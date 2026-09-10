import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { getGameMode } from "@uno/shared";
import {
  balanceOf,
  createPlayer,
  promoteToAdmin,
  resetDatabase,
  type TestPlayer,
} from "./helpers.js";

/**
 * Saisie en visionnage (TRACK-001).
 *
 * Ce que ces tests protègent tient en une phrase : une feuille saisie action
 * par action doit produire exactement le même effet sur la ligue qu'une
 * session saisie depuis la console. Statistiques, XP, distinctions, montées et
 * descentes empruntent le même chemin ; si les deux divergeaient, la ligue
 * aurait deux classements.
 */

const league = getGameMode("league")!;

interface Prepared {
  admin: TestPlayer;
  squad: TestPlayer[];
  sessionId: number;
}

/** Feuille libre, quinze joueurs, trois équipes tirées automatiquement. */
async function preparedSheet(playerCount = league.minParticipants): Promise<Prepared> {
  const admin = await promoteToAdmin(await createPlayer());
  const squad: TestPlayer[] = [];

  for (let index = 0; index < playerCount; index++) {
    const player = await createPlayer();
    await admin.caller.admin.setDivision({
      playerId: player.identity.playerId,
      division: "D1",
    });
    squad.push(player);
  }

  const created = await admin.caller.tracker.create({
    label: "Séance du mardi",
    localDate: "2026-02-10",
    slotStartHour: 20,
    modeId: "league",
    division: "D1",
    venueId: "arena",
  });

  await admin.caller.tracker.draft({
    sessionId: created.session.id,
    playerIds: squad.map((player) => player.identity.playerId),
  });

  return { admin, squad, sessionId: created.session.id };
}

function eventId(): string {
  return randomUUID();
}

describe("feuille de saisie en visionnage", () => {
  beforeEach(resetDatabase);

  it("crée une feuille sans réservation ni paiement", async () => {
    const { admin, sessionId } = await preparedSheet();
    const sheet = await admin.caller.tracker.get({ sessionId });

    expect(sheet.teams).toHaveLength(3);
    expect(sheet.participants).toHaveLength(15);
    expect(sheet.session.status).toBe("draft");
    // Aucune proposition n'est créée tant que la feuille n'est pas publiée.
    expect(sheet.session.publishedProposalId).toBeNull();
  });

  it("déduit le score des buts saisis, sans qu'il soit jamais renseigné", async () => {
    const { admin, sessionId } = await preparedSheet();
    const sheet = await admin.caller.tracker.get({ sessionId });
    const [teamA, teamB] = sheet.teams;

    const withMatch = await admin.caller.tracker.addMatch({
      sessionId,
      teamAId: teamA!.id,
      teamBId: teamB!.id,
    });
    const match = withMatch.matches[0]!;

    const scorer = withMatch.participants.find((p) => p.teamId === teamA!.id)!;
    const passer = withMatch.participants.find(
      (p) => p.teamId === teamA!.id && p.id !== scorer.id,
    )!;

    const after = await admin.caller.tracker.sync({
      sessionId,
      upserts: [
        {
          clientId: eventId(),
          matchId: match.id,
          type: "goal",
          participantId: scorer.id,
          assistParticipantId: passer.id,
          teamId: teamA!.id,
          clockMs: 63_000,
          videoMs: 125_000,
        },
      ],
      deletions: [],
    });

    expect(after.events).toHaveLength(1);
    expect(after.events[0]?.assistParticipantId).toBe(passer.id);
  });

  it("rejoue une synchronisation sans jamais dupliquer une action", async () => {
    const { admin, sessionId } = await preparedSheet();
    const sheet = await admin.caller.tracker.get({ sessionId });
    const [teamA, teamB] = sheet.teams;

    const withMatch = await admin.caller.tracker.addMatch({
      sessionId,
      teamAId: teamA!.id,
      teamBId: teamB!.id,
    });
    const match = withMatch.matches[0]!;
    const scorer = withMatch.participants.find((p) => p.teamId === teamA!.id)!;

    const action = {
      clientId: eventId(),
      matchId: match.id,
      type: "goal" as const,
      participantId: scorer.id,
      assistParticipantId: null,
      teamId: teamA!.id,
      clockMs: 30_000,
      videoMs: null,
    };

    // Une file d'attente hors ligne renvoyée deux fois : c'est le scénario
    // exact d'une coupure réseau suivie d'une reprise.
    await admin.caller.tracker.sync({ sessionId, upserts: [action], deletions: [] });
    const twice = await admin.caller.tracker.sync({
      sessionId,
      upserts: [action],
      deletions: [],
    });

    expect(twice.events).toHaveLength(1);
  });

  it("corrige une action au lieu d'en ajouter une seconde", async () => {
    const { admin, sessionId } = await preparedSheet();
    const sheet = await admin.caller.tracker.get({ sessionId });
    const [teamA, teamB] = sheet.teams;

    const withMatch = await admin.caller.tracker.addMatch({
      sessionId,
      teamAId: teamA!.id,
      teamBId: teamB!.id,
    });
    const match = withMatch.matches[0]!;
    const scorer = withMatch.participants.find((p) => p.teamId === teamA!.id)!;
    const passer = withMatch.participants.find(
      (p) => p.teamId === teamA!.id && p.id !== scorer.id,
    )!;

    const clientId = eventId();
    const base = {
      clientId,
      matchId: match.id,
      type: "goal" as const,
      participantId: scorer.id,
      teamId: teamA!.id,
      clockMs: 30_000,
      videoMs: null,
    };

    await admin.caller.tracker.sync({
      sessionId,
      upserts: [{ ...base, assistParticipantId: null }],
      deletions: [],
    });
    const corrected = await admin.caller.tracker.sync({
      sessionId,
      upserts: [{ ...base, assistParticipantId: passer.id }],
      deletions: [],
    });

    expect(corrected.events).toHaveLength(1);
    expect(corrected.events[0]?.assistParticipantId).toBe(passer.id);
  });

  it("supprime une action déjà supprimée sans échouer", async () => {
    const { admin, sessionId } = await preparedSheet();
    const absent = randomUUID();

    const result = await admin.caller.tracker.sync({
      sessionId,
      upserts: [],
      deletions: [absent],
    });

    expect(result.events).toHaveLength(0);
  });

  it("refuse une action qui désigne un joueur absent de la feuille", async () => {
    const { admin, sessionId } = await preparedSheet();
    const sheet = await admin.caller.tracker.get({ sessionId });
    const [teamA, teamB] = sheet.teams;

    const withMatch = await admin.caller.tracker.addMatch({
      sessionId,
      teamAId: teamA!.id,
      teamBId: teamB!.id,
    });
    const match = withMatch.matches[0]!;

    await expect(
      admin.caller.tracker.sync({
        sessionId,
        upserts: [
          {
            clientId: eventId(),
            matchId: match.id,
            type: "goal",
            participantId: 999_999,
            assistParticipantId: null,
            teamId: teamA!.id,
            clockMs: 0,
            videoMs: null,
          },
        ],
        deletions: [],
      }),
    ).rejects.toThrow(/absent de la feuille/i);
  });

  it("déplace un joueur d'une équipe à l'autre sans réécrire les matchs passés", async () => {
    const { admin, sessionId } = await preparedSheet();
    const sheet = await admin.caller.tracker.get({ sessionId });
    const [teamA, teamB, teamC] = sheet.teams;

    const withMatch = await admin.caller.tracker.addMatch({
      sessionId,
      teamAId: teamA!.id,
      teamBId: teamB!.id,
    });
    const match = withMatch.matches[0]!;
    const scorer = withMatch.participants.find((p) => p.teamId === teamA!.id)!;

    await admin.caller.tracker.sync({
      sessionId,
      upserts: [
        {
          clientId: eventId(),
          matchId: match.id,
          type: "goal",
          participantId: scorer.id,
          assistParticipantId: null,
          teamId: teamA!.id,
          clockMs: 10_000,
          videoMs: null,
        },
      ],
      deletions: [],
    });

    const moved = await admin.caller.tracker.moveParticipant({
      participantId: scorer.id,
      teamId: teamC!.id,
    });

    // Le joueur a changé d'équipe, mais son but reste porté au compte de
    // l'équipe qui l'a marqué.
    expect(
      moved.participants.find((p) => p.id === scorer.id)?.teamId,
    ).toBe(teamC!.id);
    expect(moved.events[0]?.teamId).toBe(teamA!.id);
  });

  it("refuse de retirer un joueur qui porte des actions", async () => {
    const { admin, sessionId } = await preparedSheet();
    const sheet = await admin.caller.tracker.get({ sessionId });
    const [teamA, teamB] = sheet.teams;

    const withMatch = await admin.caller.tracker.addMatch({
      sessionId,
      teamAId: teamA!.id,
      teamBId: teamB!.id,
    });
    const match = withMatch.matches[0]!;
    const scorer = withMatch.participants.find((p) => p.teamId === teamA!.id)!;

    await admin.caller.tracker.sync({
      sessionId,
      upserts: [
        {
          clientId: eventId(),
          matchId: match.id,
          type: "goal",
          participantId: scorer.id,
          assistParticipantId: null,
          teamId: teamA!.id,
          clockMs: 0,
          videoMs: null,
        },
      ],
      deletions: [],
    });

    await expect(
      admin.caller.tracker.removeParticipant({ participantId: scorer.id }),
    ).rejects.toThrow(/supprimez-les d'abord/i);
  });
});

describe("publication d'une feuille", () => {
  beforeEach(resetDatabase);

  /** Feuille prête à publier : un match joué, terminé, avec des buts. */
  async function playedSheet(): Promise<
    Prepared & { scorerPlayerId: number; passerPlayerId: number }
  > {
    const prepared = await preparedSheet();
    const sheet = await prepared.admin.caller.tracker.get({
      sessionId: prepared.sessionId,
    });
    const [teamA, teamB] = sheet.teams;

    const withMatch = await prepared.admin.caller.tracker.addMatch({
      sessionId: prepared.sessionId,
      teamAId: teamA!.id,
      teamBId: teamB!.id,
    });
    const match = withMatch.matches[0]!;

    const scorer = withMatch.participants.find((p) => p.teamId === teamA!.id)!;
    const passer = withMatch.participants.find(
      (p) => p.teamId === teamA!.id && p.id !== scorer.id,
    )!;
    const keeper = withMatch.participants.find((p) => p.teamId === teamB!.id)!;

    await prepared.admin.caller.tracker.sync({
      sessionId: prepared.sessionId,
      upserts: [
        {
          clientId: eventId(),
          matchId: match.id,
          type: "gk_in",
          participantId: keeper.id,
          assistParticipantId: null,
          teamId: teamB!.id,
          clockMs: 0,
          videoMs: null,
        },
        {
          clientId: eventId(),
          matchId: match.id,
          type: "goal",
          participantId: scorer.id,
          assistParticipantId: passer.id,
          teamId: teamA!.id,
          clockMs: 120_000,
          videoMs: null,
        },
        {
          clientId: eventId(),
          matchId: match.id,
          type: "save",
          participantId: keeper.id,
          assistParticipantId: null,
          teamId: teamB!.id,
          clockMs: 200_000,
          videoMs: null,
        },
      ],
      deletions: [],
    });

    await prepared.admin.caller.tracker.updateMatch({
      matchId: match.id,
      status: "finished",
    });

    return {
      ...prepared,
      scorerPlayerId: scorer.playerId!,
      passerPlayerId: passer.playerId!,
    };
  }

  it("TRACK-001 — la vidéo de la saisie suit la session publiée", async () => {
    const { admin, sessionId, squad } = await playedSheet();

    await admin.caller.tracker.addVideo({
      sessionId,
      label: "1re heure",
      url: "https://exemple.test/seance/premiere-heure.mp4",
    });
    // Un repère sans adresse ne voyage pas : il ne désigne aucun fichier.
    await admin.caller.tracker.addVideo({ sessionId, label: "2e heure" });

    const published = await admin.caller.tracker.publish({ sessionId });
    const proposalId = published.proposalId;

    // Le joueur retrouve, à côté du résultat, la vidéo qui a servi à compter.
    const videos = await squad[0]!.caller.supervision.videos({ proposalId });
    expect(videos).toHaveLength(1);
    expect(videos[0]?.url).toBe("https://exemple.test/seance/premiere-heure.mp4");
    expect(videos[0]?.label).toBe("1re heure");
  });

  it("reporte les statistiques sur les cartes joueur", async () => {
    const { admin, sessionId, scorerPlayerId, passerPlayerId } = await playedSheet();

    await admin.caller.tracker.publish({ sessionId, awardUno: false });

    const scorer = await admin.caller.players.publicProfile({ playerId: scorerPlayerId });
    const passer = await admin.caller.players.publicProfile({ playerId: passerPlayerId });

    expect(scorer.goals).toBe(1);
    expect(passer.assists).toBe(1);
  });

  it("ne verse aucun UNO tant que les récompenses ne sont pas demandées", async () => {
    const { admin, squad, sessionId } = await playedSheet();
    const before = await balanceOf(squad[0]!.identity.playerId);

    await admin.caller.tracker.publish({ sessionId, awardUno: false });

    expect(await balanceOf(squad[0]!.identity.playerId)).toBe(before);
  });

  it("verse les récompenses lorsqu'elles sont demandées", async () => {
    const { admin, squad, sessionId } = await playedSheet();
    const before = await balanceOf(squad[0]!.identity.playerId);

    await admin.caller.tracker.publish({ sessionId, awardUno: true });

    const balances = await Promise.all(
      squad.map((player) => balanceOf(player.identity.playerId)),
    );
    expect(balances.some((balance) => balance > before)).toBe(true);
  });

  it("refuse une seconde publication", async () => {
    const { admin, sessionId } = await playedSheet();
    await admin.caller.tracker.publish({ sessionId, awardUno: false });

    await expect(
      admin.caller.tracker.publish({ sessionId, awardUno: false }),
    ).rejects.toThrow(/déjà publiée/i);
  });

  it("fige la feuille une fois publiée", async () => {
    const { admin, sessionId } = await playedSheet();
    const published = await admin.caller.tracker.publish({
      sessionId,
      awardUno: false,
    });
    const sheet = await admin.caller.tracker.get({ sessionId });

    expect(sheet.session.status).toBe("published");
    expect(sheet.session.publishedProposalId).toBe(published.proposalId);

    await expect(
      admin.caller.tracker.addMatch({
        sessionId,
        teamAId: sheet.teams[0]!.id,
        teamBId: sheet.teams[1]!.id,
      }),
    ).rejects.toThrow(/publiée/i);
  });

  it("refuse de publier un score relevé qui contredit les buteurs", async () => {
    const { admin, sessionId } = await playedSheet();
    const sheet = await admin.caller.tracker.get({ sessionId });

    await admin.caller.tracker.updateMatch({
      matchId: sheet.matches[0]!.id,
      declaredScoreA: 5,
      declaredScoreB: 0,
    });

    await expect(
      admin.caller.tracker.publish({ sessionId, awardUno: false }),
    ).rejects.toThrow(/buts saisis/i);
  });

  it("refuse de publier tant qu'un invité n'est pas rattaché à un compte", async () => {
    const { admin, sessionId } = await playedSheet();
    const sheet = await admin.caller.tracker.get({ sessionId });

    await admin.caller.tracker.addParticipant({
      sessionId,
      teamId: sheet.teams[2]!.id,
      guestName: "Kevin de passage",
    });

    await expect(
      admin.caller.tracker.publish({ sessionId, awardUno: false }),
    ).rejects.toThrow(/rattachez/i);
  });

  it("refuse de publier une feuille sans match terminé", async () => {
    const { admin, sessionId } = await preparedSheet();

    await expect(
      admin.caller.tracker.publish({ sessionId, awardUno: false }),
    ).rejects.toThrow(/rien à publier/i);
  });

  it("interdit la feuille à un joueur ordinaire", async () => {
    const { squad, sessionId } = await preparedSheet();

    await expect(squad[0]!.caller.tracker.get({ sessionId })).rejects.toThrow();
  });
});

describe("enregistrements d'une feuille (TRACK-001)", () => {
  beforeEach(resetDatabase);

  it("TRACK-001 — plusieurs enregistrements, avec ou sans adresse", async () => {
    const { admin, sessionId } = await preparedSheet();
    const sheet = { session: { id: sessionId } };

    // Un lien direct vers le fichier : il se retrouve d'une visite à l'autre.
    const withUrl = await admin.caller.tracker.addVideo({
      sessionId: sheet.session.id,
      label: "1re heure",
      url: "https://exemple.test/seance/premiere-heure.mp4",
    });
    expect(withUrl.session.videos).toHaveLength(1);
    expect(withUrl.session.videos[0]?.url).toBe(
      "https://exemple.test/seance/premiere-heure.mp4",
    );

    // Sans adresse : un repère nommé, que l'on ré-associe à son fichier.
    const both = await admin.caller.tracker.addVideo({
      sessionId: sheet.session.id,
      label: "2e heure",
    });
    expect(both.session.videos).toHaveLength(2);
    expect(both.session.videos[1]?.url).toBeNull();
    expect(both.session.videos[1]?.label).toBe("2e heure");

    const left = await admin.caller.tracker.removeVideo({
      sessionId: sheet.session.id,
      videoId: both.session.videos[0]!.id,
    });
    expect(left.session.videos).toHaveLength(1);
    expect(left.session.videos[0]?.label).toBe("2e heure");
  });

  it("TRACK-001 — une page de lecteur est refusée : elle ne se pilote pas", async () => {
    const { admin, sessionId } = await preparedSheet();
    const sheet = { session: { id: sessionId } };

    // La saisie lit la position au millième sur l'élément vidéo : un cadre
    // YouTube ne le permet pas, et l'accepter donnerait un lecteur muet.
    await expect(
      admin.caller.tracker.addVideo({
        sessionId: sheet.session.id,
        label: "1re heure",
        url: "https://youtu.be/dQw4w9WgXcQ",
      }),
    ).rejects.toThrow(/image par image/i);

    await expect(
      admin.caller.tracker.addVideo({
        sessionId: sheet.session.id,
        label: "1re heure",
        url: "javascript:alert(1)",
      }),
    ).rejects.toThrow();
  });

  it("TRACK-001 — le coup d'envoi retient son enregistrement", async () => {
    const { admin, sessionId } = await preparedSheet();
    const sheet = { session: { id: sessionId } };

    const withVideos = await admin.caller.tracker.addVideo({
      sessionId: sheet.session.id,
      label: "2e heure",
      url: "https://exemple.test/seance/seconde-heure.mp4",
    });
    const videoId = withVideos.session.videos[0]!.id;

    const current = await admin.caller.tracker.get({ sessionId });
    const [teamA, teamB] = current.teams;

    const withMatch = await admin.caller.tracker.addMatch({
      sessionId: sheet.session.id,
      teamAId: teamA!.id,
      teamBId: teamB!.id,
    });
    const matchId = withMatch.matches[0]!.id;

    const started = await admin.caller.tracker.updateMatch({
      matchId,
      status: "playing",
      videoStartMs: 90_000,
      videoId,
    });

    // Sans cet ancrage, rouvrir l'action irait la chercher dans la première
    // heure alors qu'elle a été relevée dans la seconde.
    const match = started.matches.find((row) => row.id === matchId);
    expect(match?.videoStartMs).toBe(90_000);
    expect(match?.videoId).toBe(videoId);
  });
});
