import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  ne,
  sql,
} from "drizzle-orm";
import {
  AppError,
  LIMITS,
  VIDEO_FREE_STORAGE_BYTES,
  VIDEO_UPLOAD,
  parseVideoUrl,
  type SessionVideo,
  type VideoMoment,
  type VideoRole,
  type VideoSessionRow,
  type VideoStorageInfo,
  type VideoUploadTicket,
  gabarit,
} from "@uno/shared";
import { db, type Executor, type Transaction } from "../db/client.js";
import {
  players,
  proposalParticipants,
  proposals,
  sessionVideos,
} from "../db/schema.js";
import { logger } from "../lib/logger.js";
import {
  abortMultipartUpload,
  completeMultipartUpload,
  deleteVideoObject,
  isVideoKeyOf,
  newVideoKey,
  signedVideoUrl,
  startMultipartUpload,
  videoStorageEnabled,
} from "../storage/videos.js";
import { recordAdminEvent } from "./admin-events.service.js";
import { maySupervise } from "./auth.service.js";
import { writeAudit } from "./audit.service.js";
import { notifyPlayer } from "./notifications.service.js";

/**
 * Supervision des sessions (SUP-001, SUP-002).
 *
 * La saisie d'une feuille de match n'est pas une écriture anodine : elle
 * décide des distinctions, verse les récompenses UNO et fait monter ou
 * descendre les joueurs de division. Elle était donc réservée à
 * l'administration. Elle s'ouvre à des **superviseurs** — des joueurs ou des
 * arbitres que l'administration désigne un par un — sans rien perdre de ses
 * garanties.
 */

/** Accorde ou retire le droit de supervision (SUP-001). */
export async function setSupervisor(
  actor: { userId: number },
  params: {
    playerId: number;
    isSupervisor: boolean;
    reason?: string | undefined;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [player] = await tx
      .select({
        isSupervisor: players.isSupervisor,
        displayName: players.displayName,
      })
      .from(players)
      .where(eq(players.id, params.playerId))
      .limit(1);

    if (!player) throw new AppError("NOT_FOUND", "Joueur introuvable.");
    if (player.isSupervisor === params.isSupervisor) return;

    await tx
      .update(players)
      .set({ isSupervisor: params.isSupervisor, updatedAt: new Date() })
      .where(eq(players.id, params.playerId));

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "player.supervisor.update",
      entityType: "player",
      entityId: params.playerId,
      before: { isSupervisor: player.isSupervisor },
      after: {
        isSupervisor: params.isSupervisor,
        reason: params.reason ?? null,
      },
    });

    await recordAdminEvent(
      {
        type: "supervisor.updated",
        body: params.isSupervisor
          ? `${player.displayName} peut désormais saisir les feuilles de match.`
          : `${player.displayName} ne peut plus saisir les feuilles de match.`,
        entityType: "player",
        entityId: params.playerId,
        playerId: params.playerId,
        // L'horodatage distingue deux décisions successives sur le même
        // joueur : retirer puis rendre le droit doit laisser deux traces.
        key: `supervisor:${params.playerId}:${Date.now()}`,
      },
      tx,
    );
  });
}

/** Superviseurs actuels, pour l'écran d'administration. */
export async function listSupervisors(executor: Executor) {
  return executor
    .select({
      id: players.id,
      displayName: players.displayName,
      accountType: players.accountType,
      division: players.division,
    })
    .from(players)
    .where(eq(players.isSupervisor, true))
    .orderBy(asc(players.displayName));
}

// ---------------------------------------------------------------------------
// Vidéos de session (SUP-002)
// ---------------------------------------------------------------------------

/**
 * Qui a le droit de voir les vidéos d'une session.
 *
 * Les participants et leur arbitre : ce sont eux qui sont filmés. Les
 * superviseurs et l'administration : ce sont eux qui saisissent. Personne
 * d'autre — être filmé au futsal n'est pas consentir à une diffusion à toute
 * la ligue.
 */
export async function assertMayWatch(
  executor: Executor,
  actor: { playerId: number; role: "user" | "admin"; isSupervisor: boolean },
  proposalId: number,
): Promise<void> {
  if (maySupervise(actor)) return;

  const [seat] = await executor
    .select({ id: proposalParticipants.id })
    .from(proposalParticipants)
    .where(
      and(
        eq(proposalParticipants.proposalId, proposalId),
        eq(proposalParticipants.playerId, actor.playerId),
      ),
    )
    .limit(1);
  if (seat) return;

  const [refereed] = await executor
    .select({ id: proposals.id })
    .from(proposals)
    .where(
      and(
        eq(proposals.id, proposalId),
        eq(proposals.refereePlayerId, actor.playerId),
      ),
    )
    .limit(1);
  if (refereed) return;

  throw new AppError(
    "FORBIDDEN",
    "Les vidéos d'une session sont réservées à ceux qui y ont joué.",
  );
}

type VideoRow = {
  id: number;
  url: string;
  label: string | null;
  provider: "youtube" | "vimeo" | "other";
  createdAt: Date;
  addedBy: string | null;
  objectKey: string | null;
  role: string | null;
  bytes: number | null;
  moments: unknown;
};

function asRole(value: string | null): VideoRole | null {
  return value === "match" || value === "summary" ? value : null;
}

async function toSessionVideo(row: VideoRow): Promise<SessionVideo> {
  // L'adresse jouable est **recalculée** à la lecture plutôt que stockée :
  // la règle d'intégration peut changer, la base n'a pas à être migrée pour
  // autant, et rien de ce qui a été écrit un jour ne devient exécutable
  // aujourd'hui par simple relecture.
  const parsed = row.objectKey ? null : parseVideoUrl(row.url);

  // Un fichier de la ligue (SUP-004) : l'adresse est signée pour ce lecteur,
  // valable quelques heures. Sans stockage configuré, il n'y a rien à lire.
  let url = row.url;
  if (row.objectKey) {
    url = videoStorageEnabled() ? await signedVideoUrl(row.objectKey) : "";
  }

  return {
    id: row.id,
    url,
    label: row.label,
    provider: row.provider,
    embedUrl: parsed?.embedUrl ?? null,
    addedBy: row.addedBy,
    createdAt: row.createdAt.toISOString(),
    role: asRole(row.role),
    source: row.objectKey ? "file" : "link",
    bytes: row.bytes ?? null,
    moments: Array.isArray(row.moments) ? (row.moments as VideoMoment[]) : [],
  };
}

/**
 * Vidéos d'une session : le résumé d'abord, puis le match complet, puis les
 * autres enregistrements, du plus récent au plus ancien.
 */
export async function listSessionVideos(
  executor: Executor,
  proposalId: number,
): Promise<SessionVideo[]> {
  const rows = await executor
    .select({
      id: sessionVideos.id,
      url: sessionVideos.url,
      label: sessionVideos.label,
      provider: sessionVideos.provider,
      createdAt: sessionVideos.createdAt,
      addedBy: players.displayName,
      objectKey: sessionVideos.objectKey,
      role: sessionVideos.role,
      bytes: sessionVideos.bytes,
      moments: sessionVideos.moments,
    })
    .from(sessionVideos)
    .leftJoin(players, eq(players.id, sessionVideos.addedByPlayerId))
    .where(eq(sessionVideos.proposalId, proposalId))
    .orderBy(desc(sessionVideos.createdAt));

  const rank = (role: string | null) =>
    role === "summary" ? 0 : role === "match" ? 1 : 2;
  const sorted = [...rows].sort((a, b) => rank(a.role) - rank(b.role));
  return Promise.all(sorted.map((row) => toSessionVideo(row)));
}

async function sessionOf(executor: Executor, proposalId: number) {
  const [proposal] = await executor
    .select({
      id: proposals.id,
      localDate: proposals.localDate,
      venueName: proposals.venueName,
      refereePlayerId: proposals.refereePlayerId,
    })
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);
  if (!proposal)
    throw new AppError("NOT_FOUND", "Cette session est introuvable.");
  return proposal;
}

/**
 * Retire la vidéo qui tenait déjà ce rôle (SUP-004) : une séance n'a qu'un
 * match complet et qu'un résumé. Rend la clé de son fichier, à effacer une
 * fois la transaction validée.
 */
async function dropRole(
  tx: Transaction,
  proposalId: number,
  role: VideoRole,
): Promise<string[]> {
  const previous = await tx
    .select({ id: sessionVideos.id, objectKey: sessionVideos.objectKey })
    .from(sessionVideos)
    .where(
      and(
        eq(sessionVideos.proposalId, proposalId),
        eq(sessionVideos.role, role),
      ),
    );
  if (previous.length === 0) return [];
  await tx.delete(sessionVideos).where(
    inArray(
      sessionVideos.id,
      previous.map((row) => row.id),
    ),
  );
  return previous.flatMap((row) => (row.objectKey ? [row.objectKey] : []));
}

async function assertRoomFor(tx: Transaction, proposalId: number) {
  const [existing] = await tx
    .select({ total: count() })
    .from(sessionVideos)
    .where(eq(sessionVideos.proposalId, proposalId));

  if (Number(existing?.total ?? 0) >= LIMITS.videosPerSession) {
    throw new AppError(
      "RULE_VIOLATION",
      gabarit("Une session ne peut pas porter plus de {limite} vidéos.", {
        limite: LIMITS.videosPerSession,
      }),
    );
  }
}

/** Efface des fichiers du stockage, sans faire échouer ce qui a déjà réussi. */
async function forgetObjects(keys: string[]): Promise<void> {
  for (const key of keys) {
    try {
      await deleteVideoObject(key);
    } catch (error) {
      logger.warn({ err: error }, "fichier vidéo non effacé du stockage");
    }
  }
}

/**
 * Prévient les joueurs et l'arbitre que la vidéo du match est en ligne
 * (SUP-004). Une fois par séance : la clé d'évènement le garantit, même si le
 * résumé arrive après le match complet.
 */
export async function announceVideo(proposalId: number): Promise<void> {
  const proposal = await sessionOf(db, proposalId);
  const seats = await db
    .select({ playerId: proposalParticipants.playerId })
    .from(proposalParticipants)
    .where(eq(proposalParticipants.proposalId, proposalId));
  const recipients = new Set(seats.map((row) => row.playerId));
  if (proposal.refereePlayerId) recipients.add(proposal.refereePlayerId);

  for (const playerId of recipients) {
    try {
      await notifyPlayer(
        {
          playerId,
          eventKey: `proposal:${proposalId}:video-online`,
          category: "sessions",
          title: gabarit("La vidéo du match est en ligne"),
          body: gabarit(
            "Séance du {jour} à {salle} : revoyez le match, le résumé et les moments-clés.",
            { jour: { jour: proposal.localDate }, salle: proposal.venueName },
          ),
          url: `/sessions/${proposalId}`,
        },
        db,
      );
    } catch (error) {
      logger.warn({ err: error, playerId }, "vidéo en ligne non notifiée");
    }
  }
}

/**
 * Rattache une vidéo à une session (SUP-002).
 *
 * L'hébergeur est déterminé **par le serveur** à partir de l'adresse : ce
 * n'est pas au client de déclarer qu'un lien est une vidéo YouTube, sans quoi
 * n'importe quelle page pourrait se faire intégrer dans l'application.
 *
 * Avec un rôle (SUP-004), le lien remplace la vidéo qui le tenait, et les
 * joueurs sont prévenus la première fois.
 */
export async function addSessionVideo(
  actor: { playerId: number; userId: number },
  params: {
    proposalId: number;
    url: string;
    label?: string | undefined;
    role?: VideoRole | undefined;
  },
): Promise<SessionVideo[]> {
  const parsed = parseVideoUrl(params.url);
  if (!parsed) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Cette adresse n'est pas exploitable. Collez le lien complet de la vidéo.",
    );
  }

  const replaced: string[] = [];
  const list = await db.transaction(async (tx) => {
    const proposal = await sessionOf(tx, params.proposalId);
    if (params.role) {
      replaced.push(...(await dropRole(tx, params.proposalId, params.role)));
    }
    await assertRoomFor(tx, params.proposalId);

    await tx.insert(sessionVideos).values({
      proposalId: params.proposalId,
      url: params.url.trim(),
      label: params.label?.trim() || null,
      provider: parsed.provider,
      addedByPlayerId: actor.playerId,
      role: params.role ?? null,
    });

    await recordAdminEvent(
      {
        type: "session.video",
        body: `Vidéo ajoutée à la session du ${proposal.localDate} à ${proposal.venueName}.`,
        entityType: "proposal",
        entityId: params.proposalId,
        playerId: actor.playerId,
        key: `proposal:${params.proposalId}:video:${Date.now()}`,
      },
      tx,
    );

    return listSessionVideos(tx as unknown as Transaction, params.proposalId);
  });

  await forgetObjects(replaced);
  if (params.role) await announceVideo(params.proposalId);
  return list;
}

/**
 * Ouvre l'envoi d'un fichier vidéo (SUP-004) : le serveur réserve son nom et
 * signe une adresse par morceau. Les octets vont directement au stockage.
 */
export async function startSessionVideoUpload(params: {
  proposalId: number;
  role: VideoRole;
  bytes: number;
}): Promise<VideoUploadTicket> {
  if (!videoStorageEnabled()) {
    throw new AppError(
      "RULE_VIOLATION",
      "Le stockage des vidéos n'est pas configuré : collez un lien à la place.",
    );
  }
  await sessionOf(db, params.proposalId);
  const key = newVideoKey(params.proposalId, params.role);
  const { uploadId, urls } = await startMultipartUpload(key, params.bytes);
  return { key, uploadId, partBytes: VIDEO_UPLOAD.partBytes, urls };
}

/**
 * Termine l'envoi : le stockage assemble les morceaux, et la vidéo prend son
 * rôle dans la séance, à la place de la précédente.
 */
export async function completeSessionVideoUpload(
  actor: { playerId: number; userId: number },
  params: {
    proposalId: number;
    role: VideoRole;
    key: string;
    uploadId: string;
    parts: { partNumber: number; etag: string }[];
  },
): Promise<SessionVideo[]> {
  // La clé vient du client : elle doit être celle que le serveur a réservée
  // pour cette séance et ce rôle, et rien d'autre.
  if (!isVideoKeyOf(params.key, params.proposalId, params.role)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Cet envoi ne correspond à aucune vidéo.",
    );
  }
  const bytes = await completeMultipartUpload(
    params.key,
    params.uploadId,
    params.parts,
  );

  const replaced: string[] = [];
  const list = await db.transaction(async (tx) => {
    const proposal = await sessionOf(tx, params.proposalId);
    replaced.push(...(await dropRole(tx, params.proposalId, params.role)));
    await assertRoomFor(tx, params.proposalId);
    await tx.insert(sessionVideos).values({
      proposalId: params.proposalId,
      url: "",
      provider: "other",
      addedByPlayerId: actor.playerId,
      objectKey: params.key,
      role: params.role,
      bytes,
    });
    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "session.video.upload",
      entityType: "proposal",
      entityId: params.proposalId,
      before: null,
      after: { role: params.role, bytes },
    });
    await recordAdminEvent(
      {
        type: "session.video",
        body: `Vidéo déposée pour la session du ${proposal.localDate} à ${proposal.venueName}.`,
        entityType: "proposal",
        entityId: params.proposalId,
        playerId: actor.playerId,
        key: `proposal:${params.proposalId}:video:${Date.now()}`,
      },
      tx,
    );
    return listSessionVideos(tx as unknown as Transaction, params.proposalId);
  });

  await forgetObjects(replaced.filter((key) => key !== params.key));
  await announceVideo(params.proposalId);
  return list;
}

/** Abandonne un envoi : le stockage libère les morceaux déjà reçus. */
export async function abortSessionVideoUpload(params: {
  proposalId: number;
  key: string;
  uploadId: string;
}): Promise<void> {
  if (
    !isVideoKeyOf(params.key, params.proposalId, "match") &&
    !isVideoKeyOf(params.key, params.proposalId, "summary")
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Cet envoi ne correspond à aucune vidéo.",
    );
  }
  await abortMultipartUpload(params.key, params.uploadId);
}

/** Les moments-clés d'une vidéo, tels que l'administration les a corrigés. */
export async function setSessionVideoMoments(
  actor: { userId: number },
  params: { proposalId: number; videoId: number; moments: VideoMoment[] },
): Promise<SessionVideo[]> {
  return db.transaction(async (tx) => {
    const moments = [...params.moments].sort((a, b) => a.t - b.t);
    const updated = await tx
      .update(sessionVideos)
      .set({ moments })
      .where(
        and(
          eq(sessionVideos.id, params.videoId),
          eq(sessionVideos.proposalId, params.proposalId),
        ),
      );
    if (Number(updated[0].affectedRows ?? 0) === 0) {
      throw new AppError("NOT_FOUND", "Cette vidéo n'existe plus.");
    }
    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "session.video.moments",
      entityType: "proposal",
      entityId: params.proposalId,
      before: null,
      after: { videoId: params.videoId, moments: moments.length },
    });
    return listSessionVideos(tx as unknown as Transaction, params.proposalId);
  });
}

/**
 * Les séances jouées des quarante derniers jours et leurs vidéos, pour
 * l'onglet Sessions : la vidéo arrive souvent après la saisie des
 * résultats, quand la séance a quitté la file.
 */
export async function videoSessions(
  now = new Date(),
): Promise<VideoSessionRow[]> {
  const since = new Date(now.getTime() - 40 * 24 * 3600 * 1000);
  const rows = await db
    .select({
      proposalId: proposals.id,
      localDate: proposals.localDate,
      localTimeLabel: proposals.localTimeLabel,
      venueName: proposals.venueName,
      modeId: proposals.modeId,
      status: proposals.status,
    })
    .from(proposals)
    .where(
      and(
        inArray(proposals.status, ["session", "completed"]),
        lte(proposals.startsAtUtc, now),
        gte(proposals.startsAtUtc, since),
        ne(proposals.modeId, "custom"),
      ),
    )
    .orderBy(desc(proposals.startsAtUtc))
    .limit(40);
  if (rows.length === 0) return [];

  // Les vidéos de ces séances, comptées à part : une sous-requête corrélée
  // dépendrait de la façon dont l'ORM nomme les colonnes.
  const videos = await db
    .select({ proposalId: sessionVideos.proposalId, role: sessionVideos.role })
    .from(sessionVideos)
    .where(
      inArray(
        sessionVideos.proposalId,
        rows.map((row) => row.proposalId),
      ),
    );

  return rows.map((row) => {
    const mine = videos.filter((v) => v.proposalId === row.proposalId);
    return {
      ...row,
      videos: mine.length,
      hasMatch: mine.some((v) => v.role === "match"),
      hasSummary: mine.some((v) => v.role === "summary"),
    };
  });
}

/** L'espace occupé par les fichiers vidéo, face à l'espace gratuit. */
export async function videoStorageInfo(): Promise<VideoStorageInfo> {
  const [row] = await db
    .select({ used: sql<number>`COALESCE(SUM(${sessionVideos.bytes}), 0)` })
    .from(sessionVideos)
    .where(isNotNull(sessionVideos.objectKey));
  return {
    enabled: videoStorageEnabled(),
    usedBytes: Number(row?.used ?? 0),
    freeBytes: VIDEO_FREE_STORAGE_BYTES,
  };
}

/** Détache une vidéo d'une session, et efface son fichier s'il en a un. */
export async function removeSessionVideo(
  actor: { userId: number },
  params: { proposalId: number; videoId: number },
): Promise<SessionVideo[]> {
  const [target] = await db
    .select({ objectKey: sessionVideos.objectKey })
    .from(sessionVideos)
    .where(
      and(
        eq(sessionVideos.id, params.videoId),
        eq(sessionVideos.proposalId, params.proposalId),
      ),
    )
    .limit(1);

  const list = await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(sessionVideos)
      .where(
        and(
          eq(sessionVideos.id, params.videoId),
          eq(sessionVideos.proposalId, params.proposalId),
        ),
      );

    if (Number(deleted[0].affectedRows ?? 0) === 0) {
      throw new AppError("NOT_FOUND", "Cette vidéo n'existe plus.");
    }

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "session.video.delete",
      entityType: "proposal",
      entityId: params.proposalId,
      before: { videoId: params.videoId },
      after: null,
    });

    return listSessionVideos(tx as unknown as Transaction, params.proposalId);
  });

  if (target?.objectKey) await forgetObjects([target.objectKey]);
  return list;
}
