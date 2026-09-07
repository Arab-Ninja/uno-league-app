import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { DEFAULT_REWARD_POLICY, getGameMode } from "@uno/shared";
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

    const teams = await admin.caller.admin.generateTeams({ proposalId });

    expect(teams).toHaveLength(3);
    for (const team of teams) expect(team.players).toHaveLength(5);

    const ids = teams.flatMap((team) => team.players.map((p) => p.id)).sort((a, b) => a - b);
    expect(new Set(ids).size).toBe(15);
    expect(ids).toEqual(squad.map((p) => p.identity.playerId).sort((a, b) => a - b));
  });

  it("le tirage des équipes est idempotent", async () => {
    const { admin, proposalId } = await playableSession();

    const first = await admin.caller.admin.generateTeams({ proposalId });
    const second = await admin.caller.admin.generateTeams({ proposalId });

    expect(second.map((t) => t.players.map((p) => p.id))).toEqual(
      first.map((t) => t.players.map((p) => p.id)),
    );
  });

  it("MATCH-004 / MATCH-005 — une double validation ne compte pas deux fois", async () => {
    const { admin, proposalId } = await playableSession();
    const teams = await admin.caller.admin.generateTeams({ proposalId });
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
        { playerId: scorer.id, goals: 3, assists: 1, defenses: 2, saves: 0, motm: true },
      ],
    });

    await admin.caller.admin.validateMatch({ matchId: match.id });

    const ranking = await admin.caller.ranking.list({ division: "D1", stat: "goals", limit: 50 });
    const entry = ranking.entries.find((e) => e.player.id === scorer.id);
    expect(entry?.value).toBe(3);

    // Seconde validation : refusée, et rien n'est recompté.
    await expect(
      admin.caller.admin.validateMatch({ matchId: match.id }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const after = await admin.caller.ranking.list({ division: "D1", stat: "goals", limit: 50 });
    expect(after.entries.find((e) => e.player.id === scorer.id)?.value).toBe(3);
  });

  it("MATCH-005 — la récompense meilleure équipe n'est versée qu'une fois", async () => {
    const { admin, proposalId } = await playableSession();
    const teams = await admin.caller.admin.generateTeams({ proposalId });
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
    await admin.caller.admin.generateTeams({ proposalId });
    const matches = await admin.caller.proposals.matches({ proposalId });
    const match = matches[0]!;

    const outsider = await createPlayer();
    await expect(
      admin.caller.admin.reportMatch({
        matchId: match.id,
        scoreA: 1,
        scoreB: 0,
        stats: [
          { playerId: outsider.identity.playerId, goals: 1, assists: 0, defenses: 0, saves: 0, motm: false },
        ],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("MATCH-003 — un score négatif est rejeté par la validation d'entrée", async () => {
    const { admin, proposalId } = await playableSession();
    await admin.caller.admin.generateTeams({ proposalId });
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

    const teams = await admin.caller.admin.generateTeams({ proposalId: proposal.id });
    const matches = await admin.caller.proposals.matches({ proposalId: proposal.id });
    const scorer = teams[0]!.players[0]!;

    await admin.caller.admin.reportMatch({
      matchId: matches[0]!.id,
      scoreA: 3,
      scoreB: 0,
      stats: [{ playerId: scorer.id, goals: 3, assists: 0, defenses: 0, saves: 0, motm: false }],
    });
    await admin.caller.admin.validateMatch({ matchId: matches[0]!.id });

    const ranking = await admin.caller.ranking.list({ division: "D3", stat: "goals", limit: 50 });
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

    const rankingD1 = await admin.caller.ranking.list({ division: "D1", stat: "goals", limit: 50 });
    const rankingD2 = await admin.caller.ranking.list({ division: "D2", stat: "goals", limit: 50 });

    expect(rankingD1.entries.map((e) => e.player.id)).toContain(d1.identity.playerId);
    expect(rankingD1.entries.map((e) => e.player.id)).not.toContain(d2.identity.playerId);
    expect(rankingD2.entries.map((e) => e.player.id)).toContain(d2.identity.playerId);
  });

  it("RANK-003 — le classement est stable d'un rafraîchissement à l'autre", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    for (let i = 0; i < 5; i++) await createPlayer();

    const first = await admin.caller.ranking.list({ division: "D3", stat: "goals", limit: 50 });
    const second = await admin.caller.ranking.list({ division: "D3", stat: "goals", limit: 50 });

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
      stat: "goals",
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
    const teams = await admin.caller.admin.generateTeams({ proposalId });
    const matches = await admin.caller.proposals.matches({ proposalId });
    const match = matches[0]!;

    const buteur = teams[0]!.players[0]!;
    const passeur = teams[0]!.players[1]!;

    await admin.caller.admin.reportMatch({
      matchId: match.id,
      scoreA: 4,
      scoreB: 2,
      stats: [
        { playerId: buteur.id, goals: 3, assists: 0, defenses: 1, saves: 0, motm: true },
        { playerId: passeur.id, goals: 1, assists: 4, defenses: 5, saves: 0, motm: false },
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
    expect(byAward.get("motm")?.player.id).toBe(buteur.id);
  });

  it("un match non validé n'alimente pas le podium", async () => {
    const { admin, proposalId } = await playableSession();
    const teams = await admin.caller.admin.generateTeams({ proposalId });
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
          motm: true,
        },
      ],
    });

    // Le rapport est saisi mais pas validé : rien à distinguer encore.
    expect(await admin.caller.proposals.podium({ proposalId })).toEqual([]);
  });

  it("une distinction sans performance n'apparaît pas", async () => {
    const { admin, proposalId } = await playableSession();
    const teams = await admin.caller.admin.generateTeams({ proposalId });
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
          motm: false,
        },
      ],
    });
    await admin.caller.admin.validateMatch({ matchId: matches[0]!.id });

    const podium = await admin.caller.proposals.podium({ proposalId });
    const awards = podium.map((entry) => entry.award);

    // Un seul but marqué, aucune passe ni défense, aucun homme du match.
    expect(awards).toEqual(["topScorer"]);
  });

  it("la note de la carte suit les statistiques acquises en match", async () => {
    const { admin, proposalId } = await playableSession();
    const teams = await admin.caller.admin.generateTeams({ proposalId });
    const matches = await admin.caller.proposals.matches({ proposalId });
    const player = teams[0]!.players[0]!;

    expect(player.rating).toBe(50);

    await admin.caller.admin.reportMatch({
      matchId: matches[0]!.id,
      scoreA: 6,
      scoreB: 1,
      stats: [
        { playerId: player.id, goals: 6, assists: 4, defenses: 3, saves: 0, motm: true },
      ],
    });
    await admin.caller.admin.validateMatch({ matchId: matches[0]!.id });

    const after = await admin.caller.players.publicProfile({ playerId: player.id });
    expect(after.rating).toBeGreaterThan(50);
    expect(after.goals).toBe(6);
  });
});
