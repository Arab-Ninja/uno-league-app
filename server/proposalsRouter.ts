import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { proposals, proposalParticipants } from "../drizzle/schema";

export const proposalsRouter = router({
  /** List proposals filtered by location, mode and status. */
  list: publicProcedure
    .input(
      z.object({
        locationId: z.string(),
        modeId: z.string(),
        status: z.enum(["proposition", "reservation", "session"]),
      }),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const rows = await db
        .select()
        .from(proposals)
        .where(
          and(
            eq(proposals.locationId, input.locationId),
            eq(proposals.modeId, input.modeId),
            eq(proposals.status, input.status),
          ),
        );

      // For each proposal, fetch its participants
      const result = await Promise.all(
        rows.map(async (p) => {
          const parts = await db
            .select()
            .from(proposalParticipants)
            .where(eq(proposalParticipants.proposalId, p.id));
          return { ...p, participants: parts };
        }),
      );

      return result;
    }),

  /** Create a new proposal. */
  create: publicProcedure
    .input(
      z.object({
        date: z.string(), // ISO date string
        time: z.string(),
        locationId: z.string(),
        locationName: z.string(),
        locationColor: z.string().default("#334155"),
        modeId: z.string(),
        modeName: z.string(),
        minParticipants: z.number(),
        price: z.number(),
        rewards: z.string(),
        creatorOpenId: z.string(),
        creatorName: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [inserted] = await db.insert(proposals).values({
        date: new Date(input.date),
        time: input.time,
        locationId: input.locationId,
        locationName: input.locationName,
        locationColor: input.locationColor,
        modeId: input.modeId,
        modeName: input.modeName,
        minParticipants: input.minParticipants,
        price: input.price,
        rewards: input.rewards,
        status: "proposition",
        createdByOpenId: input.creatorOpenId,
      });

      // Drizzle MySQL insert result shape: [ResultSetHeader, ...]
      const proposalId = (inserted as unknown as [{ insertId: number }])[0].insertId;

      // Add creator as first participant
      await db.insert(proposalParticipants).values({
        proposalId,
        playerOpenId: input.creatorOpenId,
        playerName: input.creatorName,
      });

      return { id: proposalId };
    }),

  /** Join a proposal. Auto-advances status when full. */
  join: publicProcedure
    .input(
      z.object({
        proposalId: z.number(),
        playerOpenId: z.string(),
        playerName: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Check already joined
      const existing = await db
        .select()
        .from(proposalParticipants)
        .where(
          and(
            eq(proposalParticipants.proposalId, input.proposalId),
            eq(proposalParticipants.playerOpenId, input.playerOpenId),
          ),
        );
      if (existing.length > 0) return { alreadyJoined: true };

      await db.insert(proposalParticipants).values({
        proposalId: input.proposalId,
        playerOpenId: input.playerOpenId,
        playerName: input.playerName,
      });

      // Count participants and check if full
      const [proposal] = await db
        .select()
        .from(proposals)
        .where(eq(proposals.id, input.proposalId));
      const participants = await db
        .select()
        .from(proposalParticipants)
        .where(eq(proposalParticipants.proposalId, input.proposalId));

      if (proposal && participants.length >= proposal.minParticipants) {
        await db
          .update(proposals)
          .set({ status: "reservation" })
          .where(eq(proposals.id, input.proposalId));
        return { alreadyJoined: false, newStatus: "reservation" };
      }

      return { alreadyJoined: false, newStatus: "proposition" };
    }),

  /** Leave a proposal. Auto-deletes when 0 participants remain. */
  leave: publicProcedure
    .input(
      z.object({
        proposalId: z.number(),
        playerOpenId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db
        .delete(proposalParticipants)
        .where(
          and(
            eq(proposalParticipants.proposalId, input.proposalId),
            eq(proposalParticipants.playerOpenId, input.playerOpenId),
          ),
        );

      const remaining = await db
        .select()
        .from(proposalParticipants)
        .where(eq(proposalParticipants.proposalId, input.proposalId));

      if (remaining.length === 0) {
        // Auto-delete the proposal
        await db.delete(proposals).where(eq(proposals.id, input.proposalId));
        return { deleted: true };
      }

      // Downgrade to proposition if it was a reservation
      await db
        .update(proposals)
        .set({ status: "proposition" })
        .where(eq(proposals.id, input.proposalId));

      return { deleted: false };
    }),
});
