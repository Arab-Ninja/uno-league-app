import { AppError, type PaymentMethod } from "@uno/shared";
import type { PaymentAdapter } from "./types.js";

/**
 * Adaptateur par défaut : aucun prestataire configuré.
 *
 * Il ne simule rien. Les moyens externes ne sont tout simplement pas proposés
 * par l'API, donc l'interface ne les affiche pas — ce qui évite le parcours
 * de réservation fantôme dénoncé par le cahier des charges (§24).
 */
export const noneAdapter: PaymentAdapter = {
  name: "none",

  supportedMethods(): PaymentMethod[] {
    return [];
  },

  async createIntent() {
    throw new AppError(
      "PAYMENT_FAILED",
      "Le paiement par carte n'est pas encore disponible. Utilisez vos points UNO.",
    );
  },

  verifyWebhook() {
    return null;
  },
};
