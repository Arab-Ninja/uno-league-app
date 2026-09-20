import type { Dictionnaire } from "./fr.js";

/**
 * Le néerlandais (I18N-001).
 *
 * Le type vient du français : une clé oubliée ou inventée ne compile pas.
 * Traduction de premier jet — le néerlandais de Bruxelles a des tournures
 * qu'un relecteur natif rattrapera mieux que ce fichier.
 */
export const nl: Dictionnaire = {
  nav: {
    home: "Start",
    calendar: "Kalender",
    club: "Club",
    ranking: "Klassement",
    points: "Punten",
    profile: "Profiel",
  },
  home: {
    greeting: "Hallo",
    upcoming: "Volgende sessies",
    seeAll: "Alles bekijken",
    announcements: "Mededelingen",
    noneYetLead: "Je hebt nog geen sessie. Deze zoeken spelers —",
    noneYetPayment: "je plaats betaal je met kaart of met punten",
    noneYetEarn: ", en punten verdien je door te spelen.",
    nothingOpenTitle: "Geen open sessie",
    nothingOpenBody:
      "Er is momenteel geen plaats vrij. Start een voorstel via de kalender.",
  },
  wallet: {
    title: "Portefeuille",
    balance: "Beschikbaar saldo",
    send: "Versturen",
    shop: "Winkel",
    recent: "Recente transacties",
    fullHistory: "Volledige historiek",
    emptyTitle: "Geen transactie",
    emptyBody: "Je puntenbewegingen verschijnen hier.",
    rate: "Tarief: {rate} UNO = € 1,00. Punten zijn niet te koop.",
    zeroTitle: "Je hebt nog geen punten",
    zeroBody:
      "UNO-punten zijn niet te koop: je verdient ze door te spelen, en meer nog wie scoort, assists geeft of verdedigt. Betaal je plaats voor je eerste sessie met kaart of Bancontact — betalen met punten is gewoon een andere manier.",
    zeroAction: "Bekijk open sessies",
  },
  modes: {
    title: "Spelmodi",
    players: "Spelers",
    duration: "Duur",
    price: "Prijs",
    free: "Gratis",
    soon: "Binnenkort",
  },
  calendar: {
    title: "Kalender",
    all: "Alle",
    proposals: "Voorstellen",
    reservations: "Reservaties",
    sessions: "Sessies",
    allVenues: "Alle locaties",
    allModes: "Alle modi",
    monthSessions: "Sessies deze maand",
  },
  settings: {
    language: "Taal",
    languageHelp: "De app en je e-mails volgen deze taal, op al je toestellen.",
  },
};
