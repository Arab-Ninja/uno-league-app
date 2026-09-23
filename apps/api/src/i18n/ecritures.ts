import type { LangueTraduite } from "./erreurs.js";

/**
 * Les libellés des écritures — portefeuille d'un joueur, caisse d'un club —
 * en anglais et en néerlandais (I18N-002).
 *
 * Ces libellés sont **enregistrés en français** avec l'écriture, et traduits
 * à la lecture du relevé (`traduireEcriture`) : le gabarit est retrouvé dans
 * le texte, ce qui vaut aussi pour les écritures passées. Il faut donc que le
 * gabarit reproduise exactement le texte d'origine — un tiret, une espace de
 * trop, et l'écriture ne se reconnaît plus : elle reste en français, lisible
 * mais non traduite.
 *
 * Les morceaux cités — une raison (« club dissous »), un nom par défaut
 * (« un membre ») — ont leur propre entrée et se traduisent à leur tour.
 */
export const CATALOGUE_ECRITURES: Record<
  string,
  Record<LangueTraduite, string>
> = {
  // --- Compte ------------------------------------------------------------------
  "Bonus de bienvenue": {
    en: "Welcome bonus",
    nl: "Welkomstbonus",
  },
  "Solde repris à la fermeture du compte": {
    en: "Balance withdrawn when the account was closed",
    nl: "Saldo teruggenomen bij het sluiten van het account",
  },
  "Crédit administrateur — {motif}": {
    en: "Admin credit — {motif}",
    nl: "Creditering door beheer — {motif}",
  },
  "Débit administrateur — {motif}": {
    en: "Admin debit — {motif}",
    nl: "Debitering door beheer — {motif}",
  },
  "Remise à zéro des soldes — {motif}": {
    en: "Balances reset — {motif}",
    nl: "Saldi op nul gezet — {motif}",
  },
  "Passage au niveau {niveau}": {
    en: "Reached level {niveau}",
    nl: "Niveau {niveau} bereikt",
  },

  // --- Envois entre joueurs ----------------------------------------------------
  "Envoi à {nom} — {note}": {
    en: "Sent to {nom} — {note}",
    nl: "Gestuurd naar {nom} — {note}",
  },
  "Envoi à {nom}": {
    en: "Sent to {nom}",
    nl: "Gestuurd naar {nom}",
  },
  "Reçu de {nom} — {note}": {
    en: "Received from {nom} — {note}",
    nl: "Ontvangen van {nom} — {note}",
  },
  "Reçu de {nom}": {
    en: "Received from {nom}",
    nl: "Ontvangen van {nom}",
  },

  // --- Séances --------------------------------------------------------------------
  "Participation à une session": {
    en: "Session place",
    nl: "Deelname aan een sessie",
  },
  "Participation à une session (remplacement)": {
    en: "Session place (substitute)",
    nl: "Deelname aan een sessie (invaller)",
  },
  "Remboursement — session du {jour} à {salle}": {
    en: "Refund — session on {jour} at {salle}",
    nl: "Terugbetaling — sessie van {jour} in {salle}",
  },
  "Arbitrage d'une session": {
    en: "Refereeing a session",
    nl: "Een sessie gefloten",
  },
  "Récompense meilleure équipe": {
    en: "Best team reward",
    nl: "Beloning beste ploeg",
  },
  "Récompense de participation": {
    en: "Participation reward",
    nl: "Deelnamebeloning",
  },
  "Meilleur buteur": {
    en: "Top scorer",
    nl: "Topschutter",
  },
  "Meilleur passeur": {
    en: "Top assister",
    nl: "Beste assistgever",
  },
  "Meilleur défenseur": {
    en: "Best defender",
    nl: "Beste verdediger",
  },

  // --- Boutique ---------------------------------------------------------------------
  "Achat : {produit}": {
    en: "Purchase: {produit}",
    nl: "Aankoop: {produit}",
  },
  "Achat de {nombre} articles": {
    en: "Purchase of {nombre} items",
    nl: "Aankoop van {nombre} artikelen",
  },
  "Annulation de la commande #{numero}": {
    en: "Order #{numero} cancelled",
    nl: "Bestelling #{numero} geannuleerd",
  },
  "Remboursement de la commande #{numero}": {
    en: "Refund of order #{numero}",
    nl: "Terugbetaling van bestelling #{numero}",
  },

  // --- Clubs : défis et places ----------------------------------------------------------
  "Mise engagée — défi #{defi}": {
    en: "Stake committed — challenge #{defi}",
    nl: "Inzet vastgelegd — uitdaging #{defi}",
  },
  "Mise rendue — défi #{defi} (nul)": {
    en: "Stake returned — challenge #{defi} (draw)",
    nl: "Inzet teruggegeven — uitdaging #{defi} (gelijkspel)",
  },
  "Mise gagnée — défi #{defi}": {
    en: "Stake won — challenge #{defi}",
    nl: "Inzet gewonnen — uitdaging #{defi}",
  },
  "Mise perdue — défi #{defi}": {
    en: "Stake lost — challenge #{defi}",
    nl: "Inzet verloren — uitdaging #{defi}",
  },
  "Mise rendue — défi #{defi} annulé": {
    en: "Stake returned — challenge #{defi} cancelled",
    nl: "Inzet teruggegeven — uitdaging #{defi} geannuleerd",
  },
  "Défi annulé": {
    en: "Challenge cancelled",
    nl: "Uitdaging geannuleerd",
  },
  "Place — défi club": {
    en: "Place — club challenge",
    nl: "Plaats — clubuitdaging",
  },
  "Place prise en charge par la caisse": {
    en: "Place paid by the treasury",
    nl: "Plaats betaald door de kas",
  },
  "{raison} — remboursement de la caisse": {
    en: "{raison} — refunded to the treasury",
    nl: "{raison} — terugbetaald aan de kas",
  },
  "{raison} — défi club": {
    en: "{raison} — club challenge",
    nl: "{raison} — clubuitdaging",
  },

  // --- Clubs : transferts ------------------------------------------------------------------
  "Transfert #{numero} — montants engagés": {
    en: "Transfer #{numero} — amounts committed",
    nl: "Transfer #{numero} — bedragen vastgelegd",
  },
  "Transfert #{numero} — indemnité et prime versées": {
    en: "Transfer #{numero} — fee and bonus paid",
    nl: "Transfer #{numero} — vergoeding en premie betaald",
  },
  "Transfert #{numero} — indemnité reçue": {
    en: "Transfer #{numero} — fee received",
    nl: "Transfer #{numero} — vergoeding ontvangen",
  },
  "Transfert #{numero} — {raison}": {
    en: "Transfer #{numero} — {raison}",
    nl: "Transfer #{numero} — {raison}",
  },
  "Prime de signature": {
    en: "Signing bonus",
    nl: "Tekenpremie",
  },
  "refusé par le joueur": {
    en: "declined by the player",
    nl: "geweigerd door de speler",
  },
  "offre expirée": {
    en: "offer expired",
    nl: "bod verlopen",
  },

  // --- Clubs : caisse --------------------------------------------------------------------------
  "Contribution à la trésorerie {club}": {
    en: "Contribution to the {club} treasury",
    nl: "Bijdrage aan de kas van {club}",
  },
  "Contribution d'un membre": {
    en: "Member contribution",
    nl: "Bijdrage van een lid",
  },
  "Reversement à {nom}": {
    en: "Paid out to {nom}",
    nl: "Uitbetaald aan {nom}",
  },
  "un membre": {
    en: "a member",
    nl: "een lid",
  },
  "Reversement de la caisse {club}": {
    en: "Payout from the {club} treasury",
    nl: "Uitbetaling uit de kas van {club}",
  },
  "Caisse rendue au fondateur — {club} dissous": {
    en: "Treasury returned to the founder — {club} disbanded",
    nl: "Kas teruggegeven aan de stichter — {club} opgeheven",
  },
  "Caisse du club {club}, dissous": {
    en: "Treasury of the club {club}, disbanded",
    nl: "Kas van de club {club}, opgeheven",
  },
  "club dissous": {
    en: "club disbanded",
    nl: "club opgeheven",
  },

  // --- Tournois ----------------------------------------------------------------------------------
  "Engagement — {tournoi}": {
    en: "Entry — {tournoi}",
    nl: "Inschrijving — {tournoi}",
  },
  "Engagement rendu — {tournoi}": {
    en: "Entry refunded — {tournoi}",
    nl: "Inschrijving terugbetaald — {tournoi}",
  },
  "Engagement rendu — {tournoi} annulé": {
    en: "Entry refunded — {tournoi} cancelled",
    nl: "Inschrijving terugbetaald — {tournoi} geannuleerd",
  },
  "Engagement rendu — {tournoi} (club dissous)": {
    en: "Entry refunded — {tournoi} (club disbanded)",
    nl: "Inschrijving terugbetaald — {tournoi} (club opgeheven)",
  },
};
