import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { REFERRAL_REWARDS, getGameMode } from "@uno/shared";
import { db } from "../src/db/client.js";
import { transactions } from "../src/db/schema.js";
import {
  anonymousCaller,
  balanceOf,
  createPlayer,
  daysFromNow,
  grantUno,
  promoteToAdmin,
  resetDatabase,
  type TestPlayer,
} from "./helpers.js";

/**
 * Parrainage (REF-001).
 *
 * Le parrain touche 30 UNO à la première séance UNO League **payée et
 * clôturée** de son parrainé, puis 50 de plus à la cinquième. Rien à
 * l'inscription : un compte créé pour rien ne rapporte rien.
 */

const league = getGameMode("league")!;

/** Quinze joueurs de D2, approvisionnés, dont `extra` en tête. */
async function squadWith(extra: TestPlayer[]): Promise<TestPlayer[]> {
  const squad = [...extra];
  while (squad.length < league.minParticipants)
    squad.push(await createPlayer());
  for (const player of squad) await grantUno(player.identity.playerId, 5000);
  return squad;
}

/** Une séance UNO League complète : inscription, paiement, match, clôture. */
async function playLeagueSession(
  admin: TestPlayer,
  squad: TestPlayer[],
  inDays: number,
): Promise<number> {
  // La clôture fait monter et descendre : on remet tout le monde en D2 pour
  // que le même effectif puisse rejouer ensemble.
  for (const player of squad) {
    await admin.caller.admin.setDivision({
      playerId: player.identity.playerId,
      division: "D2",
    });
  }

  const { proposal } = await squad[0]!.caller.proposals.create({
    date: daysFromNow(inDays),
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

  const teams = await admin.caller.supervision.generateTeams({
    proposalId: proposal.id,
  });
  await admin.caller.supervision.addMatch({
    proposalId: proposal.id,
    teamAId: teams[0]!.id,
    teamBId: teams[1]!.id,
  });
  await recordSession(admin, proposal.id);
  return proposal.id;
}

async function recordSession(admin: TestPlayer, proposalId: number) {
  const [match] = await admin.caller.proposals.matches({ proposalId });
  const lineup = [
    ...(match!.teamA?.players ?? []),
    ...(match!.teamB?.players ?? []),
  ].map((player) => player.id);

  await admin.caller.supervision.record({
    proposalId,
    matches: [
      {
        matchId: match!.id,
        scoreA: 1,
        scoreB: 0,
        stats: lineup.map((playerId, index) => ({
          playerId,
          goals: index === 0 ? 1 : 0,
          assists: 0,
          defenses: 0,
          saves: 0,
        })),
      },
    ],
    complete: true,
  });
}

async function referralEntries(playerId: number) {
  return db
    .select({ amount: transactions.amount, key: transactions.idempotencyKey })
    .from(transactions)
    .where(eq(transactions.playerId, playerId));
}

describe("parrainage (REF-001)", () => {
  beforeEach(resetDatabase);

  it("REF-001 — le code se crée à la demande et rattache le parrainé à l'inscription", async () => {
    const parrain = await createPlayer({ firstName: "Élodie" });
    const { code, referrals } = await parrain.caller.referrals.mine();

    expect(code).toMatch(/^ELODIE-[2-9A-HJKMNP-Z]{4}$/);
    expect(referrals).toHaveLength(0);
    // Relu, le code ne change pas.
    expect((await parrain.caller.referrals.mine()).code).toBe(code);

    // Saisi en minuscules, il est reconnu quand même.
    const parraine = await createPlayer({ referralCode: code.toLowerCase() });
    const summary = await parrain.caller.referrals.mine();
    expect(summary.referrals).toEqual([
      expect.objectContaining({
        playerId: parraine.identity.playerId,
        paidSessions: 0,
        firstRewarded: false,
      }),
    ]);
    // Rien n'est versé à l'inscription.
    expect(await balanceOf(parrain.identity.playerId)).toBe(0);
  });

  it("REF-001 — un code inconnu fait échouer l'inscription, sans créer de compte", async () => {
    const email = `inconnu.${Date.now()}@test.local`;
    await expect(
      createPlayer({ email, referralCode: "PERSONNE-2345" }),
    ).rejects.toMatchObject({ message: "Code de parrainage inconnu." });

    // L'adresse est restée libre : la transaction a tout défait.
    await expect(createPlayer({ email })).resolves.toBeDefined();

    // Un code mal formé est refusé dès la validation.
    await expect(
      anonymousCaller().auth.signup({
        firstName: "Test",
        lastName: "Test",
        dateOfBirth: "1995-03-15",
        email: `forme.${Date.now()}@test.local`,
        nationality: "BE",
        password: "Password1",
        profilePhotoUrl: null,
        accountType: "player",
        referralCode: "pas un code",
      }),
    ).rejects.toThrow();
  });

  it("REF-001 — 30 UNO à la 1re séance payée, une seule fois même après correction", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const parrain = await createPlayer();
    const { code } = await parrain.caller.referrals.mine();
    const parraine = await createPlayer({ referralCode: code });
    const squad = await squadWith([parraine]);

    const proposalId = await playLeagueSession(admin, squad, 3);
    expect(await balanceOf(parrain.identity.playerId)).toBe(
      REFERRAL_REWARDS.firstSessionUno,
    );

    // Rouvrir puis reclôturer (MATCH-007) ne paie pas une deuxième fois.
    await admin.caller.supervision.reopen({ proposalId });
    await recordSession(admin, proposalId);
    expect(await balanceOf(parrain.identity.playerId)).toBe(
      REFERRAL_REWARDS.firstSessionUno,
    );

    const summary = await parrain.caller.referrals.mine();
    expect(summary.earnedUno).toBe(REFERRAL_REWARDS.firstSessionUno);
    expect(summary.referrals[0]).toMatchObject({
      paidSessions: 1,
      firstRewarded: true,
      milestoneRewarded: false,
    });
  });

  it("REF-001 — 50 UNO de plus à la 5e séance, puis plus rien", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const parrain = await createPlayer();
    const { code } = await parrain.caller.referrals.mine();
    const parraine = await createPlayer({ referralCode: code });
    const squad = await squadWith([parraine]);

    for (
      let session = 1;
      session <= REFERRAL_REWARDS.milestoneSessions;
      session++
    ) {
      await playLeagueSession(admin, squad, 2 + session);
      const expected =
        REFERRAL_REWARDS.firstSessionUno +
        (session >= REFERRAL_REWARDS.milestoneSessions
          ? REFERRAL_REWARDS.milestoneUno
          : 0);
      expect(await balanceOf(parrain.identity.playerId)).toBe(expected);
    }

    await playLeagueSession(admin, squad, 9);
    expect(await balanceOf(parrain.identity.playerId)).toBe(
      REFERRAL_REWARDS.firstSessionUno + REFERRAL_REWARDS.milestoneUno,
    );
    const keys = (await referralEntries(parrain.identity.playerId)).map(
      (entry) => entry.key,
    );
    expect(keys.filter((key) => key?.startsWith("referral:"))).toHaveLength(2);
  }, 120_000);

  it("REF-001 — l'administration annule un parrainage et reprend ce qui a été versé", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const parrain = await createPlayer();
    const { code } = await parrain.caller.referrals.mine();
    const parraine = await createPlayer({ referralCode: code });
    const squad = await squadWith([parraine]);

    await playLeagueSession(admin, squad, 3);
    expect(await balanceOf(parrain.identity.playerId)).toBe(30);

    // Un joueur ordinaire n'y a pas accès.
    await expect(parrain.caller.admin.referrals()).rejects.toThrow();

    const [row] = await admin.caller.admin.referrals();
    expect(row).toMatchObject({
      referrer: { id: parrain.identity.playerId },
      referred: { id: parraine.identity.playerId },
      paidSessions: 1,
      rewardedUno: 30,
      cancelledAt: null,
    });

    const result = await admin.caller.admin.cancelReferral({
      referralId: row!.id,
    });
    expect(result.reclaimedUno).toBe(30);
    expect(await balanceOf(parrain.identity.playerId)).toBe(0);

    // Annulé, il ne verse plus rien, même à la cinquième séance.
    await expect(
      admin.caller.admin.cancelReferral({ referralId: row!.id }),
    ).rejects.toMatchObject({ message: "Ce parrainage est déjà annulé." });
    await playLeagueSession(admin, squad, 4);
    expect(await balanceOf(parrain.identity.playerId)).toBe(0);
    expect((await parrain.caller.referrals.mine()).referrals[0]).toMatchObject({
      cancelled: true,
    });
  }, 60_000);
});
