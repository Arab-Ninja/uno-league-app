import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_TIMEZONE, zonedTimeToUtc } from "@uno/shared";
import { db } from "../src/db/client.js";
import {
  adminEvents,
  notificationDeliveries,
  proposals,
} from "../src/db/schema.js";
import {
  cancellationCutoff,
  expireStaleProposals,
} from "../src/services/proposal-expiry.service.js";
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
 * Annulation des séances qui n'auront pas lieu (CAL-013).
 *
 * Le jour de la séance, à midi, une proposition encore incomplète s'annule.
 * Ce qui reste non confirmé au coup d'envoi s'annule aussi, places payées
 * remboursées. Dans les deux cas, seuls les inscrits sont prévenus — avec
 * l'administration.
 */

const MINUTE = 60_000;

/** L'administrateur qui ouvre la séance y est inscrit d'office. */
async function openFriendly(admin: TestPlayer, date = daysFromNow(1)) {
  const created = await admin.caller.admin.createProposal({
    date,
    slotStartHour: 18,
    venueId: "arena",
    modeId: "friendly",
  });
  return created.proposal;
}

function noonOf(date: string): Date {
  return zonedTimeToUtc(date, 12, DEFAULT_TIMEZONE);
}

async function statusOf(proposalId: number) {
  const [row] = await db
    .select({ status: proposals.status })
    .from(proposals)
    .where(eq(proposals.id, proposalId));
  return row!.status;
}

async function cancellationNotice(playerId: number, proposalId: number) {
  const [row] = await db
    .select({
      title: notificationDeliveries.title,
      body: notificationDeliveries.body,
    })
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.playerId, playerId),
        eq(notificationDeliveries.eventKey, `proposal:${proposalId}:cancelled`),
      ),
    );
  return row ?? null;
}

async function cancellationEvents(proposalId: number) {
  return db
    .select({ body: adminEvents.body })
    .from(adminEvents)
    .where(
      sql`${adminEvents.type} = 'proposal.cancelled' AND ${adminEvents.entityId} = ${proposalId}`,
    );
}

describe("annulation des séances incomplètes (CAL-013)", () => {
  let admin: TestPlayer;

  beforeEach(async () => {
    await resetDatabase();
    admin = await promoteToAdmin(await createPlayer());
  });

  it("CAL-013 — incomplète le jour même à midi : annulée, inscrits et administration prévenus", async () => {
    const date = daysFromNow(1);
    const proposal = await openFriendly(admin, date);
    const inscrits = [admin, await createPlayer(), await createPlayer()];
    for (const joueur of inscrits.slice(1)) {
      await joueur.caller.proposals.join({ proposalId: proposal.id });
    }
    const etranger = await createPlayer();

    // Le matin, elle peut encore se remplir.
    await expireStaleProposals(new Date(noonOf(date).getTime() - MINUTE));
    expect(await statusOf(proposal.id)).toBe("proposal");

    const result = await expireStaleProposals(
      new Date(noonOf(date).getTime() + MINUTE),
    );
    expect(result.cancelled).toBe(1);
    expect(await statusOf(proposal.id)).toBe("cancelled");

    for (const joueur of inscrits) {
      const notice = await cancellationNotice(
        joueur.identity.playerId,
        proposal.id,
      );
      expect(notice?.title).toBe("Séance annulée");
      expect(notice?.body).toContain("pas complète à midi (3/10 joueurs)");
    }
    // Personne d'autre : un joueur étranger à la séance n'en entend pas parler.
    expect(
      await cancellationNotice(etranger.identity.playerId, proposal.id),
    ).toBeNull();

    const [event] = await cancellationEvents(proposal.id);
    expect(event!.body).toContain("annulée à midi : 3/10 inscrits");

    // L'entretien repasse toutes les cinq minutes : rien ne se répète.
    const again = await expireStaleProposals(
      new Date(noonOf(date).getTime() + 6 * MINUTE),
    );
    expect(again.cancelled).toBe(0);
    expect(await cancellationEvents(proposal.id)).toHaveLength(1);
  });

  it("CAL-013 — le créneau libéré se propose de nouveau", async () => {
    const date = daysFromNow(1);
    const proposal = await openFriendly(admin, date);
    await expireStaleProposals(new Date(noonOf(date).getTime() + MINUTE));
    expect(await statusOf(proposal.id)).toBe("cancelled");

    const reopened = await openFriendly(admin, date);
    expect(reopened.id).not.toBe(proposal.id);
  });

  it("CAL-013 — ouverte le jour même après midi : elle garde jusqu'au coup d'envoi", async () => {
    const date = daysFromNow(1);
    const proposal = await openFriendly(admin, date);
    const joueur = await createPlayer();
    await joueur.caller.proposals.join({ proposalId: proposal.id });
    await db
      .update(proposals)
      .set({ createdAt: new Date(noonOf(date).getTime() + 60 * MINUTE) })
      .where(eq(proposals.id, proposal.id));

    await expireStaleProposals(
      new Date(noonOf(date).getTime() + 2 * 60 * MINUTE),
    );
    expect(await statusOf(proposal.id)).toBe("proposal");

    const kickoff = new Date(proposal.startsAtUtc);
    await expireStaleProposals(new Date(kickoff.getTime() + MINUTE));
    expect(await statusOf(proposal.id)).toBe("cancelled");
    const notice = await cancellationNotice(
      joueur.identity.playerId,
      proposal.id,
    );
    expect(notice?.body).toContain("pas complète au coup d'envoi");
  });

  it("CAL-013 — complète mais pas entièrement réglée : annulée au coup d'envoi, places payées remboursées", async () => {
    const date = daysFromNow(1);
    const proposal = await openFriendly(admin, date);
    const joueurs: TestPlayer[] = [];
    for (let index = 0; index < 9; index++) {
      const joueur = await createFundedPlayer();
      await joueur.caller.proposals.join({ proposalId: proposal.id });
      joueurs.push(joueur);
    }
    expect(await statusOf(proposal.id)).toBe("reservation");

    const payeur = joueurs[0]!;
    const avant = await balanceOf(payeur.identity.playerId);
    await payeur.caller.proposals.pay({
      proposalId: proposal.id,
      method: "uno",
      idempotencyKey: randomUUID(),
    });
    const prix = avant - (await balanceOf(payeur.identity.playerId));
    expect(prix).toBeGreaterThan(0);

    // Complète : midi ne la touche pas.
    await expireStaleProposals(new Date(noonOf(date).getTime() + MINUTE));
    expect(await statusOf(proposal.id)).toBe("reservation");

    const kickoff = new Date(proposal.startsAtUtc);
    const result = await expireStaleProposals(
      new Date(kickoff.getTime() + MINUTE),
    );
    expect(result.cancelled).toBe(1);
    expect(await statusOf(proposal.id)).toBe("cancelled");

    // Le joueur qui avait payé retrouve son argent.
    expect(await balanceOf(payeur.identity.playerId)).toBe(avant);
    const remboursé = await cancellationNotice(
      payeur.identity.playerId,
      proposal.id,
    );
    expect(remboursé?.body).toContain(
      "toutes les places n'ont pas été réglées",
    );
    expect(remboursé?.body).toContain(`${prix} UNO vous ont été remboursés`);

    const nonPayeur = await cancellationNotice(
      joueurs[1]!.identity.playerId,
      proposal.id,
    );
    expect(nonPayeur?.body).not.toContain("remboursés");

    const [event] = await cancellationEvents(proposal.id);
    expect(event!.body).toContain(
      `1/10 places réglées, ${prix} UNO remboursés`,
    );
  });

  it("CAL-013 — un match personnalisé n'est pas concerné par midi : son organisateur le confirme", () => {
    const date = daysFromNow(1);
    const startsAtUtc = zonedTimeToUtc(date, 20, DEFAULT_TIMEZONE);
    const base = {
      localDate: date,
      timezone: DEFAULT_TIMEZONE,
      startsAtUtc,
      createdAt: new Date(noonOf(date).getTime() - 48 * 60 * MINUTE),
    };

    expect(cancellationCutoff({ ...base, modeId: "friendly" })).toEqual({
      at: noonOf(date),
      echeance: "midi",
    });
    expect(cancellationCutoff({ ...base, modeId: "custom" })).toEqual({
      at: startsAtUtc,
      echeance: "coup-envoi",
    });
    // Une séance du matin : midi vient après le coup d'envoi.
    const matin = zonedTimeToUtc(date, 10, DEFAULT_TIMEZONE);
    expect(
      cancellationCutoff({ ...base, startsAtUtc: matin, modeId: "friendly" }),
    ).toEqual({ at: matin, echeance: "coup-envoi" });
  });
});
