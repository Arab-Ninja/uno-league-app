import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { AppError, type CharityInput, type CharityView } from "@uno/shared";
import { db, type Executor } from "../db/client.js";
import { charities } from "../db/schema.js";
import { isDuplicateKeyError } from "../lib/errors.js";
import { assertValidImageUrl } from "../storage/index.js";
import { writeAudit } from "./audit.service.js";

/**
 * Associations caritatives bénéficiaires des dons (SHOP-008).
 *
 * Offrir un don n'est pas acheter un objet : le joueur choisit à qui va son
 * geste. La liste est tenue par l'administration — nom, présentation, image,
 * site officiel — et le joueur n'en voit que les associations actives.
 *
 * Comme les salles et les produits déjà commandés (ADMIN-004), une association
 * n'est pas supprimée une fois qu'un don lui a été adressé : elle est
 * désactivée. L'historique des commandes reste lisible, et la ligne de
 * commande en garde de toute façon le nom figé.
 */

function toView(row: typeof charities.$inferSelect): CharityView {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    imageUrl: row.imageUrl,
    websiteUrl: row.websiteUrl,
    active: row.active,
  };
}

/** Liste offerte au joueur : les associations actives, par ordre alphabétique. */
export async function listActiveCharities(
  executor: Executor = db,
): Promise<CharityView[]> {
  const rows = await executor
    .select()
    .from(charities)
    .where(eq(charities.active, true))
    .orderBy(asc(charities.name));

  return rows.map(toView);
}

/** Vue d'administration : les associations retirées y figurent aussi. */
export async function listAllCharities(): Promise<CharityView[]> {
  const rows = await db.select().from(charities).orderBy(asc(charities.name));
  return rows.map(toView);
}

/**
 * Associations d'un lot d'identifiants, pour valider un panier en une requête
 * plutôt qu'une par ligne de don.
 */
export async function charitiesByIds(
  executor: Executor,
  ids: number[],
): Promise<Map<number, CharityView>> {
  const found = new Map<number, CharityView>();
  if (ids.length === 0) return found;

  const rows = await executor
    .select()
    .from(charities)
    .where(inArray(charities.id, ids));

  for (const row of rows) found.set(row.id, toView(row));
  return found;
}

function assertImage(url: string | null | undefined): void {
  if (url) assertValidImageUrl(url);
}

export async function createCharity(
  actor: { userId: number },
  input: CharityInput,
): Promise<CharityView> {
  assertImage(input.imageUrl);

  return db.transaction(async (tx) => {
    let charityId: number;
    try {
      const inserted = await tx.insert(charities).values({
        name: input.name,
        description: input.description,
        imageUrl: input.imageUrl ?? null,
        websiteUrl: input.websiteUrl,
        active: input.active,
      });
      charityId = Number(inserted[0].insertId);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AppError("CONFLICT", "Une association porte déjà ce nom.");
      }
      throw error;
    }

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "charity.create",
      entityType: "charity",
      entityId: charityId,
      after: { name: input.name },
    });

    const [row] = await tx
      .select()
      .from(charities)
      .where(eq(charities.id, charityId))
      .limit(1);
    return toView(row!);
  });
}

export async function updateCharity(
  actor: { userId: number },
  params: { charityId: number; data: CharityInput },
): Promise<CharityView> {
  assertImage(params.data.imageUrl);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(charities)
      .where(eq(charities.id, params.charityId))
      .limit(1);

    if (!existing) throw new AppError("NOT_FOUND", "Association introuvable.");

    const [homonym] = await tx
      .select({ id: charities.id })
      .from(charities)
      .where(
        and(
          eq(charities.name, params.data.name),
          ne(charities.id, existing.id),
        ),
      )
      .limit(1);

    if (homonym) {
      throw new AppError("CONFLICT", "Une association porte déjà ce nom.");
    }

    await tx
      .update(charities)
      .set({
        name: params.data.name,
        description: params.data.description,
        imageUrl: params.data.imageUrl ?? null,
        websiteUrl: params.data.websiteUrl,
        active: params.data.active,
        updatedAt: new Date(),
      })
      .where(eq(charities.id, existing.id));

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "charity.update",
      entityType: "charity",
      entityId: existing.id,
      before: { name: existing.name, active: existing.active },
      after: { name: params.data.name, active: params.data.active },
    });

    const [row] = await tx
      .select()
      .from(charities)
      .where(eq(charities.id, existing.id))
      .limit(1);
    return toView(row!);
  });
}
