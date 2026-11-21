import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getGameMode } from "@uno/shared";
import {
  createPlayer,
  daysFromNow,
  grantUno,
  promoteToAdmin,
  resetDatabase,
  type TestPlayer,
} from "./helpers.js";

/**
 * Statistiques détaillées (STAT-001).
 *
 * Deux garanties, et la seconde compte autant que la première : que les
 * ratios se calculent sur la carrière entière, et que la courbe ne mélange
 * pas des séances qui ne comptent pas — sans quoi la somme des points d'une
 * courbe ne retomberait pas sur le total affiché à côté.
 */

const friendly = getGameMode("friendly")!;

/** Joue une séance complète dans le mode donné et la clôture. */
async function playSession(
  admin: TestPlayer,
  squad: TestPlayer[],
  options: {
    modeId: "league" | "friendly";
    date: string;
    venueId: string;
    goals: number;
  },
): Promise<number> {
  const host = squad[0]!;
  const { proposal } = await host.caller.proposals.create({
    date: options.date,
    slotStartHour: 19,
    venueId: options.venueId,
    modeId: options.modeId,
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

  await admin.caller.supervision.generateTeams({ proposalId: proposal.id });
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
        scoreA: options.goals,
        scoreB: 0,
        stats: lineup.map((player) => ({
          playerId: player.id,
          goals: player.id === host.identity.playerId ? options.goals : 0,
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

describe("statistiques détaillées (STAT-001)", () => {
  beforeEach(resetDatabase);

  it("STAT-001 — les amicaux figurent dans « Tout » et dans leur propre filtre", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const squad: TestPlayer[] = [];
    for (let index = 0; index < friendly.minParticipants; index++) {
      const player = await createPlayer();
      await grantUno(player.identity.playerId, 3000);
      squad.push(player);
    }
    const hero = squad[0]!;

    await playSession(admin, squad, {
      modeId: "friendly",
      date: daysFromNow(3),
      venueId: "arena",
      goals: 4,
    });
    await playSession(admin, squad, {
      modeId: "friendly",
      date: daysFromNow(6),
      venueId: "yc-five",
      goals: 2,
    });

    // « Tout » : les buts d'amical sont là, la courbe aussi.
    let stats = await hero.caller.players.statistics({ limit: 30 });
    expect(stats.scope).toBe("all");
    expect(stats.totals.goals).toBe(6);
    expect(stats.totals.matchesPlayed).toBe(2);
    expect(stats.sessions).toHaveLength(2);
    expect(stats.modes).toEqual([{ id: "friendly", sessions: 2 }]);

    // Le filtre d'un mode ne lit que ses séances.
    stats = await hero.caller.players.statistics({
      limit: 30,
      scope: "friendly",
    });
    expect(stats.totals.goals).toBe(6);
    expect(stats.perSession.goals).toBe(3);
    stats = await hero.caller.players.statistics({
      limit: 30,
      scope: "league",
    });
    expect(stats.totals.goals).toBe(0);
    expect(stats.sessions).toHaveLength(0);

    // La carte et le classement, eux, ne bougent pas : un amical n'y compte pas.
    expect((await hero.caller.players.me()).goals).toBe(0);
  });

  it("STAT-001 — les ratios se calculent sur la carrière, pas sur la fenêtre", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const squad: TestPlayer[] = [];
    for (let index = 0; index < friendly.minParticipants; index++) {
      const player = await createPlayer();
      await grantUno(player.identity.playerId, 3000);
      squad.push(player);
    }
    const hero = squad[0]!;

    await playSession(admin, squad, {
      modeId: "friendly",
      date: daysFromNow(3),
      venueId: "arena",
      goals: 4,
    });

    const large = await hero.caller.players.statistics({ limit: 30 });
    const narrow = await hero.caller.players.statistics({ limit: 1 });

    // Rétrécir la fenêtre d'affichage ne doit pas changer un « buts par
    // séance » : un chiffre qui bouge sans que rien ne se soit passé ne veut
    // rien dire.
    expect(narrow.perSession).toEqual(large.perSession);
    expect(narrow.totals).toEqual(large.totals);
  });

  it("STAT-001 — sans séance jouée, tout est à zéro plutôt qu'indéfini", async () => {
    const joueur = await createPlayer();
    const stats = await joueur.caller.players.statistics({ limit: 30 });

    expect(stats.totals.matchesPlayed).toBe(0);
    expect(stats.sessions).toEqual([]);
    // Une division par zéro donnerait NaN, qui traverse l'écran jusqu'au
    // joueur sous la forme d'un « NaN but par séance ».
    expect(stats.perSession.goals).toBe(0);
    expect(stats.perSession.contributions).toBe(0);
  });
});
