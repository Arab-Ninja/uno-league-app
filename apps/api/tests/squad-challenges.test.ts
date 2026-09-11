import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { SQUAD_LIMITS } from "@uno/shared";
import { db } from "../src/db/client.js";
import { expireStaleChallenges } from "../src/services/squad-challenges.service.js";
import {
  createPlayer,
  daysFromNow,
  grantUno,
  resetDatabase,
  type TestPlayer,
} from "./helpers.js";

/**
 * Défis entre SQUADs (SQUAD-004, SQUAD-005).
 *
 * Ce qui est vérifié ici n'est pas qu'un défi se crée, mais qu'aucune
 * séquence ne permette de contourner la négociation : marchander sans fin,
 * faire baisser la mise, répondre à la place de l'autre, ou accepter un défi
 * qu'on n'a pas les moyens de tenir.
 */

interface Camp {
  founder: TestPlayer;
  member: TestPlayer;
  squadId: number;
}

/** Fonde un club, y fait entrer un membre, et alimente sa caisse. */
async function camp(name: string, treasury: number): Promise<Camp> {
  const founder = await createPlayer();
  const squad = await founder.caller.squads.create({ name });

  const member = await createPlayer();
  await member.caller.squads.requestToJoin({ squadId: squad.id });
  const detail = await founder.caller.squads.detail({ squadId: squad.id });
  await founder.caller.squads.decideRequest({
    requestId: detail.pendingRequests[0]!.id,
    accept: true,
  });

  if (treasury > 0) {
    // Le bonus d'inscription ne suffit pas à doter une caisse : on crédite
    // le fondateur, qui verse ensuite par le vrai chemin.
    await grantUno(founder.identity.playerId, treasury);
    await founder.caller.squads.contribute({ squadId: squad.id, amount: treasury });
  }

  return { founder, member, squadId: squad.id };
}

/** Lance un défi du premier camp vers le second. */
async function challenge(
  from: Camp,
  to: Camp,
  stakeUno: number,
): Promise<number> {
  const view = await from.founder.caller.squads.createChallenge({
    squadId: from.squadId,
    opponentSquadId: to.squadId,
    venueId: "arena",
    date: daysFromNow(5),
    startHour: 20,
    durationMinutes: 60,
    stakeUno,
  });
  return view.id;
}

/** Trésorerie d'un club, lue en base. */
async function treasuryOf(
  squadId: number,
): Promise<{ available: number; locked: number }> {
  const rows = await db.execute<{ a: number; l: number }>(
    sql`SELECT treasury_available AS a, treasury_locked AS l FROM squads WHERE id = ${squadId}`,
  );
  const row = (rows[0] as unknown as { a: number; l: number }[])[0]!;
  return { available: Number(row.a), locked: Number(row.l) };
}

describe("défis entre SQUADs (SQUAD-004)", () => {
  beforeEach(resetDatabase);

  it("AC04 — un capitaine lance un défi, le défié doit répondre", async () => {
    const a = await camp("Les Loups", 2000);
    const b = await camp("Les Aigles", 2000);
    const id = await challenge(a, b, 500);

    const cote = await b.founder.caller.squads.challenge({ challengeId: id });
    expect(cote.currentStake).toBe(500);
    expect(cote.durationMinutes).toBe(60);
    expect(cote.viewer.awaitingReply).toBe(true);
    expect(cote.offers).toHaveLength(1);

    // Le défiant, lui, attend : ce n'est pas à lui de répondre.
    const vueA = await a.founder.caller.squads.challenge({ challengeId: id });
    expect(vueA.viewer.awaitingReply).toBe(false);
  });

  it("SQUAD-004 — un membre ordinaire ne lance ni ne tranche un défi", async () => {
    const a = await camp("Les Loups", 1000);
    const b = await camp("Les Aigles", 1000);

    await expect(
      a.member.caller.squads.createChallenge({
        squadId: a.squadId,
        opponentSquadId: b.squadId,
        venueId: "arena",
        date: daysFromNow(5),
        startHour: 20,
        durationMinutes: 60,
        stakeUno: 100,
      }),
    ).rejects.toThrow(/capitaines/i);

    const id = await challenge(a, b, 100);
    await expect(
      b.member.caller.squads.acceptChallenge({ challengeId: id }),
    ).rejects.toThrow(/capitaines/i);
  });

  it("AC05 — la mise monte à chaque contre-offre, jamais l'inverse", async () => {
    const a = await camp("Les Loups", 5000);
    const b = await camp("Les Aigles", 5000);
    const id = await challenge(a, b, 500);

    // Baisser est refusé : le marchandage ne doit pas devenir une partie
    // d'usure où le plus patient gagne.
    await expect(
      b.founder.caller.squads.counterOffer({ challengeId: id, stakeUno: 400 }),
    ).rejects.toThrow(/monte la mise/i);

    const apres = await b.founder.caller.squads.counterOffer({
      challengeId: id,
      stakeUno: 750,
    });
    expect(apres.currentStake).toBe(750);
    // La balle repasse dans l'autre camp.
    expect(apres.viewer.awaitingReply).toBe(false);

    const vueA = await a.founder.caller.squads.challenge({ challengeId: id });
    expect(vueA.viewer.awaitingReply).toBe(true);
  });

  it("AC05 — le marchandage est borné", async () => {
    const a = await camp("Les Loups", 20000);
    const b = await camp("Les Aigles", 20000);
    const id = await challenge(a, b, 100);

    // Trois contre-offres, alternativement, puis plus rien.
    let stake = 100;
    const camps = [b, a, b];
    for (const side of camps) {
      stake += 100;
      await side.founder.caller.squads.counterOffer({
        challengeId: id,
        stakeUno: stake,
      });
    }

    const vue = await a.founder.caller.squads.challenge({ challengeId: id });
    expect(vue.counterOffersLeft).toBe(0);
    expect(vue.offers).toHaveLength(SQUAD_LIMITS.negotiationRounds + 1);

    await expect(
      a.founder.caller.squads.counterOffer({ challengeId: id, stakeUno: stake + 100 }),
    ).rejects.toThrow(/limitée/i);

    // Il reste à trancher : accepter ou refuser.
    await expect(
      a.founder.caller.squads.acceptChallenge({ challengeId: id }),
    ).resolves.toBeTruthy();
  });

  it("SQUAD-004 — on ne répond pas à la place de l'autre camp", async () => {
    const a = await camp("Les Loups", 2000);
    const b = await camp("Les Aigles", 2000);
    const id = await challenge(a, b, 500);

    // C'est au défié de répondre : le défiant ne peut ni accepter sa propre
    // offre, ni contre-offrir contre lui-même.
    await expect(
      a.founder.caller.squads.acceptChallenge({ challengeId: id }),
    ).rejects.toThrow(/pas membre/i);
    await expect(
      a.founder.caller.squads.counterOffer({ challengeId: id, stakeUno: 900 }),
    ).rejects.toThrow(/pas membre/i);
  });

  it("AC06 — accepter verrouille la mise des deux côtés", async () => {
    const a = await camp("Les Loups", 2000);
    const b = await camp("Les Aigles", 3000);
    const id = await challenge(a, b, 800);

    await b.founder.caller.squads.acceptChallenge({ challengeId: id });

    // Les UNO ne quittent pas le club : ils passent du disponible à
    // l'engagé. Le total possédé ne bouge pas.
    expect(await treasuryOf(a.squadId)).toEqual({ available: 1200, locked: 800 });
    expect(await treasuryOf(b.squadId)).toEqual({ available: 2200, locked: 800 });

    const vue = await a.founder.caller.squads.challenge({ challengeId: id });
    expect(vue.status).toBe("accepted");
  });

  it("AC06 — un club qui n'a pas les moyens ne peut pas accepter", async () => {
    const a = await camp("Les Loups", 5000);
    const b = await camp("Les Aigles", 200);
    const id = await challenge(a, b, 1000);

    await expect(
      b.founder.caller.squads.acceptChallenge({ challengeId: id }),
    ).rejects.toThrow(/ne couvre pas/i);

    // Le refus ne laisse rien derrière lui : aucune des deux caisses n'a
    // bougé, pas même celle du défiant.
    expect(await treasuryOf(a.squadId)).toEqual({ available: 5000, locked: 0 });
    expect(await treasuryOf(b.squadId)).toEqual({ available: 200, locked: 0 });
  });

  it("SQUAD-004 — une mise nulle est un défi d'honneur", async () => {
    const a = await camp("Les Loups", 0);
    const b = await camp("Les Aigles", 0);
    const id = await challenge(a, b, 0);

    await expect(
      b.founder.caller.squads.acceptChallenge({ challengeId: id }),
    ).resolves.toBeTruthy();
    expect(await treasuryOf(a.squadId)).toEqual({ available: 0, locked: 0 });
  });

  it("SQUAD-004 — un défi sans réponse expire, et n'est plus négociable", async () => {
    const a = await camp("Les Loups", 2000);
    const b = await camp("Les Aigles", 2000);
    const id = await challenge(a, b, 500);

    // L'échéance est ramenée dans le passé, comme le ferait le temps.
    await db.execute(
      sql`UPDATE squad_challenges SET expires_at = DATE_SUB(NOW(3), INTERVAL 1 HOUR) WHERE id = ${id}`,
    );

    await expect(
      b.founder.caller.squads.acceptChallenge({ challengeId: id }),
    ).rejects.toThrow(/expiré/i);

    expect(await expireStaleChallenges()).toBe(1);
    const vue = await a.founder.caller.squads.challenge({ challengeId: id });
    expect(vue.status).toBe("expired");

    // Rien n'est à rendre : la mise n'est verrouillée qu'à l'acceptation.
    expect(await treasuryOf(a.squadId)).toEqual({ available: 2000, locked: 0 });
  });

  it("SQUAD-004 — un défi accepté ne se renégocie pas", async () => {
    const a = await camp("Les Loups", 3000);
    const b = await camp("Les Aigles", 3000);
    const id = await challenge(a, b, 500);
    await b.founder.caller.squads.acceptChallenge({ challengeId: id });

    await expect(
      a.founder.caller.squads.counterOffer({ challengeId: id, stakeUno: 900 }),
    ).rejects.toThrow(/plus en négociation/i);
    await expect(
      b.founder.caller.squads.rejectChallenge({ challengeId: id }),
    ).rejects.toThrow(/plus en négociation/i);
  });
});

describe("fils de discussion (SQUAD-005)", () => {
  beforeEach(resetDatabase);

  it("SQUAD-005 — le chat d'un club est réservé à ses membres", async () => {
    const a = await camp("Les Loups", 0);
    const outsider = await createPlayer();

    await a.member.caller.squads.postMessage({
      thread: { scope: "squad", squadId: a.squadId },
      body: "On se retrouve à 19 h 30 ?",
    });

    const fil = await a.founder.caller.squads.messages({
      thread: { scope: "squad", squadId: a.squadId },
    });
    expect(fil.messages).toHaveLength(1);
    expect(fil.messages[0]?.body).toBe("On se retrouve à 19 h 30 ?");
    expect(fil.writable).toBe(true);

    await expect(
      outsider.caller.squads.messages({
        thread: { scope: "squad", squadId: a.squadId },
      }),
    ).rejects.toThrow(/réservé/i);
  });

  it("SQUAD-005 — le chat d'un défi réunit les deux camps, et eux seuls", async () => {
    const a = await camp("Les Loups", 2000);
    const b = await camp("Les Aigles", 2000);
    const c = await camp("Les Renards", 0);
    const id = await challenge(a, b, 500);

    await a.member.caller.squads.postMessage({
      thread: { scope: "challenge", challengeId: id },
      body: "Bonne chance !",
    });
    await b.member.caller.squads.postMessage({
      thread: { scope: "challenge", challengeId: id },
      body: "On vous attend.",
    });

    const fil = await b.founder.caller.squads.messages({
      thread: { scope: "challenge", challengeId: id },
    });
    expect(fil.messages).toHaveLength(2);
    // On doit savoir qui parle depuis quel camp.
    expect(fil.messages[0]?.squadId).toBe(a.squadId);
    expect(fil.messages[1]?.squadId).toBe(b.squadId);

    // Un club tiers n'a rien à y faire.
    await expect(
      c.founder.caller.squads.messages({
        thread: { scope: "challenge", challengeId: id },
      }),
    ).rejects.toThrow(/réservé/i);
  });

  it("SQUAD-005 — un défi tranché fige son fil sans l'effacer", async () => {
    const a = await camp("Les Loups", 2000);
    const b = await camp("Les Aigles", 2000);
    const id = await challenge(a, b, 500);

    await a.founder.caller.squads.postMessage({
      thread: { scope: "challenge", challengeId: id },
      body: "Alors, ce défi ?",
    });
    await b.founder.caller.squads.rejectChallenge({ challengeId: id });

    const fil = await a.founder.caller.squads.messages({
      thread: { scope: "challenge", challengeId: id },
    });
    // La conversation reste lisible : elle raconte comment on s'est accordé.
    expect(fil.messages).toHaveLength(1);
    expect(fil.writable).toBe(false);

    await expect(
      a.founder.caller.squads.postMessage({
        thread: { scope: "challenge", challengeId: id },
        body: "Dommage.",
      }),
    ).rejects.toThrow(/ne reçoit plus/i);
  });

  it("SQUAD-005 — `afterId` ne rapporte que la suite", async () => {
    const a = await camp("Les Loups", 0);

    const premier = await a.founder.caller.squads.postMessage({
      thread: { scope: "squad", squadId: a.squadId },
      body: "Premier",
    });
    await a.member.caller.squads.postMessage({
      thread: { scope: "squad", squadId: a.squadId },
      body: "Deuxième",
    });

    // C'est ce qui rend l'interrogation périodique tenable : rapatrier tout
    // le fil à chaque tour coûterait cher pour rien.
    const suite = await a.founder.caller.squads.messages({
      thread: { scope: "squad", squadId: a.squadId },
      afterId: premier.id,
    });
    expect(suite.messages).toHaveLength(1);
    expect(suite.messages[0]?.body).toBe("Deuxième");
  });

  it("SQUAD-005 — quitter un club coupe l'accès à la suite", async () => {
    const a = await camp("Les Loups", 0);
    await a.member.caller.squads.leave();

    await expect(
      a.member.caller.squads.messages({
        thread: { scope: "squad", squadId: a.squadId },
      }),
    ).rejects.toThrow(/réservé/i);
  });
});
