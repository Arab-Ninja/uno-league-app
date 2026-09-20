import type { Dictionnaire } from "./fr.js";

/**
 * L'anglais (I18N-001).
 *
 * Le type vient du français : une clé oubliée ou inventée ne compile pas.
 * Traduction de premier jet, à relire par quelqu'un dont c'est la langue.
 */
export const en: Dictionnaire = {
  nav: {
    home: "Home",
    calendar: "Calendar",
    club: "Club",
    ranking: "Ranking",
    points: "Points",
    profile: "Profile",
  },
  home: {
    greeting: "Hello",
    upcoming: "Upcoming sessions",
    seeAll: "See all",
    announcements: "Announcements",
    noneYetLead: "You have no session yet. These are looking for players —",
    noneYetPayment: "your place is paid by card or in points",
    noneYetEarn: ", and points are earned by playing.",
    nothingOpenTitle: "No open session",
    nothingOpenBody:
      "No place to take right now. Start a proposal from the calendar.",
  },
  wallet: {
    title: "Wallet",
    balance: "Available balance",
    send: "Send",
    shop: "Shop",
    recent: "Recent transactions",
    fullHistory: "Full history",
    emptyTitle: "No transaction",
    emptyBody: "Your point movements will show up here.",
    rate: "Rate: {rate} UNO = €1.00. Points cannot be bought.",
    zeroTitle: "You have no points yet",
    zeroBody:
      "UNO points cannot be bought: they are earned by playing, and more so by whoever scores, assists or defends. For your first session, pay your place by card or Bancontact — paying in points is just another way.",
    zeroAction: "See open sessions",
  },
  modes: {
    title: "Game modes",
    players: "Players",
    duration: "Duration",
    price: "Price",
    free: "Free",
    soon: "Coming soon",
  },
  calendar: {
    title: "Calendar",
    all: "All",
    proposals: "Proposals",
    reservations: "Reservations",
    sessions: "Sessions",
    allVenues: "All venues",
    allModes: "All modes",
    monthSessions: "Sessions this month",
  },
  settings: {
    language: "Language",
    languageHelp:
      "The app and your emails will follow this language, on every device.",
  },
};
