import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { proposals, proposalParticipants } from "../drizzle/schema";

export const proposalsRouter = router({
  /** List proposals filtered by location, mode, division and status. */
  list: publicProcedure
    .input(
      z.object({
        locationId: z.string(),
        modeId: z.string(),
        status: z.enum(["proposition", "reservation", "session"]),
        division: z.enum(["D1", "D2", "D3"]).optional(),
      }),
    )
    .query(({ input }) => {
      const db = getDb();

      const conditions = [
        eq(proposals.locationId, input.locationId),
        eq(proposals.modeId, input.modeId),
        eq(proposals.status, input.status),
      ];
      if (input.division) {
        conditions.push(eq(proposals.division, input.division));
      }

      const rows = db
        .select()
        .from(proposals)
        .where(and(...conditions))
        .all();

      // For each proposal, fetch its participants (SQLite is synchronous)
      return rows.map((p) => {
        const parts = db
          .select()
          .from(proposalParticipants)
          .where(eq(proposalParticipants.proposalId, p.id))
          .all();
        return { ...p, participants: parts };
      });
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
        division: z.enum(["D1", "D2", "D3"]).default("D3"),
        creatorOpenId: z.string(),
        creatorName: z.string(),
      }),
    )
    .mutation(({ input }) => {
      const db = getDb();

      const result = db
        .insert(proposals)
        .values({
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
          division: input.division,
          status: "proposition",
          createdByOpenId: input.creatorOpenId,
        })
        .run();

      const proposalId = Number(result.lastInsertRowid);

      // Add creator as first participant
      db.insert(proposalParticipants)
        .values({
          proposalId,
          playerOpenId: input.creatorOpenId,
          playerName: input.creatorName,
        })
        .run();

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
    .mutation(({ input }) => {
      const db = getDb();

      // Check already joined
      const existing = db
        .select()
        .from(proposalParticipants)
        .where(
          and(
            eq(proposalParticipants.proposalId, input.proposalId),
            eq(proposalParticipants.playerOpenId, input.playerOpenId),
          ),
        )
        .get();
      if (existing) return { alreadyJoined: true };

      db.insert(proposalParticipants)
        .values({
          proposalId: input.proposalId,
          playerOpenId: input.playerOpenId,
          playerName: input.playerName,
        })
        .run();

      // Count participants and check if full
      const proposal = db
        .select()
        .from(proposals)
        .where(eq(proposals.id, input.proposalId))
        .get();
      const participantCount = db
        .select()
        .from(proposalParticipants)
        .where(eq(proposalParticipants.proposalId, input.proposalId))
        .all().length;

      if (proposal && participantCount >= proposal.minParticipants) {
        db.update(proposals)
          .set({ status: "reservation" })
          .where(eq(proposals.id, input.proposalId))
          .run();
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
    .mutation(({ input }) => {
      const db = getDb();

      db.delete(proposalParticipants)
        .where(
          and(
            eq(proposalParticipants.proposalId, input.proposalId),
            eq(proposalParticipants.playerOpenId, input.playerOpenId),
          ),
        )
        .run();

      const remaining = db
        .select()
        .from(proposalParticipants)
        .where(eq(proposalParticipants.proposalId, input.proposalId))
        .all();

      if (remaining.length === 0) {
        db.delete(proposals).where(eq(proposals.id, input.proposalId)).run();
        return { deleted: true };
      }

      // Downgrade to proposition if it was a reservation
      db.update(proposals)
        .set({ status: "proposition" })
        .where(eq(proposals.id, input.proposalId))
        .run();

      return { deleted: false };
    }),
});

