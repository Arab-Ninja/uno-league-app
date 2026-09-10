import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { SESSION_MOVEMENT_COUNT, getGameMode, type Division } from "@uno/shared";
import { sweepIneligibleSeats } from "../src/services/eligibility.service.js";
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
 * Éligibilité d'une place à une session UNO League (CAL-002, ROLE-003).
 *
 * La division est vérifiée à l'inscription, mais elle **change ensuite** :
 * une clôture de session fait monter les cinq premiers et descendre les cinq
 * derniers. Sans correction, une réservation D2 finit par contenir des D1 et
 * des D3 — ce que ces tests interdisent.
 */

const league = getGameMode("league")!;

/** Nombre d'équipes tirées pour une session, lu directement en base. */
async function teamCount(proposalId: number): Promise<number> {
  const rows = await db.execute<{ total: number }>(
    sql`SELECT COUNT(*) AS total FROM teams WHERE proposal_id = ${proposalId}`,
  );
  return Number((rows[0] as unknown as { total: number }[])[0]?.total ?? 0);
}

/** Effectif d'une division, crédité de quoi payer sa place. */
async function squadOf(
  admin: TestPlayer,
  division: Division,
  size: number,
): Promise<TestPlayer[]> {
  const squad: TestPlayer[] = [];
  for (let index = 0; index < size; index++) {
    const player = await createPlayer();
    await admin.caller.admin.setDivision({
      playerId: player.identity.playerId,
      division,
    });
    await grantUno(player.identity.playerId, 1000);
    squad.push(player);
  }
  return squad;
}

/** Proposition League créée par le premier joueur, rejointe par les autres. */
async function proposalWith(
  squad: TestPlayer[],
  options: { date: string; slotStartHour?: number; venueId?: string },
): Promise<number> {
  const { proposal } = await squad[0]!.caller.proposals.create({
    date: options.date,
    slotStartHour: options.slotStartHour ?? 18,
    venueId: options.venueId ?? "arena",
    modeId: "league",
  });

  for (const player of squad.slice(1)) {
    await player.caller.proposals.join({ proposalId: proposal.id });
  }

  return proposal.id;
}

describe("éligibilité d'une place (CAL-002)", () => {
  beforeEach(resetDatabase);

  it("ELIG-001 — un joueur qui change de division quitte la proposition", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const squad = await squadOf(admin, "D2", 3);
    const proposalId = await proposalWith(squad, { date: daysFromNow(3) });

    const moved = squad[1]!;
    await admin.caller.admin.setDivision({
      playerId: moved.identity.playerId,
      division: "D1",
    });

    const detail = await admin.caller.proposals.get({ proposalId });
    expect(detail.participants.map((row) => row.player.id)).not.toContain(
      moved.identity.playerId,
    );
    expect(detail.participants).toHaveLength(2);
    expect(detail.participantCount).toBe(2);
    expect(detail.status).toBe("proposal");
  });

  it("ELIG-002 — la place réglée est remboursée, et le tirage effacé", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const squad = await squadOf(admin, "D2", league.minParticipants);
    const proposalId = await proposalWith(squad, { date: daysFromNow(3) });

    for (const player of squad) {
      await player.caller.proposals.pay({
        proposalId,
        method: "uno",
        idempotencyKey: randomUUID(),
      });
    }

    const confirmed = await admin.caller.proposals.get({ proposalId });
    expect(confirmed.status).toBe("session");

    // Le tirage existe avant le retrait : il ne doit pas lui survivre.
    await admin.caller.supervision.generateTeams({ proposalId });
    expect(await admin.caller.proposals.matches({ proposalId })).toHaveLength(1);

    const moved = squad[0]!;
    const before = await balanceOf(moved.identity.playerId);

    await admin.caller.admin.setDivision({
      playerId: moved.identity.playerId,
      division: "D1",
    });

    const price = confirmed.priceUno;
    expect(await balanceOf(moved.identity.playerId)).toBe(before + price);

    const detail = await admin.caller.proposals.get({ proposalId });
    expect(detail.participants).toHaveLength(league.minParticipants - 1);
    // Plus assez de joueurs : la session redevient une proposition ouverte.
    expect(detail.status).toBe("proposal");
    expect(detail.paymentComplete).toBe(false);
    expect(detail.paymentDeadline).toBeNull();
    expect(await admin.caller.proposals.matches({ proposalId })).toHaveLength(0);
    expect(await teamCount(proposalId)).toBe(0);

    // Le balayage d'entretien repasse : il ne trouve plus rien à corriger et
    // ne recrédite pas une seconde fois.
    const sweep = await sweepIneligibleSeats();
    expect(sweep.removed).toBe(0);
    expect(await balanceOf(moved.identity.playerId)).toBe(before + price);
  });

  it("ELIG-003 — un remplaçant de la bonne division reprend la place", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const squad = await squadOf(admin, "D2", league.minParticipants);
    const proposalId = await proposalWith(squad, { date: daysFromNow(3) });

    // Tous paient sauf un : la réservation reste ouverte aux remplaçants.
    for (const player of squad.slice(1)) {
      await player.caller.proposals.pay({
        proposalId,
        method: "uno",
        idempotencyKey: randomUUID(),
      });
    }

    const [substitute] = await squadOf(admin, "D2", 1);
    await substitute!.caller.proposals.becomeSubstitute({ proposalId });

    const moved = squad[1]!;
    const before = await balanceOf(moved.identity.playerId);

    await admin.caller.admin.setDivision({
      playerId: moved.identity.playerId,
      division: "D1",
    });

    const detail = await admin.caller.proposals.get({ proposalId });
    const ids = detail.participants.map((row) => row.player.id);

    expect(ids).not.toContain(moved.identity.playerId);
    expect(ids).toContain(substitute!.identity.playerId);
    // La place a changé de titulaire : l'effectif reste complet.
    expect(detail.participants).toHaveLength(league.minParticipants);
    expect(detail.status).toBe("reservation");
    // Le remplaçant hérite d'une place à régler, pas d'une place payée.
    expect(
      detail.participants.find((row) => row.player.id === substitute!.identity.playerId)
        ?.hasPaid,
    ).toBe(false);
    expect(detail.paymentDeadline).not.toBeNull();
    // Et le joueur retiré récupère ce qu'il avait versé.
    expect(await balanceOf(moved.identity.playerId)).toBe(
      before + detail.priceUno,
    );
  });

  it("ELIG-004 — la clôture d'une session vide les autres sessions des joueurs promus", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const squad = await squadOf(admin, "D2", league.minParticipants);

    const playedId = await proposalWith(squad, { date: daysFromNow(3) });
    for (const player of squad) {
      await player.caller.proposals.pay({
        proposalId: playedId,
        method: "uno",
        idempotencyKey: randomUUID(),
      });
    }

    // Le même effectif est inscrit à une seconde session D2, plus tard.
    const laterId = await proposalWith(squad, {
      date: daysFromNow(6),
      slotStartHour: 20,
      venueId: "yc-five",
    });
    expect((await admin.caller.proposals.get({ proposalId: laterId })).status).toBe(
      "reservation",
    );

    const teams = await admin.caller.supervision.generateTeams({ proposalId: playedId });
    await admin.caller.supervision.addMatch({
      proposalId: playedId,
      teamAId: teams[0]!.id,
      teamBId: teams[2]!.id,
    });
    await admin.caller.supervision.addMatch({
      proposalId: playedId,
      teamAId: teams[1]!.id,
      teamBId: teams[2]!.id,
    });

    const rank = new Map(
      teams
        .flatMap((team) => team.players)
        .map((player, index) => [player.id, 20 - index]),
    );
    const played = await admin.caller.proposals.matches({ proposalId: playedId });

    await admin.caller.supervision.record({
      proposalId: playedId,
      matches: played.map((match) => ({
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

    // Cinq montent en D1, cinq descendent en D3 : dix places de la seconde
    // session ne sont plus éligibles.
    const later = await admin.caller.proposals.get({ proposalId: laterId });
    expect(later.participants).toHaveLength(
      league.minParticipants - SESSION_MOVEMENT_COUNT * 2,
    );
    expect(later.participants.every((row) => row.player.division === "D2")).toBe(true);
    expect(later.status).toBe("proposal");
  });

  it("ELIG-005 — une session déjà jouée n'est jamais retouchée", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const squad = await squadOf(admin, "D2", 3);
    const proposalId = await proposalWith(squad, { date: daysFromNow(3) });

    // La session est ramenée dans le passé, comme une session jouée.
    await db.execute(
      sql`UPDATE proposals SET starts_at_utc = DATE_SUB(NOW(), INTERVAL 2 DAY) WHERE id = ${proposalId}`,
    );

    await admin.caller.admin.setDivision({
      playerId: squad[1]!.identity.playerId,
      division: "D1",
    });

    const detail = await admin.caller.proposals.get({ proposalId });
    expect(detail.participants).toHaveLength(3);

    const sweep = await sweepIneligibleSeats();
    expect(sweep.removed).toBe(0);
  });

  it("ROLE-003 — un arbitre ne peut pas prendre une place de joueur", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const squad = await squadOf(admin, "D2", 2);
    const proposalId = await proposalWith(squad, { date: daysFromNow(3) });

    const referee = await createPlayer({ accountType: "referee" });
    await grantUno(referee.identity.playerId, 1000);

    await expect(
      referee.caller.proposals.join({ proposalId }),
    ).rejects.toThrow(/arbitre/i);

    await expect(
      referee.caller.proposals.becomeSubstitute({ proposalId }),
    ).rejects.toThrow(/arbitre|réservation|ouverte/i);
  });

  it("ROLE-003 — devenir arbitre libère les places déjà prises", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const squad = await squadOf(admin, "D2", 3);
    const proposalId = await proposalWith(squad, { date: daysFromNow(3) });

    const converted = squad[2]!;
    await admin.caller.admin.setAccountType({
      playerId: converted.identity.playerId,
      accountType: "referee",
    });

    const detail = await admin.caller.proposals.get({ proposalId });
    expect(detail.participants.map((row) => row.player.id)).not.toContain(
      converted.identity.playerId,
    );
    expect(detail.participants).toHaveLength(2);
  });

  it("le balayage d'entretien rattrape une division changée hors des routes", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const squad = await squadOf(admin, "D2", 3);
    const proposalId = await proposalWith(squad, { date: daysFromNow(3) });

    // Division modifiée directement en base : aucun évènement applicatif ne
    // s'est produit, seul le balayage peut le rattraper.
    await db.execute(
      sql`UPDATE players SET division = 'D3' WHERE id = ${squad[1]!.identity.playerId}`,
    );

    const sweep = await sweepIneligibleSeats();
    expect(sweep.removed).toBe(1);
    expect(sweep.reopened).toBe(1);

    const detail = await admin.caller.proposals.get({ proposalId });
    expect(detail.participants).toHaveLength(2);
  });
});
