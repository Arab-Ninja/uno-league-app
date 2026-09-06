import { eq } from "drizzle-orm";
import { AppError, announcementIdSchema, paginationSchema } from "@uno/shared";
import { db } from "../../db/client.js";
import { players } from "../../db/schema.js";
import {
  countUnread,
  getAnnouncement,
  listAnnouncements,
  markAsRead,
} from "../../services/announcements.service.js";
import { protectedProcedure, router } from "../init.js";

async function viewerDivision(playerId: number) {
  const [player] = await db
    .select({ division: players.division })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);
  if (!player) throw new AppError("NOT_FOUND", "Profil introuvable.");
  return player.division;
}

export const announcementsRouter = router({
  list: protectedProcedure
    .input(paginationSchema)
    .query(async ({ ctx, input }) =>
      listAnnouncements(db, {
        playerId: ctx.identity.playerId,
        division: await viewerDivision(ctx.identity.playerId),
        limit: input.limit,
        cursor: input.cursor ?? null,
      }),
    ),

  unreadCount: protectedProcedure.query(async ({ ctx }) =>
    countUnread(db, {
      playerId: ctx.identity.playerId,
      division: await viewerDivision(ctx.identity.playerId),
    }),
  ),

  /** Ouvre une annonce et la marque comme lue (ANN-002). */
  get: protectedProcedure
    .input(announcementIdSchema)
    .mutation(async ({ ctx, input }) => {
      const announcement = await getAnnouncement(db, {
        playerId: ctx.identity.playerId,
        division: await viewerDivision(ctx.identity.playerId),
        announcementId: input.announcementId,
      });
      await markAsRead({
        playerId: ctx.identity.playerId,
        announcementId: input.announcementId,
      });
      return announcement;
    }),
});
