import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { SQUAD_ROSTER_SIZE, SQUAD_SEAT_PRICE_UNO, getGameMode } from "@uno/shared";
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
 * Match d'un défi SQUAD (SQUAD-005).
 *
 * Trois choses se jouent à la clôture, et elles doivent tenir ensemble :
 * les statistiques des joueurs, le palmarès des deux clubs, et la mise. Si
 * l'une passe sans les autres, le résultat affiché ne correspond plus à
 * l'argent en caisse — c'est ce que ces tests surveillent.
 *
 * Le reste est délibérément **emprunté** : la feuille de match, la saisie et
 * l'historique sont ceux de n'importe quelle session, parce qu'un match SQUAD
 * est une session de mode `squad`.
 */

interface Camp {
  founder: TestPlayer;
  members: TestPlayer[];
  squadId: number;
}

async function camp(name: string, treasury: number): Promise<Camp> {
  const founder = await createPlayer();
  const squad = await founder.caller.squads.create({ name });

  const members: TestPlayer[] = [];
  // Quatre coéquipiers : avec le fondateur, cela fait les cinq du format.
  for (let index = 0; index < SQUAD_ROSTER_SIZE - 1; index++) {
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

  if (treasury > 0) {
    await grantUno(founder.identity.playerId, treasury);
    await founder.caller.squads.contribute({ squadId: squad.id, amount: treasury });
  }

  return { founder, members, squadId: squad.id };
}

const roster = (side: Camp): TestPlayer[] => [side.founder, ...side.members];

/** Défi accepté, deux feuilles complètes, toutes les places réglées. */
async function readyChallenge(
  a: Camp,
  b: Camp,
  stakeUno: number,
): Promise<number> {
  const view = await a.founder.caller.squads.createChallenge({
    squadId: a.squadId,
    opponentSquadId: b.squadId,
    venueId: "arena",
    date: daysFromNow(5),
    startHour: 20,
    durationMinutes: 60,
    stakeUno,
  });
  await b.founder.caller.squads.acceptChallenge({ challengeId: view.id });

  for (const side of [a, b]) {
    for (const player of roster(side)) {
      await side.founder.caller.squads.addSeat({
        challengeId: view.id,
        playerId: player.identity.playerId,
      });
    }
    // La caisse prend tout en charge : le test porte sur le match, pas sur
    // les portefeuilles de dix joueurs.
    await side.founder.caller.squads.coverSeats({
      challengeId: view.id,
      playerIds: roster(side).map((player) => player.identity.playerId),
    });
  }

  return view.id;
}

async function treasuryOf(squadId: number) {
  const rows = await db.execute<{ a: number; l: number }>(
    sql`SELECT treasury_available AS a, treasury_locked AS l FROM squads WHERE id = ${squadId}`,
  );
  const row = (rows[0] as unknown as { a: number; l: number }[])[0]!;
  return { available: Number(row.a), locked: Number(row.l) };
}

async function recordOf(squadId: number) {
  const rows = await db.execute<Record<string, number>>(
    sql`SELECT matches_played AS played, wins, losses, draws, streak, total_uno_won AS won
        FROM squads WHERE id = ${squadId}`,
  );
  const row = (rows[0] as unknown as Record<string, number>[])[0]!;
  return {
    played: Number(row.played),
    wins: Number(row.wins),
    losses: Number(row.losses),
    draws: Number(row.draws),
    streak: Number(row.streak),
    won: Number(row.won),
  };
}

async function cardOf(playerId: number) {
  const rows = await db.execute<Record<string, number | string>>(
    sql`SELECT goals, assists, xp, rating, division FROM players WHERE id = ${playerId}`,
  );
  const row = (rows[0] as unknown as Record<string, number | string>[])[0]!;
  return {
    goals: Number(row.goals),
    assists: Number(row.assists),
    xp: Number(row.xp),
    rating: Number(row.rating),
    division: String(row.division),
  };
}

/**
 * Saisit le résultat du match et clôture la session.
 *
 * Le score se **déduit des buteurs**, équipe par équipe : c'est ainsi que
 * l'outil de saisie le calcule, et cela évite de pouvoir écrire une feuille
 * où le score ne correspond pas aux buts inscrits.
 */
async function playMatch(
  admin: TestPlayer,
  proposalId: number,
  scorers: { playerId: number; goals: number }[],
): Promise<void> {
  const list = await admin.caller.proposals.matches({ proposalId });
  const match = list[0]!;
  const teamA = match.teamA?.players ?? [];
  const teamB = match.teamB?.players ?? [];
  const lineup = [...teamA, ...teamB];
  const byPlayer = new Map(scorers.map((row) => [row.playerId, row.goals]));

  const goalsOf = (side: typeof teamA) =>
    side.reduce((total, player) => total + (byPlayer.get(player.id) ?? 0), 0);

  await admin.caller.supervision.record({
    proposalId,
    matches: [
      {
        matchId: match.id,
        scoreA: goalsOf(teamA),
        scoreB: goalsOf(teamB),
        stats: lineup.map((player) => ({
          playerId: player.id,
          goals: byPlayer.get(player.id) ?? 0,
          assists: 0,
          defenses: 0,
          saves: 0,
        })),
      },
    ],
    complete: true,
  });
}

describe("mode de jeu SQUAD (MODE-002)", () => {
  it("MODE-002 — le mode dit exactement ce qu'il change au dossier", () => {
    // La combinaison demandée par le client : « statistiques et XP oui,
    // division et note non ». Elle n'était pas exprimable avant.
    expect(getGameMode("squad")?.effects).toEqual({
      careerStats: true,
      unoRewards: false,
      divisionMovement: false,
      cardRating: false,
    });
    // Et les deux modes existants n'ont pas bougé.
    expect(getGameMode("league")?.effects.divisionMovement).toBe(true);
    expect(getGameMode("friendly")?.effects.careerStats).toBe(false);
  });
});

describe("création du match d'un défi (SQUAD-005)", () => {
  beforeEach(resetDatabase);

  it("SQUAD-005 — le match naît du défi, avec les deux effectifs en équipes", async () => {
    const a = await camp("Les Corsaires", 3000);
    const b = await camp("Les Faucons", 3000);
    const admin = await promoteToAdmin(await createPlayer());
    const id = await readyChallenge(a, b, 500);

    const { proposalId } = await admin.caller.squads.createMatch({ challengeId: id });

    const list = await admin.caller.proposals.matches({ proposalId });
    expect(list).toHaveLength(1);
    const match = list[0]!;
    expect(match.teamA?.name).toBe("Les Corsaires");
    expect(match.teamB?.name).toBe("Les Faucons");
    expect(match.teamA?.players).toHaveLength(SQUAD_ROSTER_SIZE);
    expect(match.teamB?.players).toHaveLength(SQUAD_ROSTER_SIZE);

    // La session est déjà confirmée : les places ont été payées au défi.
    const detail = await admin.caller.proposals.get({ proposalId });
    expect(detail.modeId).toBe("squad");
    expect(detail.participants).toHaveLength(SQUAD_ROSTER_SIZE * 2);
  });

  it("SQUAD-005 — une feuille incomplète ne donne pas de match", async () => {
    const a = await camp("Les Corsaires", 3000);
    const b = await camp("Les Faucons", 3000);
    const admin = await promoteToAdmin(await createPlayer());

    const view = await a.founder.caller.squads.createChallenge({
      squadId: a.squadId,
      opponentSquadId: b.squadId,
      venueId: "arena",
      date: daysFromNow(5),
      startHour: 20,
      durationMinutes: 60,
      stakeUno: 0,
    });
    await b.founder.caller.squads.acceptChallenge({ challengeId: view.id });

    // Un seul joueur inscrit d'un côté, personne de l'autre.
    await a.founder.caller.squads.addSeat({
      challengeId: view.id,
      playerId: a.founder.identity.playerId,
    });

    await expect(
      admin.caller.squads.createMatch({ challengeId: view.id }),
    ).rejects.toThrow(/joueurs/i);
  });

  it("SQUAD-005 — une place non réglée ne donne pas de match", async () => {
    const a = await camp("Les Corsaires", 3000);
    const b = await camp("Les Faucons", 3000);
    const admin = await promoteToAdmin(await createPlayer());
    const id = await readyChallenge(a, b, 0);

    // On ajoute un onzième joueur impayé en retirant puis réinscrivant.
    const cobaye = a.members[0]!;
    await a.founder.caller.squads.removeSeat({
      challengeId: id,
      playerId: cobaye.identity.playerId,
    });
    await a.founder.caller.squads.addSeat({
      challengeId: id,
      playerId: cobaye.identity.playerId,
    });

    await expect(
      admin.caller.squads.createMatch({ challengeId: id }),
    ).rejects.toThrow(/non réglée/i);
  });

  it("SQUAD-005 — le match créé fige l'effectif", async () => {
    const a = await camp("Les Corsaires", 3000);
    const b = await camp("Les Faucons", 3000);
    const admin = await promoteToAdmin(await createPlayer());
    const id = await readyChallenge(a, b, 0);
    await admin.caller.squads.createMatch({ challengeId: id });

    await expect(
      a.founder.caller.squads.removeSeat({
        challengeId: id,
        playerId: a.members[0]!.identity.playerId,
      }),
    ).rejects.toThrow(/figée/i);

    const rosters = await a.founder.caller.squads.roster({ challengeId: id });
    expect(rosters[0]!.viewer.mayCompose).toBe(false);
  });

  it("SQUAD-005 — un match ne se crée pas deux fois", async () => {
    const a = await camp("Les Corsaires", 3000);
    const b = await camp("Les Faucons", 3000);
    const admin = await promoteToAdmin(await createPlayer());
    const id = await readyChallenge(a, b, 0);

    await admin.caller.squads.createMatch({ challengeId: id });
    await expect(
      admin.caller.squads.createMatch({ challengeId: id }),
    ).rejects.toThrow(/existe déjà/i);
  });
});

describe("résultat d'un match SQUAD (SQUAD-005, SQUAD-006)", () => {
  beforeEach(resetDatabase);

  it("AC08 — la clôture inscrit les statistiques, le palmarès et la mise", async () => {
    const a = await camp("Les Corsaires", 3000);
    const b = await camp("Les Faucons", 3000);
    const admin = await promoteToAdmin(await createPlayer());
    const id = await readyChallenge(a, b, 500);
    const { proposalId } = await admin.caller.squads.createMatch({ challengeId: id });

    const buteur = a.founder;
    const avant = await cardOf(buteur.identity.playerId);

    await playMatch(admin, proposalId, [
      { playerId: buteur.identity.playerId, goals: 3 },
    ]);

    const apres = await cardOf(buteur.identity.playerId);

    // Statistiques et XP : oui.
    expect(apres.goals).toBe(avant.goals + 3);
    expect(apres.xp).toBeGreaterThan(avant.xp);

    // Division et note de carte : non. C'est le choix du client, et la raison
    // en est solide — on choisit ses adversaires en SQUAD.
    expect(apres.division).toBe(avant.division);
    expect(apres.rating).toBe(avant.rating);

    // Palmarès des deux clubs.
    const corsaires = await recordOf(a.squadId);
    const faucons = await recordOf(b.squadId);
    expect(corsaires).toMatchObject({ played: 1, wins: 1, losses: 0, draws: 0, streak: 1 });
    expect(faucons).toMatchObject({ played: 1, wins: 0, losses: 1, draws: 0, streak: -1 });
    expect(corsaires.won).toBe(500);

    // Et la mise a changé de caisse.
    const misesDepart = 3000 - SQUAD_ROSTER_SIZE * SQUAD_SEAT_PRICE_UNO[60];
    expect(await treasuryOf(a.squadId)).toEqual({
      available: misesDepart + 500,
      locked: 0,
    });
    expect(await treasuryOf(b.squadId)).toEqual({
      available: misesDepart - 500,
      locked: 0,
    });
  });

  it("SQUAD-006 — un nul rend les mises et casse les deux séries", async () => {
    const a = await camp("Les Corsaires", 3000);
    const b = await camp("Les Faucons", 3000);
    const admin = await promoteToAdmin(await createPlayer());
    const id = await readyChallenge(a, b, 400);
    const { proposalId } = await admin.caller.squads.createMatch({ challengeId: id });

    await playMatch(admin, proposalId, [
      { playerId: a.founder.identity.playerId, goals: 2 },
      { playerId: b.founder.identity.playerId, goals: 2 },
    ]);

    const misesDepart = 3000 - SQUAD_ROSTER_SIZE * SQUAD_SEAT_PRICE_UNO[60];
    for (const side of [a, b]) {
      expect(await treasuryOf(side.squadId)).toEqual({
        available: misesDepart,
        locked: 0,
      });
      expect(await recordOf(side.squadId)).toMatchObject({
        played: 1,
        draws: 1,
        streak: 0,
      });
    }
  });

  it("SQUAD-005 — aucune récompense individuelle : la mise est le prix", async () => {
    const a = await camp("Les Corsaires", 3000);
    const b = await camp("Les Faucons", 3000);
    const admin = await promoteToAdmin(await createPlayer());
    const id = await readyChallenge(a, b, 300);
    const { proposalId } = await admin.caller.squads.createMatch({ challengeId: id });

    const avant = await balanceOf(a.founder.identity.playerId);
    await playMatch(admin, proposalId, [
      { playerId: a.founder.identity.playerId, goals: 4 },
    ]);

    // Le portefeuille ne bouge pas : ni participation, ni meilleure équipe.
    // Seuls les UNO d'un éventuel palier d'XP pourraient entrer — et le
    // fondateur n'en franchit pas ici.
    expect(await balanceOf(a.founder.identity.playerId)).toBe(avant);
  });

  it("SQUAD-005 — un match SQUAD réglé ne se rouvre pas", async () => {
    const a = await camp("Les Corsaires", 3000);
    const b = await camp("Les Faucons", 3000);
    const admin = await promoteToAdmin(await createPlayer());
    const id = await readyChallenge(a, b, 500);
    const { proposalId } = await admin.caller.squads.createMatch({ challengeId: id });
    await playMatch(admin, proposalId, [
      { playerId: a.founder.identity.playerId, goals: 1 },
    ]);

    // La réouverture sait défaire des colonnes, pas un mouvement d'argent
    // entre deux caisses : le refus est explicite plutôt que silencieux.
    await expect(
      admin.caller.supervision.reopen({ proposalId }),
    ).rejects.toThrow(/mise a déjà changé de caisse/i);
  });

  it("SQUAD-005 — une série de victoires s'accumule, une défaite la renverse", async () => {
    const a = await camp("Les Corsaires", 6000);
    const b = await camp("Les Faucons", 6000);
    const admin = await promoteToAdmin(await createPlayer());

    for (const vainqueur of ["a", "a", "b"] as const) {
      const id = await readyChallenge(a, b, 0);
      const { proposalId } = await admin.caller.squads.createMatch({ challengeId: id });
      const buteur = vainqueur === "a" ? a.founder : b.founder;
      await playMatch(admin, proposalId, [
        { playerId: buteur.identity.playerId, goals: 1 },
      ]);
    }

    // Deux victoires puis une défaite : la série repart à -1, pas à 1.
    expect(await recordOf(a.squadId)).toMatchObject({
      played: 3,
      wins: 2,
      losses: 1,
      streak: -1,
    });
    expect(await recordOf(b.squadId)).toMatchObject({
      played: 3,
      wins: 1,
      losses: 2,
      streak: 1,
    });
  });
});
