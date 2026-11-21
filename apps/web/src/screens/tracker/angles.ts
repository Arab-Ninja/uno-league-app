import { convertRecordingMs, type TrackerAngles } from "@uno/shared";

/**
 * Le second angle d'une feuille et son calage (TRACK-001), retenus dans ce
 * navigateur.
 *
 * Le calage est un réglage de visionnage, pas une donnée de la séance : il se
 * refait en dix secondes s'il se perd (navigation privée, autre poste). Il ne
 * part au serveur qu'à la publication, pour placer les moments-clés dans la
 * vidéo du second angle.
 */
export interface AngleSettings {
  companionId: number | null;
  angles: TrackerAngles | null;
}

const EMPTY: AngleSettings = { companionId: null, angles: null };

function storageKey(sessionId: number): string {
  return `uno:tracker:angles:${sessionId}`;
}

export function readAngleSettings(sessionId: number): AngleSettings {
  try {
    const raw = window.localStorage.getItem(storageKey(sessionId));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<AngleSettings>;
    const angles = parsed.angles;
    return {
      companionId:
        typeof parsed.companionId === "number" ? parsed.companionId : null,
      angles:
        angles &&
        typeof angles.referenceId === "number" &&
        typeof angles.otherId === "number" &&
        typeof angles.offsetMs === "number"
          ? angles
          : null,
    };
  } catch {
    return EMPTY;
  }
}

export function writeAngleSettings(
  sessionId: number,
  value: AngleSettings,
): void {
  try {
    window.localStorage.setItem(storageKey(sessionId), JSON.stringify(value));
  } catch {
    // Stockage refusé : le calage vaut pour la visite, c'est tout.
  }
}

/** `t(second) − t(principal)`, ou `null` si le calage ne relie pas les deux. */
export function deltaBetween(
  mainId: number,
  companionId: number,
  angles: TrackerAngles | null,
): number | null {
  return convertRecordingMs(0, mainId, companionId, angles);
}

/**
 * Le calage après un décalage du second angle de `deltaMs` : le second angle
 * montre désormais, pour un même instant du principal, ce qui se passait
 * `deltaMs` plus tard.
 */
export function shiftAngles(
  mainId: number,
  companionId: number,
  angles: TrackerAngles | null,
  deltaMs: number,
): TrackerAngles {
  const base =
    angles && deltaBetween(mainId, companionId, angles) !== null
      ? angles
      : { referenceId: mainId, otherId: companionId, offsetMs: 0 };
  const offsetMs =
    base.otherId === companionId
      ? base.offsetMs + deltaMs
      : base.offsetMs - deltaMs;
  return {
    ...base,
    offsetMs: Math.max(-600_000, Math.min(600_000, Math.round(offsetMs))),
  };
}
