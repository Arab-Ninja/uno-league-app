/**
 * La séance montrée : le match amical du vendredi 20 novembre 2026, relevé
 * sur la page « Détail de la session » de l'application (captures et
 * enregistrement d'écran fournis par l'administration).
 *
 * Pas de visages, et des noms abrégés (prénom et initiale) : la vidéo est
 * publique, et les conditions d'utilisation ne prévoient pas d'usage
 * promotionnel des photos ni des noms complets des joueurs.
 */
window.SEANCE = {
  mode: "Match amical",
  date: "Vendredi 20 Novembre",
  heure: "20:00 - 21:00",
  debut: "20:00",
  fin: "21:00",
  salle: "Fit Five Forest",
  division: "Toutes divisions",
  description:
    "Un match pour le plaisir, ouvert à toutes les divisions. On choisit son camp en s'inscrivant ; rien ne compte au classement, seule l'expérience est acquise.",
  prixUno: 100,
  prixEur: "10,00 €",
  places: 10,

  equipes: {
    bleue: { nom: "Equipe Bleue", score: 9 },
    noire: { nom: "Equipe Noire", score: 15 },
  },

  /** Les cartes du podium : toutes en bronze, note 50, milieu, D3. */
  carte: { note: 50, poste: "MIL", division: "D3", pays: "BE", stats: [0, 0, 0, 0, 0, 1] },
  joueurs: {
    theo: { nom: "Theo G.", carte: "THEO", initiales: "TG" },
    mehdi: { nom: "Mehdi H.", carte: "MEHDI", initiales: "MH" },
    najib: { nom: "Najib M.", carte: "NAJIB", initiales: "NM" },
    karim: { nom: "Karim B.", carte: "KARIM", initiales: "KB" },
    mohamed: { nom: "Mohamed T.", carte: "MOHAMED", initiales: "MT" },
    yousri: { nom: "Yousri E.", carte: "YOUSRI", initiales: "YE" },
    nadyr: { nom: "Nadyr M.", carte: "NADYR", initiales: "NM" },
    anthony: { nom: "Anthony", carte: "ANTHONY", initiales: "A" },
    damir: { nom: "Damir N.", carte: "DAMIR", initiales: "DN" },
    yassine: { nom: "Yassine N.", carte: "YASSINE", initiales: "YN" },
  },

  podium: [
    { prix: "Meilleur buteur", joueur: "theo", valeur: 5 },
    { prix: "Meilleur passeur", joueur: "mohamed", valeur: 5 },
    { prix: "Meilleur défenseur", joueur: "theo", valeur: 15 },
  ],
  hommeDuMatch: { prix: "Homme du match", joueur: "theo", valeur: 17 },

  /** Feuille de match : buts, passes, défenses, arrêts, points. */
  feuille: [
    ["theo", 5, 2, 13, 2, "17"],
    ["mehdi", 4, 2, 12, 2, "15"],
    ["najib", 3, 3, 6, 4, "12,5"],
    ["karim", 3, 1, 7, 5, "11,5"],
    ["mohamed", 0, 5, 11, 2, "11,5"],
    ["yousri", 3, 0, 8, 5, "11"],
    ["nadyr", 1, 2, 12, 1, "10"],
    ["anthony", 2, 1, 7, 4, "9,5"],
    ["damir", 2, 1, 7, 4, "9,5"],
    ["yassine", 1, 0, 4, 3, "5"],
  ],

  /** Moments-clés du match complet, tels que l'app les liste. */
  moments: {
    tous: [
      { minute: 0, type: "kickoff", titre: "Coup d'envoi · match 1", detail: "Equipe Bleue contre Equipe Noire" },
      { minute: 0, type: "goal", titre: "But de Mehdi H.", detail: "Equipe Noire · 0-1 · passe de Najib M." },
      { minute: 0, type: "assist", titre: "Passe décisive de Najib M.", detail: "pour Mehdi H. · Equipe Noire · 0-1" },
      { minute: 1, type: "defense", titre: "Défense de Theo", detail: "Equipe Noire" },
      { minute: 1, type: "defense", titre: "Défense de Yousri E.", detail: "Equipe Bleue" },
      { minute: 1, type: "save", titre: "Arrêt de Karim B.", detail: "Equipe Bleue" },
    ],
    buts: [
      { minute: 0, type: "goal", titre: "But de Mehdi H.", detail: "Equipe Noire · 0-1 · passe de Najib M." },
      { minute: 3, type: "goal", titre: "But de Najib M.", detail: "Equipe Noire · 0-2 · passe de Nadyr M." },
      { minute: 5, type: "goal", titre: "But de Damir N.", detail: "Equipe Bleue · 1-2 · passe de Mohamed T." },
      { minute: 28, type: "goal", titre: "But de Theo", detail: "Equipe Noire · 4-8" },
      { minute: 28, type: "goal", titre: "But de Najib M.", detail: "Equipe Noire · 4-9 · passe de Theo" },
      { minute: 30, type: "goal", titre: "But de Najib M.", detail: "Equipe Noire · 4-10 · passe de Nadyr M." },
    ],
  },

  /** L'Équipe Bleue sur le terrain, relevée dans l'app. */
  terrain: {
    attaque: ["mohamed"],
    ailes: ["yousri", "karim", "damir"],
    gardien: ["yassine"],
  },

  /**
   * Le calendrier de la semaine, tel qu'un joueur le voit avant le match.
   * La séance UNO League du dimanche est un EXEMPLE, pour montrer l'autre
   * mode : à remplacer par une vraie séance si on en publie une.
   */
  calendrier: {
    mois: "Novembre 2026",
    aujourdhui: 17,
    jours: [
      ["LUN", 16, 0], ["MAR", 17, 0], ["MER", 18, 0], ["JEU", 19, 0],
      ["VEN", 20, 1], ["SAM", 21, 0], ["DIM", 22, 1],
    ],
    seances: [
      { jour: "vendredi 20 novembre", court: "VEN 20", mode: "Match amical", ton: "amical", debut: "20:00", fin: "21:00", salle: "Fit Five Forest", division: null, inscrits: 9, places: 10, uno: 100 },
      { jour: "dimanche 22 novembre", court: "DIM 22", mode: "UNO League", ton: "league", debut: "14:00", fin: "16:00", salle: "Fit Five Forest", division: "D2", inscrits: 11, places: 15, uno: 200 },
    ],
  },

  /**
   * La vraie vidéo du match : un extrait de 24 s recadré sur le lecteur de
   * l'app, en images numérotées (30 par seconde) dans `rendu/match/`.
   */
  video: { dossier: "rendu/match", images: 720, cadence: 30 },
};
