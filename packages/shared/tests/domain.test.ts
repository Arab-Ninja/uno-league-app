import { describe, expect, it } from "vitest";
import {
  CARD_STAT_SLOTS,
  DEFAULT_POSITION,
  PLAYER_POSITIONS,
  POSITION_LABELS,
  RATING_MAX,
  RATING_MIN,
  RATING_MOVE_MAX,
  SESSION_MOVEMENT_COUNT,
  addDaysIso,
  buildLeaderboard,
  canTransition,
  cardTier,
  checkPassword,
  compareForRanking,
  diffDaysIso,
  draftTeams,
  eurToUno,
  formatEur,
  generateSlots,
  nextRating,
  ratingMovement,
  getGameMode,
  movementCountFor,
  nextPairing,
  isValidSlotStart,
  levelFromXp,
  normalizeEmail,
  overallRating,
  PROPOSAL_TRANSITIONS,
  rankingScore,
  requireSchedulableMode,
  rewardAmount,
  teamRating,
  unoToEur,
  utcToZonedParts,
  zonedTimeToUtc,
  type RankablePlayer,
} from "../src/index.js";

const friendly = requireSchedulableMode("friendly");
const league = requireSchedulableMode("league");

describe("créneaux horaires (CAL-004)", () => {
  it("génère 10 créneaux d'une heure pour un match amical", () => {
    const slots = generateSlots(friendly);
    expect(slots).toHaveLength(10);
    expect(slots[0]?.label).toBe("14:00 - 15:00");
    expect(slots.at(-1)?.label).toBe("23:00 - 00:00");
  });

  it("génère 5 créneaux de deux heures pour UNO League", () => {
    const slots = generateSlots(league);
    expect(slots.map((s) => s.label)).toEqual([
      "14:00 - 16:00",
      "16:00 - 18:00",
      "18:00 - 20:00",
      "20:00 - 22:00",
      "22:00 - 00:00",
    ]);
  });

  it("ne dépasse jamais minuit et ne chevauche aucun autre créneau", () => {
    for (const mode of [friendly, league]) {
      const slots = generateSlots(mode);
      for (const [index, slot] of slots.entries()) {
        expect(slot.endHour).toBeLessThanOrEqual(24);
        const previous = slots[index - 1];
        if (previous) expect(slot.startHour).toBe(previous.endHour);
      }
    }
  });

  it("rejette une heure de début qui n'est pas un début de créneau", () => {
    expect(isValidSlotStart(league, 15)).toBe(false);
    expect(isValidSlotStart(league, 16)).toBe(true);
    expect(isValidSlotStart(friendly, 15)).toBe(true);
    expect(isValidSlotStart(friendly, 13)).toBe(false);
  });
});

describe("conversions UNO / EUR (INFO-001, HOME-002)", () => {
  it("applique le ratio officiel 10 UNO = 1 EUR", () => {
    expect(eurToUno(10)).toBe(100);
    expect(eurToUno(20)).toBe(200);
    expect(unoToEur(1000)).toBe(100);
  });

  it("affiche 1000 UNO comme 100,00 €", () => {
    expect(formatEur(1000).replace(/ | /g, " ")).toBe("100,00 €");
  });

  it("dérive les prix de participation des modes", () => {
    expect(eurToUno(friendly.priceEur)).toBe(100);
    expect(eurToUno(league.priceEur)).toBe(200);
  });
});

describe("politique de mot de passe (AUTH-002)", () => {
  it("accepte un mot de passe conforme", () => {
    expect(checkPassword("Password1").valid).toBe(true);
  });

  it("refuse un mot de passe sans majuscule, sans chiffre ou trop court", () => {
    expect(checkPassword("password1").valid).toBe(false);
    expect(checkPassword("Password").valid).toBe(false);
    expect(checkPassword("Pass1").valid).toBe(false);
  });

  it("normalise les emails (AUTH-003)", () => {
    expect(normalizeEmail("  Joueur@Example.COM ")).toBe("joueur@example.com");
  });
});

describe("fuseaux horaires (TECH-002)", () => {
  it("convertit 18:00 Europe/Brussels en UTC pendant l'heure d'été", () => {
    const utc = zonedTimeToUtc("2026-07-15", 18, "Europe/Brussels");
    expect(utc.toISOString()).toBe("2026-07-15T16:00:00.000Z");
  });

  it("convertit 18:00 Europe/Brussels en UTC pendant l'heure d'hiver", () => {
    const utc = zonedTimeToUtc("2026-01-15", 18, "Europe/Brussels");
    expect(utc.toISOString()).toBe("2026-01-15T17:00:00.000Z");
  });

  it("revient à l'heure murale d'origine", () => {
    const utc = zonedTimeToUtc("2026-10-25", 22, "Europe/Brussels");
    const parts = utcToZonedParts(utc, "Europe/Brussels");
    expect(parts).toEqual({ isoDate: "2026-10-25", hour: 22, minute: 0 });
  });

  it("calcule les écarts en jours calendaires (CAL-003)", () => {
    expect(addDaysIso("2026-02-27", 2)).toBe("2026-03-01");
    expect(diffDaysIso("2026-09-06", "2026-09-08")).toBe(2);
  });
});

describe("récompenses (CDC §8.2)", () => {
  it("applique le barème officiel par division", () => {
    expect(rewardAmount("topScorer", "D1")).toBe(250);
    expect(rewardAmount("topScorer", "D3")).toBe(150);
    expect(rewardAmount("topAssist", "D2")).toBe(100);
    expect(rewardAmount("participation", "D1")).toBe(10);
    expect(rewardAmount("bestTeam", "D3")).toBe(20);
  });
});

describe("progression XP", () => {
  it("commence au niveau 1 et progresse par paliers", () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(499)).toBe(1);
    expect(levelFromXp(500)).toBe(2);
    expect(levelFromXp(1250)).toBe(3);
  });
});

describe("classement (RANK-002, RANK-003)", () => {
  const players: RankablePlayer[] = [
    { id: 3, displayName: "Chloé", goals: 10, assists: 2, defenses: 0, saves: 0, motm: 0 },
    { id: 1, displayName: "Alice", goals: 10, assists: 5, defenses: 0, saves: 0, motm: 0 },
    { id: 2, displayName: "Bob", goals: 12, assists: 0, defenses: 0, saves: 0, motm: 0 },
  ];

  it("trie strictement par la statistique sélectionnée", () => {
    const board = buildLeaderboard(players, "goals");
    expect(board.map((e) => e.player.displayName)).toEqual([
      "Bob",
      "Alice",
      "Chloé",
    ]);
  });

  it("départage les ex aequo par le score de classement", () => {
    // Alice et Chloé ont 10 buts ; Alice a plus de passes, donc un meilleur score.
    expect(rankingScore(players[1]!)).toBeGreaterThan(rankingScore(players[0]!));
    const board = buildLeaderboard(players, "goals");
    expect(board[1]?.player.displayName).toBe("Alice");
  });

  it("est stable d'un rafraîchissement à l'autre pour deux joueurs identiques", () => {
    const twins: RankablePlayer[] = [
      { id: 7, displayName: "Zoé", goals: 5, assists: 1, defenses: 0, saves: 0, motm: 0 },
      { id: 4, displayName: "Zoé", goals: 5, assists: 1, defenses: 0, saves: 0, motm: 0 },
    ];
    const first = buildLeaderboard(twins, "goals").map((e) => e.player.id);
    const second = buildLeaderboard([...twins].reverse(), "goals").map(
      (e) => e.player.id,
    );
    expect(first).toEqual(second);
    expect(first).toEqual([4, 7]);
  });

  it("attribue la même position à deux joueurs strictement ex aequo", () => {
    const tied: RankablePlayer[] = [
      { id: 1, displayName: "A", goals: 5, assists: 0, defenses: 0, saves: 0, motm: 0 },
      { id: 2, displayName: "B", goals: 5, assists: 0, defenses: 0, saves: 0, motm: 0 },
      { id: 3, displayName: "C", goals: 1, assists: 0, defenses: 0, saves: 0, motm: 0 },
    ];
    const board = buildLeaderboard(tied, "goals");
    expect(board.map((e) => e.position)).toEqual([1, 1, 3]);
  });

  it("expose un comparateur total", () => {
    expect(compareForRanking("goals", players[2]!, players[1]!)).toBeLessThan(0);
  });
});

describe("tirage des équipes (MATCH-001)", () => {
  const participants = Array.from({ length: 15 }, (_, i) => ({
    id: i + 1,
    rating: (i * 7) % 23,
  }));

  it("forme 3 équipes de 5 pour 15 participants", () => {
    const { teams, unassigned } = draftTeams(participants, 3, 42);
    expect(teams).toHaveLength(3);
    for (const team of teams) expect(team).toHaveLength(5);
    expect(unassigned).toHaveLength(0);
  });

  it("n'oublie ni ne duplique aucun joueur", () => {
    const { teams } = draftTeams(participants, 3, 42);
    const ids = teams.flat().map((p) => p.id).sort((a, b) => a - b);
    expect(ids).toEqual(participants.map((p) => p.id));
    expect(new Set(ids).size).toBe(15);
  });

  it("équilibre les niveaux entre équipes", () => {
    const { teams } = draftTeams(participants, 3, 42);
    const ratings = teams.map(teamRating);
    expect(Math.max(...ratings) - Math.min(...ratings)).toBeLessThanOrEqual(12);
  });

  it("est reproductible pour une même graine et varie avec la graine", () => {
    const a = draftTeams(participants, 3, 42).teams.map((t) => t.map((p) => p.id));
    const b = draftTeams(participants, 3, 42).teams.map((t) => t.map((p) => p.id));
    const c = draftTeams(participants, 3, 99).teams.map((t) => t.map((p) => p.id));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("forme 2 équipes de 5 pour un match amical à 10", () => {
    const ten = participants.slice(0, 10);
    const { teams, unassigned } = draftTeams(ten, 2, 7);
    expect(teams.map((t) => t.length)).toEqual([5, 5]);
    expect(unassigned).toHaveLength(0);
  });
});

describe("machines à états (CDC §19)", () => {
  it("autorise proposition -> réservation -> session -> terminée", () => {
    expect(canTransition(PROPOSAL_TRANSITIONS, "proposal", "reservation")).toBe(true);
    expect(canTransition(PROPOSAL_TRANSITIONS, "reservation", "session")).toBe(true);
    expect(canTransition(PROPOSAL_TRANSITIONS, "session", "completed")).toBe(true);
  });

  it("interdit les sauts d'état", () => {
    expect(canTransition(PROPOSAL_TRANSITIONS, "proposal", "session")).toBe(false);
    expect(canTransition(PROPOSAL_TRANSITIONS, "completed", "proposal")).toBe(false);
  });
});

describe("modes de jeu (MODE-001)", () => {
  it("expose cinq modes dont deux planifiables", () => {
    expect(getGameMode("minigames")?.schedulable).toBe(false);
    expect(getGameMode("league")?.schedulable).toBe(true);
    expect(() => requireSchedulableMode("tournaments")).toThrow();
  });

  it("porte les paramètres du cahier des charges", () => {
    expect(league.minParticipants).toBe(15);
    expect(league.durationHours).toBe(2);
    expect(league.divisionLocked).toBe(true);
    expect(league.ranked).toBe(true);
    expect(friendly.minParticipants).toBe(10);
    expect(friendly.durationHours).toBe(1);
    expect(friendly.divisionLocked).toBe(false);
    expect(friendly.ranked).toBe(false);
  });
});

describe("carte joueur", () => {
  const vide = {
    id: 1,
    displayName: "Nouveau",
    goals: 0,
    assists: 0,
    defenses: 0,
    saves: 0,
    motm: 0,
  };

  it("un joueur sans statistique affiche la note plancher", () => {
    expect(overallRating(vide)).toBe(RATING_MIN);
  });

  it("la note ne dépasse jamais le plafond, même pour des chiffres extrêmes", () => {
    const monstre = {
      id: 2,
      displayName: "Extrême",
      goals: 10_000,
      assists: 10_000,
      defenses: 10_000,
      saves: 10_000,
      motm: 10_000,
    };
    expect(overallRating(monstre)).toBeLessThanOrEqual(RATING_MAX);
    expect(overallRating(monstre)).toBe(RATING_MAX);
  });

  it("la note croît avec les performances", () => {
    const faible = { ...vide, id: 3, goals: 2 };
    const moyen = { ...vide, id: 4, goals: 20 };
    const fort = { ...vide, id: 5, goals: 60, assists: 30, motm: 8 };

    expect(overallRating(vide)).toBeLessThan(overallRating(faible));
    expect(overallRating(faible)).toBeLessThan(overallRating(moyen));
    expect(overallRating(moyen)).toBeLessThan(overallRating(fort));
  });

  it("reste dans les bornes sur toute la plage de statistiques plausibles", () => {
    for (let goals = 0; goals <= 500; goals += 7) {
      const note = overallRating({ ...vide, goals });
      expect(note).toBeGreaterThanOrEqual(RATING_MIN);
      expect(note).toBeLessThanOrEqual(RATING_MAX);
      expect(Number.isInteger(note)).toBe(true);
    }
  });

  it("l'aspect de la carte suit la division", () => {
    expect(cardTier("D1")).toBe("gold");
    expect(cardTier("D2")).toBe("silver");
    expect(cardTier("D3")).toBe("bronze");
  });

  it("expose six emplacements de statistiques, tous alimentés par des données réelles", () => {
    expect(CARD_STAT_SLOTS).toHaveLength(6);
    expect(CARD_STAT_SLOTS.map((slot) => slot.label)).toEqual([
      "BUT",
      "PAS",
      "DÉF",
      "ARR",
      "MOT",
      "MAT",
    ]);
  });

  it("propose un poste par défaut valide", () => {
    expect(PLAYER_POSITIONS).toContain(DEFAULT_POSITION);
    for (const position of PLAYER_POSITIONS) {
      expect(POSITION_LABELS[position]).toBeTruthy();
    }
  });
});

describe("enchaînement des matchs UNO League (MATCH-001)", () => {
  const [A, B, C] = [10, 20, 30];

  it("le premier match oppose les deux premières équipes", () => {
    expect(nextPairing([A, B, C], null)).toEqual({ teamAId: A, teamBId: B });
  });

  it("le vainqueur reste sur le terrain, l'équipe au repos entre", () => {
    // A bat B : A reste, C — qui n'a pas joué — entre.
    expect(
      nextPairing([A, B, C], { teamAId: A, teamBId: B, scoreA: 3, scoreB: 1 }),
    ).toEqual({ teamAId: A, teamBId: C });

    // B bat A : c'est B qui reste.
    expect(
      nextPairing([A, B, C], { teamAId: A, teamBId: B, scoreA: 1, scoreB: 3 }),
    ).toEqual({ teamAId: B, teamBId: C });
  });

  it("en cas de match nul, c'est l'équipe entrante qui reste", () => {
    // Dans A contre B, l'entrante est B — la seconde du couple, par
    // construction de l'enchaînement.
    expect(
      nextPairing([A, B, C], { teamAId: A, teamBId: B, scoreA: 2, scoreB: 2 }),
    ).toEqual({ teamAId: B, teamBId: C });
  });

  it("à deux équipes, elles se réaffrontent", () => {
    expect(
      nextPairing([A, B], { teamAId: A, teamBId: B, scoreA: 4, scoreB: 0 }),
    ).toEqual({ teamAId: A, teamBId: B });
  });

  it("sans deux équipes, il n'y a pas de match à composer", () => {
    expect(nextPairing([A], null)).toBeNull();
    expect(nextPairing([], null)).toBeNull();
  });
});

describe("mouvements de division (RANK-005)", () => {
  it("une session complète fait bouger cinq joueurs de chaque côté", () => {
    expect(movementCountFor(15)).toBe(SESSION_MOVEMENT_COUNT);
  });

  it("une session incomplète conserve le tiers, pas le chiffre absolu", () => {
    // Appliquer « cinq et cinq » à huit joueurs ferait bouger tout le monde.
    expect(movementCountFor(8)).toBe(2);
    expect(movementCountFor(6)).toBe(2);
    expect(movementCountFor(2)).toBe(0);
    expect(movementCountFor(0)).toBe(0);
  });
});

describe("carte de l'arbitre (ROLE-003)", () => {
  it("l'arbitre a sa propre couleur, hors hiérarchie des divisions", () => {
    expect(cardTier("D1", "referee")).toBe("referee");
    expect(cardTier("D3", "referee")).toBe("referee");
  });

  it("un joueur garde la couleur de sa division", () => {
    expect(cardTier("D1", "player")).toBe("gold");
    expect(cardTier("D2")).toBe("silver");
    expect(cardTier("D3")).toBe("bronze");
  });
});


describe("note de carte, à la hausse comme à la baisse (CARD-002)", () => {
  it("monte quand la session est meilleure que la précédente", () => {
    expect(ratingMovement(12, 8)).toBeGreaterThan(0);
    expect(nextRating(70, 12, 8)).toBeGreaterThan(70);
  });

  it("descend quand elle est moins bonne", () => {
    expect(ratingMovement(4, 9)).toBeLessThan(0);
    expect(nextRating(70, 4, 9)).toBeLessThan(70);
  });

  it("ne bouge pas à performance égale, ni sans session précédente", () => {
    expect(ratingMovement(7.5, 7.5)).toBe(0);
    // Une première session classée n'a rien à quoi se comparer : elle sert
    // de référence à la suivante.
    expect(ratingMovement(20, null)).toBe(0);
    expect(nextRating(64, 20, null)).toBe(64);
  });

  it("le plus petit progrès déplace la note d'un point", () => {
    // La règle est « plus ou moins », pas « beaucoup plus ou beaucoup moins » :
    // un demi-point d'écart ne doit pas s'arrondir à l'immobilité.
    expect(ratingMovement(8, 7.5)).toBe(1);
    expect(ratingMovement(7.5, 8)).toBe(-1);
  });

  it("l'amplitude suit l'écart, mais reste plafonnée", () => {
    const small = ratingMovement(9, 8);
    const large = ratingMovement(40, 8);
    expect(large).toBeGreaterThan(small);
    expect(large).toBeLessThanOrEqual(RATING_MOVE_MAX);
    expect(ratingMovement(8, 40)).toBeGreaterThanOrEqual(-RATING_MOVE_MAX);
  });

  it("reste dans les bornes de la carte", () => {
    // Une carte au plafond qui progresse encore y reste ; une carte au
    // plancher ne s'effondre pas davantage.
    expect(nextRating(RATING_MAX, 50, 10)).toBe(RATING_MAX);
    expect(nextRating(RATING_MIN, 1, 30)).toBe(RATING_MIN);
  });

  it("une série de bonnes puis de mauvaises séances fait l'aller-retour", () => {
    // C'est tout l'objet du changement : l'ancienne note, dérivée d'un total
    // de carrière, ne pouvait pas redescendre.
    let rating = 70;
    for (const [points, previous] of [[10, 6], [14, 10], [18, 14]] as const) {
      rating = nextRating(rating, points, previous);
    }
    const peak = rating;
    expect(peak).toBeGreaterThan(70);

    for (const [points, previous] of [[12, 18], [8, 12], [3, 8]] as const) {
      rating = nextRating(rating, points, previous);
    }
    expect(rating).toBeLessThan(peak);
  });
});
