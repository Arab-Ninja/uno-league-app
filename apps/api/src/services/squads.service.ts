import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import {
  AppError,
  SQUAD_LIMITS,
  squadRoleAtLeast,
  type CreateSquadInput,
  type MySquadView,
  type SquadDetailView,
  type SquadJoinRequestView,
  type SquadMemberView,
  type SquadRole,
  type SquadView,
  type UpdateSquadInput,
} from "@uno/shared";
import { db, type Executor, type Transaction } from "../db/client.js";
import { isDuplicateKeyError } from "../lib/errors.js";
import {
  players,
  squadJoinRequests,
  squadMembers,
  squads,
} from "../db/schema.js";
import { assertValidImageUrl } from "../storage/index.js";
import { writeAudit } from "./audit.service.js";
import { publicPlayerColumns, toPublicPlayer } from "./players.service.js";

/**
 * Clubs permanents du mode SQUAD (SQUAD-001, SQUAD-002).
 *
 * Ce qui distingue un SQUAD d'une équipe de session UNO League : il **survit
 * au match**. Une session tire trois équipes au sort et les oublie ; un club
 * garde ses joueurs, sa cote, sa trésorerie et son histoire. Tout le reste du
 * mode — défis, transferts, classement — s'appuie sur cette permanence.
 *
 * **Une seule affiliation à la fois, et la base en est garante.** La colonne
 * générée `squad_members.active_player_id` porte un index unique : deux
 * requêtes simultanées ne peuvent pas inscrire le même joueur dans deux
 * clubs, là où un contrôle applicatif seul les laisserait passer toutes les
 * deux. Ce service traduit le refus du pilote en message lisible ; il ne s'y
 * substitue jamais.
 */

/** Identifiant lisible dérivé du nom, unique par construction ensuite. */
function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    // Retire les accents : « Crémerie » et « Cremerie » donneraient sinon
    // deux adresses différentes pour un œil humain identique.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SQUAD_LIMITS.slugMax);

  return base.length > 0 ? base : "squad";
}

/** Affiliation active d'un joueur, s'il en a une. */
export async function activeMembership(
  executor: Executor,
  playerId: number,
): Promise<{ squadId: number; role: SquadRole } | null> {
  const [row] = await executor
    .select({ squadId: squadMembers.squadId, role: squadMembers.role })
    .from(squadMembers)
    .where(
      and(
        eq(squadMembers.playerId, playerId),
        eq(squadMembers.status, "active"),
      ),
    )
    .limit(1);

  return row ?? null;
}

/**
 * Exige un rôle au moins égal à `required` dans ce club.
 *
 * L'administration n'est pas dispensée ici, contrairement à ce qu'on fait
 * ailleurs : un SQUAD appartient à ses membres, et l'administration n'a pas à
 * renommer un club ou à en promouvoir le capitaine. Elle garde ses propres
 * pouvoirs — dissoudre un club, arbitrer un litige — par des routes dédiées.
 */
export async function assertSquadRole(
  executor: Executor,
  playerId: number,
  squadId: number,
  required: SquadRole,
): Promise<SquadRole> {
  const membership = await activeMembership(executor, playerId);

  if (!membership || membership.squadId !== squadId) {
    throw new AppError(
      "RULE_VIOLATION",
      "Vous n'êtes pas membre de ce SQUAD.",
    );
  }

  if (!squadRoleAtLeast(membership.role, required)) {
    throw new AppError(
      "RULE_VIOLATION",
      required === "founder"
        ? "Seul le fondateur peut effectuer cette action."
        : "Cette action est réservée au fondateur et aux capitaines.",
    );
  }

  return membership.role;
}

/** Verrouille la ligne d'un club le temps d'une transaction. */
async function lockSquad(tx: Transaction, squadId: number) {
  const [row] = await tx
    .select()
    .from(squads)
    .where(eq(squads.id, squadId))
    .for("update")
    .limit(1);

  if (!row) throw new AppError("NOT_FOUND", "Ce SQUAD est introuvable.");
  return row;
}

async function memberCountOf(
  executor: Executor,
  squadId: number,
): Promise<number> {
  const rows = await executor
    .select({ total: sql<number>`COUNT(*)` })
    .from(squadMembers)
    .where(
      and(eq(squadMembers.squadId, squadId), eq(squadMembers.status, "active")),
    );
  return Number(rows[0]?.total ?? 0);
}

function toSquadView(
  row: typeof squads.$inferSelect,
  extras: {
    founder: SquadView["founder"];
    memberCount: number;
    viewer: SquadView["viewer"];
  },
): SquadView {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    avatarUrl: row.avatarUrl,
    founder: extras.founder,
    rating: row.rating,
    matchesPlayed: row.matchesPlayed,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    streak: row.streak,
    // Sans match joué, un taux de victoire de 0 % se lirait comme une série
    // de défaites. `null` dit l'absence de résultat, pas la nullité.
    winRate:
      row.matchesPlayed > 0
        ? Math.round((row.wins / row.matchesPlayed) * 100)
        : null,
    totalUnoWon: row.totalUnoWon,
    memberCount: extras.memberCount,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    viewer: extras.viewer,
  };
}

async function membersOf(
  executor: Executor,
  squadId: number,
): Promise<SquadMemberView[]> {
  const rows = await executor
    .select({
      role: squadMembers.role,
      joinedAt: squadMembers.joinedAt,
      ...publicPlayerColumns,
    })
    .from(squadMembers)
    .innerJoin(players, eq(players.id, squadMembers.playerId))
    .where(
      and(eq(squadMembers.squadId, squadId), eq(squadMembers.status, "active")),
    )
    // Fondateur d'abord, puis capitaines, puis les membres par ancienneté :
    // l'ordre de la liste dit la hiérarchie sans qu'on ait à la répéter.
    .orderBy(
      sql`FIELD(${squadMembers.role}, 'founder', 'captain', 'member')`,
      squadMembers.joinedAt,
    );

  return rows.map(({ role, joinedAt, ...player }) => ({
    player: toPublicPlayer(player),
    role,
    joinedAt: joinedAt.toISOString(),
  }));
}

async function pendingRequestsOf(
  executor: Executor,
  squadId: number,
): Promise<SquadJoinRequestView[]> {
  const rows = await executor
    .select({
      // `id` appartient déjà aux colonnes du joueur : sans alias, l'un
      // écraserait l'autre et la demande porterait l'identifiant du joueur.
      requestId: squadJoinRequests.id,
      message: squadJoinRequests.message,
      status: squadJoinRequests.status,
      createdAt: squadJoinRequests.createdAt,
      ...publicPlayerColumns,
    })
    .from(squadJoinRequests)
    .innerJoin(players, eq(players.id, squadJoinRequests.playerId))
    .where(
      and(
        eq(squadJoinRequests.squadId, squadId),
        eq(squadJoinRequests.status, "pending"),
      ),
    )
    .orderBy(squadJoinRequests.createdAt);

  return rows.map(({ requestId, message, status, createdAt, ...player }) => ({
    id: requestId,
    player: toPublicPlayer(player),
    message,
    status,
    createdAt: createdAt.toISOString(),
  }));
}

async function founderOf(
  executor: Executor,
  founderPlayerId: number,
): Promise<SquadView["founder"]> {
  const [row] = await executor
    .select(publicPlayerColumns)
    .from(players)
    .where(eq(players.id, founderPlayerId))
    .limit(1);

  return row ? toPublicPlayer(row) : null;
}

/** Ce que le joueur qui regarde peut faire sur ce club. */
async function viewerContext(
  executor: Executor,
  squadId: number,
  viewerPlayerId: number,
): Promise<SquadView["viewer"]> {
  const membership = await activeMembership(executor, viewerPlayerId);
  const role = membership?.squadId === squadId ? membership.role : null;

  const [pending] = await executor
    .select({ id: squadJoinRequests.id })
    .from(squadJoinRequests)
    .where(
      and(
        eq(squadJoinRequests.squadId, squadId),
        eq(squadJoinRequests.playerId, viewerPlayerId),
        eq(squadJoinRequests.status, "pending"),
      ),
    )
    .limit(1);

  return {
    role,
    hasPendingRequest: Boolean(pending),
    mayRequestToJoin: membership === null && !pending,
  };
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/**
 * Profil public d'un club, par identifiant ou par adresse lisible.
 *
 * **Un club dissous est introuvable.** Sa ligne demeure — les matchs joués,
 * les transferts conclus et les mouvements de trésorerie s'y rattachent, et
 * les effacer réécrirait l'histoire (AC15) — mais plus rien n'y mène. Le
 * garder consultable laisserait un club fantôme dans l'annuaire et dans les
 * adresses partagées, sans qu'on puisse ni le rejoindre ni le défier.
 *
 * Le refus est un « introuvable » plutôt qu'un « dissous » : pour qui le
 * cherche aujourd'hui, il n'existe plus.
 */
export async function getSquad(
  executor: Executor,
  key: { squadId: number } | { slug: string },
  viewerPlayerId: number,
): Promise<SquadView> {
  const [row] = await executor
    .select()
    .from(squads)
    .where("squadId" in key ? eq(squads.id, key.squadId) : eq(squads.slug, key.slug))
    .limit(1);

  if (!row || row.status === "dissolved") {
    throw new AppError("NOT_FOUND", "Ce SQUAD est introuvable.");
  }

  return toSquadView(row, {
    founder: await founderOf(executor, row.founderPlayerId),
    memberCount: await memberCountOf(executor, row.id),
    viewer: await viewerContext(executor, row.id, viewerPlayerId),
  });
}

/**
 * Vue détaillée, réservée aux membres.
 *
 * La trésorerie et la file des demandes n'apparaissent qu'à eux : une équipe
 * adverse n'a pas à jauger les moyens de celle qu'elle s'apprête à défier, ni
 * à savoir qui frappe à sa porte.
 */
export async function getSquadDetail(
  executor: Executor,
  squadId: number,
  viewerPlayerId: number,
): Promise<SquadDetailView> {
  const base = await getSquad(executor, { squadId }, viewerPlayerId);
  const isMember = base.viewer.role !== null;

  const [row] = await executor
    .select({
      treasuryAvailable: squads.treasuryAvailable,
      treasuryLocked: squads.treasuryLocked,
    })
    .from(squads)
    .where(eq(squads.id, squadId))
    .limit(1);

  return {
    ...base,
    members: await membersOf(executor, squadId),
    treasury:
      isMember && row
        ? {
            available: row.treasuryAvailable,
            locked: row.treasuryLocked,
            total: row.treasuryAvailable + row.treasuryLocked,
          }
        : null,
    pendingRequests:
      base.viewer.role && squadRoleAtLeast(base.viewer.role, "captain")
        ? await pendingRequestsOf(executor, squadId)
        : [],
  };
}

/** Affiliation du joueur connecté, et les demandes qu'il attend. */
export async function getMySquad(
  executor: Executor,
  playerId: number,
): Promise<MySquadView> {
  const membership = await activeMembership(executor, playerId);

  const requests = await executor
    .select({ squadId: squadJoinRequests.squadId, createdAt: squadJoinRequests.createdAt })
    .from(squadJoinRequests)
    .where(
      and(
        eq(squadJoinRequests.playerId, playerId),
        eq(squadJoinRequests.status, "pending"),
      ),
    )
    .orderBy(desc(squadJoinRequests.createdAt));

  const pending = [];
  for (const request of requests) {
    pending.push({
      squad: await getSquad(executor, { squadId: request.squadId }, playerId),
      createdAt: request.createdAt.toISOString(),
    });
  }

  return {
    squad: membership
      ? await getSquadDetail(executor, membership.squadId, playerId)
      : null,
    pendingRequests: pending,
  };
}

/** Annuaire des clubs, du mieux classé au moins bien. */
export async function listSquads(
  executor: Executor,
  params: { query?: string | undefined; limit: number },
  viewerPlayerId: number,
): Promise<SquadView[]> {
  const rows = await executor
    .select()
    .from(squads)
    .where(
      params.query
        ? and(
            eq(squads.status, "active"),
            sql`${squads.name} LIKE ${`%${params.query.replace(/[%_]/g, "\\$&")}%`}`,
          )
        : eq(squads.status, "active"),
    )
    .orderBy(desc(squads.rating), squads.name)
    .limit(params.limit);

  const views: SquadView[] = [];
  for (const row of rows) {
    views.push(
      toSquadView(row, {
        founder: await founderOf(executor, row.founderPlayerId),
        memberCount: await memberCountOf(executor, row.id),
        viewer: await viewerContext(executor, row.id, viewerPlayerId),
      }),
    );
  }
  return views;
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

/**
 * Fonde un club (AC01).
 *
 * Le créateur en devient fondateur dans la même transaction : un club sans
 * fondateur, même l'espace d'un instant, serait un club que personne ne peut
 * administrer.
 */
export async function createSquad(
  actor: { userId: number; playerId: number },
  input: CreateSquadInput,
): Promise<SquadView> {
  if (input.avatarUrl) assertValidImageUrl(input.avatarUrl);

  return db.transaction(async (tx) => {
    const existing = await activeMembership(tx, actor.playerId);
    if (existing) {
      throw new AppError(
        "RULE_VIOLATION",
        "Vous appartenez déjà à un SQUAD. Quittez-le avant d'en fonder un autre.",
      );
    }

    const slug = slugify(input.name);

    let squadId: number;
    try {
      const inserted = await tx.insert(squads).values({
        name: input.name,
        slug,
        description: input.description ?? null,
        avatarUrl: input.avatarUrl ?? null,
        founderPlayerId: actor.playerId,
        // Le club naît actif : il réserve donc son nom (SQUAD-002).
        activeName: input.name,
        activeSlug: slug,
      });
      squadId = Number(inserted[0].insertId);
    } catch (error) {
      // L'unicité est tenue par l'index, pas par une lecture préalable : deux
      // créations simultanées du même nom ne peuvent pas passer toutes deux.
      if (isDuplicateKeyError(error)) {
        throw new AppError("CONFLICT", "Ce nom de SQUAD est déjà pris.", {
          name: "Ce nom de SQUAD est déjà pris.",
        });
      }
      throw error;
    }

    await tx.insert(squadMembers).values({
      squadId,
      playerId: actor.playerId,
      role: "founder",
    });

    // Les demandes que le fondateur avait déposées ailleurs n'ont plus d'objet.
    await tx
      .update(squadJoinRequests)
      .set({ status: "cancelled", decidedAt: new Date() })
      .where(
        and(
          eq(squadJoinRequests.playerId, actor.playerId),
          eq(squadJoinRequests.status, "pending"),
        ),
      );

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "squad.create",
      entityType: "squad",
      entityId: squadId,
      after: { name: input.name },
    });

    return getSquad(tx, { squadId }, actor.playerId);
  });
}

/** Renomme ou réhabille un club (fondateur seul). */
export async function updateSquad(
  actor: { userId: number; playerId: number },
  input: UpdateSquadInput,
): Promise<SquadView> {
  if (input.avatarUrl) assertValidImageUrl(input.avatarUrl);

  return db.transaction(async (tx) => {
    await assertSquadRole(tx, actor.playerId, input.squadId, "founder");
    const current = await lockSquad(tx, input.squadId);

    const name = input.name ?? current.name;
    const slug = input.name ? slugify(input.name) : current.slug;
    // La réservation suit le nom, et ne vaut que pour un club vivant.
    const reserved = current.status === "active";

    try {
      await tx
        .update(squads)
        .set({
          name,
          slug,
          description:
            input.description === undefined ? current.description : input.description,
          avatarUrl:
            input.avatarUrl === undefined ? current.avatarUrl : input.avatarUrl,
          activeName: reserved ? name : null,
          activeSlug: reserved ? slug : null,
          updatedAt: new Date(),
        })
        .where(eq(squads.id, input.squadId));
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AppError("CONFLICT", "Ce nom de SQUAD est déjà pris.", {
          name: "Ce nom de SQUAD est déjà pris.",
        });
      }
      throw error;
    }

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "squad.update",
      entityType: "squad",
      entityId: input.squadId,
      before: { name: current.name },
      after: { name: input.name ?? current.name },
    });

    return getSquad(tx, { squadId: input.squadId }, actor.playerId);
  });
}

/**
 * Demande d'adhésion (SQUAD-002).
 *
 * Le joueur ne rejoint pas d'autorité : un fondateur ou un capitaine tranche.
 * La demande est refusée d'emblée s'il appartient déjà à un club — mieux vaut
 * le dire au moment de cliquer qu'après une attente inutile.
 */
export async function requestToJoin(
  actor: { userId: number; playerId: number },
  input: { squadId: number; message?: string | null | undefined },
): Promise<void> {
  await db.transaction(async (tx) => {
    const squad = await lockSquad(tx, input.squadId);
    if (squad.status !== "active") {
      throw new AppError("RULE_VIOLATION", "Ce SQUAD ne recrute plus.");
    }

    const existing = await activeMembership(tx, actor.playerId);
    if (existing) {
      throw new AppError(
        "RULE_VIOLATION",
        existing.squadId === input.squadId
          ? "Vous êtes déjà membre de ce SQUAD."
          : "Vous appartenez déjà à un SQUAD. Quittez-le avant d'en rejoindre un autre.",
      );
    }

    try {
      await tx.insert(squadJoinRequests).values({
        squadId: input.squadId,
        playerId: actor.playerId,
        message: input.message ?? null,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AppError(
          "CONFLICT",
          "Votre demande est déjà en attente auprès de ce SQUAD.",
        );
      }
      throw error;
    }
  });
}

/** Retire une demande qu'on a déposée soi-même. */
export async function cancelJoinRequest(
  actor: { playerId: number },
  requestId: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(squadJoinRequests)
      .where(eq(squadJoinRequests.id, requestId))
      .for("update")
      .limit(1);

    if (!request || request.playerId !== actor.playerId) {
      throw new AppError("NOT_FOUND", "Cette demande est introuvable.");
    }
    if (request.status !== "pending") {
      throw new AppError("RULE_VIOLATION", "Cette demande a déjà été traitée.");
    }

    await tx
      .update(squadJoinRequests)
      .set({ status: "cancelled", decidedAt: new Date() })
      .where(eq(squadJoinRequests.id, requestId));
  });
}

/**
 * Accepte ou refuse une demande (fondateur ou capitaine).
 *
 * L'acceptation inscrit le joueur et **annule ses autres demandes** : elles
 * n'ont plus d'objet, et les laisser en attente exposerait un fondateur
 * tiers à accepter quelqu'un qui n'est plus libre.
 */
export async function decideJoinRequest(
  actor: { userId: number; playerId: number },
  input: { requestId: number; accept: boolean },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(squadJoinRequests)
      .where(eq(squadJoinRequests.id, input.requestId))
      .for("update")
      .limit(1);

    if (!request) throw new AppError("NOT_FOUND", "Cette demande est introuvable.");
    if (request.status !== "pending") {
      throw new AppError("RULE_VIOLATION", "Cette demande a déjà été traitée.");
    }

    await assertSquadRole(tx, actor.playerId, request.squadId, "captain");

    await tx
      .update(squadJoinRequests)
      .set({
        status: input.accept ? "accepted" : "rejected",
        decidedAt: new Date(),
        decidedByPlayerId: actor.playerId,
      })
      .where(eq(squadJoinRequests.id, input.requestId));

    if (!input.accept) return;

    try {
      await tx.insert(squadMembers).values({
        squadId: request.squadId,
        playerId: request.playerId,
        role: "member",
      });
    } catch (error) {
      // Le joueur a rejoint un autre club entre-temps : l'index unique le dit
      // mieux qu'une lecture préalable ne l'aurait deviné.
      if (isDuplicateKeyError(error)) {
        throw new AppError(
          "CONFLICT",
          "Ce joueur a rejoint un autre SQUAD entre-temps.",
        );
      }
      throw error;
    }

    await tx
      .update(squadJoinRequests)
      .set({ status: "cancelled", decidedAt: new Date() })
      .where(
        and(
          eq(squadJoinRequests.playerId, request.playerId),
          eq(squadJoinRequests.status, "pending"),
          ne(squadJoinRequests.id, input.requestId),
        ),
      );

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "squad.member.join",
      entityType: "squad",
      entityId: request.squadId,
      after: { playerId: request.playerId },
    });
  });
}

/** Promeut ou rétrograde un membre (fondateur seul). */
export async function setMemberRole(
  actor: { userId: number; playerId: number },
  input: { squadId: number; playerId: number; role: "captain" | "member" },
): Promise<void> {
  await db.transaction(async (tx) => {
    await assertSquadRole(tx, actor.playerId, input.squadId, "founder");

    const [member] = await tx
      .select()
      .from(squadMembers)
      .where(
        and(
          eq(squadMembers.squadId, input.squadId),
          eq(squadMembers.playerId, input.playerId),
          eq(squadMembers.status, "active"),
        ),
      )
      .for("update")
      .limit(1);

    if (!member) {
      throw new AppError("NOT_FOUND", "Ce joueur n'est pas membre de ce SQUAD.");
    }
    if (member.role === "founder") {
      throw new AppError(
        "RULE_VIOLATION",
        "Le rôle de fondateur se transmet, il ne se retire pas.",
      );
    }

    await tx
      .update(squadMembers)
      .set({ role: input.role })
      .where(eq(squadMembers.id, member.id));

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "squad.member.role",
      entityType: "squad",
      entityId: input.squadId,
      before: { playerId: input.playerId, role: member.role },
      after: { playerId: input.playerId, role: input.role },
    });
  });
}

/**
 * Ferme l'appartenance d'un joueur à son club.
 *
 * La ligne n'est pas supprimée mais close : les compositions de match et les
 * transferts passés s'y adossent, et les effacer réécrirait l'histoire
 * (AC15). C'est aussi ce qui libère la place — la colonne générée cesse de
 * porter l'identifiant du joueur, qui peut alors rejoindre ailleurs.
 */
async function closeMembership(
  tx: Transaction,
  membershipId: number,
  status: "left" | "removed",
): Promise<void> {
  await tx
    .update(squadMembers)
    .set({ status, leftAt: new Date() })
    .where(eq(squadMembers.id, membershipId));
}

/**
 * Quitter son club.
 *
 * **Un fondateur ne part pas sans avoir transmis.** Un club sans fondateur ne
 * pourrait plus être administré : ni renommé, ni dissous, ni doté d'un
 * capitaine. Deux issues seulement — transmettre à quelqu'un, ou dissoudre le
 * club s'il en est le dernier membre.
 */
export async function leaveSquad(actor: {
  userId: number;
  playerId: number;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const membership = await activeMembership(tx, actor.playerId);
    if (!membership) {
      throw new AppError("RULE_VIOLATION", "Vous n'appartenez à aucun SQUAD.");
    }

    await lockSquad(tx, membership.squadId);
    const remaining = (await memberCountOf(tx, membership.squadId)) - 1;

    if (membership.role === "founder" && remaining > 0) {
      throw new AppError(
        "RULE_VIOLATION",
        "Transmettez d'abord le SQUAD à un autre membre : un club sans " +
          "fondateur ne peut plus être administré.",
      );
    }

    const [row] = await tx
      .select({ id: squadMembers.id })
      .from(squadMembers)
      .where(
        and(
          eq(squadMembers.squadId, membership.squadId),
          eq(squadMembers.playerId, actor.playerId),
          eq(squadMembers.status, "active"),
        ),
      )
      .limit(1);

    if (row) await closeMembership(tx, row.id, "left");

    // Dernier membre parti : le club n'a plus d'effectif. Il est dissous, et
    // non supprimé — son histoire de matchs reste lisible.
    if (remaining === 0) {
      await tx
        .update(squads)
        .set({
          status: "dissolved",
          // Le nom cesse d'être réservé : un autre club pourra le reprendre,
          // sans que celui-ci perde le sien dans son histoire (SQUAD-002).
          activeName: null,
          activeSlug: null,
          updatedAt: new Date(),
        })
        .where(eq(squads.id, membership.squadId));
    }

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "squad.member.leave",
      entityType: "squad",
      entityId: membership.squadId,
      after: { playerId: actor.playerId, dissolved: remaining === 0 },
    });
  });
}

/** Exclut un membre (fondateur ou capitaine ; le fondateur est intouchable). */
export async function removeMember(
  actor: { userId: number; playerId: number },
  input: { squadId: number; playerId: number },
): Promise<void> {
  await db.transaction(async (tx) => {
    const actorRole = await assertSquadRole(
      tx,
      actor.playerId,
      input.squadId,
      "captain",
    );

    if (input.playerId === actor.playerId) {
      throw new AppError(
        "RULE_VIOLATION",
        "Pour partir vous-même, utilisez « Quitter le SQUAD ».",
      );
    }

    const [member] = await tx
      .select()
      .from(squadMembers)
      .where(
        and(
          eq(squadMembers.squadId, input.squadId),
          eq(squadMembers.playerId, input.playerId),
          eq(squadMembers.status, "active"),
        ),
      )
      .for("update")
      .limit(1);

    if (!member) {
      throw new AppError("NOT_FOUND", "Ce joueur n'est pas membre de ce SQUAD.");
    }
    if (member.role === "founder") {
      throw new AppError("RULE_VIOLATION", "Le fondateur ne peut pas être exclu.");
    }
    // Un capitaine ne destitue pas un autre capitaine : entre pairs, c'est au
    // fondateur de trancher.
    if (member.role === "captain" && actorRole !== "founder") {
      throw new AppError(
        "RULE_VIOLATION",
        "Seul le fondateur peut exclure un capitaine.",
      );
    }

    await closeMembership(tx, member.id, "removed");

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "squad.member.remove",
      entityType: "squad",
      entityId: input.squadId,
      after: { playerId: input.playerId, role: member.role },
    });
  });
}

/**
 * Transmet la fondation à un autre membre.
 *
 * Les deux lignes changent dans la même transaction : un club à deux
 * fondateurs, ou sans aucun, ne doit exister à aucun instant.
 */
export async function transferOwnership(
  actor: { userId: number; playerId: number },
  input: { squadId: number; toPlayerId: number },
): Promise<void> {
  await db.transaction(async (tx) => {
    await assertSquadRole(tx, actor.playerId, input.squadId, "founder");

    if (input.toPlayerId === actor.playerId) {
      throw new AppError("RULE_VIOLATION", "Vous êtes déjà fondateur.");
    }

    const [heir] = await tx
      .select()
      .from(squadMembers)
      .where(
        and(
          eq(squadMembers.squadId, input.squadId),
          eq(squadMembers.playerId, input.toPlayerId),
          eq(squadMembers.status, "active"),
        ),
      )
      .for("update")
      .limit(1);

    if (!heir) {
      throw new AppError(
        "NOT_FOUND",
        "Ce joueur n'est pas membre de ce SQUAD.",
      );
    }

    await tx
      .update(squadMembers)
      .set({ role: "member" })
      .where(
        and(
          eq(squadMembers.squadId, input.squadId),
          eq(squadMembers.playerId, actor.playerId),
          eq(squadMembers.status, "active"),
        ),
      );

    await tx
      .update(squadMembers)
      .set({ role: "founder" })
      .where(eq(squadMembers.id, heir.id));

    await tx
      .update(squads)
      .set({ founderPlayerId: input.toPlayerId, updatedAt: new Date() })
      .where(eq(squads.id, input.squadId));

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "squad.ownership.transfer",
      entityType: "squad",
      entityId: input.squadId,
      before: { founderPlayerId: actor.playerId },
      after: { founderPlayerId: input.toPlayerId },
    });
  });
}
