import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getGameMode } from "@uno/shared";
import { db } from "../src/db/client.js";
import {
  createPlayer,
  daysFromNow,
  grantUno,
  promoteToAdmin,
  resetDatabase,
  type TestPlayer,
} from "./helpers.js";

/**
 * Note de carte évolutive (CARD-002).
 *
 * La note était dérivée du total de carrière : elle ne pouvait donc que
 * monter, et une carte finissait par ne plus rien dire de la forme du joueur.
 * Elle se déplace désormais à chaque session classée, dans les deux sens.
 *
 * Ces tests suivent **un** joueur sur trois sessions : une de référence, une
 * meilleure, une moins bonne. C'est le seul moyen de vérifier la baisse, que
 * l'ancienne formule rendait impossible.
 */

const league = getGameMode("league")!;

/** Note actuelle d'un joueur, lue en base. */
async function ratingOf(playerId: number): Promise<number> {
  const rows = await db.execute<{ rating: number }>(
    sql`SELECT rating FROM players WHERE id = ${playerId}`,
  );
  return Number((rows[0] as unknown as { rating: number }[])[0]?.rating ?? 0);
}

/** Effectif D1 complet, crédité de quoi payer. */
async function squadOf(admin: TestPlayer): Promise<TestPlayer[]> {
  const squad: TestPlayer[] = [];
  for (let index = 0; index < league.minParticipants; index++) {
    const player = await createPlayer();
    await admin.caller.admin.setDivision({
      playerId: player.identity.playerId,
      division: "D1",
    });
    await grantUno(player.identity.playerId, 5000);
    squad.push(player);
  }
  return squad;
}

/**
 * Joue une session complète et la clôture, en donnant au joueur désigné le
 * nombre de buts voulu — les points du barème en découlent.
 *
 * Les autres joueurs marquent tous la même chose d'une session à l'autre :
 * seul le héros de l'histoire change de rendement, pour que ce soit bien sa
 * variation à lui que la note suive.
 */
async function playSession(
  admin: TestPlayer,
  squad: TestPlayer[],
  options: { date: string; venueId: string; heroGoals: number },
): Promise<number> {
  const hero = squad[0]!;

  // Chacun repart de D1 : les montées et descentes de la session précédente
  // videraient sinon la réservation suivante (CAL-002).
  for (const player of squad) {
    await db.execute(
      sql`UPDATE players SET division = 'D1' WHERE id = ${player.identity.playerId}`,
    );
  }

  const { proposal } = await hero.caller.proposals.create({
    date: options.date,
    slotStartHour: 18,
    venueId: options.venueId,
    modeId: "league",
  });

  for (const player of squad.slice(1)) {
    await player.caller.proposals.join({ proposalId: proposal.id });
  }
  for (const player of squad) {
    await player.caller.proposals.pay({
      proposalId: proposal.id,
      method: "uno",
      idempotencyKey: randomUUID(),
    });
  }

  const teams = await admin.caller.supervision.generateTeams({
    proposalId: proposal.id,
  });

  // Le héros doit figurer sur la feuille : on enchaîne les deux équipes qui
  // contiennent son équipe.
  const heroTeam = teams.find((team) =>
    team.players.some((player) => player.id === hero.identity.playerId),
  )!;
  const other = teams.find((team) => team.id !== heroTeam.id)!;

  await admin.caller.supervision.addMatch({
    proposalId: proposal.id,
    teamAId: heroTeam.id,
    teamBId: other.id,
  });

  const matches = await admin.caller.proposals.matches({
    proposalId: proposal.id,
  });
  const match = matches[0]!;
  const lineup = [
    ...(match.teamA?.players ?? []),
    ...(match.teamB?.players ?? []),
  ];

  await admin.caller.supervision.record({
    proposalId: proposal.id,
    matches: [
      {
        matchId: match.id,
        scoreA: options.heroGoals,
        scoreB: 0,
        stats: lineup.map((player) => ({
          playerId: player.id,
          goals: player.id === hero.identity.playerId ? options.heroGoals : 0,
          assists: 0,
          defenses: 0,
          saves: 0,
        })),
      },
    ],
    complete: true,
  });

  return proposal.id;
}

describe("note de carte évolutive (CARD-002)", () => {
  beforeEach(resetDatabase);

  it("CARD-002 — la note monte, puis redescend, au fil des sessions", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const squad = await squadOf(admin);
    const heroId = squad[0]!.identity.playerId;

    const start = await ratingOf(heroId);

    // Session de référence : rien à quoi se comparer, la note ne bouge pas.
    const first = await playSession(admin, squad, {
      date: daysFromNow(2),
      venueId: "arena",
      heroGoals: 4,
    });
    expect(await ratingOf(heroId)).toBe(start);

    // Mieux qu'à la précédente : la note monte.
    await playSession(admin, squad, {
      date: daysFromNow(5),
      venueId: "yc-five",
      heroGoals: 9,
    });
    const afterRise = await ratingOf(heroId);
    expect(afterRise).toBeGreaterThan(start);

    // Moins bien : elle redescend. C'est ce que l'ancienne note, dérivée du
    // total de carrière, ne pouvait pas faire.
    await playSession(admin, squad, {
      date: daysFromNow(8),
      venueId: "arena",
      heroGoals: 1,
    });
    expect(await ratingOf(heroId)).toBeLessThan(afterRise);

    expect(first).toBeGreaterThan(0);
  });

  it("CARD-002 — l'historique de session porte la note d'avant et d'après", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const squad = await squadOf(admin);
    const heroId = squad[0]!.identity.playerId;

    await playSession(admin, squad, {
      date: daysFromNow(2),
      venueId: "arena",
      heroGoals: 3,
    });
    const secondId = await playSession(admin, squad, {
      date: daysFromNow(5),
      venueId: "yc-five",
      heroGoals: 10,
    });

    const detail = await admin.caller.proposals.get({ proposalId: secondId });
    const hero = detail.participants.find((row) => row.player.id === heroId)!;

    expect(hero.ratingBefore).not.toBeNull();
    expect(hero.ratingAfter).not.toBeNull();
    expect(hero.ratingAfter!).toBeGreaterThan(hero.ratingBefore!);
    // La carte affiche bien la note d'arrivée.
    expect(hero.player.rating).toBe(hero.ratingAfter);
  });
});
