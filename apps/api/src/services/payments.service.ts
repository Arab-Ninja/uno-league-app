import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  AppError,
  type PaymentIntentView,
  type PaymentMethod,
} from "@uno/shared";
import { db, type Transaction } from "../db/client.js";
import { payments, players, proposalParticipants, users } from "../db/schema.js";
import { env } from "../env.js";
import { isDuplicateKeyError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { availablePaymentMethods, paymentAdapter } from "../payments/index.js";
import { debit } from "./ledger.service.js";
import { recordAdminEvent } from "./admin-events.service.js";
import {
  lockProposal,
  markParticipantPaid,
  takeOverSeat,
} from "./proposals.service.js";

/**
 * Paiement d'une participation (CAL-009, CAL-010).
 *
 * Règles structurantes :
 *  - le montant vient TOUJOURS de la proposition lue en base ; un montant
 *    fourni par le client est ignoré (écart §24) ;
 *  - le paiement en points UNO, le débit du registre et le passage de la
 *    réservation en session sont dans une seule transaction (TECH-003) ;
 *  - un paiement externe n'est jamais considéré comme réussi tant qu'un
 *    webhook signé ne l'a pas confirmé (CAL-010).
 */

interface PayContext {
  playerId: number;
  userId: number;
}

/** Vérifie l'éligibilité au paiement et renvoie le contexte verrouillé. */
async function assertPayable(
  tx: Transaction,
  proposalId: number,
  playerId: number,
): Promise<{ priceUno: number; priceEurCents: number }> {
  const proposal = await lockProposal(tx, proposalId);

  // CTA (§8.1) : on ne paie qu'une réservation, jamais une proposition encore
  // ouverte ni une session déjà complète.
  if (proposal.status !== "reservation") {
    throw new AppError(
      proposal.status === "session" || proposal.status === "completed"
        ? "ALREADY_PAID"
        : "PROPOSAL_CLOSED",
      proposal.status === "proposal"
        ? "Cette session n'a pas encore atteint le nombre de joueurs requis."
        : "Cette session n'attend plus de paiement.",
    );
  }

  const [participant] = await tx
    .select({ hasPaid: proposalParticipants.hasPaid })
    .from(proposalParticipants)
    .where(
      and(
        eq(proposalParticipants.proposalId, proposalId),
        eq(proposalParticipants.playerId, playerId),
      ),
    )
    .limit(1);

  if (!participant) throw new AppError("NOT_PARTICIPANT");
  if (participant.hasPaid) throw new AppError("ALREADY_PAID");

  return {
    priceUno: proposal.priceUno,
    priceEurCents: proposal.priceEur * 100,
  };
}

/** Paiement en points UNO (CAL-009). */
async function payWithUno(
  actor: PayContext,
  proposalId: number,
  idempotencyKey: string,
): Promise<PaymentIntentView> {
  return db.transaction(async (tx) => {
    const { priceUno, priceEurCents } = await assertPayable(
      tx,
      proposalId,
      actor.playerId,
    );

    let paymentId: number;
    try {
      const inserted = await tx.insert(payments).values({
        proposalId,
        playerId: actor.playerId,
        method: "uno",
        status: "pending",
        amountUno: priceUno,
        amountEurCents: priceEurCents,
        idempotencyKey,
      });
      paymentId = Number(inserted[0].insertId);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        // STATE-002 : double clic ou retry réseau. On renvoie l'état du
        // paiement déjà enregistré au lieu de débiter une seconde fois.
        const [existing] = await tx
          .select()
          .from(payments)
          .where(eq(payments.idempotencyKey, idempotencyKey))
          .limit(1);
        if (existing) {
          return {
            paymentId: existing.id,
            status: existing.status,
            method: existing.method as PaymentMethod,
            amountUno: existing.amountUno,
            amountEurCents: existing.amountEurCents,
            redirectUrl: null,
          };
        }
      }
      throw error;
    }

    // Refuse si le solde est insuffisant : aucune ligne écrite, solde intact.
    await debit(tx, {
      playerId: actor.playerId,
      amount: priceUno,
      type: "session_fee",
      description: "Participation à une session",
      referenceType: "payment",
      referenceId: paymentId,
      idempotencyKey: `payment:${paymentId}`,
    });

    await tx
      .update(payments)
      .set({ status: "paid", paidAt: new Date(), updatedAt: new Date() })
      .where(eq(payments.id, paymentId));

    // CAL-011 : bascule en session si c'était le dernier paiement attendu.
    const outcome = await markParticipantPaid(tx, {
      proposalId,
      playerId: actor.playerId,
      paymentId,
    });

    await recordAdminEvent(
      {
        type: "payment.received",
        body: `Paiement de ${priceUno} UNO reçu pour la session #${proposalId}.`,
        entityType: "proposal",
        entityId: proposalId,
        playerId: actor.playerId,
        key: `payment:${paymentId}:received`,
      },
      tx,
    );

    if (outcome.status === "session") {
      await recordAdminEvent(
        {
          type: "proposal.session",
          body: `Session #${proposalId} confirmée : tous les paiements sont reçus.`,
          entityType: "proposal",
          entityId: proposalId,
          key: `proposal:${proposalId}:session`,
        },
        tx,
      );
    }

    return {
      paymentId,
      status: "paid" as const,
      method: "uno" as PaymentMethod,
      amountUno: priceUno,
      amountEurCents: priceEurCents,
      redirectUrl: null,
    };
  });
}

/**
 * Paiement externe (CAL-010).
 * Crée un intent chez le prestataire et renvoie l'URL de redirection. Le
 * participant reste impayé tant que le webhook n'a pas confirmé.
 */
async function payWithProvider(
  actor: PayContext,
  proposalId: number,
  method: PaymentMethod,
  idempotencyKey: string,
): Promise<PaymentIntentView> {
  const adapter = paymentAdapter();
  if (!adapter.supportedMethods().includes(method)) {
    throw new AppError(
      "PAYMENT_FAILED",
      "Ce moyen de paiement n'est pas disponible actuellement.",
    );
  }

  const prepared = await db.transaction(async (tx) => {
    const { priceUno, priceEurCents } = await assertPayable(
      tx,
      proposalId,
      actor.playerId,
    );

    const [existing] = await tx
      .select()
      .from(payments)
      .where(eq(payments.idempotencyKey, idempotencyKey))
      .limit(1);

    if (existing) {
      return { payment: existing, reference: existing.idempotencyKey, reused: true };
    }

    const reference = `ref_${proposalId}_${actor.playerId}_${randomBytes(8).toString("hex")}`;

    const inserted = await tx.insert(payments).values({
      proposalId,
      playerId: actor.playerId,
      method,
      status: "pending",
      amountUno: priceUno,
      amountEurCents: priceEurCents,
      provider: adapter.name,
      providerIntentId: reference,
      idempotencyKey,
    });

    const [row] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, Number(inserted[0].insertId)))
      .limit(1);

    return { payment: row!, reference, reused: false };
  });

  if (prepared.reused && prepared.payment.status !== "pending") {
    return {
      paymentId: prepared.payment.id,
      status: prepared.payment.status,
      method,
      amountUno: prepared.payment.amountUno,
      amountEurCents: prepared.payment.amountEurCents,
      redirectUrl: null,
    };
  }

  const [account] = await db
    .select({ email: users.email })
    .from(players)
    .innerJoin(users, eq(users.id, players.userId))
    .where(eq(players.id, actor.playerId))
    .limit(1);

  const intent = await adapter.createIntent({
    paymentId: prepared.payment.id,
    amountEurCents: prepared.payment.amountEurCents,
    method,
    description: "Participation UNO League",
    reference: prepared.payment.providerIntentId ?? prepared.reference,
    // Le retour ramène à la session payée, pas à une page générique : après
    // un paiement par carte, l'utilisateur doit retrouver ce qu'il vient de
    // régler, pas se demander si ça a marché.
    returnUrl: `${env.PAYMENT_RETURN_URL}${env.PAYMENT_RETURN_URL.includes("?") ? "&" : "?"}session=${proposalId}`,
    customerEmail: account?.email ?? "",
  });

  await db
    .update(payments)
    .set({
      status: "initiated",
      provider: adapter.name,
      updatedAt: new Date(),
    })
    .where(eq(payments.id, prepared.payment.id));

  return {
    paymentId: prepared.payment.id,
    status: "initiated",
    method,
    amountUno: prepared.payment.amountUno,
    amountEurCents: prepared.payment.amountEurCents,
    // Le client redirige ; il ne conclut rien lui-même.
    redirectUrl: intent.redirectUrl,
  };
}

/**
 * Un remplaçant règle une place laissée impayée et la prend (CAL-008).
 *
 * Reprise et paiement dans une seule transaction. L'ordre compte : la place
 * est saisie **avant** le débit, si bien que deux remplaçants simultanés ne
 * peuvent pas être débités tous les deux — le second se heurte au verrou puis
 * au refus « place déjà reprise », sans avoir rien payé.
 */
export async function claimSeat(
  actor: PayContext,
  params: { proposalId: number; replacePlayerId?: number; idempotencyKey: string },
): Promise<PaymentIntentView & { replacedPlayerId: number }> {
  return db.transaction(async (tx) => {
    const seat = await takeOverSeat(tx, {
      proposalId: params.proposalId,
      playerId: actor.playerId,
      ...(params.replacePlayerId === undefined
        ? {}
        : { replacePlayerId: params.replacePlayerId }),
    });

    let paymentId: number;
    try {
      const inserted = await tx.insert(payments).values({
        proposalId: params.proposalId,
        playerId: actor.playerId,
        method: "uno",
        status: "pending",
        amountUno: seat.priceUno,
        amountEurCents: seat.priceUno * 10,
        idempotencyKey: params.idempotencyKey,
      });
      paymentId = Number(inserted[0].insertId);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AppError("CONFLICT", "Ce paiement est déjà en cours de traitement.");
      }
      throw error;
    }

    // Solde insuffisant : toute la transaction est annulée, reprise de place
    // comprise. La place reste donc au joueur en retard, ce qui est correct.
    await debit(tx, {
      playerId: actor.playerId,
      amount: seat.priceUno,
      type: "session_fee",
      description: "Participation à une session (remplacement)",
      referenceType: "payment",
      referenceId: paymentId,
      idempotencyKey: `payment:${paymentId}`,
    });

    await tx
      .update(payments)
      .set({ status: "paid", paidAt: new Date(), updatedAt: new Date() })
      .where(eq(payments.id, paymentId));

    await markParticipantPaid(tx, {
      proposalId: params.proposalId,
      playerId: actor.playerId,
      paymentId,
    });

    await recordAdminEvent(
      {
        type: "substitute.promoted",
        body:
          `Un remplaçant a repris et réglé une place non payée sur la session ` +
          `#${params.proposalId}.`,
        entityType: "proposal",
        entityId: params.proposalId,
        playerId: actor.playerId,
        key: `proposal:${params.proposalId}:promoted:${actor.playerId}`,
      },
      tx,
    );

    return {
      paymentId,
      status: "paid" as const,
      method: "uno" as PaymentMethod,
      amountUno: seat.priceUno,
      amountEurCents: seat.priceUno * 10,
      redirectUrl: null,
      replacedPlayerId: seat.replacedPlayerId,
    };
  });
}

export async function payProposal(
  actor: PayContext,
  params: { proposalId: number; method: PaymentMethod; idempotencyKey: string },
): Promise<PaymentIntentView> {
  if (!availablePaymentMethods().includes(params.method)) {
    throw new AppError(
      "PAYMENT_FAILED",
      "Ce moyen de paiement n'est pas disponible actuellement.",
    );
  }

  return params.method === "uno"
    ? payWithUno(actor, params.proposalId, params.idempotencyKey)
    : payWithProvider(actor, params.proposalId, params.method, params.idempotencyKey);
}

/**
 * Traitement d'un webhook prestataire déjà vérifié (CAL-010, ANN-004).
 * Idempotent : un webhook rejoué ne modifie rien la seconde fois.
 */
export async function applyWebhookOutcome(event: {
  reference: string;
  providerIntentId: string;
  outcome: "paid" | "failed";
}): Promise<{ applied: boolean }> {
  return db.transaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.providerIntentId, event.reference))
      .limit(1);

    if (!payment) {
      logger.warn({ reference: event.reference }, "webhook sans paiement correspondant");
      return { applied: false };
    }

    // Webhook reçu deux fois : la seconde passe est un no-op (§21.1).
    if (payment.status === "paid" || payment.status === "refunded") {
      return { applied: false };
    }

    if (event.outcome === "failed") {
      await tx
        .update(payments)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(payments.id, payment.id));
      return { applied: true };
    }

    await tx
      .update(payments)
      .set({ status: "paid", paidAt: new Date(), updatedAt: new Date() })
      .where(eq(payments.id, payment.id));

    await markParticipantPaid(tx, {
      proposalId: payment.proposalId,
      playerId: payment.playerId,
      paymentId: payment.id,
    });

    return { applied: true };
  });
}
