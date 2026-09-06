import { z } from "zod";
import {
  createOrderSchema,
  listShopItemsSchema,
  paginationSchema,
} from "@uno/shared";
import { db } from "../../db/client.js";
import {
  createOrder,
  getOrder,
  getShopItem,
  listOrders,
  listShopItems,
} from "../../services/orders.service.js";
import { protectedProcedure, router } from "../init.js";

export const shopRouter = router({
  /** Catalogue : uniquement les produits disponibles (SHOP-001). */
  items: protectedProcedure
    .input(listShopItemsSchema)
    .query(({ input }) => listShopItems(db, input.category)),

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
});
