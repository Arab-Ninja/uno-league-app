import { sql, desc } from "drizzle-orm";
import { publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { users, players, proposals, proposalParticipants, transactions } from "../drizzle/schema";

export const adminRouter = router({
  /**
   * Returns live row counts for every main table and the 5 most-recently
   * created entries in each table.  If the database is not connected the
   * query resolves with connected: false so the UI can show a clear error.
   *
   * Access is gated by the admin password check in the UI (app/admin.tsx).
   */
  dbStats: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      return {
        connected: false,
        error:
          "DATABASE_URL non configuré. La base de données Manus AI n'est pas accessible depuis ce serveur.",
        counts: null,
        recent: null,
      };
    }

    try {
      const [
        [userCount],
        [playerCount],
        [proposalCount],
        [participantCount],
        [transactionCount],
        recentPlayers,
        recentProposals,
        recentTransactions,
      ] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(users),
        db.select({ count: sql<number>`count(*)` }).from(players),
        db.select({ count: sql<number>`count(*)` }).from(proposals),
        db.select({ count: sql<number>`count(*)` }).from(proposalParticipants),
        db.select({ count: sql<number>`count(*)` }).from(transactions),
        db
          .select({
            id: players.id,
            name: players.name,
            division: players.division,
            unoPoints: players.unoPoints,
            createdAt: players.createdAt,
          })
          .from(players)
          .orderBy(desc(players.createdAt))
          .limit(5),
        db
          .select({
            id: proposals.id,
            locationName: proposals.locationName,
            modeName: proposals.modeName,
            time: proposals.time,
            status: proposals.status,
            date: proposals.date,
            createdAt: proposals.createdAt,
          })
          .from(proposals)
          .orderBy(desc(proposals.createdAt))
          .limit(5),
        db
          .select({
            id: transactions.id,
            playerOpenId: transactions.playerOpenId,
            type: transactions.type,
            amount: transactions.amount,
            description: transactions.description,
            createdAt: transactions.createdAt,
          })
          .from(transactions)
          .orderBy(desc(transactions.createdAt))
          .limit(5),
      ]);

      return {
        connected: true,
        counts: {
          users: Number(userCount?.count ?? 0),
          players: Number(playerCount?.count ?? 0),
          proposals: Number(proposalCount?.count ?? 0),
          participants: Number(participantCount?.count ?? 0),
          transactions: Number(transactionCount?.count ?? 0),
        },
        recent: {
          players: recentPlayers,
          proposals: recentProposals,
          transactions: recentTransactions,
        },
      };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : "Unknown error",
        counts: null,
        recent: null,
      };
    }
  }),
});
