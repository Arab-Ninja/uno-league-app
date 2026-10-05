import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";
import {
  AppError,
  gabarit,
  type AnnouncementInput,
  type AnnouncementUpdateInput,
  type AnnouncementView,
  type Division,
} from "@uno/shared";
import { db, type Executor } from "../db/client.js";
import {
  announcementReads,
  announcements,
  players,
  users,
} from "../db/schema.js";
import { logger } from "../lib/logger.js";
import { writeAudit } from "./audit.service.js";
import { notifyPlayer } from "./notifications.service.js";

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
    or(
      isNull(announcements.expiresAt),
      gt(announcements.expiresAt, new Date()),
    ),
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
  params: {
    playerId: number;
    division: Division | null;
    limit: number;
    cursor?: number | null;
  },
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
      images: row.images ?? [],
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
export async function markAsRead(params: {
  playerId: number;
  announcementId: number;
}): Promise<void> {
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
  params: {
    playerId: number;
    division: Division | null;
    announcementId: number;
  },
): Promise<AnnouncementView> {
  const [row] = await executor
    .select()
    .from(announcements)
    .where(
      and(
        eq(announcements.id, params.announcementId),
        visibilityCondition(params.division),
      ),
    )
    .limit(1);

  if (!row) throw new AppError("NOT_FOUND", "Cette annonce est introuvable.");

  return {
    id: row.id,
    type: row.type,
    title: row.title,
    content: row.content,
    images: row.images ?? [],
    publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    read: true,
  };
}

export async function createAnnouncement(
  actor: { userId: number },
  input: AnnouncementInput,
): Promise<number> {
  const announcementId = await db.transaction(async (tx) => {
    const inserted = await tx.insert(announcements).values({
      type: input.type,
      title: input.title,
      content: input.content,
      images: input.images,
      status: input.publishNow ? "published" : "draft",
      publishedAt: input.publishNow ? new Date() : null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      targetDivision: input.targetDivision ?? null,
      createdByUserId: actor.userId,
    });

    const id = Number(inserted[0].insertId);

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "announcement.publish",
      entityType: "announcement",
      entityId: id,
      after: {
        type: input.type,
        title: input.title,
        images: input.images.length,
        published: input.publishNow,
      },
    });

    return id;
  });

  // Après la transaction : prévenir n'a rien à faire sous un verrou, et un
  // envoi raté ne doit pas défaire la publication.
  if (input.publishNow) {
    await notifyAnnouncement(announcementId, {
      title: input.title,
      targetDivision: input.targetDivision ?? null,
    });
  }

  return announcementId;
}

/**
 * Prévient les joueurs concernés d'une annonce publiée (ANN-005).
 *
 * Notification dans l'application et push, pour chaque compte actif que
 * l'annonce vise : toute la ligue, ou la seule division ciblée — la même
 * règle que l'affichage. La clé `announcement:{id}` rend l'envoi rejouable
 * sans doublon. Pas de courrier de repli : ce serait un envoi de masse.
 */
export async function notifyAnnouncement(
  announcementId: number,
  announcement: { title: string; targetDivision: Division | null },
): Promise<number> {
  const recipients = await db
    .select({ playerId: players.id })
    .from(players)
    .innerJoin(users, eq(users.id, players.userId))
    .where(
      and(
        eq(users.status, "active"),
        announcement.targetDivision === null
          ? undefined
          : eq(players.division, announcement.targetDivision),
      ),
    );

  for (const { playerId } of recipients) {
    try {
      await notifyPlayer(
        {
          playerId,
          eventKey: `announcement:${announcementId}`,
          title: gabarit("Nouvelle annonce"),
          // Le titre écrit par l'administration passe tel quel.
          body: announcement.title,
          url: `/annonces?id=${announcementId}`,
          emailFallback: false,
        },
        db,
      );
    } catch (error) {
      logger.warn({ err: error, playerId }, "annonce non notifiée");
    }
  }
  return recipients.length;
}

// ---------------------------------------------------------------------------
// Administration (ANN-005)
// ---------------------------------------------------------------------------

export interface AdminAnnouncementView {
  id: number;
  title: string;
  content: string;
  images: string[];
  status: "draft" | "published" | "expired" | "archived";
  targetDivision: Division | null;
  publishedAt: string | null;
  /** Joueurs qui l'ont ouverte. */
  readCount: number;
}

/** Les annonces de la ligue, retirées exceptées, de la plus récente à la plus ancienne. */
export async function listAllAnnouncements(): Promise<AdminAnnouncementView[]> {
  const rows = await db
    .select({
      id: announcements.id,
      title: announcements.title,
      content: announcements.content,
      images: announcements.images,
      status: announcements.status,
      targetDivision: announcements.targetDivision,
      publishedAt: announcements.publishedAt,
      createdAt: announcements.createdAt,
      readCount: sql<number>`(
        SELECT COUNT(*) FROM announcement_reads r
        WHERE r.announcement_id = ${announcements.id}
      )`,
    })
    .from(announcements)
    .where(ne(announcements.status, "archived"))
    .orderBy(desc(announcements.createdAt), desc(announcements.id))
    .limit(200);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    images: row.images ?? [],
    status: row.status,
    targetDivision: row.targetDivision,
    publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
    readCount: Number(row.readCount ?? 0),
  }));
}

/**
 * Corrige une annonce : titre, texte, images.
 *
 * Sans nouvelle notification — une faute de frappe corrigée ne mérite pas de
 * refaire sonner tous les téléphones.
 */
export async function updateAnnouncement(
  actor: { userId: number },
  input: AnnouncementUpdateInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select({ title: announcements.title, status: announcements.status })
      .from(announcements)
      .where(eq(announcements.id, input.announcementId))
      .limit(1);
    if (!before || before.status === "archived") {
      throw new AppError("NOT_FOUND", "Cette annonce est introuvable.");
    }

    await tx
      .update(announcements)
      .set({
        title: input.title,
        content: input.content,
        images: input.images,
        updatedAt: new Date(),
      })
      .where(eq(announcements.id, input.announcementId));

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "announcement.update",
      entityType: "announcement",
      entityId: input.announcementId,
      before: { title: before.title },
      after: { title: input.title, images: input.images.length },
    });
  });
}

/** Retire une annonce : elle disparaît de l'application, la trace reste. */
export async function archiveAnnouncement(
  actor: { userId: number },
  announcementId: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ title: announcements.title, status: announcements.status })
      .from(announcements)
      .where(eq(announcements.id, announcementId))
      .limit(1);
    if (!row || row.status === "archived") {
      throw new AppError("NOT_FOUND", "Cette annonce est introuvable.");
    }

    await tx
      .update(announcements)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(announcements.id, announcementId));

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "announcement.archive",
      entityType: "announcement",
      entityId: announcementId,
      before: { title: row.title, status: row.status },
    });
  });
}
