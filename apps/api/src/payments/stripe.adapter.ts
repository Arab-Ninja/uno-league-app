import Stripe from "stripe";
import { AppError, type PaymentMethod } from "@uno/shared";
import { env } from "../env.js";
import { logger } from "../lib/logger.js";
import type {
  CreateIntentParams,
  PaymentAdapter,
  PaymentIntent,
  VerifiedWebhookEvent,
} from "./types.js";

/**
 * Adaptateur Stripe (CAL-010).
 *
 * Couvre la carte bancaire et Bancontact via Stripe Checkout. Le montant
 * provient toujours du serveur ; `client_reference_id` porte la référence
 * interne du paiement, que le webhook renvoie à l'identique.
 *
 * **Apple Pay et Google Pay n'apparaissent pas ici**, et c'est voulu : chez
 * Stripe ce ne sont pas des moyens de paiement distincts mais des façons de
 * présenter une carte. Checkout les propose de lui-même, sur un appareil
 * compatible et un domaine vérifié dans le tableau de bord Stripe. Les
 * déclarer séparément les ferait apparaître là où ils n'existent pas — sur
 * un ordinateur sans portefeuille, par exemple. Une carte Revolut est une
 * carte : elle passe par le même chemin.
 */

function createClient(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new AppError(
      "PAYMENT_FAILED",
      "Le paiement en ligne n'est pas configuré.",
    );
  }
  return new Stripe(env.STRIPE_SECRET_KEY, { typescript: true });
}

const METHOD_TO_STRIPE: Partial<Record<PaymentMethod, string>> = {
  stripe_card: "card",
  stripe_bancontact: "bancontact",
};

export const stripeAdapter: PaymentAdapter = {
  name: "stripe",

  supportedMethods(): PaymentMethod[] {
    return ["stripe_card", "stripe_bancontact"];
  },

  async createIntent(params: CreateIntentParams): Promise<PaymentIntent> {
    const stripe = createClient();
    const method = METHOD_TO_STRIPE[params.method];
    if (!method) {
      throw new AppError("PAYMENT_FAILED", "Moyen de paiement non supporté.");
    }

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: [method as Stripe.Checkout.SessionCreateParams.PaymentMethodType],
        client_reference_id: params.reference,
        customer_email: params.customerEmail,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "eur",
              // Montant figé côté serveur : le client ne peut pas l'influencer.
              unit_amount: params.amountEurCents,
              product_data: { name: params.description },
            },
          },
        ],
        // L'URL de retour porte déjà la session : on complète avec l'issue.
        success_url: `${params.returnUrl}&paiement=succes`,
        cancel_url: `${params.returnUrl}&paiement=annule`,
        metadata: { reference: params.reference, paymentId: String(params.paymentId) },
      },
      // Stripe déduplique lui-même les créations d'intent rejouées.
      { idempotencyKey: params.reference },
    );

    if (!session.url) {
      throw new AppError("PAYMENT_FAILED", "Le paiement n'a pas pu être initié.");
    }

    return { providerIntentId: session.id, redirectUrl: session.url };
  },

  verifyWebhook(rawBody: Buffer, signature: string): VerifiedWebhookEvent | null {
    if (!env.STRIPE_WEBHOOK_SECRET) {
      logger.error("STRIPE_WEBHOOK_SECRET absent : webhook rejeté");
      return null;
    }

    const stripe = createClient();
    let event: Stripe.Event;
    try {
      // Lève si la signature ne correspond pas : un appel forgé est rejeté.
      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        env.STRIPE_WEBHOOK_SECRET,
      );
    } catch {
      logger.warn("signature de webhook Stripe invalide");
      return null;
    }

    if (
      event.type !== "checkout.session.completed" &&
      event.type !== "checkout.session.async_payment_succeeded" &&
      event.type !== "checkout.session.async_payment_failed" &&
      event.type !== "checkout.session.expired"
    ) {
      return null;
    }

    const session = event.data.object as Stripe.Checkout.Session;
    const reference = session.client_reference_id;
    if (!reference) return null;

    const paid =
      session.payment_status === "paid" ||
      event.type === "checkout.session.async_payment_succeeded";

    return {
      reference,
      providerIntentId: session.id,
      outcome: paid ? "paid" : "failed",
      amountEurCents: session.amount_total ?? 0,
    };
  },
};
