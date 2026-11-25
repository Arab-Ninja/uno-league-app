import { randomBytes } from "node:crypto";
import { and, count, desc, eq, gte, inArray, isNotNull, ne } from "drizzle-orm";
import {
  AppError,
  gabarit,
  type PublicPlayer,
  type SquadSentInvitationView,
  type SquadView,
} from "@uno/shared";
import { db, type Executor, type Transaction } from "../db/client.js";
import { isDuplicateKeyError } from "../lib/errors.js";
import {
  players,
  squadInvitations,
  squadJoinRequests,
  squadMembers,
  squads,
  users,
} from "../db/schema.js";
import { writeAudit } from "./audit.service.js";
import { blockerIds } from "./moderation.service.js";
import { notifyPlayer } from "./notifications.service.js";
import {
  publicPlayerColumns,
  searchPlayers,
  toPublicPlayer,
} from "./players.service.js";
import {
  activeMembership,
  assertSquadRole,
  getSquad,
  lockSquad,
} from "./squads.service.js";

/**
 * Inviter des joueurs dans son club (CLUB-004).
 *
 * Fonder un club ne servait à rien tant qu'on ne pouvait qu'attendre que
 * d'autres le trouvent dans l'annuaire et le demandent. Le fondateur et ses
 * capitaines invitent désormais eux-mêmes, par deux chemins :
 *
 *  - **un joueur de l'application**, cherché par son nom : il est prévenu, et
 *    accepte ou refuse depuis l'onglet Club ;
 *  - **un lien**, pour qui n'a pas encore l'application : il s'inscrit, et le
 *    lien l'amène sur le club, qu'il rejoint d'un geste. Le lien sert tant
 *    qu'on ne le renouvelle pas.
 *
 * Accepter une invitation, c'est entrer : le club a déjà dit oui en invitant.
 * La règle d'une seule affiliation tient toujours — c'est l'index unique de
 * `squad_members` qui la garantit, ici comme pour les demandes.
 */

/** Invitations nominatives envoyées par un même joueur en vingt-quatre heures. */
export const SQUAD_INVITATIONS_PER_DAY = 30;

export type SquadInviteState = "invitable" | "invited" | "member" | "otherClub";

export interface SquadInviteCandidate {
  player: PublicPlayer;
  state: SquadInviteState;
}

/** Un club qui peut encore accueillir : actif, et que le joueur dirige. */
async function assertCanInvite(
  executor: Executor,
  playerId: number,
  squadId: number,
) {
  await assertSquadRole(executor, playerId, squadId, "captain");
  const [squad] = await executor
    .select({ status: squads.status })
    .from(squads)
    .where(eq(squads.id, squadId))
    .limit(1);
  if (squad?.status !== "active") {
    throw new AppError("RULE_VIOLATION", "Ce club ne recrute plus.");
  }
}

/** Qui est déjà membre d'un club, et qui ce club a déjà invité. */
async function knownFor(
  executor: Executor,
  squadId: number,
  playerIds: number[],
): Promise<{ memberOf: Map<number, number>; invited: Set<number> }> {
  if (playerIds.length === 0)
    return { memberOf: new Map(), invited: new Set() };
  const [members, invites] = await Promise.all([
    executor
      .select({
        playerId: squadMembers.playerId,
        squadId: squadMembers.squadId,
      })
      .from(squadMembers)
      .where(
        and(
          inArray(squadMembers.playerId, playerIds),
          eq(squadMembers.status, "active"),
        ),
      ),
    executor
      .select({ playerId: squadInvitations.inviteePlayerId })
      .from(squadInvitations)
      .where(
        and(
          eq(squadInvitations.squadId, squadId),
          eq(squadInvitations.status, "pending"),
          inArray(squadInvitations.inviteePlayerId, playerIds),
        ),
      ),
  ]);
  return {
    memberOf: new Map(members.map((row) => [row.playerId, row.squadId])),
    invited: new Set(
      invites
        .map((row) => row.playerId)
        .filter((id): id is number => id !== null),
    ),
  };
}

function stateOf(
  squadId: number,
  playerId: number,
  known: { memberOf: Map<number, number>; invited: Set<number> },
): SquadInviteState {
  const club = known.memberOf.get(playerId);
  if (club === squadId) return "member";
  if (club !== undefined) return "otherClub";
  if (known.invited.has(playerId)) return "invited";
  return "invitable";
}

/**
 * Les joueurs à inviter, trouvés par leur nom, chacun avec son état : un ami
 * introuvable inquiète, le voir « déjà dans un club » répond à la question.
 */
export async function squadInviteCandidates(
  actor: { playerId: number },
  input: { squadId: number; query: string },
): Promise<SquadInviteCandidate[]> {
  await assertCanInvite(db, actor.playerId, input.squadId);
  const found = await searchPlayers(db, {
    query: input.query,
    limit: 20,
    excludePlayerId: actor.playerId,
  });
  const known = await knownFor(
    db,
    input.squadId,
    found.map((player) => player.id),
  );
  const order: Record<SquadInviteState, number> = {
    invitable: 0,
    invited: 1,
    member: 2,
    otherClub: 3,
  };
  return found
    .map((player) => ({
      player,
      state: stateOf(input.squadId, player.id, known),
    }))
    .sort((a, b) => order[a.state] - order[b.state]);
}

/**
 * Invite des joueurs de l'application.
 *
 * Ceux qui ne peuvent pas l'être — déjà membres, déjà dans un autre club,
 * déjà invités — sont passés sans erreur : un cas particulier ne fait pas
 * échouer les autres. Un joueur qui a bloqué l'invitant compte parmi les
 * passés, sans que l'invitant l'apprenne (MOD-001).
 */
export async function invitePlayersToSquad(
  actor: { userId: number; playerId: number },
  input: { squadId: number; playerIds: number[] },
): Promise<{ invited: number; skipped: number }> {
  const requested = [...new Set(input.playerIds)].filter(
    (id) => id !== actor.playerId,
  );

  const outcome = await db.transaction(async (tx) => {
    await lockSquad(tx, input.squadId);
    await assertCanInvite(tx, actor.playerId, input.squadId);

    const candidates =
      requested.length === 0
        ? []
        : await tx
            .select({ id: players.id })
            .from(players)
            .innerJoin(users, eq(users.id, players.userId))
            .where(
              and(inArray(players.id, requested), eq(users.status, "active")),
            );
    const known = await knownFor(
      tx,
      input.squadId,
      candidates.map((row) => row.id),
    );
    const blockers = await blockerIds(tx, actor.playerId);
    const eligible = candidates.filter(
      (row) =>
        !blockers.has(row.id) &&
        stateOf(input.squadId, row.id, known) === "invitable",
    );

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [sent] = await tx
      .select({ total: count() })
      .from(squadInvitations)
      .where(
        and(
          eq(squadInvitations.inviterPlayerId, actor.playerId),
          gte(squadInvitations.createdAt, since),
        ),
      );
    if ((sent?.total ?? 0) + eligible.length > SQUAD_INVITATIONS_PER_DAY) {
      throw new AppError(
        "RULE_VIOLATION",
        gabarit("Limite atteinte : {max} invitations par jour.", {
          max: SQUAD_INVITATIONS_PER_DAY,
        }),
      );
    }

    const created: number[] = [];
    for (const row of eligible) {
      try {
        await tx.insert(squadInvitations).values({
          squadId: input.squadId,
          inviteePlayerId: row.id,
          inviterPlayerId: actor.playerId,
        });
        created.push(row.id);
      } catch (error) {
        // Un capitaine l'a invité au même instant : la sienne suffit.
        if (!isDuplicateKeyError(error)) throw error;
      }
    }

    const [club] = await tx
      .select({ name: squads.name, slug: squads.slug })
      .from(squads)
      .where(eq(squads.id, input.squadId))
      .limit(1);
    const [inviter] = await tx
      .select({ displayName: players.displayName })
      .from(players)
      .where(eq(players.id, actor.playerId))
      .limit(1);

    if (created.length > 0) {
      await writeAudit(tx, {
        actorUserId: actor.userId,
        action: "squad.invite",
        entityType: "squad",
        entityId: input.squadId,
        after: { invited: created.length },
      });
    }

    return {
      created,
      club: club ?? { name: "", slug: "" },
      inviterName: inviter?.displayName ?? "",
    };
  });

  // Hors de la transaction : le réseau n'a rien à faire sous un verrou.
  for (const playerId of outcome.created) {
    await notifyPlayer(
      {
        playerId,
        eventKey: `squad:${input.squadId}:invited:${playerId}`,
        category: "sessions",
        title: gabarit("Invitation dans un club"),
        body: gabarit("{nom} vous invite à rejoindre le club {club}.", {
          nom: outcome.inviterName,
          club: outcome.club.name,
        }),
        url: `/squad/${outcome.club.slug}`,
      },
      db,
    );
  }

  return {
    invited: outcome.created.length,
    skipped: requested.length - outcome.created.length,
  };
}

/** Les invitations nominatives du club encore sans réponse. */
export async function sentInvitations(
  actor: { playerId: number },
  squadId: number,
): Promise<SquadSentInvitationView[]> {
  await assertSquadRole(db, actor.playerId, squadId, "captain");
  const inviters = await db
    .select({ id: squadInvitations.id, name: players.displayName })
    .from(squadInvitations)
    .innerJoin(players, eq(players.id, squadInvitations.inviterPlayerId))
    .where(
      and(
        eq(squadInvitations.squadId, squadId),
        eq(squadInvitations.status, "pending"),
      ),
    );
  const inviterOf = new Map(inviters.map((row) => [row.id, row.name]));

  const rows = await db
    .select({
      invitationId: squadInvitations.id,
      createdAt: squadInvitations.createdAt,
      ...publicPlayerColumns,
    })
    .from(squadInvitations)
    .innerJoin(players, eq(players.id, squadInvitations.inviteePlayerId))
    .where(
      and(
        eq(squadInvitations.squadId, squadId),
        eq(squadInvitations.status, "pending"),
      ),
    )
    .orderBy(desc(squadInvitations.createdAt));

  return rows.map(({ invitationId, createdAt, ...player }) => ({
    id: invitationId,
    player: toPublicPlayer(player),
    inviterName: inviterOf.get(invitationId) ?? "",
    createdAt: createdAt.toISOString(),
  }));
}

/** Retire une invitation nominative encore sans réponse (fondateur, capitaine). */
export async function cancelSquadInvitation(
  actor: { playerId: number },
  invitationId: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    const invitation = await lockInvitation(tx, invitationId);
    await assertSquadRole(tx, actor.playerId, invitation.squadId, "captain");
    if (
      invitation.status !== "pending" ||
      invitation.inviteePlayerId === null
    ) {
      throw new AppError(
        "RULE_VIOLATION",
        "Cette invitation a déjà reçu une réponse.",
      );
    }
    await tx
      .update(squadInvitations)
      .set({ status: "cancelled", decidedAt: new Date() })
      .where(eq(squadInvitations.id, invitationId));
  });
}

async function lockInvitation(tx: Transaction, invitationId: number) {
  const [invitation] = await tx
    .select()
    .from(squadInvitations)
    .where(eq(squadInvitations.id, invitationId))
    .for("update")
    .limit(1);
  if (!invitation) {
    throw new AppError("NOT_FOUND", "Cette invitation est introuvable.");
  }
  return invitation;
}

/**
 * Fait entrer un joueur dans un club, sur invitation.
 *
 * Ce qu'il avait en cours ailleurs n'a plus d'objet : ses demandes et ses
 * autres invitations sont closes, comme à l'acceptation d'une demande.
 */
async function enterSquad(
  tx: Transaction,
  actor: { userId: number; playerId: number },
  squadId: number,
  via: "invitation" | "link",
): Promise<void> {
  const squad = await lockSquad(tx, squadId);
  if (squad.status !== "active") {
    throw new AppError("RULE_VIOLATION", "Ce club ne recrute plus.");
  }

  const existing = await activeMembership(tx, actor.playerId);
  if (existing) {
    throw new AppError(
      "RULE_VIOLATION",
      existing.squadId === squadId
        ? "Vous êtes déjà membre de ce club."
        : "Vous appartenez déjà à un club. Quittez-le avant d'en rejoindre un autre.",
    );
  }

  try {
    await tx.insert(squadMembers).values({
      squadId,
      playerId: actor.playerId,
      role: "member",
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AppError(
        "CONFLICT",
        "Vous appartenez déjà à un club. Quittez-le avant d'en rejoindre un autre.",
      );
    }
    throw error;
  }

  const closed = { status: "cancelled" as const, decidedAt: new Date() };
  await tx
    .update(squadJoinRequests)
    .set(closed)
    .where(
      and(
        eq(squadJoinRequests.playerId, actor.playerId),
        eq(squadJoinRequests.status, "pending"),
      ),
    );
  await tx
    .update(squadInvitations)
    .set(closed)
    .where(
      and(
        eq(squadInvitations.inviteePlayerId, actor.playerId),
        eq(squadInvitations.status, "pending"),
        ne(squadInvitations.squadId, squadId),
      ),
    );

  await writeAudit(tx, {
    actorUserId: actor.userId,
    action: "squad.member.join",
    entityType: "squad",
    entityId: squadId,
    after: { playerId: actor.playerId, via },
  });
}

/** Accepte ou refuse une invitation qu'on a reçue. */
export async function respondToSquadInvitation(
  actor: { userId: number; playerId: number },
  input: { invitationId: number; accept: boolean },
): Promise<void> {
  await db.transaction(async (tx) => {
    const invitation = await lockInvitation(tx, input.invitationId);
    if (invitation.inviteePlayerId !== actor.playerId) {
      throw new AppError("NOT_FOUND", "Cette invitation est introuvable.");
    }
    if (invitation.status !== "pending") {
      throw new AppError(
        "RULE_VIOLATION",
        "Cette invitation a déjà reçu une réponse.",
      );
    }

    if (input.accept) {
      await enterSquad(tx, actor, invitation.squadId, "invitation");
    }
    await tx
      .update(squadInvitations)
      .set({
        status: input.accept ? "accepted" : "declined",
        decidedAt: new Date(),
      })
      .where(eq(squadInvitations.id, input.invitationId));
  });
}

/**
 * Le lien d'invitation du club, créé à la première demande.
 *
 * `renew` le remplace : l'ancien cesse aussitôt d'ouvrir le club. C'est le
 * geste à faire quand un lien a circulé plus loin que prévu.
 */
export async function squadInviteLink(
  actor: { playerId: number },
  input: { squadId: number; renew: boolean },
): Promise<{ token: string }> {
  return db.transaction(async (tx) => {
    await lockSquad(tx, input.squadId);
    await assertCanInvite(tx, actor.playerId, input.squadId);

    const linkOf = and(
      eq(squadInvitations.squadId, input.squadId),
      eq(squadInvitations.status, "pending"),
      // Un lien n'a pas d'invité, mais un jeton : c'est ce qui le distingue.
      isNotNull(squadInvitations.token),
    );
    const [current] = await tx
      .select({ id: squadInvitations.id, token: squadInvitations.token })
      .from(squadInvitations)
      .where(linkOf)
      .limit(1);

    if (current?.token && !input.renew) return { token: current.token };

    if (current) {
      await tx
        .update(squadInvitations)
        .set({ status: "cancelled", decidedAt: new Date() })
        .where(eq(squadInvitations.id, current.id));
    }

    const token = randomBytes(18).toString("base64url");
    await tx.insert(squadInvitations).values({
      squadId: input.squadId,
      inviteePlayerId: null,
      inviterPlayerId: actor.playerId,
      token,
    });
    return { token };
  });
}

/** Rejoint un club par son lien d'invitation. */
export async function joinWithSquadLink(
  actor: { userId: number; playerId: number },
  token: string,
): Promise<SquadView> {
  return db.transaction(async (tx) => {
    const [link] = await tx
      .select({ squadId: squadInvitations.squadId })
      .from(squadInvitations)
      .where(
        and(
          eq(squadInvitations.token, token),
          eq(squadInvitations.status, "pending"),
        ),
      )
      .limit(1);
    if (!link) {
      throw new AppError(
        "NOT_FOUND",
        "Ce lien d'invitation n'est plus valable : demandez-en un nouveau au club.",
      );
    }

    await enterSquad(tx, actor, link.squadId, "link");

    // Une invitation nominative dans ce même club a désormais sa réponse.
    await tx
      .update(squadInvitations)
      .set({ status: "accepted", decidedAt: new Date() })
      .where(
        and(
          eq(squadInvitations.squadId, link.squadId),
          eq(squadInvitations.inviteePlayerId, actor.playerId),
          eq(squadInvitations.status, "pending"),
        ),
      );

    return getSquad(tx, { squadId: link.squadId }, actor.playerId);
  });
}
