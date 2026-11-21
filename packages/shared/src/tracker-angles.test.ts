import { describe, expect, it } from "vitest";
import {
  TRACKER_MATCH_DURATION_MS,
  convertRecordingMs,
  matchClockFromVideo,
  trackerMatchDurationMs,
} from "./tracker.js";

describe("durée d'un match de la feuille", () => {
  it("dix minutes en UNO League, le créneau entier pour un amical", () => {
    expect(trackerMatchDurationMs("league")).toBe(TRACKER_MATCH_DURATION_MS);
    expect(trackerMatchDurationMs("squad")).toBe(TRACKER_MATCH_DURATION_MS);
    expect(trackerMatchDurationMs("friendly")).toBe(3_600_000);
    expect(trackerMatchDurationMs("inconnu")).toBe(TRACKER_MATCH_DURATION_MS);
    expect(trackerMatchDurationMs(null)).toBe(TRACKER_MATCH_DURATION_MS);
  });

  it("une action à la 35e minute d'un amical n'est pas datée 10:00", () => {
    const friendly = trackerMatchDurationMs("friendly");
    expect(matchClockFromVideo(60_000 + 35 * 60_000, 60_000, friendly)).toBe(
      35 * 60_000,
    );
  });
});

describe("calage de deux angles", () => {
  const angles = { referenceId: 1, otherId: 2, offsetMs: 3_500 };

  it("passe d'un angle à l'autre dans les deux sens", () => {
    expect(convertRecordingMs(10_000, 1, 2, angles)).toBe(13_500);
    expect(convertRecordingMs(13_500, 2, 1, angles)).toBe(10_000);
    expect(convertRecordingMs(10_000, 1, 1, null)).toBe(10_000);
  });

  it("ne devine rien sans calage entre les deux enregistrements", () => {
    expect(convertRecordingMs(10_000, 1, 2, null)).toBeNull();
    expect(convertRecordingMs(10_000, 1, 3, angles)).toBeNull();
  });
});
