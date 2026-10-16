import { randomUUID } from "node:crypto";
import { and, eq, like, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_TIMEZONE, zonedTimeToUtc } from "@uno/shared";
import { db } from "../src/db/client.js";
import {
  adminEvents,
  notificationDeliveries,
  payments,
  proposalParticipants,
  proposalPolls,
  proposals,
} from "../src/db/schema.js";
import { closeDuePolls } from "../src/services/proposal-alternatives.service.js";
import { expireStaleProposals } from "../src/services/proposal-expiry.service.js";
import {
  balanceOf,
  createFundedPlayer,
  createPlayer,
  daysFromNow,
  promoteToAdmin,
  resetDatabase,
  type TestPlayer,
} from "./helpers.js";

/**
 * Alternatives d'une séance (ALT-001).
 *
 * Le créneau d'une proposition part chez l'exploitant avant qu'elle soit
 * complète : l'administration propose deux ou trois créneaux du même jour,
 * les inscrits votent, la majorité s'applique — ou l'administration déplace
 * directement. Celui à qui le nouveau créneau ne convient pas libère sa
 * place, remboursée.
 */

const MINUTE = 60_000;
const DATE = () => daysFromNow(1);

function noonOf(date: string): Date {
  return zonedTimeToUtc(date, 12, DEFAULT_TIMEZONE);
}

/** Amical de demain, 18 h, à l'Arena ; l'administrateur y est inscrit. */
async function openFriendly(admin: TestPlayer) {
  const created = await admin.caller.admin.createProposal({
    date: DATE(),
    slotStartHour: 18,
    venueId: "arena",
    modeId: "friendly",
  });
  return created.proposal;
}

async function joinAll(proposalId: number, joueurs: TestPlayer[]) {
  for (const joueur of joueurs) {
    await joueur.caller.proposals.join({ proposalId });
  }
}

async function proposalRow(proposalId: number) {
  const [row] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, proposalId));
  return row!;
}

async function notice(playerId: number, keyPrefix: string) {
  const [row] = await db
    .select({
      title: notificationDeliveries.title,
      body: notificationDeliveries.body,
    })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.playerId, playerId),
        like(notificationDeliveries.eventKey, `${keyPrefix}%`),
      ),
    );
  return row ?? null;
}

async function adminEventsOf(type: string, proposalId: number) {
  return db
    .select({ body: adminEvents.body })
    .from(adminEvents)
    .where(
      sql`${adminEvents.type} = ${type} AND ${adminEvents.entityId} = ${proposalId}`,
    );
}

describe("vote d'alternative (ALT-001)", () => {
  let admin: TestPlayer;

  beforeEach(async () => {
    await resetDatabase();
    admin = await promoteToAdmin(await createPlayer());
  });

  it("ALT-001 — deux créneaux au vote, la majorité s'applique à la clôture", async () => {
    const proposal = await openFriendly(admin);
    const [a, b, c] = [
      await createPlayer(),
      await createPlayer(),
      await createPlayer(),
    ];
    await joinAll(proposal.id, [a!, b!, c!]);
    const etranger = await createPlayer();

    const closesAt = new Date(noonOf(DATE()).getTime() - 60 * MINUTE);
    const poll = await admin.caller.admin.openProposalPoll({
      proposalId: proposal.id,
      options: [
        { venueId: "city-five", slotStartHour: 18 },
        { venueId: "arena", slotStartHour: 20 },
      ],
      closesAt: closesAt.toISOString(),
      reason: "L'Arena n'a plus de terrain à 18 h.",
    });
    expect(poll.status).toBe("open");
    expect(poll.options.map((option) => option.venueName)).toEqual([
      "City Five",
      "Arena",
    ]);

    // Tous les inscrits sont appelés à voter, le mot de l'admin compris.
    const appel = await notice(
      a!.identity.playerId,
      `proposal:${proposal.id}:poll:${poll.id}`,
    );
    expect(appel?.title).toBe("Votez pour un autre créneau");
    expect(appel?.body).toContain("plus de terrain à 18 h");
    expect(
      await notice(etranger.identity.playerId, `proposal:${proposal.id}`),
    ).toBeNull();

    const [cityFive, arena20] = poll.options;
    await a!.caller.proposals.votePoll({
      pollId: poll.id,
      optionId: cityFive!.id,
    });
    await b!.caller.proposals.votePoll({
      pollId: poll.id,
      optionId: arena20!.id,
    });
    // On peut changer d'avis jusqu'à la clôture.
    await b!.caller.proposals.votePoll({
      pollId: poll.id,
      optionId: cityFive!.id,
    });
    await c!.caller.proposals.votePoll({ pollId: poll.id, optionId: null });

    // Un joueur étranger à la séance ne vote pas.
    await expect(
      etranger.caller.proposals.votePoll({
        pollId: poll.id,
        optionId: cityFive!.id,
      }),
    ).rejects.toThrow();

    const vu = await a!.caller.proposals.alternatives({
      proposalId: proposal.id,
    });
    expect(vu.poll?.myChoice).toBe(cityFive!.id);
    expect(vu.poll?.options[0]?.votes).toBe(2);
    expect(vu.poll?.noneVotes).toBe(1);
    // Rien pour qui n'est pas inscrit.
    expect(
      (
        await etranger.caller.proposals.alternatives({
          proposalId: proposal.id,
        })
      ).poll,
    ).toBeNull();

    // Avant l'échéance, rien ne bouge.
    expect(
      (await closeDuePolls(new Date(closesAt.getTime() - MINUTE))).applied,
    ).toBe(0);

    const result = await closeDuePolls(new Date(closesAt.getTime() + MINUTE));
    expect(result.applied).toBe(1);

    const moved = await proposalRow(proposal.id);
    expect(moved.venueId).toBe("city-five");
    expect(moved.venueName).toBe("City Five");
    expect(moved.localTimeLabel).toBe("18:00 - 19:00");
    expect(moved.localDate).toBe(DATE());
    expect(moved.movedAt).not.toBeNull();

    const deplace = await notice(
      c!.identity.playerId,
      `proposal:${proposal.id}:moved`,
    );
    expect(deplace?.title).toBe("Séance déplacée");
    expect(deplace?.body).toContain("City Five");
    expect(deplace?.body).toContain("au lieu de Arena");

    const [event] = await adminEventsOf("proposal.moved", proposal.id);
    expect(event!.body).toContain("choisi par vote (2 voix sur 4 inscrits)");

    // Une seconde passe ne retranche rien.
    expect(
      (await closeDuePolls(new Date(closesAt.getTime() + 6 * MINUTE))).applied,
    ).toBe(0);
  });

  it("ALT-001 — égalité : l'administration est prévenue et tranche", async () => {
    const proposal = await openFriendly(admin);
    const [a, b] = [await createPlayer(), await createPlayer()];
    await joinAll(proposal.id, [a!, b!]);

    const closesAt = new Date(noonOf(DATE()).getTime() - 30 * MINUTE);
    const poll = await admin.caller.admin.openProposalPoll({
      proposalId: proposal.id,
      options: [
        { venueId: "city-five", slotStartHour: 18 },
        { venueId: "yc-five", slotStartHour: 18 },
      ],
      closesAt: closesAt.toISOString(),
    });
    await a!.caller.proposals.votePoll({
      pollId: poll.id,
      optionId: poll.options[0]!.id,
    });
    await b!.caller.proposals.votePoll({
      pollId: poll.id,
      optionId: poll.options[1]!.id,
    });

    const result = await closeDuePolls(new Date(closesAt.getTime() + MINUTE));
    expect(result).toMatchObject({ applied: 0, toDecide: 1 });
    expect((await proposalRow(proposal.id)).venueId).toBe("arena");

    const [event] = await adminEventsOf("proposal.poll", proposal.id);
    expect(event!.body).toContain("égalité entre City Five");
    expect(event!.body).toContain("À trancher");

    const [row] = (await admin.caller.admin.manageableProposals()).filter(
      (item) => item.id === proposal.id,
    );
    expect(row!.poll?.status).toBe("tie");

    // Un joueur ne tranche pas.
    await expect(
      a!.caller.admin.decideProposalPoll({
        pollId: poll.id,
        optionId: poll.options[1]!.id,
      }),
    ).rejects.toThrow();

    await admin.caller.admin.decideProposalPoll({
      pollId: poll.id,
      optionId: poll.options[1]!.id,
    });
    expect((await proposalRow(proposal.id)).venueId).toBe("yc-five");
    const [moved] = await adminEventsOf("proposal.moved", proposal.id);
    expect(moved!.body).toContain("tranché par l'administration");
  });

  it("ALT-001 — les règles d'ouverture d'un vote", async () => {
    const proposal = await openFriendly(admin);
    const joueur = await createPlayer();
    await joinAll(proposal.id, [joueur]);
    const noon = noonOf(DATE());
    const base = {
      proposalId: proposal.id,
      options: [
        { venueId: "city-five", slotStartHour: 18 },
        { venueId: "arena", slotStartHour: 20 },
      ],
    };

    // Après midi le jour J : trop tard, une proposition incomplète serait
    // déjà annulée.
    await expect(
      admin.caller.admin.openProposalPoll({
        ...base,
        closesAt: new Date(noon.getTime() + MINUTE).toISOString(),
      }),
    ).rejects.toThrow(/au plus tard/);

    const closesAt = new Date(noon.getTime() - MINUTE).toISOString();

    // Le créneau actuel n'est pas une alternative.
    await expect(
      admin.caller.admin.openProposalPoll({
        ...base,
        closesAt,
        options: [
          { venueId: "arena", slotStartHour: 18 },
          { venueId: "city-five", slotStartHour: 18 },
        ],
      }),
    ).rejects.toThrow(/déjà le créneau/);

    // Le même créneau deux fois non plus.
    await expect(
      admin.caller.admin.openProposalPoll({
        ...base,
        closesAt,
        options: [
          { venueId: "city-five", slotStartHour: 18 },
          { venueId: "city-five", slotStartHour: 18 },
        ],
      }),
    ).rejects.toThrow(/deux fois/);

    // Un joueur n'ouvre pas de vote.
    await expect(
      joueur.caller.admin.openProposalPoll({ ...base, closesAt }),
    ).rejects.toThrow();

    await admin.caller.admin.openProposalPoll({ ...base, closesAt });
    // Un seul vote à la fois.
    await expect(
      admin.caller.admin.openProposalPoll({ ...base, closesAt }),
    ).rejects.toThrow(/déjà en cours/);
  });

  it("ALT-001 — rappel aux inscrits qui n'ont pas voté, une seule fois", async () => {
    const proposal = await openFriendly(admin);
    const [a, b] = [await createPlayer(), await createPlayer()];
    await joinAll(proposal.id, [a!, b!]);

    const closesAt = noonOf(DATE());
    const poll = await admin.caller.admin.openProposalPoll({
      proposalId: proposal.id,
      options: [
        { venueId: "city-five", slotStartHour: 18 },
        { venueId: "arena", slotStartHour: 20 },
      ],
      closesAt: closesAt.toISOString(),
    });
    await a!.caller.proposals.votePoll({
      pollId: poll.id,
      optionId: poll.options[0]!.id,
    });

    const result = await closeDuePolls(
      new Date(closesAt.getTime() - 90 * MINUTE),
    );
    // L'admin et b n'ont pas voté.
    expect(result.reminded).toBe(2);
    expect(
      await notice(
        b!.identity.playerId,
        `proposal:${proposal.id}:poll:${poll.id}:reminder`,
      ),
    ).not.toBeNull();
    expect(
      await notice(
        a!.identity.playerId,
        `proposal:${proposal.id}:poll:${poll.id}:reminder`,
      ),
    ).toBeNull();

    expect(
      (await closeDuePolls(new Date(closesAt.getTime() - 30 * MINUTE)))
        .reminded,
    ).toBe(0);
  });

  it("ALT-001 — l'annulation de midi clôt le vote en cours", async () => {
    const proposal = await openFriendly(admin);
    const closesAt = noonOf(DATE());
    await admin.caller.admin.openProposalPoll({
      proposalId: proposal.id,
      options: [
        { venueId: "city-five", slotStartHour: 18 },
        { venueId: "arena", slotStartHour: 20 },
      ],
      closesAt: closesAt.toISOString(),
    });

    // Le vote se tranche d'abord (égalité, aucune voix), puis midi annule.
    await closeDuePolls(new Date(closesAt.getTime() + MINUTE));
    await expireStaleProposals(new Date(closesAt.getTime() + MINUTE));
    expect((await proposalRow(proposal.id)).status).toBe("cancelled");

    const polls = await db
      .select({
        status: proposalPolls.status,
        active: proposalPolls.activeProposalId,
      })
      .from(proposalPolls)
      .where(eq(proposalPolls.proposalId, proposal.id));
    expect(polls).toEqual([{ status: "closed", active: null }]);
  });
});

describe("déplacement direct et place libérée (ALT-001)", () => {
  let admin: TestPlayer;

  beforeEach(async () => {
    await resetDatabase();
    admin = await promoteToAdmin(await createPlayer());
  });

  /** Une réservation complète : l'admin et neuf joueurs, dont `payeurs` ont réglé. */
  async function fullReservation(payeurs: number) {
    const proposal = await openFriendly(admin);
    const joueurs: TestPlayer[] = [];
    for (let index = 0; index < 9; index++) {
      joueurs.push(await createFundedPlayer());
    }
    await joinAll(proposal.id, joueurs);
    for (const joueur of joueurs.slice(0, payeurs)) {
      await joueur.caller.proposals.pay({
        proposalId: proposal.id,
        method: "uno",
        idempotencyKey: randomUUID(),
      });
    }
    expect((await proposalRow(proposal.id)).status).toBe("reservation");
    return { proposal, joueurs };
  }

  it("ALT-001 — l'admin déplace une réservation : tous prévenus, le terrain est à réserver", async () => {
    const { proposal, joueurs } = await fullReservation(1);
    await admin.caller.admin.setVenueBooked({
      proposalId: proposal.id,
      booked: true,
    });

    const moved = await admin.caller.admin.moveProposal({
      proposalId: proposal.id,
      venueId: "city-five",
      slotStartHour: 20,
    });
    expect(moved).toEqual({
      venueName: "City Five",
      localTimeLabel: "20:00 - 21:00",
    });

    const row = await proposalRow(proposal.id);
    expect(row.status).toBe("reservation");
    expect(row.venueBookedAt).toBeNull();
    expect(row.startsAtUtc.getTime()).toBe(
      zonedTimeToUtc(DATE(), 20, DEFAULT_TIMEZONE).getTime(),
    );

    const payeur = await notice(
      joueurs[0]!.identity.playerId,
      `proposal:${proposal.id}:moved`,
    );
    expect(payeur?.body).toContain("elle vous sera remboursée");
    const autre = await notice(
      joueurs[5]!.identity.playerId,
      `proposal:${proposal.id}:moved`,
    );
    expect(autre?.body).toContain("Libérez votre place");
    expect(autre?.body).not.toContain("remboursée");

    // Un joueur ne déplace pas une séance.
    await expect(
      joueurs[1]!.caller.admin.moveProposal({
        proposalId: proposal.id,
        venueId: "arena",
        slotStartHour: 21,
      }),
    ).rejects.toThrow();
  });

  it("ALT-001 — place réglée avant le déplacement : libérée et remboursée en UNO", async () => {
    const { proposal, joueurs } = await fullReservation(2);
    const payeur = joueurs[0]!;
    const avant = await balanceOf(payeur.identity.playerId);

    // Hors déplacement, une réservation ne se quitte pas seul.
    await expect(
      payeur.caller.proposals.leaveAfterMove({
        proposalId: proposal.id,
        refund: "uno",
      }),
    ).rejects.toThrow(/délai/);

    await admin.caller.admin.moveProposal({
      proposalId: proposal.id,
      venueId: "city-five",
      slotStartHour: 20,
    });

    const vu = await payeur.caller.proposals.alternatives({
      proposalId: proposal.id,
    });
    expect(vu.withdrawal).toMatchObject({ paid: true, refundMethods: ["uno"] });

    // Payé en UNO : pas de remboursement en euros.
    await expect(
      payeur.caller.proposals.leaveAfterMove({
        proposalId: proposal.id,
        refund: "eur",
      }),
    ).rejects.toThrow(/en UNO/);

    const result = await payeur.caller.proposals.leaveAfterMove({
      proposalId: proposal.id,
      refund: "uno",
    });
    expect(result.refundedUno).toBeGreaterThan(0);
    expect(await balanceOf(payeur.identity.playerId)).toBe(
      avant + result.refundedUno,
    );

    const row = await proposalRow(proposal.id);
    expect(row.participantCount).toBe(9);
    expect(row.status).toBe("proposal");

    const [event] = await adminEventsOf("payment.refund", proposal.id);
    expect(event!.body).toContain("UNO remboursés");

    // Un non-payeur inscrit avant le déplacement peut partir aussi.
    await joueurs[5]!.caller.proposals.leaveAfterMove({
      proposalId: proposal.id,
      refund: "uno",
    });
    expect((await proposalRow(proposal.id)).participantCount).toBe(8);

    // Qui s'inscrit après le déplacement a accepté le nouveau créneau.
    const nouveau = await createFundedPlayer();
    await nouveau.caller.proposals.join({ proposalId: proposal.id });
    await expect(
      nouveau.caller.proposals.leaveAfterMove({
        proposalId: proposal.id,
        refund: "uno",
      }),
    ).rejects.toThrow(/après le déplacement/);
  });

  it("ALT-001 — payé en ligne, remboursé en euros : sans prestataire, l'administration le fait à la main", async () => {
    const { proposal, joueurs } = await fullReservation(0);
    const joueur = joueurs[0]!;

    // Un paiement par carte abouti, tel que le webhook l'aurait enregistré.
    const inserted = await db.insert(payments).values({
      proposalId: proposal.id,
      playerId: joueur.identity.playerId,
      method: "stripe_card",
      status: "paid",
      amountUno: 200,
      amountEurCents: 1000,
      provider: "stripe",
      providerIntentId: `cs_test_${randomUUID()}`,
      idempotencyKey: randomUUID(),
      paidAt: new Date(Date.now() - 60 * MINUTE),
    });
    const paymentId = Number(inserted[0].insertId);
    await db
      .update(proposalParticipants)
      .set({ hasPaid: true, paymentId })
      .where(
        and(
          eq(proposalParticipants.proposalId, proposal.id),
          eq(proposalParticipants.playerId, joueur.identity.playerId),
        ),
      );

    await admin.caller.admin.moveProposal({
      proposalId: proposal.id,
      venueId: "yc-five",
      slotStartHour: 18,
    });

    const vu = await joueur.caller.proposals.alternatives({
      proposalId: proposal.id,
    });
    expect(vu.withdrawal?.refundMethods).toEqual(["uno", "eur"]);
    expect(vu.withdrawal?.amountEurCents).toBe(1000);

    const avant = await balanceOf(joueur.identity.playerId);
    const result = await joueur.caller.proposals.leaveAfterMove({
      proposalId: proposal.id,
      refund: "eur",
    });
    expect(result).toEqual({ refundedUno: 0, refundedEurCents: 1000 });
    // Rien en UNO : c'est la carte qui est remboursée.
    expect(await balanceOf(joueur.identity.playerId)).toBe(avant);

    const [payment] = await db
      .select({ status: payments.status })
      .from(payments)
      .where(eq(payments.id, paymentId));
    expect(payment!.status).toBe("refunded");

    const [event] = await adminEventsOf("payment.refund", proposal.id);
    expect(event!.body).toContain("À FAIRE dans Stripe");
    expect(event!.body).toMatch(/10,00/);

    const message = await notice(
      joueur.identity.playerId,
      `proposal:${proposal.id}:left-after-move`,
    );
    expect(message?.body).toContain("sera fait par l'organisation");
  });
});
