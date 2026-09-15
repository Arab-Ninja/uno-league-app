import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import { stripeAdapter } from "../src/payments/stripe.adapter.js";
import { env } from "../src/env.js";

/**
 * Vérification des webhooks Stripe (CAL-010).
 *
 * Deux garanties sont testées ici, et aucune ne demande le réseau : la
 * signature est vérifiée localement, par HMAC.
 *
 *  1. un appel non signé, ou signé avec un autre secret, n'a AUCUN effet ;
 *  2. l'issue déduite de l'évènement est exacte — c'est le point qui avait
 *     régressé, voir le cas « paiement différé » plus bas.
 */

const stripe = new Stripe("cle-stripe-factice-pour-les-tests");

/** Enveloppe un objet Checkout dans un évènement Stripe signé, comme en vrai. */
function signedEvent(
  type: string,
  session: Partial<Stripe.Checkout.Session>,
  secret: string = env.STRIPE_WEBHOOK_SECRET as string,
): { body: Buffer; signature: string } {
  const payload = JSON.stringify({
    id: "evt_test",
    object: "event",
    type,
    data: { object: { object: "checkout.session", ...session } },
  });

  return {
    body: Buffer.from(payload, "utf8"),
    signature: stripe.webhooks.generateTestHeaderString({ payload, secret }),
  };
}

const REFERENCE = "ref_1_2_abcdef0123456789";

describe("signature d'un webhook Stripe", () => {
  it("rejette une signature forgée sans rien appliquer", () => {
    const { body } = signedEvent("checkout.session.completed", {
      client_reference_id: REFERENCE,
      payment_status: "paid",
    });

    expect(stripeAdapter.verifyWebhook(body, "t=1,v1=signature_inventee")).toEqual({
      status: "invalid",
    });
  });

  it("rejette un évènement signé avec un autre secret", () => {
    const { body, signature } = signedEvent(
      "checkout.session.completed",
      { client_reference_id: REFERENCE, payment_status: "paid" },
      "un-autre-secret-que-celui-du-serveur",
    );

    expect(stripeAdapter.verifyWebhook(body, signature)).toEqual({ status: "invalid" });
  });

  /**
   * Hors périmètre, mais authentique : la distinction n'est pas cosmétique.
   *
   * Cet évènement ressort « ignored », et non « invalid », parce que la route
   * répond alors 200. Le classer invalide produirait un 400, que Stripe
   * interprète comme une panne : il réessaie, accumule les échecs, puis
   * désactive l'endpoint — et plus aucun paiement n'est crédité.
   */
  it("accuse réception d'un évènement signé mais hors sujet", () => {
    const { body, signature } = signedEvent("payment_intent.created", {
      client_reference_id: REFERENCE,
    });

    expect(stripeAdapter.verifyWebhook(body, signature)).toEqual({ status: "ignored" });
  });

  /**
   * Sans référence, aucun paiement ne peut être retrouvé : appliquer
   * l'évènement reviendrait à créditer une session au hasard. Il est
   * néanmoins authentique — donc ignoré, pas rejeté.
   */
  it("ignore une session sans référence interne", () => {
    const { body, signature } = signedEvent("checkout.session.completed", {
      payment_status: "paid",
    });

    expect(stripeAdapter.verifyWebhook(body, signature)).toEqual({ status: "ignored" });
  });
});

describe("issue déduite d'un évènement Checkout", () => {
  /** Raccourci : renvoie l'issue d'un évènement correctement signé. */
  function outcomeOf(
    type: string,
    paymentStatus?: Stripe.Checkout.Session.PaymentStatus,
  ): string | undefined {
    const { body, signature } = signedEvent(type, {
      client_reference_id: REFERENCE,
      ...(paymentStatus ? { payment_status: paymentStatus } : {}),
      amount_total: 1200,
      id: "cs_test_123",
    });

    const result = stripeAdapter.verifyWebhook(body, signature);
    return result.status === "ok" ? result.event.outcome : undefined;
  }

  it("confirme un paiement immédiat", () => {
    expect(outcomeOf("checkout.session.completed", "paid")).toBe("paid");
  });

  /**
   * LE cas qui avait régressé.
   *
   * Un moyen à notification différée — un virement, par exemple — conclut la
   * session Checkout AVANT que l'argent n'arrive : Stripe envoie alors
   * `completed` avec un paiement encore `unpaid`. Le traiter comme un échec
   * marquait la réservation « échouée » pendant les heures, parfois les jours,
   * qui précèdent la confirmation bancaire. L'issue doit rester en suspens.
   */
  it("laisse un paiement différé en attente, sans le déclarer échoué", () => {
    expect(outcomeOf("checkout.session.completed", "unpaid")).toBe("pending");
  });

  it("confirme le paiement différé quand la banque répond", () => {
    expect(outcomeOf("checkout.session.async_payment_succeeded", "paid")).toBe("paid");
  });

  it("marque échoué un paiement différé refusé", () => {
    expect(outcomeOf("checkout.session.async_payment_failed", "unpaid")).toBe("failed");
  });

  /** Une session expirée ne sera jamais reprise par Stripe : c'est un échec. */
  it("marque échouée une session expirée", () => {
    expect(outcomeOf("checkout.session.expired", "unpaid")).toBe("failed");
  });

  /** Montant nul (place offerte) : rien à encaisser, la place est due. */
  it("confirme une session sans paiement requis", () => {
    expect(outcomeOf("checkout.session.completed", "no_payment_required")).toBe("paid");
  });

  it("remonte l'identifiant de session Stripe pour le rapprochement", () => {
    const { body, signature } = signedEvent("checkout.session.completed", {
      client_reference_id: REFERENCE,
      payment_status: "paid",
      id: "cs_test_123",
      amount_total: 1200,
    });

    const result = stripeAdapter.verifyWebhook(body, signature);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.event.reference).toBe(REFERENCE);
    expect(result.event.providerIntentId).toBe("cs_test_123");
    expect(result.event.amountEurCents).toBe(1200);
  });
});

describe("moyens de paiement exposés", () => {
  /**
   * Un seul moyen externe : les moyens réels sont choisis par Checkout, et se
   * règlent depuis le tableau de bord Stripe. En lister plusieurs ici les
   * figerait dans le code — c'est précisément ce dont on est revenu.
   */
  it("n'expose qu'un moyen externe, sans détailler les réseaux", () => {
    expect(stripeAdapter.supportedMethods()).toEqual(["stripe"]);
  });
});
