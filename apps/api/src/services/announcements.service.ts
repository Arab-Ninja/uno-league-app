import { and, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import {
  AppError,
  type AnnouncementInput,
  type AnnouncementView,
  type Division,
} from "@uno/shared";
import { db, type Executor } from "../db/client.js";
import { announcementReads, announcements } from "../db/schema.js";
import { writeAudit } from "./audit.service.js";

/**
 * Annonces (CDC §14).
 *
 * Une annonce est visible si elle est publiée, non expirée, et ciblée sur la
 * division du joueur (ou sur aucune division). L'état lu/non-lu est propre à
 * chaque joueur.
 *
 * Sans division — un arbitre n'en a pas (ROLE-003) — restent les annonces
 * adressées à toute la ligue. Une annonce visant la D2 ne le concerne pas :
 * il n'y joue pas.
 */

function visibilityCondition(division: Division | null) {
  return and(
    eq(announcements.status, "published"),
    or(isNull(announcements.expiresAt), gt(announcements.expiresAt, new Date())),
    division === null
      ? isNull(announcements.targetDivision)
      : or(
          isNull(announcements.targetDivision),
          eq(announcements.targetDivision, division),
        ),
    or(isNull(announcements.targetRole), eq(announcements.targetRole, "user")),
  );
}

export async function listAnnouncements(
  executor: Executor,
  params: { playerId: number; division: Division | null; limit: number; cursor?: number | null },
): Promise<{ items: AnnouncementView[]; nextCursor: number | null }> {
  const base = visibilityCondition(params.division);
  const where = params.cursor
    ? and(base, lt(announcements.id, params.cursor))
    : base;

  const rows = await executor
    .select()
    .from(announcements)
    .where(where)
    .orderBy(desc(announcements.publishedAt), desc(announcements.id))
    .limit(params.limit + 1);

  const hasMore = rows.length > params.limit;
  const page = hasMore ? rows.slice(0, params.limit) : rows;

  const reads = page.length
    ? await executor
        .select({ announcementId: announcementReads.announcementId })
        .from(announcementReads)
        .where(
          and(
            eq(announcementReads.playerId, params.playerId),
            inArray(
              announcementReads.announcementId,
              page.map((row) => row.id),
            ),
          ),
        )
    : [];

  const readSet = new Set(reads.map((row) => row.announcementId));

  return {
    items: page.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      content: row.content,
      publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      read: readSet.has(row.id),
    })),
    nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
  };
}

/** Nombre d'annonces non lues, pour la pastille de notification. */
export async function countUnread(
  executor: Executor,
  params: { playerId: number; division: Division | null },
): Promise<number> {
  const [row] = await executor
    .select({ total: sql<number>`COUNT(*)` })
    .from(announcements)
    .where(
      and(
        visibilityCondition(params.division),
        sql`NOT EXISTS (
          SELECT 1 FROM announcement_reads r
          WHERE r.announcement_id = ${announcements.id}
            AND r.player_id = ${params.playerId}
        )`,
      ),
    );
  return Number(row?.total ?? 0);
}

/** Marque une annonce comme lue (ANN-002). Idempotent. */
export async function markAsRead(
  params: { playerId: number; announcementId: number },
): Promise<void> {
  await db
    .insert(announcementReads)
    .values({
      announcementId: params.announcementId,
      playerId: params.playerId,
    })
    .onDuplicateKeyUpdate({ set: { readAt: new Date() } });
}

export async function getAnnouncement(
  executor: Executor,
  params: { playerId: number; division: Division | null; announcementId: number },
): Promise<AnnouncementView> {
  const [row] = await executor
    .select()
    .from(announcements)
    .where(
      and(eq(announcements.id, params.announcementId), visibilityCondition(params.division)),
    )
    .limit(1);

  if (!row) throw new AppError("NOT_FOUND", "Cette annonce est introuvable.");

  return {
    id: row.id,
    type: row.type,
    title: row.title,
    content: row.content,
    publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    read: true,
  };
}

export async function createAnnouncement(
  actor: { userId: number },
  input: AnnouncementInput,
): Promise<number> {
  return db.transaction(async (tx) => {
    const inserted = await tx.insert(announcements).values({
      type: input.type,
      title: input.title,
      content: input.content,
      status: input.publishNow ? "published" : "draft",
      publishedAt: input.publishNow ? new Date() : null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      targetDivision: input.targetDivision ?? null,
      createdByUserId: actor.userId,
    });

    const announcementId = Number(inserted[0].insertId);

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "announcement.publish",
      entityType: "announcement",
      entityId: announcementId,
      after: { type: input.type, title: input.title, published: input.publishNow },
    });

    return announcementId;
  });
}
