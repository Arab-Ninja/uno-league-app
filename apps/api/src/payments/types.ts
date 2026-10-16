import type { PaymentMethod } from "@uno/shared";

/**
 * Abstraction des prestataires de paiement (CAL-010, écart §24).
 *
 * Principe non négociable : le front ne déclare JAMAIS un paiement externe
 * comme réussi. Il obtient une URL de redirection, l'utilisateur paie chez le
 * prestataire, et seul un webhook signé et vérifié fait passer le paiement au
 * statut `paid` côté serveur.
 */

export interface CreateIntentParams {
  paymentId: number;
  amountEurCents: number;
  method: PaymentMethod;
  description: string;
  /** Référence opaque renvoyée par le prestataire dans le webhook. */
  reference: string;
  returnUrl: string;
  customerEmail: string;
}

export interface PaymentIntent {
  providerIntentId: string;
  redirectUrl: string;
}

export interface VerifiedWebhookEvent {
  /** Référence transmise à `createIntent`, telle que renvoyée par le PSP. */
  reference: string;
  providerIntentId: string;
  outcome: "paid" | "failed";
  amountEurCents: number;
}

export interface RefundParams {
  /** L'identifiant renvoyé par `createIntent` pour ce paiement. */
  providerIntentId: string;
  amountEurCents: number;
  /** Rejouer le même remboursement ne rembourse qu'une fois. */
  idempotencyKey: string;
}

export interface PaymentAdapter {
  readonly name: string;
  /** Moyens de paiement réellement proposables par cet adaptateur. */
  supportedMethods(): PaymentMethod[];
  createIntent(params: CreateIntentParams): Promise<PaymentIntent>;
  /**
   * Vérifie la signature du webhook et en extrait l'évènement.
   * Doit lever si la signature est invalide : un webhook non authentifié ne
   * doit jamais pouvoir créditer une session.
   */
  verifyWebhook(
    rawBody: Buffer,
    signature: string,
  ): VerifiedWebhookEvent | null;
  /**
   * Rembourse un paiement en ligne sur le moyen qui l'a réglé (ALT-001).
   * Lève si le prestataire refuse ou n'est pas joignable : l'appelant le
   * signale alors à l'administration, qui rembourse à la main.
   */
  refund(params: RefundParams): Promise<{ refundId: string }>;
}
