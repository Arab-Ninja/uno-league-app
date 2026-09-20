/**
 * Le dictionnaire de référence (I18N-001).
 *
 * **Le français définit la forme.** `Dictionnaire` en est tiré, et les deux
 * autres langues doivent s'y conformer : TypeScript refuse une clé oubliée ou
 * inventée. C'est ce qui empêche l'anglais et le néerlandais de pourrir en
 * silence au fil des écrans ajoutés.
 *
 * Les jetons `{nom}` sont remplacés à l'affichage. On les nomme plutôt que de
 * les numéroter : l'ordre des mots change d'une langue à l'autre, `{count}` ne
 * bouge pas.
 */
export const fr = {
  nav: {
    home: "Accueil",
    calendar: "Calendrier",
    club: "Club",
    ranking: "Classement",
    points: "Points",
    profile: "Profil",
  },
  home: {
    greeting: "Bonjour",
    upcoming: "Prochaines séances",
    seeAll: "Tout voir",
    announcements: "Annonces",
    noneYetLead:
      "Vous n'avez pas encore de séance. En voici qui cherchent des joueurs —",
    noneYetPayment: "votre place se paie par carte ou en points",
    noneYetEarn: ", les points se gagnent en jouant.",
    nothingOpenTitle: "Aucune séance ouverte",
    nothingOpenBody:
      "Aucune place à prendre pour l'instant. Créez une proposition depuis le calendrier.",
  },
  wallet: {
    title: "Portefeuille",
    balance: "Solde disponible",
    send: "Envoyer",
    shop: "Boutique",
    recent: "Dernières transactions",
    fullHistory: "Tout l'historique",
    emptyTitle: "Aucune transaction",
    emptyBody: "Vos mouvements de points apparaîtront ici.",
    rate: "Barème : {rate} UNO = 1,00 €. Les points ne s'achètent pas.",
    zeroTitle: "Vous n'avez pas encore de points",
    zeroBody:
      "Les points UNO ne s'achètent pas : ils se gagnent en jouant, et davantage à qui marque, passe ou défend. Pour votre première séance, réglez votre place par carte ou Bancontact — le paiement en points n'est qu'une autre façon de faire.",
    zeroAction: "Voir les séances ouvertes",
  },
  modes: {
    title: "Modes de jeu",
    players: "Joueurs",
    duration: "Durée",
    price: "Prix",
    free: "Gratuit",
    soon: "Bientôt disponible",
  },
  calendar: {
    title: "Calendrier",
    all: "Toutes",
    proposals: "Propositions",
    reservations: "Réservations",
    sessions: "Sessions",
    allVenues: "Tous les lieux",
    allModes: "Tous les modes",
    monthSessions: "Sessions du mois",
  },
  settings: {
    language: "Langue",
    languageHelp:
      "L'application et vos courriels suivront cette langue, sur tous vos appareils.",
  },
};

/**
 * La **forme** du dictionnaire, pas ses mots.
 *
 * Sans `as const`, chaque valeur est un `string` : les deux autres langues
 * doivent fournir les mêmes clés, avec le texte qu'elles veulent. Avec
 * `as const`, le type exigerait « Accueil » en anglais aussi — ce qui a été
 * essayé, et ne compile évidemment pas.
 */
export type Dictionnaire = typeof fr;
