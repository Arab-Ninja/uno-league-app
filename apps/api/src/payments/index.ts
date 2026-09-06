import type { PaymentMethod } from "@uno/shared";
import { env } from "../env.js";
import { noneAdapter } from "./none.adapter.js";
import { stripeAdapter } from "./stripe.adapter.js";
import type { PaymentAdapter } from "./types.js";

/**
 * Sélection du prestataire selon la configuration (TECH-001).
 * Changer de prestataire ne demande qu'une variable d'environnement et un
 * nouvel adaptateur : aucun code métier n'est à modifier.
 */
export function paymentAdapter(): PaymentAdapter {
  switch (env.PAYMENT_PROVIDER) {
    case "stripe":
      return stripeAdapter;
    default:
      return noneAdapter;
  }
}

/** Moyens réellement proposables au joueur : UNO + ceux du prestataire actif. */
export function availablePaymentMethods(): PaymentMethod[] {
  return ["uno", ...paymentAdapter().supportedMethods()];
}

export type { PaymentAdapter } from "./types.js";
