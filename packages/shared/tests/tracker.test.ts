import { describe, expect, it } from "vitest";
import {
  TRACKER_MATCH_DURATION_MS,
  aggregateMatch,
  aggregateSession,
  checkMatch,
  formatMatchClock,
  goalkeeperAt,
  matchClockFromVideo,
  trackerAction,
  trackerPoints,
  type TrackerEvent,
} from "@uno/shared";

/**
 * Saisie en visionnage : le domaine qui déduit la feuille des actions.
 *
 * Ce que ces tests protègent, c'est la promesse centrale du tracker : le
 * score, les passes décisives et les buts encaissés ne se saisissent pas, ils
 * se déduisent. Une régression ici ne se verrait pas à l'écran — elle
 * produirait un classement faux.
 */

const MATCH = { id: 1, teamAId: 10, teamBId: 20 };

let sequence = 0;
function event(partial: Partial<TrackerEvent> & Pick<TrackerEvent, "type">): TrackerEvent {
  sequence += 1;
  return {
    clientId: `evt-${String(sequence).padStart(4, "0")}`,
    matchId: MATCH.id,
    participantId: 1,
    assistParticipantId: null,
    teamId: MATCH.teamAId,
    clockMs: 0,
    videoMs: null,
    ...partial,
  };
}

describe("agrégation d'un match", () => {
  it("déduit le score des buts saisis", () => {
    const events = [
      event({ type: "goal", participantId: 1, teamId: 10, clockMs: 30_000 }),
      event({ type: "goal", participantId: 2, teamId: 10, clockMs: 90_000 }),
      event({ type: "goal", participantId: 7, teamId: 20, clockMs: 120_000 }),
    ];

    const result = aggregateMatch(MATCH, events);

    expect(result.scoreA).toBe(2);
    expect(result.scoreB).toBe(1);
  });

  it("crédite le passeur sans qu'une action séparée soit saisie", () => {
    const events = [
      event({
        type: "goal",
        participantId: 1,
        assistParticipantId: 3,
        teamId: 10,
        clockMs: 10_000,
      }),
    ];

    const result = aggregateMatch(MATCH, events);
    const scorer = result.participants.find((line) => line.participantId === 1);
    const passer = result.participants.find((line) => line.participantId === 3);

    expect(scorer?.goals).toBe(1);
    expect(scorer?.assists).toBe(0);
    expect(passer?.assists).toBe(1);
    expect(passer?.goals).toBe(0);
  });

  it("attribue le but encaissé au gardien en poste à cet instant", () => {
    const events = [
      // Gardien initial de l'équipe B, remplacé à la sixième minute.
      event({ type: "gk_in", participantId: 6, teamId: 20, clockMs: 0 }),
      event({ type: "goal", participantId: 1, teamId: 10, clockMs: 120_000 }),
      event({ type: "gk_in", participantId: 9, teamId: 20, clockMs: 360_000 }),
      event({ type: "goal", participantId: 2, teamId: 10, clockMs: 400_000 }),
      event({ type: "goal", participantId: 2, teamId: 10, clockMs: 500_000 }),
    ];

    const result = aggregateMatch(MATCH, events);
    const first = result.participants.find((line) => line.participantId === 6);
    const second = result.participants.find((line) => line.participantId === 9);

    expect(first?.concededGoals).toBe(1);
    expect(second?.concededGoals).toBe(2);
  });

  it("compte le temps passé au but, relais final inclus", () => {
    const events = [
      event({ type: "gk_in", participantId: 6, teamId: 20, clockMs: 0 }),
      event({ type: "gk_in", participantId: 9, teamId: 20, clockMs: 240_000 }),
    ];

    const result = aggregateMatch(MATCH, events);
    const first = result.participants.find((line) => line.participantId === 6);
    const second = result.participants.find((line) => line.participantId === 9);

    expect(first?.goalkeepingMs).toBe(240_000);
    expect(second?.goalkeepingMs).toBe(TRACKER_MATCH_DURATION_MS - 240_000);
  });

  it("compte le contre son camp pour l'adversaire, sans point retiré", () => {
    const events = [
      event({ type: "gk_in", participantId: 6, teamId: 10, clockMs: 0 }),
      event({ type: "own_goal", participantId: 4, teamId: 10, clockMs: 200_000 }),
    ];

    const result = aggregateMatch(MATCH, events);
    const author = result.participants.find((line) => line.participantId === 4);
    const keeper = result.participants.find((line) => line.participantId === 6);

    expect(result.scoreA).toBe(0);
    expect(result.scoreB).toBe(1);
    expect(author?.ownGoals).toBe(1);
    expect(author?.points).toBe(0);
    expect(keeper?.concededGoals).toBe(1);
  });

  it("applique le barème officiel du classement", () => {
    const events = [
      event({ type: "goal", participantId: 1, assistParticipantId: 2, teamId: 10 }),
      event({ type: "defense", participantId: 1, teamId: 10 }),
      event({ type: "save", participantId: 1, teamId: 10 }),
    ];

    const result = aggregateMatch(MATCH, events);
    const line = result.participants.find((item) => item.participantId === 1);

    // 1,5 (but) + 0,5 (défense) + 0,5 (arrêt) = 2,5
    expect(line?.points).toBe(2.5);
    expect(trackerPoints({ goals: 2, assists: 1, defenses: 0, saves: 0 })).toBe(4);
  });

  it("ignore les actions d'un autre match", () => {
    const events = [
      event({ type: "goal", participantId: 1, teamId: 10 }),
      event({ type: "goal", matchId: 99, participantId: 1, teamId: 10 }),
    ];

    expect(aggregateMatch(MATCH, events).scoreA).toBe(1);
  });

  it("produit la même feuille quel que soit l'ordre de lecture des actions", () => {
    const events = [
      event({ type: "gk_in", participantId: 6, teamId: 20, clockMs: 0 }),
      event({ type: "goal", participantId: 1, teamId: 10, clockMs: 100_000 }),
      event({ type: "gk_in", participantId: 9, teamId: 20, clockMs: 300_000 }),
      event({ type: "goal", participantId: 2, teamId: 10, clockMs: 400_000 }),
    ];

    const forward = aggregateMatch(MATCH, events);
    const backward = aggregateMatch(MATCH, [...events].reverse());

    expect(backward).toEqual(forward);
  });
});

describe("gardien en poste", () => {
  it("renvoie le dernier gardien entré avant l'instant demandé", () => {
    const events = [
      event({ type: "gk_in", participantId: 6, teamId: 20, clockMs: 0 }),
      event({ type: "gk_in", participantId: 9, teamId: 20, clockMs: 300_000 }),
    ];

    expect(goalkeeperAt(events, MATCH.id, 20, 100_000)).toBe(6);
    expect(goalkeeperAt(events, MATCH.id, 20, 400_000)).toBe(9);
    expect(goalkeeperAt(events, MATCH.id, 10, 400_000)).toBeNull();
  });
});

describe("horloge", () => {
  it("déduit la minute de jeu de la position vidéo", () => {
    expect(matchClockFromVideo(185_000, 125_000)).toBe(60_000);
  });

  it("borne l'horloge à la durée du match", () => {
    expect(matchClockFromVideo(50_000, 100_000)).toBe(0);
    expect(matchClockFromVideo(9_999_000, 0)).toBe(TRACKER_MATCH_DURATION_MS);
  });

  it("formate en minutes et secondes", () => {
    expect(formatMatchClock(0)).toBe("00:00");
    expect(formatMatchClock(65_000)).toBe("01:05");
    expect(formatMatchClock(TRACKER_MATCH_DURATION_MS)).toBe("10:00");
  });
});

describe("contrôles de cohérence", () => {
  const base = {
    ...MATCH,
    status: "finished" as const,
    declaredScoreA: null,
    declaredScoreB: null,
  };

  it("bloque un score relevé qui ne colle pas aux buteurs saisis", () => {
    const events = [event({ type: "goal", participantId: 1, teamId: 10 })];

    const warnings = checkMatch(
      { ...base, declaredScoreA: 3, declaredScoreB: 0 },
      events,
    );

    expect(warnings.some((warning) => warning.level === "blocking")).toBe(true);
  });

  it("laisse passer un score relevé conforme", () => {
    const events = [
      event({ type: "goal", participantId: 1, teamId: 10 }),
      event({ type: "gk_in", participantId: 6, teamId: 20 }),
    ];

    const warnings = checkMatch(
      { ...base, declaredScoreA: 1, declaredScoreB: 0 },
      events,
    );

    expect(warnings.filter((warning) => warning.level === "blocking")).toHaveLength(0);
  });

  it("signale un but encaissé sans gardien désigné", () => {
    const events = [event({ type: "goal", participantId: 1, teamId: 10 })];
    const warnings = checkMatch(base, events);

    expect(
      warnings.some(
        (warning) =>
          warning.level === "warning" && /gardien/i.test(warning.message),
      ),
    ).toBe(true);
  });

  it("signale un match terminé sans aucune action", () => {
    expect(
      checkMatch(base, []).some((warning) => /aucune action/i.test(warning.message)),
    ).toBe(true);
  });
});

describe("cumul de session", () => {
  it("additionne les matchs et désigne l'homme de la session", () => {
    const matches = [
      { id: 1, teamAId: 10, teamBId: 20 },
      { id: 2, teamAId: 10, teamBId: 30 },
    ];
    const events = [
      event({ type: "goal", matchId: 1, participantId: 1, teamId: 10 }),
      event({ type: "goal", matchId: 2, participantId: 1, teamId: 10 }),
      event({ type: "goal", matchId: 2, participantId: 2, teamId: 10 }),
      event({ type: "defense", matchId: 2, participantId: 2, teamId: 10 }),
    ];

    const result = aggregateSession(matches, events);
    const best = result.participants[0];

    expect(best?.participantId).toBe(1);
    expect(best?.goals).toBe(2);
    expect(result.motmParticipantId).toBe(1);
    expect(result.matches).toHaveLength(2);
  });

  it("ne désigne personne quand rien n'a été saisi", () => {
    expect(aggregateSession([MATCH], []).motmParticipantId).toBeNull();
  });
});

describe("pavé de saisie", () => {
  it("expose un raccourci distinct par action", () => {
    const shortcuts = ["goal", "defense", "save", "own_goal", "gk_in"].map(
      (type) => trackerAction(type as never).shortcut,
    );

    expect(new Set(shortcuts).size).toBe(shortcuts.length);
  });

  it("n'ouvre la désignation du passeur que sur un but", () => {
    expect(trackerAction("goal").asksAssist).toBe(true);
    expect(trackerAction("defense").asksAssist).toBe(false);
  });
});
