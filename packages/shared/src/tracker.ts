import { getGameMode } from "./constants.js";
import { RANKING_WEIGHTS } from "./ranking.js";
import type { TrackerSheet } from "./types.js";

/**
 * Saisie des statistiques en visionnage (TRACK-001).
 *
 * Le principe qui commande tout le reste : **on saisit des actions, pas des
 * compteurs**. Une action est un fait daté — « à 4:12, Yassine marque, servi
 * par Karim ». Les statistiques, le score et les buts encaissés en sont
 * *déduits*, jamais tapés.
 *
 * Trois conséquences, et ce sont exactement les trois défauts de la saisie
 * par tableau qu'elle remplace :
 *
 *  1. **Annuler est trivial** : on retire le dernier fait, tous les totaux
 *     suivent. Un tableau de compteurs, lui, ne se « dé-tape » pas.
 *  2. **Le score ne peut pas contredire les buteurs** : il est la somme des
 *     buts saisis. Un score juste avec des buteurs faux devient impossible.
 *  3. **Chaque chiffre est justifiable** : derrière un total, il y a une
 *     minute et un timecode vidéo. Un joueur qui conteste sa feuille peut
 *     revoir l'action.
 *
 * Tout ce fichier est pur : mêmes entrées, mêmes sorties, aucune dépendance
 * au serveur ni au navigateur. Le total affiché pendant la saisie et le total
 * enregistré en base sortent donc du même code (INFO-001).
 */

// ---------------------------------------------------------------------------
// Format
// ---------------------------------------------------------------------------

/** Durée d'un match UNO League, en minutes (CDC §8). */
export const TRACKER_MATCH_MINUTES = 10;

/** La même durée en millisecondes, unité de travail de l'horloge. */
export const TRACKER_MATCH_DURATION_MS = TRACKER_MATCH_MINUTES * 60_000;

/** Nombre d'équipes d'une session UNO League. */
export const TRACKER_TEAM_COUNT = 3;

/**
 * Équipes préréglées.
 *
 * Les couleurs ne sont pas décoratives : sur une vidéo, une équipe se
 * reconnaît à la chasuble, pas à un nom. Nommer les équipes par leur couleur
 * supprime la traduction mentale « équipe B = les rouges » à chaque action,
 * qui est la première source d'erreur de saisie.
 */
export const TRACKER_TEAM_PRESETS = [
  { name: "Rouge", color: "#ef4444" },
  { name: "Bleu", color: "#3b82f6" },
  { name: "Vert", color: "#22c55e" },
  { name: "Jaune", color: "#eab308" },
] as const;

// ---------------------------------------------------------------------------
// Actions saisissables
// ---------------------------------------------------------------------------

export const TRACKER_EVENT_TYPES = [
  "goal",
  "own_goal",
  "defense",
  "save",
  "gk_in",
] as const;

export type TrackerEventType = (typeof TRACKER_EVENT_TYPES)[number];

export interface TrackerActionDefinition {
  type: TrackerEventType;
  label: string;
  /** Libellé court, pour les pastilles du journal. */
  short: string;
  /** Touche du clavier, en minuscule. */
  shortcut: string;
  /** true : l'action ouvre la désignation du passeur juste après. */
  asksAssist: boolean;
  /** true : l'action est proposée dans le pavé de saisie principal. */
  primary: boolean;
}

/**
 * Le pavé de saisie, dans l'ordre de fréquence réelle d'un match de futsal.
 *
 * Les raccourcis sont choisis sur la rangée de repos, en français : Bbut,
 * Ppasse — non, la passe ne se saisit pas seule (voir `asksAssist`) —,
 * Ddéfense, Aarrêt, Ggardien, Ccontre son camp.
 */
export const TRACKER_ACTIONS: readonly TrackerActionDefinition[] = [
  {
    type: "goal",
    label: "But",
    short: "But",
    shortcut: "b",
    asksAssist: true,
    primary: true,
  },
  {
    type: "defense",
    label: "Défense",
    short: "Déf",
    shortcut: "d",
    asksAssist: false,
    primary: true,
  },
  {
    type: "save",
    label: "Arrêt",
    short: "Arrêt",
    shortcut: "a",
    asksAssist: false,
    primary: true,
  },
  {
    type: "own_goal",
    label: "Contre son camp",
    short: "CSC",
    shortcut: "c",
    asksAssist: false,
    primary: false,
  },
  {
    type: "gk_in",
    label: "Entre au but",
    short: "Gardien",
    shortcut: "g",
    asksAssist: false,
    primary: false,
  },
] as const;

export function trackerAction(type: TrackerEventType): TrackerActionDefinition {
  const found = TRACKER_ACTIONS.find((action) => action.type === type);
  if (!found) throw new Error(`Action de saisie inconnue : ${type}`);
  return found;
}

// ---------------------------------------------------------------------------
// Faits de jeu
// ---------------------------------------------------------------------------

/**
 * Une action saisie.
 *
 * `clientId` est produit par l'appareil de saisie, pas par le serveur : c'est
 * ce qui rend la synchronisation rejouable. Une action saisie hors ligne puis
 * envoyée deux fois — reprise de réseau, onglet rouvert, double clic sur
 * « Synchroniser » — est écrite une seule fois, parce que la clé est unique en
 * base. Sans elle, la moindre coupure réseau produirait des doublons, donc des
 * statistiques fausses.
 *
 * `teamId` est figé au moment de l'action, et non relu depuis l'équipe
 * courante du joueur. Un joueur déplacé d'une équipe à l'autre entre deux
 * matchs — cas normal, les compositions bougent en cours de séance — ne doit
 * pas réécrire l'histoire des matchs déjà saisis.
 */
export interface TrackerEvent {
  clientId: string;
  matchId: number;
  type: TrackerEventType;
  /** Auteur de l'action (identifiant de participant à la session). */
  participantId: number;
  /** Passeur décisif, uniquement pour un but. */
  assistParticipantId: number | null;
  /** Équipe de l'auteur au moment de l'action. */
  teamId: number;
  /** Horloge du match, en millisecondes depuis le coup d'envoi. */
  clockMs: number;
  /** Position dans la vidéo, si la saisie se fait en visionnage. */
  videoMs: number | null;
}

// ---------------------------------------------------------------------------
// Horloge
// ---------------------------------------------------------------------------

/** Borne l'horloge de match dans [0, durée du match]. */
export function clampMatchClock(
  ms: number,
  durationMs: number = TRACKER_MATCH_DURATION_MS,
): number {
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.min(durationMs, Math.round(ms)));
}

/**
 * Horloge de match déduite de la position vidéo.
 *
 * `videoStartMs` est la position du coup d'envoi dans l'enregistrement : elle
 * se pose une fois par match, d'un bouton. Toute action saisie ensuite connaît
 * sa minute de jeu sans que personne n'ait à la calculer.
 */
export function matchClockFromVideo(
  videoMs: number,
  videoStartMs: number,
  durationMs: number = TRACKER_MATCH_DURATION_MS,
): number {
  return clampMatchClock(videoMs - videoStartMs, durationMs);
}

/** Formate une horloge en « MM:SS ». */
export function formatMatchClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Agrégation
// ---------------------------------------------------------------------------

export interface TrackerParticipantStats {
  participantId: number;
  goals: number;
  assists: number;
  defenses: number;
  saves: number;
  /** Buts contre son camp : suivis pour la feuille, sans effet au classement. */
  ownGoals: number;
  /** Buts encaissés pendant que le joueur gardait la cage. */
  concededGoals: number;
  /** Millisecondes passées au but. */
  goalkeepingMs: number;
  /** Points au barème officiel du classement. */
  points: number;
}

export function emptyParticipantStats(participantId: number): TrackerParticipantStats {
  return {
    participantId,
    goals: 0,
    assists: 0,
    defenses: 0,
    saves: 0,
    ownGoals: 0,
    concededGoals: 0,
    goalkeepingMs: 0,
    points: 0,
  };
}

/** Points au barème officiel : but 1,5 · passe 1 · défense 0,5 · arrêt 0,5. */
export function trackerPoints(
  stats: Pick<TrackerParticipantStats, "goals" | "assists" | "defenses" | "saves">,
): number {
  const total =
    stats.goals * RANKING_WEIGHTS.goals +
    stats.assists * RANKING_WEIGHTS.assists +
    stats.defenses * RANKING_WEIGHTS.defenses +
    stats.saves * RANKING_WEIGHTS.saves;
  return Math.round(total * 10) / 10;
}

export interface TrackerMatchInput {
  id: number;
  teamAId: number;
  teamBId: number;
  durationMs?: number;
}

export interface TrackerMatchAggregate {
  matchId: number;
  scoreA: number;
  scoreB: number;
  /** Statistiques par participant, triées par identifiant pour la stabilité. */
  participants: TrackerParticipantStats[];
  /** Gardien en poste à la fin du match, par équipe. */
  goalkeepers: Record<number, number | null>;
}

/**
 * Ordre de traitement des actions.
 *
 * L'horloge d'abord — c'est la chronologie du match. À horloge égale, l'ordre
 * de saisie, départagé par `clientId` : deux actions à la même seconde (un but
 * et l'entrée du gardien remplaçant juste après) doivent s'appliquer dans un
 * ordre stable, sans quoi le même enregistrement donnerait deux feuilles
 * différentes selon la façon dont la base a renvoyé les lignes.
 */
function chronological(a: TrackerEvent, b: TrackerEvent): number {
  if (a.clockMs !== b.clockMs) return a.clockMs - b.clockMs;
  return a.clientId < b.clientId ? -1 : a.clientId > b.clientId ? 1 : 0;
}

/**
 * Statistiques d'un match, déduites de ses actions.
 *
 * Le gardien encaisse sans qu'on ait rien à saisir : à chaque but, le domaine
 * sait qui gardait la cage adverse — c'est le dernier joueur entré au but pour
 * cette équipe avant l'action. C'est une action de saisie en moins par but,
 * l'une des plus faciles à oublier, et la seule qu'il aurait fallu saisir
 * *pour l'équipe d'en face*.
 */
export function aggregateMatch(
  match: TrackerMatchInput,
  events: readonly TrackerEvent[],
): TrackerMatchAggregate {
  const durationMs = match.durationMs ?? TRACKER_MATCH_DURATION_MS;
  const stats = new Map<number, TrackerParticipantStats>();

  const ensure = (participantId: number): TrackerParticipantStats => {
    const existing = stats.get(participantId);
    if (existing) return existing;
    const created = emptyParticipantStats(participantId);
    stats.set(participantId, created);
    return created;
  };

  // Gardien en poste, par équipe, et depuis quand.
  const keeper: Record<number, { participantId: number; sinceMs: number } | null> = {
    [match.teamAId]: null,
    [match.teamBId]: null,
  };

  const takeGoal = (concedingTeamId: number): void => {
    const onDuty = keeper[concedingTeamId];
    if (onDuty) ensure(onDuty.participantId).concededGoals++;
  };

  const ordered = [...events]
    .filter((event) => event.matchId === match.id)
    .sort(chronological);

  for (const event of ordered) {
    switch (event.type) {
      case "goal": {
        const scorer = ensure(event.participantId);
        scorer.goals++;
        if (event.assistParticipantId !== null) {
          ensure(event.assistParticipantId).assists++;
        }
        // L'équipe qui encaisse est l'autre — quelle que soit celle du buteur,
        // ce qui rend le calcul insensible à une erreur d'équipe sur l'action.
        takeGoal(
          event.teamId === match.teamAId ? match.teamBId : match.teamAId,
        );
        break;
      }
      case "own_goal": {
        // Le but compte pour l'adversaire ; le gardien encaissé est celui de
        // l'équipe de l'auteur. Aucun point n'est retiré : le barème officiel
        // ne pénalise pas, et improviser une pénalité ici la rendrait
        // invisible dans le classement général.
        ensure(event.participantId).ownGoals++;
        takeGoal(event.teamId);
        break;
      }
      case "defense": {
        ensure(event.participantId).defenses++;
        break;
      }
      case "save": {
        ensure(event.participantId).saves++;
        break;
      }
      case "gk_in": {
        const previous = keeper[event.teamId];
        if (previous) {
          ensure(previous.participantId).goalkeepingMs +=
            Math.max(0, event.clockMs - previous.sinceMs);
        }
        keeper[event.teamId] = {
          participantId: event.participantId,
          sinceMs: event.clockMs,
        };
        break;
      }
    }
  }

  // Le gardien encore en poste au coup de sifflet final garde sa cage jusqu'au
  // bout : sans cette clôture, le dernier relais ne compterait aucune minute.
  for (const teamId of [match.teamAId, match.teamBId]) {
    const onDuty = keeper[teamId];
    if (onDuty) {
      ensure(onDuty.participantId).goalkeepingMs += Math.max(
        0,
        durationMs - onDuty.sinceMs,
      );
    }
  }

  let scoreA = 0;
  let scoreB = 0;
  for (const event of ordered) {
    if (event.type === "goal") {
      if (event.teamId === match.teamAId) scoreA++;
      else scoreB++;
    } else if (event.type === "own_goal") {
      // Un contre son camp compte pour l'adversaire de son auteur.
      if (event.teamId === match.teamAId) scoreB++;
      else scoreA++;
    }
  }

  for (const line of stats.values()) {
    line.points = trackerPoints(line);
  }

  return {
    matchId: match.id,
    scoreA,
    scoreB,
    participants: [...stats.values()].sort(
      (a, b) => a.participantId - b.participantId,
    ),
    goalkeepers: {
      [match.teamAId]: keeper[match.teamAId]?.participantId ?? null,
      [match.teamBId]: keeper[match.teamBId]?.participantId ?? null,
    },
  };
}

/**
 * Gardien en poste pour une équipe à un instant donné.
 *
 * Utilisé par l'interface pour attribuer un arrêt d'un seul geste : le bouton
 * « Arrêt » vise le gardien du moment, il n'y a personne à désigner.
 */
export function goalkeeperAt(
  events: readonly TrackerEvent[],
  matchId: number,
  teamId: number,
  clockMs: number,
): number | null {
  const relevant = events
    .filter(
      (event) =>
        event.matchId === matchId &&
        event.type === "gk_in" &&
        event.teamId === teamId &&
        event.clockMs <= clockMs,
    )
    .sort(chronological);

  return relevant.length > 0
    ? (relevant[relevant.length - 1] as TrackerEvent).participantId
    : null;
}

// ---------------------------------------------------------------------------
// Totaux de session
// ---------------------------------------------------------------------------

export interface TrackerSessionAggregate {
  matches: TrackerMatchAggregate[];
  /** Cumul de la session, par participant, trié du meilleur au moins bon. */
  participants: TrackerParticipantStats[];
  /** Participant au plus grand total de points, ou null si personne n'a joué. */
  motmParticipantId: number | null;
}

/**
 * Cumul d'une session complète.
 *
 * L'homme du match — de la session, en l'occurrence — est le plus grand total
 * de points, exactement comme à la clôture d'une session réservée. Deux
 * chemins différents ne peuvent donc pas désigner deux joueurs différents.
 */
export function aggregateSession(
  matches: readonly TrackerMatchInput[],
  events: readonly TrackerEvent[],
): TrackerSessionAggregate {
  const perMatch = matches.map((match) => aggregateMatch(match, events));
  const totals = new Map<number, TrackerParticipantStats>();

  for (const aggregate of perMatch) {
    for (const line of aggregate.participants) {
      const current = totals.get(line.participantId) ?? emptyParticipantStats(line.participantId);
      current.goals += line.goals;
      current.assists += line.assists;
      current.defenses += line.defenses;
      current.saves += line.saves;
      current.ownGoals += line.ownGoals;
      current.concededGoals += line.concededGoals;
      current.goalkeepingMs += line.goalkeepingMs;
      totals.set(line.participantId, current);
    }
  }

  const participants = [...totals.values()].map((line) => ({
    ...line,
    points: trackerPoints(line),
  }));

  participants.sort(
    (a, b) => b.points - a.points || a.participantId - b.participantId,
  );

  return {
    matches: perMatch,
    participants,
    motmParticipantId: participants[0]?.participantId ?? null,
  };
}

// ---------------------------------------------------------------------------
// Contrôles de cohérence
// ---------------------------------------------------------------------------

export type TrackerWarningLevel = "blocking" | "warning";

export interface TrackerWarning {
  level: TrackerWarningLevel;
  message: string;
  matchId?: number;
}

export interface TrackerMatchCheckInput extends TrackerMatchInput {
  /** Score relevé sur la vidéo, s'il a été saisi. */
  declaredScoreA: number | null;
  declaredScoreB: number | null;
  status: "pending" | "playing" | "finished";
}

/**
 * Écarts entre ce qui a été saisi et ce qui est vérifiable.
 *
 * Le seul contrôle qui bloque est celui du score : un score relevé au tableau
 * qui ne correspond pas aux buteurs saisis signale un but manqué ou attribué
 * deux fois, et publier ce match fausserait le classement de session, donc les
 * distinctions et les mouvements de division. Les autres écarts sont
 * signalés : ils dégradent la feuille sans la rendre fausse.
 */
export function checkMatch(
  match: TrackerMatchCheckInput,
  events: readonly TrackerEvent[],
): TrackerWarning[] {
  const aggregate = aggregateMatch(match, events);
  const warnings: TrackerWarning[] = [];

  if (match.declaredScoreA !== null && match.declaredScoreB !== null) {
    if (
      aggregate.scoreA !== match.declaredScoreA ||
      aggregate.scoreB !== match.declaredScoreB
    ) {
      warnings.push({
        level: "blocking",
        matchId: match.id,
        message:
          `Score relevé ${match.declaredScoreA}–${match.declaredScoreB}, ` +
          `buts saisis ${aggregate.scoreA}–${aggregate.scoreB} : ` +
          "il manque un buteur, ou un but a été compté deux fois.",
      });
    }
  }

  const played = events.some((event) => event.matchId === match.id);
  if (match.status === "finished" && !played) {
    warnings.push({
      level: "warning",
      matchId: match.id,
      message: "Match terminé sans aucune action saisie.",
    });
  }

  for (const teamId of [match.teamAId, match.teamBId]) {
    const hasKeeper = events.some(
      (event) =>
        event.matchId === match.id &&
        event.type === "gk_in" &&
        event.teamId === teamId,
    );
    const conceded = teamId === match.teamAId ? aggregate.scoreB : aggregate.scoreA;
    if (!hasKeeper && conceded > 0) {
      warnings.push({
        level: "warning",
        matchId: match.id,
        message:
          "Aucun gardien désigné pour une équipe qui a encaissé : " +
          `${conceded} but(s) encaissé(s) ne seront attribués à personne.`,
      });
    }
  }

  return warnings;
}

/**
 * Ce qui empêcherait une publication d'être juste.
 *
 * Partagé entre le serveur, qui refuse, et l'écran de saisie, qui prévient :
 * l'administration voit ce qui bloque *pendant* qu'elle saisit, et non au
 * moment où elle croit avoir terminé.
 */
export function publicationBlockers(sheet: TrackerSheet): TrackerWarning[] {
  const warnings: TrackerWarning[] = [];
  const events: TrackerEvent[] = sheet.events.map((event) => ({
    clientId: event.clientId,
    matchId: event.matchId,
    type: event.type as TrackerEventType,
    participantId: event.participantId,
    assistParticipantId: event.assistParticipantId,
    teamId: event.teamId,
    clockMs: event.clockMs,
    videoMs: event.videoMs,
  }));

  const finished = sheet.matches.filter((match) => match.status === "finished");
  if (finished.length === 0) {
    warnings.push({
      level: "blocking",
      message: "Aucun match terminé : il n'y a rien à publier.",
    });
  }

  for (const match of finished) {
    warnings.push(
      ...checkMatch(
        {
          id: match.id,
          teamAId: match.teamAId,
          teamBId: match.teamBId,
          status: match.status,
          declaredScoreA: match.declaredScoreA,
          declaredScoreB: match.declaredScoreB,
        },
        events,
      ),
    );
  }

  const guests = sheet.participants.filter(
    (participant) => participant.playerId === null,
  );
  if (guests.length > 0) {
    warnings.push({
      level: "blocking",
      message:
        `Rattachez ${guests.length === 1 ? "l'invité" : "les invités"} à un compte : ` +
        guests.map((guest) => guest.displayName).join(", ") +
        ". Sans compte, leurs points n'iraient nulle part.",
    });
  }

  const mode = getGameMode(sheet.session.modeId);
  if ((mode?.ranked ?? false) && sheet.session.division === null) {
    warnings.push({
      level: "blocking",
      message:
        "Choisissez la division de la session : elle commande le barème des " +
        "récompenses et les montées comme les descentes.",
    });
  }

  return warnings;
}
