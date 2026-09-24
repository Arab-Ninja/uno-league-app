import type { LangueTraduite } from "./erreurs.js";

/**
 * Ce que la ligue annonce à un joueur, en anglais et en néerlandais
 * (I18N-002) : notifications internes, push, et leur courrier de repli.
 *
 * Même principe que les messages d'erreur — la clé est le gabarit français,
 * écrit là où la notification part — mais la langue n'est pas celle de la
 * requête : c'est celle du compte du destinataire. Un remplaçant prévenu
 * qu'une place lui revient ne l'est pas dans la langue du joueur qui vient de
 * la libérer.
 *
 * Les jours (`{jour}`, `{avant}`, `{apres}`) et l'échéance arrivent déjà
 * écrits dans la langue : « lundi 12 octobre », "Monday 12 October".
 */
export const CATALOGUE_NOTIFICATIONS: Record<
  string,
  Record<LangueTraduite, string>
> = {
  // --- Portefeuille, arbitrage ----------------------------------------------
  "Points reçus": {
    en: "Points received",
    nl: "Punten ontvangen",
  },
  "{nom} vous a envoyé {montant} UNO.": {
    en: "{nom} sent you {montant} UNO.",
    nl: "{nom} heeft je {montant} UNO gestuurd.",
  },
  "Session arbitrée": {
    en: "Session refereed",
    nl: "Sessie gefloten",
  },
  "{montant} UNO vous ont été crédités pour votre arbitrage.": {
    en: "{montant} UNO have been credited for your refereeing.",
    nl: "Je hebt {montant} UNO gekregen voor het fluiten.",
  },

  // --- Boutique ------------------------------------------------------------------
  "Commande #{numero} — {statut}": {
    en: "Order #{numero} — {statut}",
    nl: "Bestelling #{numero} — {statut}",
  },
  "Votre commande n'a pas été honorée. Les {montant} UNO ont été recrédités sur votre portefeuille.":
    {
      en: "Your order could not be fulfilled. The {montant} UNO have been returned to your wallet.",
      nl: "Je bestelling kon niet geleverd worden. De {montant} UNO staan weer in je portefeuille.",
    },
  "Votre commande est désormais {statut}.": {
    en: "Your order is now {statut}.",
    nl: "Je bestelling is nu {statut}.",
  },
  "Proposition retenue": {
    en: "Suggestion accepted",
    nl: "Voorstel aanvaard",
  },
  "Proposition écartée": {
    en: "Suggestion declined",
    nl: "Voorstel afgewezen",
  },
  "« {titre} » rejoint la boutique.": {
    en: "“{titre}” is joining the shop.",
    nl: "“{titre}” komt in de winkel.",
  },
  "« {titre} » n'a pas été retenue.": {
    en: "“{titre}” was not accepted.",
    nl: "“{titre}” werd niet aanvaard.",
  },

  // --- Séances ------------------------------------------------------------------
  "Séance confirmée": {
    en: "Session confirmed",
    nl: "Sessie bevestigd",
  },
  "Séance confirmée — place à régler": {
    en: "Session confirmed — place to pay",
    nl: "Sessie bevestigd — plaats te betalen",
  },
  "{salle}, le {jour} à {heure} : le plateau est complet.": {
    en: "{salle}, {jour} at {heure}: the session is full.",
    nl: "{salle}, {jour} om {heure}: de sessie is volzet.",
  },
  "Rien à régler, rendez-vous sur le terrain.": {
    en: "Nothing to pay — see you on the pitch.",
    nl: "Niets te betalen, tot op het veld.",
  },
  "Réglez votre place avant le {echeance}, faute de quoi elle reviendra à un remplaçant.":
    {
      en: "Pay for your place before {echeance}, or it will go to a substitute.",
      nl: "Betaal je plaats vóór {echeance}, anders gaat ze naar een invaller.",
    },
  "Votre place est à régler.": {
    en: "Your place is to be paid.",
    nl: "Je plaats moet nog betaald worden.",
  },
  "Séance déplacée": {
    en: "Session moved",
    nl: "Sessie verplaatst",
  },
  "{salle} : la séance du {avant} à {heureAvant} est déplacée au {apres} à {heureApres}.":
    {
      en: "{salle}: the session on {avant} at {heureAvant} has moved to {apres} at {heureApres}.",
      nl: "{salle}: de sessie van {avant} om {heureAvant} is verplaatst naar {apres} om {heureApres}.",
    },
  "Place perdue faute de paiement": {
    en: "Place lost for non-payment",
    nl: "Plaats verloren wegens niet-betaling",
  },
  "La session du {jour} à {salle} est complète : toutes les places ont été réglées. La vôtre ne l'étant pas, elle a été attribuée à un remplaçant.":
    {
      en: "The session on {jour} at {salle} is full: every place has been paid. Yours was not, so it has gone to a substitute.",
      nl: "De sessie van {jour} in {salle} is volzet: alle plaatsen zijn betaald. De jouwe niet, dus ze is naar een invaller gegaan.",
    },
  "Paiement en retard": {
    en: "Payment overdue",
    nl: "Betaling te laat",
  },
  "Votre place du {jour} à {salle} n'est pas réglée. Elle peut désormais être reprise par un remplaçant.":
    {
      en: "Your place on {jour} at {salle} has not been paid. A substitute can now take it.",
      nl: "Je plaats van {jour} in {salle} is niet betaald. Een invaller kan ze nu overnemen.",
    },

  // --- Places libérées ------------------------------------------------------------
  "Place libérée": {
    en: "Place released",
    nl: "Plaats vrijgegeven",
  },
  "Votre compte est un compte arbitre : il ne peut pas occuper une place de joueur. Votre place du {jour} à {salle} a été libérée.":
    {
      en: "Your account is a referee account: it cannot take a player's place. Your place on {jour} at {salle} has been released.",
      nl: "Je account is een scheidsrechtersaccount: het kan geen spelersplaats innemen. Je plaats van {jour} in {salle} is vrijgegeven.",
    },
  "Votre place du {jour} à {salle} était réservée à la division {division}. Vous êtes désormais en {nouvelle}, elle a donc été libérée.":
    {
      en: "Your place on {jour} at {salle} was reserved for division {division}. You are now in {nouvelle}, so it has been released.",
      nl: "Je plaats van {jour} in {salle} was voorbehouden aan divisie {division}. Je zit nu in {nouvelle}, dus ze is vrijgegeven.",
    },
  "{montant} UNO vous ont été remboursés.": {
    en: "{montant} UNO have been refunded to you.",
    nl: "Je hebt {montant} UNO terugbetaald gekregen.",
  },
  "Une place vous revient": {
    en: "A place is yours",
    nl: "Er is een plaats voor jou",
  },
  "Vous entrez dans la session du {jour} à {salle}. Réglez votre place pour la confirmer.":
    {
      en: "You are in the session on {jour} at {salle}. Pay for your place to confirm it.",
      nl: "Je zit in de sessie van {jour} in {salle}. Betaal je plaats om ze te bevestigen.",
    },
  "Session incomplète": {
    en: "Session no longer full",
    nl: "Sessie niet meer volzet",
  },
  "La session du {jour} à {salle} n'est plus complète : une place s'est libérée et les inscriptions rouvrent.":
    {
      en: "The session on {jour} at {salle} is no longer full: a place has opened up and sign-ups are open again.",
      nl: "De sessie van {jour} in {salle} is niet meer volzet: er is een plaats vrijgekomen en de inschrijvingen gaan weer open.",
    },
};
