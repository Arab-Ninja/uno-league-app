import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { proposals, proposalParticipants, players, transactions } from "../drizzle/schema";
import { sql } from "drizzle-orm";

export const proposalsRouter = router({
  /** List proposals filtered by location, mode, division and status. */
  list: publicProcedure
    .input(
      z.object({
        locationId: z.string().optional(),
        modeId: z.string().optional(),
        division: z.string().optional(),
        status: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = getDb();
      let query = sql`SELECT * FROM proposals WHERE 1=1`;

      if (input.locationId) {
        query = sql`${query} AND locationId = ${input.locationId}`;
      }
      if (input.modeId) {
        query = sql`${query} AND modeId = ${input.modeId}`;
      }
      if (input.division) {
        query = sql`${query} AND division = ${input.division}`;
      }
      if (input.status) {
        query = sql`${query} AND status = ${input.status}`;
      }

      const result = await db.execute(query);
      return (result as any)[0];
    }),

  /** Get a single proposal with participants. */
  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();

      const proposal = await db
        .select()
        .from(proposals)
        .where(eq(proposals.id, input.id));

      if (!proposal[0]) return null;

      const participants = await db
        .select()
        .from(proposalParticipants)
        .where(eq(proposalParticipants.proposalId, input.id));

      return { ...proposal[0], participants };
    }),

  /** Create a new proposal. */
  create: publicProcedure
    .input(
      z.object({
        date: z.string(),
        time: z.string(),
        locationId: z.string(),
        locationName: z.string(),
        locationColor: z.string(),
        modeId: z.string(),
        modeName: z.string(),
        minParticipants: z.number(),
        price: z.number(),
        rewards: z.string(),
        division: z.string(),
        creatorOpenId: z.string(),
        creatorName: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();

      console.log(`[proposalsRouter.create] 📝 Creating proposal:`, {
        location: input.locationName,
        mode: input.modeName,
        creator: input.creatorName,
        price: input.price,
      });

      // Convert date to MySQL DATETIME format (YYYY-MM-DD HH:MM:SS)
      const dateObj = new Date(input.date);
      const year = dateObj.getUTCFullYear();
      const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getUTCDate()).padStart(2, '0');
      const hours = String(dateObj.getUTCHours()).padStart(2, '0');
      const minutes = String(dateObj.getUTCMinutes()).padStart(2, '0');
      const seconds = String(dateObj.getUTCSeconds()).padStart(2, '0');
      const mysqlDateTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

      // Use raw SQL to avoid Drizzle's date conversion issues
      const query = `INSERT INTO proposals (date, time, locationId, locationName, locationColor, modeId, modeName, minParticipants, price, rewards, status, division, createdByOpenId) 
                     VALUES ('${mysqlDateTime}', '${input.time}', '${input.locationId}', '${input.locationName}', '${input.locationColor}', '${input.modeId}', '${input.modeName}', ${input.minParticipants}, ${input.price}, '${input.rewards}', 'proposition', '${input.division}', '${input.creatorOpenId}')`;
      const result = await db.execute(sql.raw(query));

      const proposalId = (result as any)[0].insertId;
      console.log(`[proposalsRouter.create] ✅ Proposal created with ID: ${proposalId}`);

      // Add creator as first participant
      await db.insert(proposalParticipants).values({
        proposalId,
        playerOpenId: input.creatorOpenId,
        playerName: input.creatorName,
      });

      console.log(`[proposalsRouter.create] ✅ Creator added as participant`);

      return { id: proposalId };
    }),

  /** Join a proposal. Auto-advances status when full. */
  join: publicProcedure
    .input(
      z.object({
        proposalId: z.number(),
        playerOpenId: z.string(),
        playerName: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();

      console.log(`[proposalsRouter.join] 👤 Player joining proposal:`, {
        proposalId: input.proposalId,
        playerName: input.playerName,
      });

      // Check if already joined
      const existing = await db
        .select()
        .from(proposalParticipants)
        .where(
          and(
            eq(proposalParticipants.proposalId, input.proposalId),
            eq(proposalParticipants.playerOpenId, input.playerOpenId)
          )
        );

      if (existing.length > 0) {
        console.log(`[proposalsRouter.join] ⚠️ Player already joined`);
        return { success: false, message: "Already joined" };
      }

      // Add participant
      await db.insert(proposalParticipants).values({
        proposalId: input.proposalId,
        playerOpenId: input.playerOpenId,
        playerName: input.playerName,
      });

      // Check if proposal is now full
      const participants = await db
        .select()
        .from(proposalParticipants)
        .where(eq(proposalParticipants.proposalId, input.proposalId));

      const proposal = await db
        .select()
        .from(proposals)
        .where(eq(proposals.id, input.proposalId));

      if (
        proposal[0] &&
        participants.length >= proposal[0].minParticipants
      ) {
        // Proposal is full: move from "proposition" to "reservation" (awaiting payment).
        await db
          .update(proposals)
          .set({ status: "reservation" })
          .where(eq(proposals.id, input.proposalId));

        console.log(
          `[proposalsRouter.join] ✅ Proposal confirmed (${participants.length}/${proposal[0].minParticipants})`
        );
      }

      console.log(`[proposalsRouter.join] ✅ Player joined successfully`);
      return { success: true };
    }),

  /** Leave a proposal. */
  leave: publicProcedure
    .input(
      z.object({
        proposalId: z.number(),
        playerOpenId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();

      console.log(`[proposalsRouter.leave] 👤 Player leaving proposal:`, {
        proposalId: input.proposalId,
        playerOpenId: input.playerOpenId,
      });

      await db
        .delete(proposalParticipants)
        .where(
          and(
            eq(proposalParticipants.proposalId, input.proposalId),
            eq(proposalParticipants.playerOpenId, input.playerOpenId)
          )
        );

      console.log(`[proposalsRouter.leave] ✅ Player left successfully`);
      return { success: true };
    }),

  /** Pay for a proposal. Marks the participant as paid and advances the
   *  proposal to "session" once every participant has paid. */
  pay: publicProcedure
    .input(
      z.object({
        proposalId: z.number(),
        playerOpenId: z.string(),
        amount: z.number(),
        paymentMethod: z.enum(["paypal", "stripe", "bancontact", "uno-points"]),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();

      console.log(`[proposalsRouter.pay] 💰 Processing payment:`, {
        proposalId: input.proposalId,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
      });

      // Create transaction
      await db.insert(transactions).values({
        playerOpenId: input.playerOpenId,
        amount: -input.amount,
        description: `Payment for proposal #${input.proposalId} (${input.paymentMethod})`,
        type: "purchase",
      });

      // Only UNO-points payments actually deduct from the player's balance;
      // other methods are handled by the external payment provider.
      if (input.paymentMethod === "uno-points") {
        const player = await db
          .select()
          .from(players)
          .where(eq(players.openId, input.playerOpenId));

        if (player[0]) {
          await db
            .update(players)
            .set({ unoPoints: player[0].unoPoints - input.amount })
            .where(eq(players.openId, input.playerOpenId));
        }
      }

      // Mark this participant as paid
      await db
        .update(proposalParticipants)
        .set({ hasPaid: true })
        .where(
          and(
            eq(proposalParticipants.proposalId, input.proposalId),
            eq(proposalParticipants.playerOpenId, input.playerOpenId)
          )
        );

      const participants = await db
        .select()
        .from(proposalParticipants)
        .where(eq(proposalParticipants.proposalId, input.proposalId));

      const paidCount = participants.filter((p) => p.hasPaid).length;
      const newStatus = paidCount >= participants.length ? "session" : "reservation";

      await db
        .update(proposals)
        .set({ status: newStatus })
        .where(eq(proposals.id, input.proposalId));

      console.log(`[proposalsRouter.pay] ✅ Payment processed (${paidCount}/${participants.length} paid)`);
      return { success: true, paidCount, newStatus };
    }),
});
