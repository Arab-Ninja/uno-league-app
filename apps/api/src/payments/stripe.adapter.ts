import Stripe from "stripe";
import { AppError, type PaymentMethod } from "@uno/shared";
import { env } from "../env.js";
import { logger } from "../lib/logger.js";
import type {
  CreateIntentParams,
  PaymentAdapter,
  PaymentIntent,
  VerifiedWebhookEvent,
  WebhookVerification,
} from "./types.js";

/**
 * Adaptateur Stripe (CAL-010).
 *
 * Le paiement passe par Stripe Checkout, page hébergée par Stripe : aucune
 * donnée de carte ne traverse jamais nos serveurs. Le montant provient
 * toujours de la base ; `client_reference_id` porte la référence interne du
 * paiement, que le webhook renvoie à l'identique.
 *
 * **Un seul moyen externe est exposé, et les moyens ne sont pas déclarés à
 * Stripe.** C'est la recommandation de Stripe, et elle n'est pas cosmétique :
 * en passant `payment_method_types`, on fige dans le code une liste que
 * Checkout sait composer bien mieux que nous — il connaît le pays de la
 * carte, l'appareil, le montant, et classe les moyens par taux de réussite.
 * Déclarer `["card"]` interdisait Bancontact au joueur belge qui payait
 * depuis son application bancaire, et déclarer `["bancontact"]` interdisait
 * la carte. Sans ce paramètre, les moyens acceptés se règlent depuis le
 * tableau de bord Stripe, sans redéploiement.
 *
 * Apple Pay et Google Pay n'apparaissent toujours pas comme des moyens
 * distincts, pour la même raison qu'avant : ce sont des façons de présenter
 * une carte, que Checkout propose de lui-même sur un appareil compatible et
 * un domaine vérifié dans le tableau de bord.
 */

/**
 * Version d'API figée.
 *
 * Sans elle, Stripe applique la version du compte, qui peut changer depuis le
 * tableau de bord — donc sans déploiement, sans revue, et sans que rien dans
 * le dépôt ne l'indique. Une montée de version se fait ici, en connaissance
 * de cause, après lecture du journal des changements.
 *
 * Le type attendu par le SDK est la version exacte qu'il embarque : la
 * constante n'est donc pas seulement documentaire. Si une montée du paquet
 * `stripe` change de version d'API, `tsc` échoue ici — la divergence se voit
 * à la compilation plutôt qu'en production, sur une réponse au format
 * inattendu.
 */
const STRIPE_API_VERSION: Stripe.LatestApiVersion = "2026-08-26.dahlia";

/**
 * Étiquette de suivi des sessions Checkout, lisible dans le tableau de bord.
 *
 * Le suffixe est aléatoire — Stripe le demande pour éviter les collisions
 * entre intégrations — mais il est **figé une fois pour toutes**, et c'est
 * tout l'intérêt : l'étiquette sert à comparer un parcours de paiement dans
 * le temps. La tirer au démarrage du serveur donnerait une étiquette par
 * déploiement, donc des statistiques éparpillées et incomparables.
 */
const INTEGRATION_IDENTIFIER = "uno-league-session-rvlpofzl";

function createClient(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new AppError(
      "PAYMENT_FAILED",
      "Le paiement en ligne n'est pas configuré.",
    );
  }
  return new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
  });
}

export const stripeAdapter: PaymentAdapter = {
  name: "stripe",

  supportedMethods(): PaymentMethod[] {
    return ["stripe"];
  },

  async createIntent(params: CreateIntentParams): Promise<PaymentIntent> {
    const stripe = createClient();

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        // Pas de `payment_method_types` : voir l'en-tête de ce fichier.
        client_reference_id: params.reference,
        customer_email: params.customerEmail,
        integration_identifier: INTEGRATION_IDENTIFIER,
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

  verifyWebhook(rawBody: Buffer, signature: string): WebhookVerification {
    if (!env.STRIPE_WEBHOOK_SECRET) {
      logger.error("STRIPE_WEBHOOK_SECRET absent : webhook rejeté");
      return { status: "invalid" };
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
      return { status: "invalid" };
    }

    // Signé par Stripe, mais hors périmètre : accusé de réception, sans effet.
    if (
      event.type !== "checkout.session.completed" &&
      event.type !== "checkout.session.async_payment_succeeded" &&
      event.type !== "checkout.session.async_payment_failed" &&
      event.type !== "checkout.session.expired"
    ) {
      return { status: "ignored" };
    }

    const session = event.data.object as Stripe.Checkout.Session;
    const reference = session.client_reference_id;
    if (!reference) {
      // Une session Checkout ouverte hors de l'application (lien de paiement,
      // tableau de bord) n'a pas notre référence : rien à rapprocher, mais
      // l'évènement est authentique — ce n'est pas une panne d'endpoint.
      logger.warn("session Checkout sans référence interne : évènement ignoré");
      return { status: "ignored" };
    }

    return {
      status: "ok",
      event: {
        reference,
        providerIntentId: session.id,
        outcome: outcomeOf(event.type, session.payment_status),
        amountEurCents: session.amount_total ?? 0,
      },
    };
  },
};

/**
 * Issue d'un évènement Checkout.
 *
 * Le cas qui compte est `checkout.session.completed` avec un paiement encore
 * `unpaid` : c'est ce que Stripe envoie pour un moyen à notification différée
 * — un virement, par exemple — où la session est bien conclue mais l'argent
 * n'est pas encore arrivé. Le traiter comme un échec marquait le paiement
 * « échoué » alors qu'il était simplement en cours : le joueur voyait sa
 * réservation refusée pendant les heures, parfois les jours, qui séparent la
 * fin du parcours de la confirmation bancaire. L'issue est donc `pending`, et
 * c'est `async_payment_succeeded` ou `async_payment_failed` qui tranchera.
 *
 * Une session expirée, elle, est bien un échec : Stripe ne la reprendra pas.
 */
function outcomeOf(
  type: string,
  paymentStatus: Stripe.Checkout.Session.PaymentStatus | null,
): VerifiedWebhookEvent["outcome"] {
  if (type === "checkout.session.async_payment_succeeded") return "paid";
  if (type === "checkout.session.async_payment_failed") return "failed";
  if (type === "checkout.session.expired") return "failed";

  // checkout.session.completed
  if (paymentStatus === "paid" || paymentStatus === "no_payment_required") {
    return "paid";
  }
  return "pending";
}
