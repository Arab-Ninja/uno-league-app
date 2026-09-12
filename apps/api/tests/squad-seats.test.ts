import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { SQUAD_ROSTER_SIZE, SQUAD_SEAT_PRICE_UNO } from "@uno/shared";
import { db } from "../src/db/client.js";
import {
  balanceOf,
  createPlayer,
  daysFromNow,
  grantUno,
  promoteToAdmin,
  resetDatabase,
  type TestPlayer,
} from "./helpers.js";

/**
 * Places d'un défi et règlement de la mise (SQUAD-006).
 *
 * Deux flux d'argent se croisent ici, et tout l'enjeu est qu'ils ne se
 * mélangent jamais :
 *
 *  - **la place** paie la salle. Elle est dépensée que l'on gagne ou non ;
 *  - **la mise** est séquestrée, et revient au vainqueur.
 *
 * Ces tests suivent les soldes à l'UNO près, parce que c'est le seul moyen de
 * prouver qu'aucun chemin n'en crée ni n'en fait disparaître.
 */

interface Camp {
  founder: TestPlayer;
  members: TestPlayer[];
  squadId: number;
}

/** Fonde un club avec `size` membres en plus du fondateur, et dote sa caisse. */
async function camp(
  name: string,
  options: { treasury?: number; size?: number } = {},
): Promise<Camp> {
  const founder = await createPlayer();
  const squad = await founder.caller.squads.create({ name });

  const members: TestPlayer[] = [];
  for (let index = 0; index < (options.size ?? 1); index++) {
    const member = await createPlayer();
    await member.caller.squads.requestToJoin({ squadId: squad.id });
    const detail = await founder.caller.squads.detail({ squadId: squad.id });
    const request = detail.pendingRequests.find(
      (row) => row.player.id === member.identity.playerId,
    )!;
    await founder.caller.squads.decideRequest({
      requestId: request.id,
      accept: true,
    });
    members.push(member);
  }

  if (options.treasury) {
    await grantUno(founder.identity.playerId, options.treasury);
    await founder.caller.squads.contribute({
      squadId: squad.id,
      amount: options.treasury,
    });
  }

  return { founder, members, squadId: squad.id };
}

/** Lance un défi et le fait accepter : la composition s'ouvre alors. */
async function acceptedChallenge(
  from: Camp,
  to: Camp,
  options: { stakeUno?: number; durationMinutes?: 60 | 120 } = {},
): Promise<number> {
  const view = await from.founder.caller.squads.createChallenge({
    squadId: from.squadId,
    opponentSquadId: to.squadId,
    venueId: "arena",
    date: daysFromNow(5),
    startHour: 20,
    durationMinutes: options.durationMinutes ?? 60,
    stakeUno: options.stakeUno ?? 0,
  });
  await to.founder.caller.squads.acceptChallenge({ challengeId: view.id });
  return view.id;
}

async function treasuryOf(
  squadId: number,
): Promise<{ available: number; locked: number }> {
  const rows = await db.execute<{ a: number; l: number }>(
    sql`SELECT treasury_available AS a, treasury_locked AS l FROM squads WHERE id = ${squadId}`,
  );
  const row = (rows[0] as unknown as { a: number; l: number }[])[0]!;
  return { available: Number(row.a), locked: Number(row.l) };
}

/** La composition d'un camp, vue par l'un de ses joueurs. */
async function rosterOf(viewer: TestPlayer, challengeId: number, squadId: number) {
  const rosters = await viewer.caller.squads.roster({ challengeId });
  return rosters.find((roster) => roster.squad?.id === squadId)!;
}

const SEAT_1H = SQUAD_SEAT_PRICE_UNO[60];
const SEAT_2H = SQUAD_SEAT_PRICE_UNO[120];

describe("composition d'un défi (SQUAD-006)", () => {
  beforeEach(resetDatabase);

  it("SQUAD-006 — la composition ne s'ouvre qu'une fois le défi accepté", async () => {
    const a = await camp("Les Loups");
    const b = await camp("Les Aigles");

    const view = await a.founder.caller.squads.createChallenge({
      squadId: a.squadId,
      opponentSquadId: b.squadId,
      venueId: "arena",
      date: daysFromNow(5),
      startHour: 20,
      durationMinutes: 60,
      stakeUno: 0,
    });

    // Inscrire des joueurs avant l'acceptation les ferait payer une place
    // pour une rencontre qui n'aura peut-être pas lieu.
    await expect(
      a.founder.caller.squads.addSeat({
        challengeId: view.id,
        playerId: a.founder.identity.playerId,
      }),
    ).rejects.toThrow(/accepté/i);

    expect(await a.founder.caller.squads.roster({ challengeId: view.id })).toEqual([]);

    await b.founder.caller.squads.acceptChallenge({ challengeId: view.id });
    const rosters = await a.founder.caller.squads.roster({ challengeId: view.id });
    expect(rosters).toHaveLength(2);
    expect(rosters[0]!.openSlots).toBe(SQUAD_ROSTER_SIZE);
  });

  it("SQUAD-006 — le prix dépend de la durée, et se fige à l'inscription", async () => {
    const a = await camp("Les Loups");
    const b = await camp("Les Aigles");

    const courte = await acceptedChallenge(a, b, { durationMinutes: 60 });
    await a.founder.caller.squads.addSeat({
      challengeId: courte,
      playerId: a.founder.identity.playerId,
    });

    const longue = await acceptedChallenge(b, a, { durationMinutes: 120 });
    await b.founder.caller.squads.addSeat({
      challengeId: longue,
      playerId: b.founder.identity.playerId,
    });

    expect((await rosterOf(a.founder, courte, a.squadId)).seats[0]!.priceUno).toBe(
      SEAT_1H,
    );
    expect((await rosterOf(b.founder, longue, b.squadId)).seats[0]!.priceUno).toBe(
      SEAT_2H,
    );
    // Dix euros de l'heure, vingt pour deux : le tarif annoncé au client.
    expect(SEAT_1H).toBe(100);
    expect(SEAT_2H).toBe(200);
  });

  it("SQUAD-006 — cinq joueurs par équipe, et pas un de plus", async () => {
    const a = await camp("Les Loups", { size: SQUAD_ROSTER_SIZE });
    const b = await camp("Les Aigles");
    const id = await acceptedChallenge(a, b);

    const roster = [a.founder, ...a.members].slice(0, SQUAD_ROSTER_SIZE);
    for (const player of roster) {
      await a.founder.caller.squads.addSeat({
        challengeId: id,
        playerId: player.identity.playerId,
      });
    }

    const surnuméraire = a.members[SQUAD_ROSTER_SIZE - 1]!;
    await expect(
      a.founder.caller.squads.addSeat({
        challengeId: id,
        playerId: surnuméraire.identity.playerId,
      }),
    ).rejects.toThrow(/complète/i);

    expect((await rosterOf(a.founder, id, a.squadId)).openSlots).toBe(0);
  });

  it("SQUAD-006 — on ne compose ni l'équipe d'en face, ni avec un étranger", async () => {
    const a = await camp("Les Loups", { size: 1 });
    const b = await camp("Les Aigles", { size: 1 });
    const id = await acceptedChallenge(a, b);

    // Un joueur d'un autre club n'entre pas sur notre feuille.
    await expect(
      a.founder.caller.squads.addSeat({
        challengeId: id,
        playerId: b.members[0]!.identity.playerId,
      }),
    ).rejects.toThrow(/membre actif/i);

    // Et un membre ordinaire ne compose pas : diriger le club est un rôle.
    await expect(
      a.members[0]!.caller.squads.addSeat({
        challengeId: id,
        playerId: a.members[0]!.identity.playerId,
      }),
    ).rejects.toThrow();
  });
});

describe("règlement d'une place (SQUAD-006)", () => {
  beforeEach(resetDatabase);

  it("AC06 — le joueur paie sa place, qui sort de son portefeuille", async () => {
    const a = await camp("Les Loups", { size: 1 });
    const b = await camp("Les Aigles");
    const id = await acceptedChallenge(a, b);

    const joueur = a.members[0]!;
    await a.founder.caller.squads.addSeat({
      challengeId: id,
      playerId: joueur.identity.playerId,
    });

    const avant = await balanceOf(joueur.identity.playerId);
    await joueur.caller.squads.paySeat({ challengeId: id });

    expect(await balanceOf(joueur.identity.playerId)).toBe(avant - SEAT_1H);

    const seat = (await rosterOf(a.founder, id, a.squadId)).seats.find(
      (row) => row.player.id === joueur.identity.playerId,
    )!;
    expect(seat.status).toBe("paid");
    expect(seat.paidBy).toBe("player");

    // Payer deux fois ne débite pas deux fois.
    await joueur.caller.squads.paySeat({ challengeId: id });
    expect(await balanceOf(joueur.identity.playerId)).toBe(avant - SEAT_1H);
  });

  it("AC06 — la caisse prend une place à sa charge, sur décision du fondateur", async () => {
    const a = await camp("Les Loups", { treasury: 1000, size: 1 });
    const b = await camp("Les Aigles");
    const id = await acceptedChallenge(a, b);

    const joueur = a.members[0]!;
    await a.founder.caller.squads.addSeat({
      challengeId: id,
      playerId: joueur.identity.playerId,
    });

    const soldeJoueur = await balanceOf(joueur.identity.playerId);
    const caisse = await treasuryOf(a.squadId);

    await a.founder.caller.squads.coverSeats({
      challengeId: id,
      playerIds: [joueur.identity.playerId],
    });

    // La place est payée, mais pas par lui.
    expect(await balanceOf(joueur.identity.playerId)).toBe(soldeJoueur);
    expect((await treasuryOf(a.squadId)).available).toBe(caisse.available - SEAT_1H);

    const seat = (await rosterOf(a.founder, id, a.squadId)).seats[0]!;
    expect(seat.status).toBe("paid");
    expect(seat.paidBy).toBe("treasury");
  });

  it("SQUAD-006 — engager la caisse est un pouvoir de fondateur, pas de capitaine", async () => {
    const a = await camp("Les Loups", { treasury: 1000, size: 1 });
    const b = await camp("Les Aigles");
    const id = await acceptedChallenge(a, b);

    const capitaine = a.members[0]!;
    await a.founder.caller.squads.setMemberRole({
      squadId: a.squadId,
      playerId: capitaine.identity.playerId,
      role: "captain",
    });
    await a.founder.caller.squads.addSeat({
      challengeId: id,
      playerId: capitaine.identity.playerId,
    });

    // Il compose — c'est son rôle — mais n'engage pas l'argent des autres.
    await expect(
      capitaine.caller.squads.coverSeats({
        challengeId: id,
        playerIds: [capitaine.identity.playerId],
      }),
    ).rejects.toThrow();

    const roster = await rosterOf(capitaine, id, a.squadId);
    expect(roster.viewer.mayCompose).toBe(true);
    expect(roster.viewer.mayCover).toBe(false);
  });

  it("SQUAD-006 — une caisse vide ne prend rien en charge", async () => {
    const a = await camp("Les Loups", { size: 1 });
    const b = await camp("Les Aigles");
    const id = await acceptedChallenge(a, b);

    await a.founder.caller.squads.addSeat({
      challengeId: id,
      playerId: a.members[0]!.identity.playerId,
    });

    await expect(
      a.founder.caller.squads.coverSeats({
        challengeId: id,
        playerIds: [a.members[0]!.identity.playerId],
      }),
    ).rejects.toThrow(/couvre pas/i);

    expect((await treasuryOf(a.squadId)).available).toBe(0);
  });

  it("SQUAD-006 — retirer un joueur rend l'argent là d'où il venait", async () => {
    const a = await camp("Les Loups", { treasury: 1000, size: 2 });
    const b = await camp("Les Aigles");
    const id = await acceptedChallenge(a, b);

    const paye = a.members[0]!;
    const pris = a.members[1]!;
    for (const player of [paye, pris]) {
      await a.founder.caller.squads.addSeat({
        challengeId: id,
        playerId: player.identity.playerId,
      });
    }

    await paye.caller.squads.paySeat({ challengeId: id });
    await a.founder.caller.squads.coverSeats({
      challengeId: id,
      playerIds: [pris.identity.playerId],
    });

    const soldePaye = await balanceOf(paye.identity.playerId);
    const soldePris = await balanceOf(pris.identity.playerId);
    const caisse = await treasuryOf(a.squadId);

    await a.founder.caller.squads.removeSeat({
      challengeId: id,
      playerId: paye.identity.playerId,
    });
    await a.founder.caller.squads.removeSeat({
      challengeId: id,
      playerId: pris.identity.playerId,
    });

    // Celui qui avait payé retrouve ses UNO ; celui que la caisse avait pris
    // en charge ne touche rien, et c'est la caisse qui est remboursée.
    expect(await balanceOf(paye.identity.playerId)).toBe(soldePaye + SEAT_1H);
    expect(await balanceOf(pris.identity.playerId)).toBe(soldePris);
    expect((await treasuryOf(a.squadId)).available).toBe(caisse.available + SEAT_1H);

    expect((await rosterOf(a.founder, id, a.squadId)).seats).toHaveLength(0);
  });

  it("SQUAD-006 — un joueur retiré puis réinscrit retrouve une place", async () => {
    const a = await camp("Les Loups", { size: 1 });
    const b = await camp("Les Aigles");
    const id = await acceptedChallenge(a, b);
    const joueur = a.members[0]!;

    await a.founder.caller.squads.addSeat({
      challengeId: id,
      playerId: joueur.identity.playerId,
    });
    await a.founder.caller.squads.removeSeat({
      challengeId: id,
      playerId: joueur.identity.playerId,
    });
    // L'index unique ne porte que sur les places vivantes : une place rendue
    // ne condamne pas le joueur pour le reste du défi.
    await a.founder.caller.squads.addSeat({
      challengeId: id,
      playerId: joueur.identity.playerId,
    });

    expect((await rosterOf(a.founder, id, a.squadId)).seats).toHaveLength(1);
  });
});

describe("règlement d'un défi (SQUAD-006)", () => {
  beforeEach(resetDatabase);

  it("AC07 — le vainqueur prend la mise des deux camps", async () => {
    const a = await camp("Les Loups", { treasury: 2000 });
    const b = await camp("Les Aigles", { treasury: 2000 });
    const admin = await promoteToAdmin(await createPlayer());
    const id = await acceptedChallenge(a, b, { stakeUno: 500 });

    // À l'acceptation, la mise est séquestrée des deux côtés.
    expect(await treasuryOf(a.squadId)).toEqual({ available: 1500, locked: 500 });
    expect(await treasuryOf(b.squadId)).toEqual({ available: 1500, locked: 500 });

    await admin.caller.squads.settleChallenge({
      challengeId: id,
      winnerSquadId: a.squadId,
    });

    // Le vainqueur retrouve sa mise et prend celle d'en face ; le perdant
    // voit la sienne quitter la caisse. Rien n'est créé, rien ne disparaît.
    expect(await treasuryOf(a.squadId)).toEqual({ available: 2500, locked: 0 });
    expect(await treasuryOf(b.squadId)).toEqual({ available: 1500, locked: 0 });

    const rows = await db.execute<{ won: number }>(
      sql`SELECT total_uno_won AS won FROM squads WHERE id = ${a.squadId}`,
    );
    expect(Number((rows[0] as unknown as { won: number }[])[0]!.won)).toBe(500);
  });

  it("AC07 — un nul rend à chacun sa propre mise", async () => {
    const a = await camp("Les Loups", { treasury: 2000 });
    const b = await camp("Les Aigles", { treasury: 2000 });
    const admin = await promoteToAdmin(await createPlayer());
    const id = await acceptedChallenge(a, b, { stakeUno: 500 });

    await admin.caller.squads.settleChallenge({ challengeId: id });

    expect(await treasuryOf(a.squadId)).toEqual({ available: 2000, locked: 0 });
    expect(await treasuryOf(b.squadId)).toEqual({ available: 2000, locked: 0 });
  });

  it("SQUAD-006 — les places ne sont pas rendues au vainqueur : la salle a été jouée", async () => {
    const a = await camp("Les Loups", { treasury: 2000, size: 1 });
    const b = await camp("Les Aigles", { treasury: 2000 });
    const admin = await promoteToAdmin(await createPlayer());
    const id = await acceptedChallenge(a, b, { stakeUno: 500 });

    const joueur = a.members[0]!;
    await a.founder.caller.squads.addSeat({
      challengeId: id,
      playerId: joueur.identity.playerId,
    });
    await joueur.caller.squads.paySeat({ challengeId: id });
    const solde = await balanceOf(joueur.identity.playerId);

    await admin.caller.squads.settleChallenge({
      challengeId: id,
      winnerSquadId: a.squadId,
    });

    expect(await balanceOf(joueur.identity.playerId)).toBe(solde);
  });

  it("SQUAD-006 — annuler un défi accepté rend les mises et rembourse les places", async () => {
    const a = await camp("Les Loups", { treasury: 2000, size: 1 });
    const b = await camp("Les Aigles", { treasury: 2000 });
    const admin = await promoteToAdmin(await createPlayer());
    const id = await acceptedChallenge(a, b, { stakeUno: 500 });

    const joueur = a.members[0]!;
    await a.founder.caller.squads.addSeat({
      challengeId: id,
      playerId: joueur.identity.playerId,
    });
    await joueur.caller.squads.paySeat({ challengeId: id });
    const solde = await balanceOf(joueur.identity.playerId);

    await admin.caller.squads.annulChallenge({
      challengeId: id,
      reason: "Salle indisponible",
    });

    // Le match n'a pas eu lieu : ni la mise ni la salle ne sont dues.
    expect(await treasuryOf(a.squadId)).toEqual({ available: 2000, locked: 0 });
    expect(await treasuryOf(b.squadId)).toEqual({ available: 2000, locked: 0 });
    expect(await balanceOf(joueur.identity.playerId)).toBe(solde + SEAT_1H);

    const view = await a.founder.caller.squads.challenge({ challengeId: id });
    expect(view.status).toBe("cancelled");
  });

  it("SQUAD-006 — régler un défi est réservé à l'administration", async () => {
    const a = await camp("Les Loups", { treasury: 2000 });
    const b = await camp("Les Aigles", { treasury: 2000 });
    const id = await acceptedChallenge(a, b, { stakeUno: 500 });

    await expect(
      a.founder.caller.squads.settleChallenge({
        challengeId: id,
        winnerSquadId: a.squadId,
      }),
    ).rejects.toThrow();

    // La mise reste séquestrée : l'échec n'a rien déplacé.
    expect(await treasuryOf(a.squadId)).toEqual({ available: 1500, locked: 500 });
  });

  it("SQUAD-006 — un vainqueur étranger au défi est refusé", async () => {
    const a = await camp("Les Loups", { treasury: 2000 });
    const b = await camp("Les Aigles", { treasury: 2000 });
    const c = await camp("Les Ours");
    const admin = await promoteToAdmin(await createPlayer());
    const id = await acceptedChallenge(a, b, { stakeUno: 500 });

    await expect(
      admin.caller.squads.settleChallenge({
        challengeId: id,
        winnerSquadId: c.squadId,
      }),
    ).rejects.toThrow(/ne participe pas/i);
  });

  it("SQUAD-006 — un défi réglé ne se règle pas deux fois", async () => {
    const a = await camp("Les Loups", { treasury: 2000 });
    const b = await camp("Les Aigles", { treasury: 2000 });
    const admin = await promoteToAdmin(await createPlayer());
    const id = await acceptedChallenge(a, b, { stakeUno: 500 });

    await admin.caller.squads.settleChallenge({
      challengeId: id,
      winnerSquadId: a.squadId,
    });
    await expect(
      admin.caller.squads.settleChallenge({
        challengeId: id,
        winnerSquadId: b.squadId,
      }),
    ).rejects.toThrow(/accepté/i);

    expect(await treasuryOf(a.squadId)).toEqual({ available: 2500, locked: 0 });
  });
});

describe("fil de discussion d'un défi accepté (SQUAD-005)", () => {
  beforeEach(resetDatabase);

  it("SQUAD-005 — le fil reste ouvert une fois le défi accepté", async () => {
    const a = await camp("Les Loups");
    const b = await camp("Les Aigles");
    const id = await acceptedChallenge(a, b);

    // C'est là que les deux clubs ont le plus à se dire : composer, régler
    // les places, convenir de l'heure sur place. Fermer le fil à
    // l'acceptation coupait la parole au moment où elle sert.
    await a.founder.caller.squads.postMessage({
      thread: { scope: "challenge", challengeId: id },
      body: "On se retrouve à 19h45 devant la salle.",
    });

    const fil = await b.founder.caller.squads.messages({
      thread: { scope: "challenge", challengeId: id },
      limit: 20,
    });
    expect(fil.writable).toBe(true);
    expect(fil.messages.at(-1)?.body).toContain("19h45");
  });

  it("SQUAD-005 — le fil se ferme quand il n'y a plus rien à organiser", async () => {
    const a = await camp("Les Loups", { treasury: 1000 });
    const b = await camp("Les Aigles", { treasury: 1000 });
    const admin = await promoteToAdmin(await createPlayer());
    const id = await acceptedChallenge(a, b, { stakeUno: 200 });

    await admin.caller.squads.settleChallenge({
      challengeId: id,
      winnerSquadId: a.squadId,
    });

    const fil = await a.founder.caller.squads.messages({
      thread: { scope: "challenge", challengeId: id },
      limit: 20,
    });
    expect(fil.writable).toBe(false);
    await expect(
      a.founder.caller.squads.postMessage({
        thread: { scope: "challenge", challengeId: id },
        body: "Trop tard.",
      }),
    ).rejects.toThrow();
  });
});
