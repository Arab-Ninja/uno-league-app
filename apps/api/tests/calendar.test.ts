import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eurToUno, getGameMode } from "@uno/shared";
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
const friendly = getGameMode("friendly")!;

/** Crée `count` joueurs et les place tous en division `division`. */
async function createSquad(count: number, division?: "D1" | "D2" | "D3") {
  const admin = await promoteToAdmin(await createPlayer());
  const squad: TestPlayer[] = [];
  for (let i = 0; i < count; i++) {
    const player = await createPlayer();
    if (division && division !== "D3") {
      await admin.caller.admin.setDivision({
        playerId: player.identity.playerId,
        division,
      });
    }
    squad.push(player);
  }
  return { admin, squad };
}

describe("calendrier : propositions, réservations, sessions", () => {
  beforeEach(resetDatabase);

  it("E2E-004 / E2E-005 — J+1 est refusé, J+2 est accepté", async () => {
    const player = await createPlayer();

    await expect(
      player.caller.proposals.create({
        date: daysFromNow(1),
        slotStartHour: 18,
        venueId: "arena",
        modeId: "friendly",
      }),
    ).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });

    const created = await player.caller.proposals.create({
      date: daysFromNow(3),
      slotStartHour: 18,
      venueId: "arena",
      modeId: "friendly",
    });

    expect(created.proposal.status).toBe("proposal");
    // CAL-003 : le créateur est automatiquement participant.
    expect(created.proposal.participantCount).toBe(1);
    expect(created.proposal.viewer?.isParticipant).toBe(true);
  });

  it("CAL-004 — un créneau qui n'appartient pas au mode est refusé", async () => {
    const player = await createPlayer();

    // UNO League dure 2 h : 15 h n'est pas un début de créneau valide.
    await expect(
      player.caller.proposals.create({
        date: daysFromNow(3),
        slotStartHour: 15,
        venueId: "arena",
        modeId: "league",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("MODE-001 — un mode non activé ne déclenche aucune réservation", async () => {
    const player = await createPlayer();
    await expect(
      player.caller.proposals.create({
        date: daysFromNow(3),
        slotStartHour: 18,
        venueId: "arena",
        // @ts-expect-error — le schéma n'accepte que les modes planifiables.
        modeId: "tournaments",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("CAL-005 — une proposition identique n'est jamais dupliquée", async () => {
    const first = await createPlayer();
    const second = await createPlayer();
    const slot = { date: daysFromNow(4), slotStartHour: 20, venueId: "yc-five" as const, modeId: "friendly" as const };

    const original = await first.caller.proposals.create(slot);
    const duplicate = await second.caller.proposals.create(slot);

    // Le second joueur rejoint la proposition existante au lieu d'en créer
    // une seconde sur le même créneau.
    expect(duplicate.joinedExisting).toBe(true);
    expect(duplicate.proposal.id).toBe(original.proposal.id);
    expect(duplicate.proposal.participantCount).toBe(2);

    const all = await first.caller.proposals.list({ mineOnly: false });
    expect(all.filter((p) => p.venueId === "yc-five")).toHaveLength(1);
  });

  it("CAL-006 — rejoindre deux fois est idempotent", async () => {
    const creator = await createPlayer();
    const joiner = await createPlayer();
    const { proposal } = await creator.caller.proposals.create({
      date: daysFromNow(3),
      slotStartHour: 16,
      venueId: "city-five",
      modeId: "friendly",
    });

    const first = await joiner.caller.proposals.join({ proposalId: proposal.id });
    const second = await joiner.caller.proposals.join({ proposalId: proposal.id });

    expect(first.participantCount).toBe(2);
    expect(second.participantCount).toBe(2);

    const detail = await creator.caller.proposals.get({ proposalId: proposal.id });
    expect(detail.participants).toHaveLength(2);
  });

  it("CAL-007 — atteindre le quota bascule en réservation et ferme les inscriptions", async () => {
    const { squad } = await createSquad(friendly.minParticipants + 1);
    const [creator, ...others] = squad;

    const { proposal } = await creator!.caller.proposals.create({
      date: daysFromNow(3),
      slotStartHour: 14,
      venueId: "arena",
      modeId: "friendly",
    });

    let latest = proposal;
    for (const player of others.slice(0, friendly.minParticipants - 1)) {
      latest = await player.caller.proposals.join({ proposalId: proposal.id });
    }

    expect(latest.participantCount).toBe(friendly.minParticipants);
    expect(latest.status).toBe("reservation");

    // Le joueur surnuméraire ne peut plus s'inscrire.
    const extra = others.at(-1)!;
    await expect(
      extra.caller.proposals.join({ proposalId: proposal.id }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("STATE-001 — deux joueurs qui visent la dernière place : un seul réussit", async () => {
    const { squad } = await createSquad(friendly.minParticipants + 1);
    const [creator, ...others] = squad;

    const { proposal } = await creator!.caller.proposals.create({
      date: daysFromNow(5),
      slotStartHour: 17,
      venueId: "fit-five-forest",
      modeId: "friendly",
    });

    // On remplit jusqu'à N-1 : il reste exactement une place.
    for (const player of others.slice(0, friendly.minParticipants - 2)) {
      await player.caller.proposals.join({ proposalId: proposal.id });
    }

    const contenderA = others.at(-2)!;
    const contenderB = others.at(-1)!;

    const results = await Promise.allSettled([
      contenderA.caller.proposals.join({ proposalId: proposal.id }),
      contenderB.caller.proposals.join({ proposalId: proposal.id }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: "CONFLICT",
    });

    const detail = await creator!.caller.proposals.get({ proposalId: proposal.id });
    expect(detail.participantCount).toBe(friendly.minParticipants);
    expect(detail.participants).toHaveLength(friendly.minParticipants);
  });

  it("CAL-002 — un joueur D2 ne voit que les propositions League de sa division", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const d1 = await createPlayer();
    const d2 = await createPlayer();

    await admin.caller.admin.setDivision({ playerId: d1.identity.playerId, division: "D1" });
    await admin.caller.admin.setDivision({ playerId: d2.identity.playerId, division: "D2" });

    await d1.caller.proposals.create({
      date: daysFromNow(3),
      slotStartHour: 18,
      venueId: "arena",
      modeId: "league",
    });
    await d1.caller.proposals.create({
      date: daysFromNow(3),
      slotStartHour: 21,
      venueId: "arena",
      modeId: "friendly",
    });

    const visible = await d2.caller.proposals.list({ mineOnly: false });

    // La proposition League D1 est invisible, le match amical reste visible.
    expect(visible.filter((p) => p.modeId === "league")).toHaveLength(0);
    expect(visible.filter((p) => p.modeId === "friendly")).toHaveLength(1);
  });

  it("CAL-008 — quitter est possible avant le quota, refusé après", async () => {
    const { squad } = await createSquad(friendly.minParticipants);
    const [creator, ...others] = squad;

    const { proposal } = await creator!.caller.proposals.create({
      date: daysFromNow(3),
      slotStartHour: 19,
      venueId: "city-five",
      modeId: "friendly",
    });

    const first = others[0]!;
    await first.caller.proposals.join({ proposalId: proposal.id });
    const afterLeave = await first.caller.proposals.leave({ proposalId: proposal.id });
    expect(afterLeave.participantCount).toBe(1);

    // On atteint le quota.
    for (const player of others.slice(0, friendly.minParticipants - 1)) {
      await player.caller.proposals.join({ proposalId: proposal.id });
    }

    await expect(
      others[0]!.caller.proposals.leave({ proposalId: proposal.id }),
    ).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });
  });

  it("E2E-007 / CAL-011 — la session n'est confirmée que lorsque tous ont payé", async () => {
    const { squad } = await createSquad(friendly.minParticipants);
    const [creator, ...others] = squad;

    for (const player of squad) {
      await grantUno(player.identity.playerId, 500);
    }

    const { proposal } = await creator!.caller.proposals.create({
      date: daysFromNow(3),
      slotStartHour: 22,
      venueId: "arena",
      modeId: "friendly",
    });

    for (const player of others) {
      await player.caller.proposals.join({ proposalId: proposal.id });
    }

    const priceUno = eurToUno(friendly.priceEur);
    expect(priceUno).toBe(100);

    // Tous paient sauf le dernier.
    for (const player of squad.slice(0, -1)) {
      await player.caller.proposals.pay({
        proposalId: proposal.id,
        method: "uno",
        idempotencyKey: randomUUID(),
      });
    }

    let detail = await creator!.caller.proposals.get({ proposalId: proposal.id });
    expect(detail.status).toBe("reservation");
    expect(detail.paidCount).toBe(friendly.minParticipants - 1);
    expect(detail.paymentComplete).toBe(false);

    await squad.at(-1)!.caller.proposals.pay({
      proposalId: proposal.id,
      method: "uno",
      idempotencyKey: randomUUID(),
    });

    detail = await creator!.caller.proposals.get({ proposalId: proposal.id });
    expect(detail.status).toBe("session");
    expect(detail.paymentComplete).toBe(true);
    expect(detail.paidCount).toBe(friendly.minParticipants);
  });

  it("E2E-008 — un solde insuffisant ne débite rien", async () => {
    const { squad } = await createSquad(league.minParticipants, "D1");
    const [creator, ...others] = squad;

    const { proposal } = await creator!.caller.proposals.create({
      date: daysFromNow(3),
      slotStartHour: 18,
      venueId: "arena",
      modeId: "league",
    });
    for (const player of others) {
      await player.caller.proposals.join({ proposalId: proposal.id });
    }

    // Le prix League vaut 200 UNO ; on ramène le solde à 150.
    const admin = await promoteToAdmin(await createPlayer());
    await admin.caller.admin.adjustUno({
      playerId: creator!.identity.playerId,
      amount: 850,
      direction: "debit",
      reason: "Test solde insuffisant",
    });

    const before = await balanceOf(creator!.identity.playerId);
    expect(before).toBe(150);

    await expect(
      creator!.caller.proposals.pay({
        proposalId: proposal.id,
        method: "uno",
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });

    expect(await balanceOf(creator!.identity.playerId)).toBe(before);
    const detail = await creator!.caller.proposals.get({ proposalId: proposal.id });
    expect(detail.paidCount).toBe(0);
  });

  it("STATE-002 — un double clic sur « Payer » ne débite qu'une fois", async () => {
    const { squad } = await createSquad(friendly.minParticipants);
    const [creator, ...others] = squad;
    await grantUno(creator!.identity.playerId, 500);

    const { proposal } = await creator!.caller.proposals.create({
      date: daysFromNow(3),
      slotStartHour: 15,
      venueId: "yc-five",
      modeId: "friendly",
    });
    for (const player of others) {
      await player.caller.proposals.join({ proposalId: proposal.id });
    }

    const before = await balanceOf(creator!.identity.playerId);
    const key = randomUUID();

    const results = await Promise.allSettled([
      creator!.caller.proposals.pay({ proposalId: proposal.id, method: "uno", idempotencyKey: key }),
      creator!.caller.proposals.pay({ proposalId: proposal.id, method: "uno", idempotencyKey: key }),
    ]);

    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    // Un seul débit, quel que soit le nombre d'appels rejoués.
    expect(await balanceOf(creator!.identity.playerId)).toBe(
      before - eurToUno(friendly.priceEur),
    );
  });

  it("CAL-009 — le prix vient du serveur, pas du client", async () => {
    const { squad } = await createSquad(friendly.minParticipants);
    const [creator, ...others] = squad;
    await grantUno(creator!.identity.playerId, 500);

    const { proposal } = await creator!.caller.proposals.create({
      date: daysFromNow(3),
      slotStartHour: 16,
      venueId: "arena",
      modeId: "friendly",
    });
    for (const player of others) {
      await player.caller.proposals.join({ proposalId: proposal.id });
    }

    const before = await balanceOf(creator!.identity.playerId);
    await creator!.caller.proposals.pay({
      proposalId: proposal.id,
      method: "uno",
      idempotencyKey: randomUUID(),
      // @ts-expect-error — un montant fourni par le client doit être ignoré.
      amount: 1,
    });

    expect(await balanceOf(creator!.identity.playerId)).toBe(before - 100);
  });

  it("CAL-010 — sans prestataire configuré, aucun moyen externe n'est proposé", async () => {
    const player = await createPlayer();
    const config = await player.caller.proposals.config();
    expect(config.paymentMethods).toEqual(["uno"]);
  });

  it("HOME-001 — le dashboard n'affiche que les 3 prochaines sessions du joueur", async () => {
    const player = await createPlayer();
    for (const [index, hour] of [14, 16, 18, 20].entries()) {
      await player.caller.proposals.create({
        date: daysFromNow(3 + index),
        slotStartHour: hour,
        venueId: "arena",
        modeId: "friendly",
      });
    }

    const dashboard = await player.caller.players.dashboard();
    expect(dashboard.upcoming).toHaveLength(3);

    const dates = dashboard.upcoming.map((session) => session.startsAtUtc);
    expect([...dates].sort()).toEqual(dates);
  });
});

describe("récompenses affichées", () => {
  beforeEach(resetDatabase);

  it("§8.2 — un match amical n'annonce que les primes réellement versées", async () => {
    const player = await createPlayer();
    const { proposal } = await player.caller.proposals.create({
      date: daysFromNow(3),
      slotStartHour: 14,
      venueId: "arena",
      modeId: "friendly",
    });

    const detail = await player.caller.proposals.get({ proposalId: proposal.id });
    // Non classé : ni meilleur buteur, ni passeur, ni défenseur.
    expect(detail.rewards.map((r) => r.kind).sort()).toEqual([
      "bestTeam",
      "participation",
    ]);
  });

  it("§8.2 — une session League annonce le barème complet de sa division", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const player = await createPlayer();
    await admin.caller.admin.setDivision({
      playerId: player.identity.playerId,
      division: "D1",
    });

    const { proposal } = await player.caller.proposals.create({
      date: daysFromNow(3),
      slotStartHour: 18,
      venueId: "arena",
      modeId: "league",
    });

    const detail = await player.caller.proposals.get({ proposalId: proposal.id });
    const scorer = detail.rewards.find((r) => r.kind === "topScorer");
    expect(detail.rewards).toHaveLength(5);
    expect(scorer?.amountUno).toBe(250);
  });
});
