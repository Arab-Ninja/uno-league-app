import { and, asc, count, desc, eq } from "drizzle-orm";
import {
  AppError,
  LIMITS,
  parseVideoUrl,
  type SessionVideo,
} from "@uno/shared";
import { db, type Executor, type Transaction } from "../db/client.js";
import {
  players,
  proposalParticipants,
  proposals,
  sessionVideos,
} from "../db/schema.js";
import { recordAdminEvent } from "./admin-events.service.js";
import { maySupervise } from "./auth.service.js";
import { writeAudit } from "./audit.service.js";

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

/**
 * Un superviseur ne saisit jamais une session qu'il a jouée.
 *
 * Il y déciderait de sa propre montée en division, de son homme du match et
 * de ses propres UNO. Ce n'est pas une question de confiance : c'est une
 * position qu'on ne met pas quelqu'un dans, et une suspicion qu'on n'inflige
 * pas au reste de la ligue.
 *
 * L'administration échappe à la règle : c'est elle qui arbitre les litiges,
 * et lui interdire la saisie d'une session qu'elle a jouée reviendrait à
 * bloquer une ligue où l'organisateur joue aussi.
 */
export async function assertMaySupervise(
  executor: Executor,
  actor: { playerId: number; role: "user" | "admin" },
  proposalId: number,
): Promise<void> {
  if (actor.role === "admin") return;

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

  if (seat) {
    throw new AppError(
      "RULE_VIOLATION",
      "Vous avez joué cette session : sa saisie revient à un autre superviseur.",
    );
  }

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

  if (refereed) {
    throw new AppError(
      "RULE_VIOLATION",
      "Vous avez arbitré cette session : sa saisie revient à un autre superviseur.",
    );
  }
}

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

function toSessionVideo(row: {
  id: number;
  url: string;
  label: string | null;
  provider: "youtube" | "vimeo" | "other";
  createdAt: Date;
  addedBy: string | null;
}): SessionVideo {
  // L'adresse jouable est **recalculée** à la lecture plutôt que stockée :
  // la règle d'intégration peut changer, la base n'a pas à être migrée pour
  // autant, et rien de ce qui a été écrit un jour ne devient exécutable
  // aujourd'hui par simple relecture.
  const parsed = parseVideoUrl(row.url);

  return {
    id: row.id,
    url: row.url,
    label: row.label,
    provider: row.provider,
    embedUrl: parsed?.embedUrl ?? null,
    addedBy: row.addedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Vidéos d'une session, de la plus récente à la plus ancienne. */
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
    })
    .from(sessionVideos)
    .leftJoin(players, eq(players.id, sessionVideos.addedByPlayerId))
    .where(eq(sessionVideos.proposalId, proposalId))
    .orderBy(desc(sessionVideos.createdAt));

  return rows.map(toSessionVideo);
}

/**
 * Rattache une vidéo à une session (SUP-002).
 *
 * L'hébergeur est déterminé **par le serveur** à partir de l'adresse : ce
 * n'est pas au client de déclarer qu'un lien est une vidéo YouTube, sans quoi
 * n'importe quelle page pourrait se faire intégrer dans l'application.
 */
export async function addSessionVideo(
  actor: { playerId: number; userId: number },
  params: { proposalId: number; url: string; label?: string | undefined },
): Promise<SessionVideo[]> {
  const parsed = parseVideoUrl(params.url);
  if (!parsed) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Cette adresse n'est pas exploitable. Collez le lien complet de la vidéo.",
    );
  }

  return db.transaction(async (tx) => {
    const [proposal] = await tx
      .select({
        id: proposals.id,
        localDate: proposals.localDate,
        venueName: proposals.venueName,
      })
      .from(proposals)
      .where(eq(proposals.id, params.proposalId))
      .limit(1);
    if (!proposal)
      throw new AppError("NOT_FOUND", "Cette session est introuvable.");

    const [existing] = await tx
      .select({ total: count() })
      .from(sessionVideos)
      .where(eq(sessionVideos.proposalId, params.proposalId));

    if (Number(existing?.total ?? 0) >= LIMITS.videosPerSession) {
      throw new AppError(
        "RULE_VIOLATION",
        `Une session ne peut pas porter plus de ${LIMITS.videosPerSession} vidéos.`,
      );
    }

    await tx.insert(sessionVideos).values({
      proposalId: params.proposalId,
      url: params.url.trim(),
      label: params.label?.trim() || null,
      provider: parsed.provider,
      addedByPlayerId: actor.playerId,
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
}

/** Détache une vidéo d'une session. */
export async function removeSessionVideo(
  actor: { userId: number },
  params: { proposalId: number; videoId: number },
): Promise<SessionVideo[]> {
  return db.transaction(async (tx) => {
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
}
