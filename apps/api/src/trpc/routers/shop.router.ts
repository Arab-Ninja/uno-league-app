import { z } from "zod";
import {
  createOrderSchema,
  listShopItemsSchema,
  paginationSchema,
  productReviewSchema,
} from "@uno/shared";
import { db } from "../../db/client.js";
import {
  cancelOwnOrder,
  createOrder,
  getOrder,
  getShopItem,
  listOrders,
  listShopItems,
} from "../../services/orders.service.js";
import {
  deleteOwnReview,
  listReviews,
  upsertReview,
} from "../../services/reviews.service.js";
import { protectedProcedure, router } from "../init.js";

export const shopRouter = router({
  /** Catalogue : uniquement les produits disponibles (SHOP-001). */
  items: protectedProcedure
    .input(listShopItemsSchema)
    .query(({ input }) =>
      listShopItems(db, { category: input.category, query: input.query }),
    ),

  item: protectedProcedure
    .input(z.object({ shopItemId: z.number().int().positive() }))
    .query(({ input }) => getShopItem(db, input.shopItemId)),

  /** Achat : commande + débit + transaction, en une seule opération atomique. */
  purchase: protectedProcedure
    .input(createOrderSchema)
    .mutation(({ ctx, input }) =>
      createOrder(
        { playerId: ctx.identity.playerId, userId: ctx.identity.userId },
        input,
      ),
    ),

  /** Historique des commandes (SHOP-004). */
  orders: protectedProcedure
    .input(paginationSchema)
    .query(({ ctx, input }) =>
      listOrders(db, {
        playerId: ctx.identity.playerId,
        limit: input.limit,
        cursor: input.cursor ?? null,
      }),
    ),

  order: protectedProcedure
    .input(z.object({ orderId: z.number().int().positive() }))
    .query(({ ctx, input }) =>
      getOrder(db, ctx.identity.playerId, input.orderId),
    ),

  /** Annulation par le joueur, tant que la commande n'est pas confirmée. */
  cancelOrder: protectedProcedure
    .input(z.object({ orderId: z.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      cancelOwnOrder(
        { playerId: ctx.identity.playerId, userId: ctx.identity.userId },
        input.orderId,
      ),
    ),

  /** Avis d'un produit (SHOP-002). */
  reviews: protectedProcedure
    .input(
      z.object({
        shopItemId: z.number().int().positive(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(({ ctx, input }) =>
      listReviews(db, {
        shopItemId: input.shopItemId,
        viewerPlayerId: ctx.identity.playerId,
        limit: input.limit,
      }),
    ),

  reviewProduct: protectedProcedure
    .input(productReviewSchema)
    .mutation(({ ctx, input }) =>
      upsertReview({ playerId: ctx.identity.playerId }, input),
    ),

  removeReview: protectedProcedure
    .input(z.object({ shopItemId: z.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      deleteOwnReview({ playerId: ctx.identity.playerId }, input.shopItemId),
    ),
});
