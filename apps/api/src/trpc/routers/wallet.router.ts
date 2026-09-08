import {
  UNO_PER_EUR,
  WALLET_RECENT_TRANSACTIONS,
  paginationSchema,
  searchPlayersSchema,
  transferUnoSchema,
  type WalletTransaction,
} from "@uno/shared";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { players } from "../../db/schema.js";
import {
  counterpartyOf,
  listTransactions,
  resolveTransactionLinks,
  transfer,
} from "../../services/ledger.service.js";
import { searchPlayers } from "../../services/players.service.js";
import { protectedProcedure, router } from "../init.js";

/**
 * Portefeuille UNO (CDC §11).
 * Le solde affiché provient toujours du serveur ; l'interface ne le calcule
 * jamais elle-même (P-004).
 */
export const walletRouter = router({
  summary: protectedProcedure.query(async ({ ctx }) => {
    const [player] = await db
      .select({ unoPoints: players.unoPoints })
      .from(players)
      .where(eq(players.id, ctx.identity.playerId))
      .limit(1);

    const history = await listTransactions(db, {
      playerId: ctx.identity.playerId,
      limit: WALLET_RECENT_TRANSACTIONS,
    });

    // Chaque écriture porte ce qu'elle permet d'ouvrir : la session payée, la
    // commande, le joueur d'en face (WAL-004).
    const links = await resolveTransactionLinks(db, history.items);

    return {
      balance: player?.unoPoints ?? 0,
      unoPerEur: UNO_PER_EUR,
      transactions: history.items.map(
        (row): WalletTransaction => ({
          id: row.id,
          type: row.type as WalletTransaction["type"],
          amount: row.amount,
          balanceAfter: row.balanceAfter,
          description: row.description,
          counterpartyName: counterpartyOf(row, links),
          createdAt: row.createdAt.toISOString(),
          link: links.get(row.id) ?? null,
        }),
      ),
    };
  }),

  transactions: protectedProcedure
    .input(paginationSchema)
    .query(async ({ ctx, input }) => {
      const page = await listTransactions(db, {
        playerId: ctx.identity.playerId,
        limit: input.limit,
        cursor: input.cursor ?? null,
      });
      const links = await resolveTransactionLinks(db, page.items);

      return {
        items: page.items.map(
          (row): WalletTransaction => ({
            id: row.id,
            type: row.type as WalletTransaction["type"],
            amount: row.amount,
            balanceAfter: row.balanceAfter,
            description: row.description,
            counterpartyName: counterpartyOf(row, links),
            createdAt: row.createdAt.toISOString(),
            link: links.get(row.id) ?? null,
          }),
        ),
        nextCursor: page.nextCursor,
      };
    }),

  /** Recherche du destinataire parmi les joueurs réels (WAL-002). */
  searchRecipients: protectedProcedure
    .input(searchPlayersSchema)
    .query(({ ctx, input }) =>
      searchPlayers(db, {
        query: input.query,
        limit: input.limit,
        excludePlayerId: ctx.identity.playerId,
      }),
    ),

  /** Transfert atomique entre deux joueurs (WAL-002, WAL-003). */
  send: protectedProcedure
    .input(transferUnoSchema)
    .mutation(({ ctx, input }) =>
      db.transaction((tx) =>
        transfer(tx, {
          fromPlayerId: ctx.identity.playerId,
          toPlayerId: input.toPlayerId,
          amount: input.amount,
          ...(input.note ? { note: input.note } : {}),
          idempotencyKey: input.idempotencyKey,
        }),
      ),
    ),
});
