import { and, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import {
  AppError,
  MODERATION_LIMITS,
  type BlockedPlayerView,
  type ContentReportView,
  type ReportContentInput,
  type ReportKind,
  type ReportReason,
  type ReportStatus,
} from "@uno/shared";
import { db, type Executor } from "../db/client.js";
import {
  contentReports,
  playerBlocks,
  players,
  productReviews,
  squadMessages,
} from "../db/schema.js";
import { isDuplicateKeyError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { writeAudit } from "./audit.service.js";
import { pushToAdmins } from "./push.service.js";

/**
 * Signaler, bloquer, et traiter les signalements (MOD-001).
 *
 * Ce que les stores exigent d'une application où les joueurs écrivent pour
 * les autres (App Store Review Guidelines 1.2), et ce qu'une ligue doit de
 * toute façon à ses membres : un moyen de dire « ceci n'a rien à faire ici »,
 * quelqu'un pour l'entendre vite, et un moyen de ne plus voir celui qui
 * dérange sans attendre personne.
 */

/** Le contenu visé : son auteur et ce qu'il disait au moment du signalement. */
async function resolveTarget(
  executor: Executor,
  kind: ReportKind,
  targetId: number,
): Promise<{ authorId: number; excerpt: string | null }> {
  if (kind === "message") {
    const [row] = await executor
      .select({ authorId: squadMessages.playerId, body: squadMessages.body })
      .from(squadMessages)
      .where(eq(squadMessages.id, targetId))
      .limit(1);
    if (!row) throw new AppError("NOT_FOUND", "Ce message est introuvable.");
    return { authorId: row.authorId, excerpt: row.body };
  }

  if (kind === "review") {
    const [row] = await executor
      .select({
        authorId: productReviews.playerId,
        comment: productReviews.comment,
      })
      .from(productReviews)
      .where(eq(productReviews.id, targetId))
      .limit(1);
    if (!row) throw new AppError("NOT_FOUND", "Cet avis est introuvable.");
    return { authorId: row.authorId, excerpt: row.comment };
  }

  const [row] = await executor
    .select({ id: players.id })
    .from(players)
    .where(eq(players.id, targetId))
    .limit(1);
  if (!row) throw new AppError("NOT_FOUND", "Ce joueur est introuvable.");
  return { authorId: row.id, excerpt: null };
}

/**
 * Signale un contenu à l'administration.
 *
 * Signaler deux fois la même chose ne crée pas deux lignes : la réponse est
 * la même, la file de l'administration ne double pas. L'administration est
 * prévenue par push — sans le contenu lui-même, qui reste dans l'application
 * (SEC-007).
 */
export async function reportContent(
  actor: { playerId: number },
  input: ReportContentInput,
): Promise<{ reported: true }> {
  const target = await resolveTarget(db, input.kind, input.targetId);

  if (target.authorId === actor.playerId) {
    throw new AppError(
      "RULE_VIOLATION",
      "Impossible de signaler son propre contenu : il suffit de le retirer.",
    );
  }

  try {
    await db.insert(contentReports).values({
      reporterPlayerId: actor.playerId,
      kind: input.kind,
      targetId: input.targetId,
      reportedPlayerId: target.authorId,
      reason: input.reason,
      details: input.details?.trim() || null,
      excerpt: target.excerpt?.slice(0, MODERATION_LIMITS.excerptMax) ?? null,
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) return { reported: true };
    throw error;
  }

  void pushToAdmins(db, {
    title: "Contenu signalé",
    body: "Un signalement attend d'être examiné dans l'administration.",
    url: "/admin/moderation",
    tag: "moderation",
  }).catch((error: unknown) => {
    logger.warn({ err: error }, "push de signalement non envoyé");
  });

  return { reported: true };
}

/** Les joueurs que ce joueur a bloqués. */
export async function blockedIds(
  executor: Executor,
  playerId: number,
): Promise<Set<number>> {
  const rows = await executor
    .select({ id: playerBlocks.blockedPlayerId })
    .from(playerBlocks)
    .where(eq(playerBlocks.blockerPlayerId, playerId));
  return new Set(rows.map((row) => row.id));
}

/** Les joueurs qui ont bloqué ce joueur : il ne peut plus les inviter. */
export async function blockerIds(
  executor: Executor,
  playerId: number,
): Promise<Set<number>> {
  const rows = await executor
    .select({ id: playerBlocks.blockerPlayerId })
    .from(playerBlocks)
    .where(eq(playerBlocks.blockedPlayerId, playerId));
  return new Set(rows.map((row) => row.id));
}

export async function blockPlayer(
  actor: { playerId: number },
  playerId: number,
): Promise<{ blocked: true }> {
  if (playerId === actor.playerId) {
    throw new AppError("RULE_VIOLATION", "Impossible de se bloquer soi-même.");
  }

  const [target] = await db
    .select({ id: players.id })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);
  if (!target) throw new AppError("NOT_FOUND", "Ce joueur est introuvable.");

  try {
    await db
      .insert(playerBlocks)
      .values({ blockerPlayerId: actor.playerId, blockedPlayerId: playerId });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }
  return { blocked: true };
}

export async function unblockPlayer(
  actor: { playerId: number },
  playerId: number,
): Promise<{ unblocked: boolean }> {
  const result = await db
    .delete(playerBlocks)
    .where(
      and(
        eq(playerBlocks.blockerPlayerId, actor.playerId),
        eq(playerBlocks.blockedPlayerId, playerId),
      ),
    );
  return { unblocked: Number(result[0].affectedRows ?? 0) > 0 };
}

export async function listBlocked(
  playerId: number,
): Promise<BlockedPlayerView[]> {
  const rows = await db
    .select({
      playerId: players.id,
      displayName: players.displayName,
      profilePhotoUrl: players.profilePhotoUrl,
      blockedAt: playerBlocks.createdAt,
    })
    .from(playerBlocks)
    .innerJoin(players, eq(players.id, playerBlocks.blockedPlayerId))
    .where(eq(playerBlocks.blockerPlayerId, playerId))
    .orderBy(desc(playerBlocks.createdAt));

  return rows.map((row) => ({
    ...row,
    blockedAt: row.blockedAt.toISOString(),
  }));
}

// --- Administration ---------------------------------------------------------

const reporters = alias(players, "reporters");
const reported = alias(players, "reported");

export async function listReports(params: {
  status: ReportStatus | "all";
  limit: number;
}): Promise<ContentReportView[]> {
  const rows = await db
    .select({
      report: contentReports,
      reporterName: reporters.displayName,
      reportedName: reported.displayName,
    })
    .from(contentReports)
    .leftJoin(reporters, eq(reporters.id, contentReports.reporterPlayerId))
    .leftJoin(reported, eq(reported.id, contentReports.reportedPlayerId))
    .where(
      params.status === "all"
        ? undefined
        : eq(contentReports.status, params.status),
    )
    .orderBy(desc(contentReports.createdAt))
    .limit(params.limit);

  return rows.map(({ report, reporterName, reportedName }) => ({
    id: report.id,
    kind: report.kind as ReportKind,
    targetId: report.targetId,
    reason: report.reason as ReportReason,
    details: report.details,
    excerpt: report.excerpt,
    status: report.status as ReportStatus,
    reporter:
      reporterName === null
        ? null
        : { playerId: report.reporterPlayerId, displayName: reporterName },
    reported:
      report.reportedPlayerId === null || reportedName === null
        ? null
        : { playerId: report.reportedPlayerId, displayName: reportedName },
    createdAt: report.createdAt.toISOString(),
    resolvedAt: report.resolvedAt?.toISOString() ?? null,
  }));
}

/**
 * Tranche un signalement.
 *
 * `remove` retire le contenu — message ou avis — et clôt **tous** les
 * signalements qui le visaient : dix joueurs choqués par le même message
 * n'appellent qu'une décision. Un joueur signalé ne se « retire » pas ici :
 * son compte se traite depuis sa fiche, avec les garde-fous de la
 * suppression de compte. `dismiss` classe sans suite.
 */
export async function resolveReport(
  admin: { playerId: number; userId: number },
  reportId: number,
  action: "remove" | "dismiss",
): Promise<{ resolved: number }> {
  return db.transaction(async (tx) => {
    const [report] = await tx
      .select()
      .from(contentReports)
      .where(eq(contentReports.id, reportId))
      .limit(1);
    if (!report) {
      throw new AppError("NOT_FOUND", "Ce signalement est introuvable.");
    }

    const kind = report.kind as ReportKind;
    if (action === "remove") {
      if (kind === "message") {
        await tx
          .delete(squadMessages)
          .where(eq(squadMessages.id, report.targetId));
      } else if (kind === "review") {
        await tx
          .delete(productReviews)
          .where(eq(productReviews.id, report.targetId));
      } else {
        throw new AppError(
          "RULE_VIOLATION",
          "Un joueur ne se retire pas d'ici : son compte se traite depuis sa fiche.",
        );
      }
    }

    const siblings = await tx
      .select({ id: contentReports.id })
      .from(contentReports)
      .where(
        and(
          eq(contentReports.kind, report.kind),
          eq(contentReports.targetId, report.targetId),
          eq(contentReports.status, "open"),
        ),
      );
    const ids = action === "remove" ? siblings.map((row) => row.id) : [];
    if (!ids.includes(report.id)) ids.push(report.id);

    await tx
      .update(contentReports)
      .set({
        status: action === "remove" ? "removed" : "dismissed",
        resolvedAt: new Date(),
        resolvedByPlayerId: admin.playerId,
      })
      .where(inArray(contentReports.id, ids));

    await writeAudit(tx, {
      actorUserId: admin.userId,
      action: action === "remove" ? "moderation.remove" : "moderation.dismiss",
      entityType: "content_report",
      entityId: report.id,
    });

    return { resolved: ids.length };
  });
}
