import { and, desc, eq, sql } from "drizzle-orm";
import { AppError, type ProductReviewInput, type ProductReviewView } from "@uno/shared";
import { db, type Executor } from "../db/client.js";
import {
  orderItems,
  orders,
  players,
  productReviews,
  shopItems,
} from "../db/schema.js";
import { publicPlayerColumns, toPublicPlayer } from "./players.service.js";
import { recordAdminEvent } from "./admin-events.service.js";

/**
 * Avis produits (SHOP-002).
 *
 * Trois règles, toutes tenues par la base plutôt que par du code défensif :
 *
 *  - **un joueur, un avis par produit.** L'index unique (produit, joueur) rend
 *    impossible de gonfler une note en publiant plusieurs fois ; modifier son
 *    avis réécrit la ligne existante ;
 *  - **la note est bornée de 1 à 5** par une contrainte CHECK, en plus de la
 *    validation applicative ;
 *  - **« achat vérifié » n'est pas déclaratif.** Le drapeau est calculé au
 *    moment de la publication, en cherchant une commande du joueur portant
 *    l'article. Un joueur peut donner son avis sans avoir acheté — c'est
 *    permis — mais il ne peut pas prétendre l'avoir fait.
 */

async function hasPurchased(
  executor: Executor,
  playerId: number,
  shopItemId: number,
): Promise<boolean> {
  const [row] = await executor
    .select({ id: orderItems.id })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orderItems.shopItemId, shopItemId),
        eq(orders.playerId, playerId),
        // Une commande annulée ne vaut pas achat.
        sql`${orders.status} IN ('paid', 'fulfilled', 'refunded')`,
      ),
    )
    .limit(1);

  return Boolean(row);
}

export async function listReviews(
  executor: Executor,
  params: { shopItemId: number; viewerPlayerId: number; limit: number },
): Promise<ProductReviewView[]> {
  const rows = await executor
    .select({ review: productReviews, ...publicPlayerColumns })
    .from(productReviews)
    .innerJoin(players, eq(players.id, productReviews.playerId))
    .where(eq(productReviews.shopItemId, params.shopItemId))
    .orderBy(desc(productReviews.createdAt))
    .limit(params.limit);

  return rows.map(({ review, ...player }) => ({
    id: review.id,
    player: toPublicPlayer(player),
    rating: review.rating,
    comment: review.comment,
    verifiedPurchase: review.verifiedPurchase,
    createdAt: review.createdAt.toISOString(),
    mine: review.playerId === params.viewerPlayerId,
  }));
}

/**
 * Publie ou met à jour l'avis du joueur.
 *
 * Publier deux fois ne crée pas deux avis : la seconde publication remplace
 * la première. C'est ce qu'attend un utilisateur qui corrige sa note, et cela
 * ferme la porte au bourrage d'urnes.
 */
export async function upsertReview(
  actor: { playerId: number },
  input: ProductReviewInput,
): Promise<ProductReviewView> {
  return db.transaction(async (tx) => {
    const [product] = await tx
      .select({ id: shopItems.id, name: shopItems.name, archived: shopItems.archived })
      .from(shopItems)
      .where(eq(shopItems.id, input.shopItemId))
      .limit(1);

    if (!product || product.archived) {
      throw new AppError("NOT_FOUND", "Ce produit est introuvable.");
    }

    const comment = input.comment?.trim() || null;
    const verified = await hasPurchased(tx, actor.playerId, input.shopItemId);

    const [existing] = await tx
      .select({ id: productReviews.id })
      .from(productReviews)
      .where(
        and(
          eq(productReviews.shopItemId, input.shopItemId),
          eq(productReviews.playerId, actor.playerId),
        ),
      )
      .limit(1);

    if (existing) {
      await tx
        .update(productReviews)
        .set({
          rating: input.rating,
          comment,
          verifiedPurchase: verified,
          updatedAt: new Date(),
        })
        .where(eq(productReviews.id, existing.id));
    } else {
      await tx.insert(productReviews).values({
        shopItemId: input.shopItemId,
        playerId: actor.playerId,
        rating: input.rating,
        comment,
        verifiedPurchase: verified,
      });
    }

    const [mine] = await listReviewsForPlayer(tx, input.shopItemId, actor.playerId);
    if (!mine) throw new AppError("INTERNAL", "L'avis n'a pas pu être enregistré.");

    // Un avis modifié ne renotifie pas : la clé est celle du couple
    // (produit, joueur), pas celle de la publication.
    await recordAdminEvent({
      type: "review.published",
      body: `${mine.player.displayName} a noté « ${product.name} » ${input.rating}/5.`,
      entityType: "shopItem",
      entityId: product.id,
      playerId: actor.playerId,
      key: `review:${product.id}:${actor.playerId}`,
    }, tx);

    return mine;
  });
}

async function listReviewsForPlayer(
  executor: Executor,
  shopItemId: number,
  playerId: number,
): Promise<ProductReviewView[]> {
  const rows = await executor
    .select({ review: productReviews, ...publicPlayerColumns })
    .from(productReviews)
    .innerJoin(players, eq(players.id, productReviews.playerId))
    .where(
      and(
        eq(productReviews.shopItemId, shopItemId),
        eq(productReviews.playerId, playerId),
      ),
    )
    .limit(1);

  return rows.map(({ review, ...player }) => ({
    id: review.id,
    player: toPublicPlayer(player),
    rating: review.rating,
    comment: review.comment,
    verifiedPurchase: review.verifiedPurchase,
    createdAt: review.createdAt.toISOString(),
    mine: true,
  }));
}

/** Retrait de son propre avis. Un joueur ne peut effacer que le sien. */
export async function deleteOwnReview(
  actor: { playerId: number },
  shopItemId: number,
): Promise<{ deleted: boolean }> {
  const result = await db
    .delete(productReviews)
    .where(
      and(
        eq(productReviews.shopItemId, shopItemId),
        eq(productReviews.playerId, actor.playerId),
      ),
    );

  return { deleted: Number(result[0].affectedRows ?? 0) > 0 };
}
