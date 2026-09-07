import { and, asc, count, eq, ne } from "drizzle-orm";
import { AppError, DEFAULT_TIMEZONE, type VenueInput } from "@uno/shared";
import { db, type Executor } from "../db/client.js";
import { proposals, venues } from "../db/schema.js";
import { isDuplicateKeyError } from "../lib/errors.js";
import { assertValidImageUrl } from "../storage/index.js";
import { writeAudit } from "./audit.service.js";

/**
 * Lieux (ADMIN-007).
 *
 * Le lieu était une constante du code : ouvrir une nouvelle salle imposait un
 * déploiement. Il devient une entité administrable, avec sa présentation et
 * ses photos, publiée dans l'écran Informations.
 *
 * Deux règles protègent l'historique :
 *
 *  - une proposition **recopie** `venueId` et `venueName` au moment de sa
 *    création ; renommer une salle ne réécrit donc pas les sessions passées ;
 *  - une salle déjà utilisée n'est jamais supprimée, elle est désactivée —
 *    même principe qu'un produit déjà commandé (ADMIN-004).
 */

export interface VenueView {
  id: number;
  slug: string;
  name: string;
  headline: string | null;
  description: string;
  address: string | null;
  timezone: string;
  images: string[];
  active: boolean;
  sortOrder: number;
}

function toView(row: typeof venues.$inferSelect): VenueView {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    headline: row.headline,
    description: row.description,
    address: row.address,
    timezone: row.timezone,
    images: row.images ?? [],
    active: row.active,
    sortOrder: row.sortOrder,
  };
}

/** Salles proposées à la création d'une session : les actives uniquement. */
export async function listActiveVenues(
  executor: Executor = db,
): Promise<VenueView[]> {
  const rows = await executor
    .select()
    .from(venues)
    .where(eq(venues.active, true))
    .orderBy(asc(venues.sortOrder), asc(venues.id));

  return rows.map(toView);
}

/** Vue d'administration : les salles retirées y figurent aussi. */
export async function listAllVenues(): Promise<VenueView[]> {
  const rows = await db
    .select()
    .from(venues)
    .orderBy(asc(venues.sortOrder), asc(venues.id));

  return rows.map(toView);
}

export async function getVenueBySlug(
  executor: Executor,
  slug: string,
): Promise<VenueView | null> {
  const [row] = await executor
    .select()
    .from(venues)
    .where(eq(venues.slug, slug))
    .limit(1);

  return row ? toView(row) : null;
}

/**
 * Identifiant lisible dérivé du nom.
 * Il sert de clé dans les propositions déjà enregistrées : il est calculé une
 * fois à la création et ne bouge plus, même si la salle est renommée.
 */
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return base === "" ? `salle-${Date.now().toString(36)}` : base;
}

function assertImages(images: string[]): void {
  for (const url of images) assertValidImageUrl(url);
}

export async function createVenue(
  actor: { userId: number },
  input: VenueInput,
): Promise<VenueView> {
  assertImages(input.images);

  return db.transaction(async (tx) => {
    // Un suffixe numérique départage deux salles homonymes plutôt que de
    // rejeter la création : l'administrateur n'a pas à inventer un nom unique.
    const base = slugify(input.name);
    let slug = base;
    for (let attempt = 2; attempt <= 20; attempt++) {
      const [taken] = await tx
        .select({ id: venues.id })
        .from(venues)
        .where(eq(venues.slug, slug))
        .limit(1);
      if (!taken) break;
      slug = `${base.slice(0, 36)}-${attempt}`;
    }

    const [counted] = await tx.select({ total: count() }).from(venues);

    let venueId: number;
    try {
      const inserted = await tx.insert(venues).values({
        slug,
        name: input.name,
        headline: input.headline ?? null,
        description: input.description,
        address: input.address ?? null,
        timezone: input.timezone ?? DEFAULT_TIMEZONE,
        images: input.images,
        active: input.active,
        sortOrder: input.sortOrder ?? Number(counted?.total ?? 0),
      });
      venueId = Number(inserted[0].insertId);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AppError("CONFLICT", "Une salle porte déjà ce nom.");
      }
      throw error;
    }

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "venue.create",
      entityType: "venue",
      entityId: venueId,
      after: { name: input.name, slug },
    });

    const [row] = await tx.select().from(venues).where(eq(venues.id, venueId)).limit(1);
    return toView(row!);
  });
}

export async function updateVenue(
  actor: { userId: number },
  params: { venueId: number; data: VenueInput },
): Promise<VenueView> {
  assertImages(params.data.images);

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(venues)
      .where(eq(venues.id, params.venueId))
      .limit(1);

    if (!current) throw new AppError("NOT_FOUND", "Cette salle est introuvable.");

    await tx
      .update(venues)
      .set({
        name: params.data.name,
        headline: params.data.headline ?? null,
        description: params.data.description,
        address: params.data.address ?? null,
        timezone: params.data.timezone ?? current.timezone,
        images: params.data.images,
        active: params.data.active,
        sortOrder: params.data.sortOrder ?? current.sortOrder,
        updatedAt: new Date(),
      })
      .where(eq(venues.id, params.venueId));

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "venue.update",
      entityType: "venue",
      entityId: params.venueId,
      before: { name: current.name, active: current.active },
      after: { name: params.data.name, active: params.data.active },
    });

    const [row] = await tx
      .select()
      .from(venues)
      .where(eq(venues.id, params.venueId))
      .limit(1);
    return toView(row!);
  });
}

/**
 * Retire une salle.
 *
 * Si des sessions y ont été jouées ou y sont programmées, la suppression
 * détruirait la lisibilité de leur historique : la salle est alors désactivée.
 * Le résultat dit laquelle des deux voies a été prise, pour que l'interface
 * l'annonce honnêtement.
 */
export async function removeVenue(
  actor: { userId: number },
  venueId: number,
): Promise<{ deactivated: boolean }> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(venues)
      .where(eq(venues.id, venueId))
      .limit(1);

    if (!current) throw new AppError("NOT_FOUND", "Cette salle est introuvable.");

    const [usage] = await tx
      .select({ used: count() })
      .from(proposals)
      .where(eq(proposals.venueId, current.slug));

    const deactivated = Number(usage?.used ?? 0) > 0;

    if (deactivated) {
      await tx
        .update(venues)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(venues.id, venueId));
    } else {
      await tx.delete(venues).where(eq(venues.id, venueId));
    }

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: deactivated ? "venue.update" : "venue.delete",
      entityType: "venue",
      entityId: venueId,
      before: { name: current.name, active: current.active },
      after: { deleted: !deactivated, active: false },
    });

    return { deactivated };
  });
}

/**
 * Garantit qu'au moins une salle existe.
 *
 * Sans salle, aucune session ne peut être proposée : l'application serait
 * bloquée sur une base fraîche. Les salles historiques sont donc créées au
 * premier démarrage, puis administrées normalement.
 */
export async function ensureDefaultVenues(
  defaults: readonly {
    slug: string;
    name: string;
    timezone: string;
    headline?: string;
    description?: string;
  }[],
): Promise<{ created: number }> {
  const [counted] = await db.select({ total: count() }).from(venues);
  if (Number(counted?.total ?? 0) > 0) return { created: 0 };

  await db.insert(venues).values(
    defaults.map((venue, index) => ({
      slug: venue.slug,
      name: venue.name,
      headline: venue.headline ?? null,
      description: venue.description ?? "",
      timezone: venue.timezone,
      images: [],
      active: true,
      sortOrder: index,
    })),
  );

  return { created: defaults.length };
}

/** Vérifie qu'une salle existe et est ouverte aux nouvelles propositions. */
export async function requireBookableVenue(
  executor: Executor,
  slug: string,
): Promise<VenueView> {
  const [row] = await executor
    .select()
    .from(venues)
    .where(and(eq(venues.slug, slug), ne(venues.active, false)))
    .limit(1);

  if (!row) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Cette salle n'accueille plus de nouvelles sessions.",
    );
  }
  return toView(row);
}
