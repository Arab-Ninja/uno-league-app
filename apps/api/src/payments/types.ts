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
  /** Identifiant de la session chez le PSP (`cs_…` chez Stripe). */
  providerIntentId: string;
  /**
   * Issue du paiement.
   *
   * `pending` n'est pas un détail : les moyens à notification différée
   * concluent le parcours bien avant que l'argent n'arrive. Sans cette
   * troisième valeur, il fallait choisir entre déclarer payé ce qui ne l'est
   * pas encore et déclarer échoué ce qui est en cours — les deux étant faux.
   */
  outcome: "paid" | "failed" | "pending";
  amountEurCents: number;
}

/**
 * Résultat de la vérification d'un webhook.
 *
 * Les trois cas sont distingués parce qu'ils appellent trois réponses HTTP
 * différentes, et que les confondre coûte cher :
 *
 *  - `invalid` — signature refusée. C'est un 400, et il doit le rester : un
 *    appel forgé ne doit jamais passer pour reçu.
 *  - `ignored` — signature valide, évènement hors périmètre. C'est un **200**.
 *    Répondre 400 ici, comme on le faisait, revient à dire à Stripe que
 *    l'endpoint est en panne : il réessaie, accumule les échecs, puis
 *    **désactive l'endpoint**. Les paiements cesseraient alors d'être
 *    crédités, sans erreur visible côté application. Le risque devient
 *    concret dès qu'un second type d'évènement est souscrit — la facturation
 *    récurrente, par exemple.
 *  - `ok` — évènement à appliquer.
 */
export type WebhookVerification =
  | { status: "invalid" }
  | { status: "ignored" }
  | { status: "ok"; event: VerifiedWebhookEvent };

export interface PaymentAdapter {
  readonly name: string;
  /** Moyens de paiement réellement proposables par cet adaptateur. */
  supportedMethods(): PaymentMethod[];
  createIntent(params: CreateIntentParams): Promise<PaymentIntent>;
  /**
   * Vérifie la signature du webhook et en extrait l'évènement.
   * Une signature invalide ne doit JAMAIS pouvoir créditer une session : elle
   * ressort en `invalid`, jamais en `ignored`.
   */
  verifyWebhook(rawBody: Buffer, signature: string): WebhookVerification;
}
