import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  DEFAULT_REWARD_POLICY,
  REFEREE_SESSION_FEE_UNO,
  SESSION_MOVEMENT_COUNT,
  getGameMode,
} from "@uno/shared";
import { db } from "../src/db/client.js";
import { auditPlayerBalance } from "../src/services/ledger.service.js";
import {
  balanceOf,
  createPlayer,
  daysFromNow,
  grantUno,
  promoteToAdmin,
  resetDatabase,
  type TestPlayer,
} from "./helpers.js";

const league = getGameMode("league")!;

/** Monte une session League D1 complète, payée par tous les participants. */
async function playableSession(): Promise<{
  admin: TestPlayer;
  squad: TestPlayer[];
  proposalId: number;
}> {
  const admin = await promoteToAdmin(await createPlayer());
  const squad: TestPlayer[] = [];

  for (let i = 0; i < league.minParticipants; i++) {
    const player = await createPlayer();
    await admin.caller.admin.setDivision({
      playerId: player.identity.playerId,
      division: "D1",
    });
    await grantUno(player.identity.playerId, 1000);
    squad.push(player);
  }

  const creator = squad[0]!;
  const { proposal } = await creator.caller.proposals.create({
    date: daysFromNow(3),
    slotStartHour: 18,
    venueId: "arena",
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

  return { admin, squad, proposalId: proposal.id };
}

describe("matchs, équipes et statistiques", () => {
  beforeEach(resetDatabase);

  it("MATCH-001 — 15 participants forment 3 équipes de 5, sans oubli ni doublon", async () => {
    const { admin, squad, proposalId } = await playableSession();

    const teams = await admin.caller.supervision.generateTeams({ proposalId });

    expect(teams).toHaveLength(3);
    for (const team of teams) expect(team.players).toHaveLength(5);

    const ids = teams.flatMap((team) => team.players.map((p) => p.id)).sort((a, b) => a - b);
    expect(new Set(ids).size).toBe(15);
    expect(ids).toEqual(squad.map((p) => p.identity.playerId).sort((a, b) => a - b));
  });

  it("le tirage des équipes est idempotent", async () => {
    const { admin, proposalId } = await playableSession();

    const first = await admin.caller.supervision.generateTeams({ proposalId });
    const second = await admin.caller.supervision.generateTeams({ proposalId });

    expect(second.map((t) => t.players.map((p) => p.id))).toEqual(
      first.map((t) => t.players.map((p) => p.id)),
    );
  });

  it("MATCH-004 / MATCH-005 — une double validation ne compte pas deux fois", async () => {
    const { admin, proposalId } = await playableSession();
    const teams = await admin.caller.supervision.generateTeams({ proposalId });
    const matches = await admin.caller.proposals.matches({ proposalId });
    const match = matches[0]!;

    const scorer = teams[0]!.players[0]!;
    const before = await admin.caller.players.publicProfile({ playerId: scorer.id });
    void before;

    await admin.caller.admin.reportMatch({
      matchId: match.id,
      scoreA: 5,
      scoreB: 3,
      stats: [
        { playerId: scorer.id, goals: 3, assists: 1, defenses: 2, saves: 0 },
      ],
    });

    await admin.caller.admin.validateMatch({ matchId: match.id });

    const ranking = await admin.caller.ranking.list({ division: "D1", sort: "goals", limit: 50 });
    const entry = ranking.entries.find((e) => e.player.id === scorer.id);
    expect(entry?.value).toBe(3);

    // Seconde validation : refusée, et rien n'est recompté.
    await expect(
      admin.caller.admin.validateMatch({ matchId: match.id }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const after = await admin.caller.ranking.list({ division: "D1", sort: "goals", limit: 50 });
    expect(after.entries.find((e) => e.player.id === scorer.id)?.value).toBe(3);
  });

  it("MATCH-005 — la récompense meilleure équipe n'est versée qu'une fois", async () => {
    const { admin, proposalId } = await playableSession();
    const teams = await admin.caller.supervision.generateTeams({ proposalId });
    const matches = await admin.caller.proposals.matches({ proposalId });
    const match = matches[0]!;

    const winner = teams.find((t) => t.id === match.teamA?.id)!.players[0]!;
    const before = await balanceOf(winner.id);

    await admin.caller.admin.reportMatch({
      matchId: match.id,
      scoreA: 4,
      scoreB: 1,
      stats: [],
    });
    await admin.caller.admin.validateMatch({ matchId: match.id });

    const expected = before + DEFAULT_REWARD_POLICY.bestTeam.D1;
    expect(await balanceOf(winner.id)).toBe(expected);

    await admin.caller.admin
      .validateMatch({ matchId: match.id })
      .catch(() => null);
    expect(await balanceOf(winner.id)).toBe(expected);

    const audit = await auditPlayerBalance(db, winner.id);
    expect(audit.consistent).toBe(true);
  });

  it("MATCH-003 — une statistique d'un joueur absent du match est refusée", async () => {
    const { admin, proposalId } = await playableSession();
    await admin.caller.supervision.generateTeams({ proposalId });
    const matches = await admin.caller.proposals.matches({ proposalId });
    const match = matches[0]!;

    const outsider = await createPlayer();
    await expect(
      admin.caller.admin.reportMatch({
        matchId: match.id,
        scoreA: 1,
        scoreB: 0,
        stats: [
          { playerId: outsider.identity.playerId, goals: 1, assists: 0, defenses: 0, saves: 0 },
        ],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("MATCH-003 — un score négatif est rejeté par la validation d'entrée", async () => {
    const { admin, proposalId } = await playableSession();
    await admin.caller.supervision.generateTeams({ proposalId });
    const matches = await admin.caller.proposals.matches({ proposalId });

    await expect(
      admin.caller.admin.reportMatch({
        matchId: matches[0]!.id,
        scoreA: -1,
        scoreB: 0,
        stats: [],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("§8.2 — la clôture de session verse la participation une seule fois", async () => {
    const { admin, squad, proposalId } = await playableSession();
    const player = squad[0]!;
    const before = await balanceOf(player.identity.playerId);

    await admin.caller.admin.completeSession({ proposalId });
    const expected = before + DEFAULT_REWARD_POLICY.participation.D1;
    expect(await balanceOf(player.identity.playerId)).toBe(expected);

    // Une seconde clôture est refusée : la session n'est plus au bon statut.
    await expect(
      admin.caller.admin.completeSession({ proposalId }),
    ).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });
    expect(await balanceOf(player.identity.playerId)).toBe(expected);
  });

  it("MATCH-006 — la session clôturée apparaît une seule fois dans l'historique", async () => {
    const { admin, squad, proposalId } = await playableSession();
    await admin.caller.admin.completeSession({ proposalId });

    const history = await squad[0]!.caller.players.history({ limit: 20 });
    expect(history.filter((s) => s.id === proposalId)).toHaveLength(1);
  });

  it("§8 — un match amical ne compte pas au classement", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const friendly = getGameMode("friendly")!;
    const squad: TestPlayer[] = [];

    for (let i = 0; i < friendly.minParticipants; i++) {
      const player = await createPlayer();
      await grantUno(player.identity.playerId, 500);
      squad.push(player);
    }

    const { proposal } = await squad[0]!.caller.proposals.create({
      date: daysFromNow(3),
      slotStartHour: 20,
      venueId: "yc-five",
      modeId: "friendly",
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

    const teams = await admin.caller.supervision.generateTeams({ proposalId: proposal.id });
    const matches = await admin.caller.proposals.matches({ proposalId: proposal.id });
    const scorer = teams[0]!.players[0]!;

    await admin.caller.admin.reportMatch({
      matchId: matches[0]!.id,
      scoreA: 3,
      scoreB: 0,
      stats: [{ playerId: scorer.id, goals: 3, assists: 0, defenses: 0, saves: 0 }],
    });
    await admin.caller.admin.validateMatch({ matchId: matches[0]!.id });

    const ranking = await admin.caller.ranking.list({ division: "D3", sort: "goals", limit: 50 });
    expect(ranking.entries.find((e) => e.player.id === scorer.id)?.value).toBe(0);
  });
});

describe("classement", () => {
  beforeEach(resetDatabase);

  it("RANK-001 — changer de division recharge uniquement les joueurs concernés", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const d1 = await createPlayer();
    const d2 = await createPlayer();
    await admin.caller.admin.setDivision({ playerId: d1.identity.playerId, division: "D1" });
    await admin.caller.admin.setDivision({ playerId: d2.identity.playerId, division: "D2" });

    const rankingD1 = await admin.caller.ranking.list({ division: "D1", sort: "goals", limit: 50 });
    const rankingD2 = await admin.caller.ranking.list({ division: "D2", sort: "goals", limit: 50 });

    expect(rankingD1.entries.map((e) => e.player.id)).toContain(d1.identity.playerId);
    expect(rankingD1.entries.map((e) => e.player.id)).not.toContain(d2.identity.playerId);
    expect(rankingD2.entries.map((e) => e.player.id)).toContain(d2.identity.playerId);
  });

  it("RANK-003 — le classement est stable d'un rafraîchissement à l'autre", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    for (let i = 0; i < 5; i++) await createPlayer();

    const first = await admin.caller.ranking.list({ division: "D3", sort: "goals", limit: 50 });
    const second = await admin.caller.ranking.list({ division: "D3", sort: "goals", limit: 50 });

    expect(second.entries.map((e) => e.player.id)).toEqual(
      first.entries.map((e) => e.player.id),
    );
    expect(second.entries.map((e) => e.position)).toEqual(
      first.entries.map((e) => e.position),
    );
  });

  it("RANK-005 — les quotas de montée/descente sont des paramètres, pas des constantes", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const promoted: number[] = [];
    for (let i = 0; i < 4; i++) {
      const player = await createPlayer();
      await admin.caller.admin.setDivision({
        playerId: player.identity.playerId,
        division: "D2",
      });
      promoted.push(player.identity.playerId);
    }

    const result = await admin.caller.admin.applySeasonLadder({
      promotionCount: 2,
      relegationCount: 0,
      sort: "points",
    });

    // La montée s'applique à chaque échelon (D2→D1 puis D3→D2) : on vérifie
    // le quota sur la cohorte D2, et que le quota est bien respecté.
    const promotedFromD2 = result.promoted.filter((id) => promoted.includes(id));
    expect(promotedFromD2).toHaveLength(2);

    const remainingD2 = await admin.caller.admin.players({ limit: 50, division: "D2" });
    const stillD2 = remainingD2.items.filter((p) => promoted.includes(p.id));
    expect(stillD2).toHaveLength(2);
  });
});

describe("administration", () => {
  beforeEach(resetDatabase);

  it("E2E-012 — un joueur ordinaire reçoit 403 sur toutes les routes admin", async () => {
    const player = await createPlayer();

    const attempts: Promise<unknown>[] = [
      player.caller.admin.stats(),
      player.caller.admin.players({ limit: 20 }),
      player.caller.admin.setDivision({ playerId: 1, division: "D1" }),
      player.caller.admin.adjustUno({
        playerId: 1,
        amount: 100,
        direction: "credit",
        reason: "tentative",
      }),
      player.caller.admin.shopItems(),
      player.caller.admin.auditLogs({ limit: 20 }),
    ];

    for (const attempt of attempts) {
      await expect(attempt).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("E2E-013 — un admin change la division, et l'audit le trace", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const player = await createPlayer();

    await admin.caller.admin.setDivision({
      playerId: player.identity.playerId,
      division: "D1",
      reason: "Promotion exceptionnelle",
    });

    expect((await player.caller.players.me()).division).toBe("D1");

    const logs = await admin.caller.admin.auditLogs({ limit: 20 });
    const entry = logs.items.find((log) => log.action === "player.division.update");
    expect(entry).toBeDefined();
    expect(entry?.actorEmail).toBe(admin.email);
    expect(entry?.beforeJson).toMatchObject({ division: "D3" });
    expect(entry?.afterJson).toMatchObject({ division: "D1" });
  });

  it("ADMIN-002 — un débit supérieur au solde est refusé, un crédit passe", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const player = await createPlayer();

    const credited = await admin.caller.admin.adjustUno({
      playerId: player.identity.playerId,
      amount: 100,
      direction: "credit",
      reason: "Bonus exceptionnel",
    });
    expect(credited.balanceAfter).toBe(1100);

    await expect(
      admin.caller.admin.adjustUno({
        playerId: player.identity.playerId,
        amount: 5000,
        direction: "debit",
        reason: "Retrait trop important",
      }),
    ).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });

    expect(await balanceOf(player.identity.playerId)).toBe(1100);
  });

  it("ADMIN-003 — la nouvelle division filtre immédiatement le calendrier", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const author = await createPlayer();
    const viewer = await createPlayer();

    await admin.caller.admin.setDivision({ playerId: author.identity.playerId, division: "D1" });
    await author.caller.proposals.create({
      date: daysFromNow(3),
      slotStartHour: 18,
      venueId: "arena",
      modeId: "league",
    });

    expect(
      (await viewer.caller.proposals.list({ mineOnly: false })).filter(
        (p) => p.modeId === "league",
      ),
    ).toHaveLength(0);

    await admin.caller.admin.setDivision({ playerId: viewer.identity.playerId, division: "D1" });

    expect(
      (await viewer.caller.proposals.list({ mineOnly: false })).filter(
        (p) => p.modeId === "league",
      ),
    ).toHaveLength(1);
  });

  it("WAL-006 — le tableau de bord admin ne signale aucune incohérence de solde", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const player = await createPlayer();
    await admin.caller.admin.adjustUno({
      playerId: player.identity.playerId,
      amount: 250,
      direction: "credit",
      reason: "Contrôle de cohérence",
    });

    const stats = await admin.caller.admin.stats();
    expect(stats.inconsistentBalances).toBe(0);
    expect(stats.counts.players).toBeGreaterThanOrEqual(2);
  });
});

describe("carte joueur et podium", () => {
  beforeEach(resetDatabase);

  it("la vue publique porte tout le nécessaire à la carte, et rien de personnel", async () => {
    const player = await createPlayer();
    const other = await createPlayer();

    const view = await player.caller.players.publicProfile({
      playerId: other.identity.playerId,
    });

    // Ce qu'il faut pour dessiner la carte
    expect(view).toMatchObject({
      id: other.identity.playerId,
      division: "D3",
      position: "MIL",
      tier: "bronze",
      rating: 50,
      goals: 0,
      matchesPlayed: 0,
    });

    // ROLE-002 : aucune donnée personnelle ne doit transiter
    expect(view).not.toHaveProperty("email");
    expect(view).not.toHaveProperty("address");
    expect(view).not.toHaveProperty("unoPoints");
    expect(view).not.toHaveProperty("dateOfBirth");
  });

  it("AUTH-007 — le joueur choisit son poste, jamais sa division", async () => {
    const player = await createPlayer();

    await player.caller.players.updateProfile({ position: "GB" });
    const profile = await player.caller.players.me();

    expect(profile.position).toBe("GB");
    expect(profile.division).toBe("D3");
    expect(profile.tier).toBe("bronze");
  });

  it("la clôture d'une session incrémente le compteur de matchs joués", async () => {
    const { admin, squad, proposalId } = await playableSession();
    const player = squad[0]!;

    expect((await player.caller.players.me()).matchesPlayed).toBe(0);

    await admin.caller.admin.completeSession({ proposalId });

    expect((await player.caller.players.me()).matchesPlayed).toBe(1);
  });

  it("le podium met en avant les joueurs distingués de la session", async () => {
    const { admin, proposalId } = await playableSession();
    const teams = await admin.caller.supervision.generateTeams({ proposalId });
    const matches = await admin.caller.proposals.matches({ proposalId });
    const match = matches[0]!;

    const buteur = teams[0]!.players[0]!;
    const passeur = teams[0]!.players[1]!;

    await admin.caller.admin.reportMatch({
      matchId: match.id,
      scoreA: 4,
      scoreB: 2,
      stats: [
        { playerId: buteur.id, goals: 3, assists: 0, defenses: 1, saves: 0 },
        { playerId: passeur.id, goals: 1, assists: 4, defenses: 5, saves: 0 },
      ],
    });
    await admin.caller.admin.validateMatch({ matchId: match.id });

    const podium = await admin.caller.proposals.podium({ proposalId });
    const byAward = new Map(podium.map((entry) => [entry.award, entry]));

    expect(byAward.get("topScorer")).toMatchObject({ value: 3 });
    expect(byAward.get("topScorer")?.player.id).toBe(buteur.id);
    expect(byAward.get("topAssist")).toMatchObject({ value: 4 });
    expect(byAward.get("topAssist")?.player.id).toBe(passeur.id);
    expect(byAward.get("topDefender")?.player.id).toBe(passeur.id);
    // L'homme du match est celui qui totalise le plus de points sur la
    // session : le passeur (1,5 + 4 + 2,5 = 8) devance le buteur
    // (4,5 + 0 + 0,5 = 5), bien que celui-ci ait marqué davantage.
    expect(byAward.get("motm")?.player.id).toBe(passeur.id);
  });

  it("un match non validé n'alimente pas le podium", async () => {
    const { admin, proposalId } = await playableSession();
    const teams = await admin.caller.supervision.generateTeams({ proposalId });
    const matches = await admin.caller.proposals.matches({ proposalId });

    await admin.caller.admin.reportMatch({
      matchId: matches[0]!.id,
      scoreA: 2,
      scoreB: 0,
      stats: [
        {
          playerId: teams[0]!.players[0]!.id,
          goals: 2,
          assists: 0,
          defenses: 0,
          saves: 0,
        },
      ],
    });

    // Le rapport est saisi mais pas validé : rien à distinguer encore.
    expect(await admin.caller.proposals.podium({ proposalId })).toEqual([]);
  });

  it("une distinction sans performance n'apparaît pas", async () => {
    const { admin, proposalId } = await playableSession();
    const teams = await admin.caller.supervision.generateTeams({ proposalId });
    const matches = await admin.caller.proposals.matches({ proposalId });

    await admin.caller.admin.reportMatch({
      matchId: matches[0]!.id,
      scoreA: 1,
      scoreB: 0,
      stats: [
        {
          playerId: teams[0]!.players[0]!.id,
          goals: 1,
          assists: 0,
          defenses: 0,
          saves: 0,
        },
      ],
    });
    await admin.caller.admin.validateMatch({ matchId: matches[0]!.id });

    const podium = await admin.caller.proposals.podium({ proposalId });
    const awards = podium.map((entry) => entry.award);

    // Aucune passe ni défense n'ayant été réalisée, les distinctions
    // correspondantes n'apparaissent pas : on ne décerne pas un titre à
    // zéro. L'homme du match, lui, existe dès qu'un joueur a marqué des
    // points — ici l'unique buteur, seul à en avoir.
    expect(awards).toEqual(["topScorer", "motm"]);
    expect(podium.map((entry) => entry.player.id)).toEqual([
      teams[0]!.players[0]!.id,
      teams[0]!.players[0]!.id,
    ]);
  });

  /**
   * CARD-002 — la note ne suit plus le total de carrière.
   *
   * Elle le suivait, et ne pouvait donc que monter : une carte finissait par
   * ne plus rien dire de la forme du joueur. Elle se déplace désormais à la
   * **clôture d'une session**, comparée à la session précédente — jamais à la
   * validation d'un match isolé, qui ne clôt rien.
   *
   * Le déplacement lui-même, dans les deux sens, est couvert par
   * `rating.test.ts`.
   */
  it("la note ne bouge pas à la validation d'un match, les statistiques si", async () => {
    const { admin, proposalId } = await playableSession();
    const teams = await admin.caller.supervision.generateTeams({ proposalId });
    const matches = await admin.caller.proposals.matches({ proposalId });
    const player = teams[0]!.players[0]!;

    expect(player.rating).toBe(50);

    await admin.caller.admin.reportMatch({
      matchId: matches[0]!.id,
      scoreA: 6,
      scoreB: 1,
      stats: [
        { playerId: player.id, goals: 6, assists: 4, defenses: 3, saves: 0 },
      ],
    });
    await admin.caller.admin.validateMatch({ matchId: matches[0]!.id });

    const after = await admin.caller.players.publicProfile({ playerId: player.id });
    expect(after.goals).toBe(6);
    expect(after.assists).toBe(4);
    // Un match validé alimente la carrière ; la note attend la clôture.
    expect(after.rating).toBe(50);
  });

  /**
   * §8 — un amical ne rapporte aucun UNO et ne touche pas aux divisions.
   *
   * Le barème affiché doit dire la même chose que ce qui est versé : annoncer
   * une participation qui n'arrive jamais serait une promesse non tenue, faite
   * avant que le joueur ne paie sa place.
   */
  it("§8 — un match amical ne verse aucun UNO et ne change aucune division", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const friendly = getGameMode("friendly")!;
    const squad: TestPlayer[] = [];

    for (let i = 0; i < friendly.minParticipants; i++) {
      const player = await createPlayer();
      await grantUno(player.identity.playerId, 500);
      squad.push(player);
    }

    const { proposal } = await squad[0]!.caller.proposals.create({
      date: daysFromNow(3),
      slotStartHour: 20,
      venueId: "yc-five",
      modeId: "friendly",
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

    // Le détail n'annonce aucune récompense pour ce mode.
    const detail = await squad[0]!.caller.proposals.get({ proposalId: proposal.id });
    expect(detail.rewards).toEqual([]);

    const teams = await admin.caller.supervision.generateTeams({ proposalId: proposal.id });
    const matches = await admin.caller.proposals.matches({ proposalId: proposal.id });

    const balancesBefore = await Promise.all(
      squad.map((player) => balanceOf(player.identity.playerId)),
    );

    await admin.caller.supervision.record({
      proposalId: proposal.id,
      matches: matches.map((match, index) => ({
        matchId: match.id,
        scoreA: 3 + index,
        scoreB: 1,
        stats: [
          ...(match.teamA?.players ?? []),
          ...(match.teamB?.players ?? []),
        ].map((player, rank) => ({
          playerId: player.id,
          goals: rank % 3,
          assists: rank % 2,
          defenses: rank,
          saves: 0,
        })),
      })),
      complete: true,
    });

    // Aucun UNO versé : les soldes sont strictement inchangés.
    const balancesAfter = await Promise.all(
      squad.map((player) => balanceOf(player.identity.playerId)),
    );
    expect(balancesAfter).toEqual(balancesBefore);

    // Aucune division touchée, et aucun mouvement affiché : la question ne se
    // pose pas dans ce mode.
    const played = await squad[0]!.caller.proposals.get({ proposalId: proposal.id });
    expect(played.participants.every((row) => row.player.division === "D3")).toBe(true);
    expect(played.participants.every((row) => row.movement === null)).toBe(true);
  });

  /**
   * RANK-005 — montées et descentes à l'issue d'une session classée.
   *
   * Quinze joueurs, cinq montent, cinq descendent, cinq se maintiennent — sauf
   * aux extrémités. Cette session est en D1 : personne ne monte plus haut, et
   * le mouvement des cinq premiers est donc « se maintient ». Les cinq
   * derniers, eux, descendent bel et bien en D2.
   */
  it("RANK-005 — la session classée fait descendre les cinq derniers", async () => {
    const { admin, proposalId, squad } = await playableSession();

    const squads = await admin.caller.supervision.generateTeams({ proposalId });

    // Le tirage n'ouvre que la première rencontre : en UNO League les matchs
    // s'enchaînent, le vainqueur restant sur le terrain. On complète ici le
    // tour complet, pour que les quinze joueurs aient tous disputé le même
    // nombre de matchs — sans quoi le classement de session récompenserait le
    // temps de jeu plutôt que la performance.
    await admin.caller.supervision.addMatch({
      proposalId,
      teamAId: squads[0]!.id,
      teamBId: squads[2]!.id,
    });
    await admin.caller.supervision.addMatch({
      proposalId,
      teamAId: squads[1]!.id,
      teamBId: squads[2]!.id,
    });

    const matches = await admin.caller.proposals.matches({ proposalId });
    expect(matches).toHaveLength(3);

    // Chaque joueur reçoit un nombre de buts fixe, décroissant selon son rang
    // dans l'effectif : chacun disputant deux matchs, l'ordre du classement de
    // session est parfaitement déterminé.
    const rank = new Map(
      squads
        .flatMap((team) => team.players)
        .map((player, index) => [player.id, 20 - index]),
    );

    await admin.caller.supervision.record({
      proposalId,
      matches: matches.map((match) => ({
        matchId: match.id,
        scoreA: 5,
        scoreB: 2,
        stats: [
          ...(match.teamA?.players ?? []),
          ...(match.teamB?.players ?? []),
        ].map((player) => ({
          playerId: player.id,
          goals: rank.get(player.id) ?? 0,
          assists: 0,
          defenses: 0,
          saves: 0,
        })),
      })),
      complete: true,
    });

    const detail = await admin.caller.proposals.get({ proposalId });
    const promoted = detail.participants.filter((row) => row.movement === "promoted");
    const relegated = detail.participants.filter((row) => row.movement === "relegated");

    // Sommet de la hiérarchie : aucune montée possible.
    expect(promoted).toHaveLength(0);
    expect(relegated).toHaveLength(SESSION_MOVEMENT_COUNT);
    expect(relegated.every((row) => row.player.division === "D2")).toBe(true);

    // Les relégués sont bien les derniers du classement de session.
    expect(relegated.map((row) => row.sessionRank)).toEqual([11, 12, 13, 14, 15]);

    // Et les autres restent en D1.
    expect(
      detail.participants
        .filter((row) => row.movement === "stayed")
        .every((row) => row.player.division === "D1"),
    ).toBe(true);

    // Le classement de session est complet et ordonné.
    expect(detail.participants.map((row) => row.sessionRank)).toEqual(
      Array.from({ length: squad.length }, (_unused, index) => index + 1),
    );

    // §8.2 — l'homme du match est le joueur au plus grand total de points.
    const podium = await admin.caller.proposals.podium({ proposalId });
    const motm = podium.find((entry) => entry.award === "motm");
    expect(motm?.player.id).toBe(detail.participants[0]?.player.id);
  });

  /**
   * §8.2 — le meilleur défenseur cumule défenses ET arrêts.
   *
   * Ne compter que les défenses écartait mécaniquement les gardiens d'une
   * distinction qui les concerne au premier chef.
   */
  it("§8.2 — le meilleur défenseur additionne défenses et arrêts", async () => {
    const { admin, proposalId } = await playableSession();
    const teams = await admin.caller.supervision.generateTeams({ proposalId });
    const matches = await admin.caller.proposals.matches({ proposalId });
    const match = matches[0]!;

    const gardien = teams[0]!.players[0]!;
    const defenseur = teams[0]!.players[1]!;

    await admin.caller.admin.reportMatch({
      matchId: match.id,
      scoreA: 1,
      scoreB: 0,
      stats: [
        // Le gardien défend moins souvent au pied, mais arrête bien plus.
        { playerId: gardien.id, goals: 0, assists: 0, defenses: 2, saves: 9 },
        { playerId: defenseur.id, goals: 1, assists: 0, defenses: 7, saves: 0 },
      ],
    });
    await admin.caller.admin.validateMatch({ matchId: match.id });

    const podium = await admin.caller.proposals.podium({ proposalId });
    const best = podium.find((entry) => entry.award === "topDefender");

    expect(best?.player.id).toBe(gardien.id);
    expect(best?.value).toBe(11);
  });

});

describe("arbitrage (ROLE-003)", () => {
  beforeEach(resetDatabase);

  it("un arbitre se propose, un seul par session, et il ne paie pas", async () => {
    const { admin, proposalId } = await playableSession();
    const referee = await createPlayer({ accountType: "referee" });
    const other = await createPlayer({ accountType: "referee" });

    const assigned = await referee.caller.proposals.becomeReferee({ proposalId });
    expect(assigned.accountType).toBe("referee");
    // Carte verte : l'arbitre est hors hiérarchie des divisions.
    expect(assigned.tier).toBe("referee");

    const detail = await referee.caller.proposals.get({ proposalId });
    expect(detail.referee?.id).toBe(referee.identity.playerId);
    // Il n'est pas participant : ni quota, ni paiement, ni équipe.
    expect(detail.participantCount).toBe(league.minParticipants);
    expect(
      detail.participants.some((row) => row.player.id === referee.identity.playerId),
    ).toBe(false);

    // La place est prise : un second arbitre est refusé.
    await expect(
      other.caller.proposals.becomeReferee({ proposalId }),
    ).rejects.toThrow(/déjà un arbitre/);

    // Se proposer de nouveau est sans effet, pas une erreur.
    await referee.caller.proposals.becomeReferee({ proposalId });

    // Il se retire, la place se libère.
    await referee.caller.proposals.withdrawReferee({ proposalId });
    const freed = await other.caller.proposals.becomeReferee({ proposalId });
    expect(freed.id).toBe(other.identity.playerId);

    void admin;
  });

  it("un joueur ordinaire ne peut pas arbitrer", async () => {
    const { proposalId } = await playableSession();
    const player = await createPlayer();

    await expect(
      player.caller.proposals.becomeReferee({ proposalId }),
    ).rejects.toThrow(/compte arbitre/);
  });

  it("un match amical n'est pas arbitré", async () => {
    const referee = await createPlayer({ accountType: "referee" });
    const creator = await createPlayer();
    const { proposal } = await creator.caller.proposals.create({
      date: daysFromNow(3),
      slotStartHour: 20,
      venueId: "yc-five",
      modeId: "friendly",
    });

    await expect(
      referee.caller.proposals.becomeReferee({ proposalId: proposal.id }),
    ).rejects.toThrow(/UNO League/);
  });

  it("§8.2 — l'arbitre est rémunéré à la clôture, une seule fois", async () => {
    const { admin, proposalId } = await playableSession();
    const referee = await createPlayer({ accountType: "referee" });
    await referee.caller.proposals.becomeReferee({ proposalId });

    const before = await balanceOf(referee.identity.playerId);

    const squads = await admin.caller.supervision.generateTeams({ proposalId });
    const matches = await admin.caller.proposals.matches({ proposalId });

    await admin.caller.supervision.record({
      proposalId,
      matches: matches.map((match) => ({
        matchId: match.id,
        scoreA: 3,
        scoreB: 1,
        stats: [
          ...(match.teamA?.players ?? []),
          ...(match.teamB?.players ?? []),
        ].map((player) => ({
          playerId: player.id,
          goals: 1,
          assists: 0,
          defenses: 0,
          saves: 0,
        })),
      })),
      complete: true,
    });

    expect(await balanceOf(referee.identity.playerId)).toBe(
      before + REFEREE_SESSION_FEE_UNO,
    );

    // Le compteur de sa carte suit son travail.
    const card = await referee.caller.players.me();
    expect(card.sessionsRefereed).toBe(1);

    // Et il n'entre pas au classement des joueurs.
    const ranking = await admin.caller.ranking.list({
      division: "D1",
      sort: "points",
      limit: 50,
    });
    expect(
      ranking.entries.some((row) => row.player.id === referee.identity.playerId),
    ).toBe(false);

    void squads;
  });
});
