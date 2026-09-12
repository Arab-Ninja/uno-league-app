import { and, eq, inArray, ne, sql } from "drizzle-orm";
import {
  AppError,
  SQUAD_ROSTER_SIZE,
  squadSeatPriceUno,
  type SquadRosterView,
  type SquadSeatView,
  type SquadSeatSource,
} from "@uno/shared";
import { db, type Executor, type Transaction } from "../db/client.js";
import { isDuplicateKeyError } from "../lib/errors.js";
import {
  players,
  squadChallengeSeats,
  squadChallenges,
  squadMembers,
  squads,
} from "../db/schema.js";
import { publicPlayerColumns, toPublicPlayer } from "./players.service.js";
import { credit, debit } from "./ledger.service.js";
import { moveTreasury } from "./squad-treasury.service.js";
import { assertSquadRole } from "./squads.service.js";
import { writeAudit } from "./audit.service.js";

/**
 * Places d'un défi SQUAD (SQUAD-006).
 *
 * **Chaque joueur paie sa place, comme en League.** Le client a tranché ainsi,
 * et a ajouté une dérogation : la caisse du club peut prendre à sa charge un
 * ou plusieurs joueurs pour une séance, sur décision du fondateur. Les deux
 * chemins mènent au même endroit — une place réglée — mais l'argent ne vient
 * pas de la même poche, et le registre doit le dire.
 *
 * Deux choses qu'on ne mélange pas :
 *
 *  - **la mise** engage le club, elle est séquestrée à l'acceptation du défi
 *    et revient au vainqueur ;
 *  - **la place** paie la salle, elle est dépensée quoi qu'il arrive.
 *
 * Les confondre reviendrait à croire qu'une équipe qui gagne joue gratuitement.
 */

/** Verrouille un défi : composition et règlement s'y adossent. */
async function lockChallenge(tx: Transaction, challengeId: number) {
  const [row] = await tx
    .select()
    .from(squadChallenges)
    .where(eq(squadChallenges.id, challengeId))
    .for("update")
    .limit(1);

  if (!row) throw new AppError("NOT_FOUND", "Ce défi est introuvable.");
  return row;
}

/**
 * Un défi dont on peut composer l'équipe.
 *
 * Avant l'acceptation, il n'y a pas de match : inscrire des joueurs les
 * ferait payer une place pour une rencontre qui n'aura peut-être pas lieu.
 * Après le règlement, la composition appartient à l'histoire.
 */
function assertOpenForComposition(
  row: typeof squadChallenges.$inferSelect,
): void {
  if (row.status !== "accepted") {
    throw new AppError(
      "RULE_VIOLATION",
      row.status === "pending"
        ? "La composition s'ouvre une fois le défi accepté."
        : "Ce défi est clos : sa composition n'est plus modifiable.",
    );
  }

  /**
   * L'effectif est figé au coup d'envoi (SQUAD-005).
   *
   * Dès que le match existe, la feuille dit qui joue — et bientôt qui a joué.
   * La retoucher après coup reviendrait à réécrire la composition d'une
   * rencontre en cours ou déjà disputée, et à rembourser une place dont le
   * titulaire est sur le terrain.
   */
  if (row.matchId !== null) {
    throw new AppError(
      "RULE_VIOLATION",
      "Le match est créé : la composition est figée.",
    );
  }
}

/** Le club de l'acteur dans ce défi, ou une erreur s'il n'y est pour rien. */
function sideOf(
  row: typeof squadChallenges.$inferSelect,
  squadId: number,
): number {
  if (squadId === row.challengerSquadId || squadId === row.challengedSquadId) {
    return squadId;
  }
  throw new AppError("RULE_VIOLATION", "Ce club n'est pas partie à ce défi.");
}

/** Les places encore vivantes d'un club pour un défi. */
async function liveSeats(
  executor: Executor,
  challengeId: number,
  squadId?: number,
) {
  return executor
    .select()
    .from(squadChallengeSeats)
    .where(
      and(
        eq(squadChallengeSeats.challengeId, challengeId),
        ne(squadChallengeSeats.status, "released"),
        ...(squadId === undefined
          ? []
          : [eq(squadChallengeSeats.squadId, squadId)]),
      ),
    );
}

/** La place vivante d'un joueur dans un défi, s'il en a une. */
async function seatOf(
  executor: Executor,
  challengeId: number,
  playerId: number,
) {
  const [row] = await executor
    .select()
    .from(squadChallengeSeats)
    .where(
      and(
        eq(squadChallengeSeats.challengeId, challengeId),
        eq(squadChallengeSeats.playerId, playerId),
        ne(squadChallengeSeats.status, "released"),
      ),
    )
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/**
 * Inscrit un joueur sur la feuille (AC06).
 *
 * Réservé au fondateur et aux capitaines : composer l'équipe est un acte de
 * direction, et il engage la caisse dès lors qu'elle peut prendre la place à
 * sa charge.
 */
export async function addSeat(
  actor: { userId: number; playerId: number },
  input: { challengeId: number; playerId: number },
): Promise<SquadRosterView[]> {
  await db.transaction(async (tx) => {
    const challenge = await lockChallenge(tx, input.challengeId);
    assertOpenForComposition(challenge);

    // Le club de l'acteur décide de quelle feuille il s'agit : on ne compose
    // pas l'équipe d'en face.
    const [membership] = await tx
      .select({ squadId: squadMembers.squadId })
      .from(squadMembers)
      .where(
        and(
          eq(squadMembers.playerId, actor.playerId),
          eq(squadMembers.status, "active"),
        ),
      )
      .limit(1);

    if (!membership) {
      throw new AppError("RULE_VIOLATION", "Vous n'appartenez à aucun SQUAD.");
    }

    const squadId = sideOf(challenge, membership.squadId);
    await assertSquadRole(tx, actor.playerId, squadId, "captain");

    // Le joueur inscrit doit être des nôtres : une feuille n'accueille pas un
    // joueur d'un autre club, ni un joueur sans club.
    const [target] = await tx
      .select({ id: squadMembers.id })
      .from(squadMembers)
      .where(
        and(
          eq(squadMembers.squadId, squadId),
          eq(squadMembers.playerId, input.playerId),
          eq(squadMembers.status, "active"),
        ),
      )
      .limit(1);

    if (!target) {
      throw new AppError(
        "RULE_VIOLATION",
        "Ce joueur n'est pas membre actif de votre SQUAD.",
      );
    }

    const seats = await liveSeats(tx, challenge.id, squadId);
    if (seats.length >= SQUAD_ROSTER_SIZE) {
      throw new AppError(
        "RULE_VIOLATION",
        `La feuille est complète : ${SQUAD_ROSTER_SIZE} joueurs par équipe.`,
      );
    }

    try {
      await tx.insert(squadChallengeSeats).values({
        challengeId: challenge.id,
        squadId,
        playerId: input.playerId,
        // Figé maintenant : un changement de tarif ne doit toucher ni ce que
        // ce joueur doit, ni ce qu'un remboursement lui rendra.
        priceUno: squadSeatPriceUno(challenge.durationMinutes),
      });
    } catch (error) {
      // L'index unique tient la règle : deux inscriptions simultanées du même
      // joueur ne peuvent pas passer toutes les deux.
      if (isDuplicateKeyError(error)) {
        throw new AppError(
          "CONFLICT",
          "Ce joueur figure déjà sur la feuille de ce défi.",
        );
      }
      throw error;
    }

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "squad.seat.add",
      entityType: "squad_challenge",
      entityId: challenge.id,
      after: { squadId, playerId: input.playerId },
    });
  });

  return rostersOf(db, input.challengeId, actor.playerId);
}

/**
 * Retire un joueur de la feuille, et lui rend ce qu'il avait payé.
 *
 * Le remboursement revient d'où l'argent venait : au portefeuille du joueur
 * s'il avait réglé lui-même, à la caisse si elle l'avait pris en charge.
 * Rendre systématiquement au joueur ferait de chaque remaniement un cadeau
 * aux dépens du club.
 */
export async function removeSeat(
  actor: { userId: number; playerId: number },
  input: { challengeId: number; playerId: number },
): Promise<SquadRosterView[]> {
  await db.transaction(async (tx) => {
    const challenge = await lockChallenge(tx, input.challengeId);
    assertOpenForComposition(challenge);

    const seat = await seatOf(tx, challenge.id, input.playerId);
    if (!seat) {
      throw new AppError("NOT_FOUND", "Ce joueur n'est pas sur la feuille.");
    }

    // Un joueur peut se retirer lui-même ; sinon il faut diriger le club.
    if (input.playerId !== actor.playerId) {
      await assertSquadRole(tx, actor.playerId, seat.squadId, "captain");
    }

    await releaseSeat(tx, seat, "Place libérée");

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "squad.seat.remove",
      entityType: "squad_challenge",
      entityId: challenge.id,
      before: { playerId: seat.playerId, status: seat.status },
    });
  });

  return rostersOf(db, input.challengeId, actor.playerId);
}

/**
 * Libère une place et rembourse ce qui avait été réglé.
 *
 * Exporté parce que l'annulation d'un défi accepté passe par le même geste,
 * pour toutes les places d'un coup : un seul chemin de remboursement, donc
 * une seule façon de se tromper.
 */
export async function releaseSeat(
  tx: Transaction,
  seat: typeof squadChallengeSeats.$inferSelect,
  reason: string,
): Promise<void> {
  if (seat.status === "paid") {
    if (seat.paidBy === "treasury") {
      await moveTreasury(tx, {
        squadId: seat.squadId,
        playerId: seat.playerId,
        available: seat.priceUno,
        type: "seat_refund",
        description: `${reason} — remboursement de la caisse`,
        referenceType: "seat",
        referenceId: seat.id,
        idempotencyKey: `squad:seat:${seat.id}:refund`,
      });
    } else {
      await credit(tx, {
        playerId: seat.playerId,
        amount: seat.priceUno,
        type: "refund",
        description: `${reason} — défi SQUAD`,
        referenceType: "seat",
        referenceId: seat.id,
        idempotencyKey: `squad:seat:${seat.id}:refund`,
      });
    }
  }

  await tx
    .update(squadChallengeSeats)
    .set({ status: "released", updatedAt: new Date() })
    .where(eq(squadChallengeSeats.id, seat.id));
}

/** Libère toutes les places d'un défi : utilisé quand il est annulé. */
export async function releaseAllSeats(
  tx: Transaction,
  challengeId: number,
  reason: string,
): Promise<number> {
  const seats = await liveSeats(tx, challengeId);
  for (const seat of seats) {
    await releaseSeat(tx, seat, reason);
  }
  return seats.length;
}

// ---------------------------------------------------------------------------
// Règlement d'une place
// ---------------------------------------------------------------------------

/** Marque une place réglée, quelle que soit la poche d'où vient l'argent. */
async function markPaid(
  tx: Transaction,
  seatId: number,
  source: SquadSeatSource,
): Promise<void> {
  await tx
    .update(squadChallengeSeats)
    .set({ status: "paid", paidBy: source, paidAt: new Date(), updatedAt: new Date() })
    .where(eq(squadChallengeSeats.id, seatId));
}

/**
 * Le joueur règle sa propre place, depuis son portefeuille.
 *
 * `debit` refuse un solde insuffisant sans rien écrire : on ne peut pas se
 * retrouver avec une place réglée et un portefeuille intact.
 */
export async function paySeat(
  actor: { userId: number; playerId: number },
  input: { challengeId: number },
): Promise<SquadRosterView[]> {
  await db.transaction(async (tx) => {
    const challenge = await lockChallenge(tx, input.challengeId);
    assertOpenForComposition(challenge);

    const seat = await seatOf(tx, challenge.id, actor.playerId);
    if (!seat) {
      throw new AppError(
        "RULE_VIOLATION",
        "Vous ne figurez pas sur la feuille de ce défi.",
      );
    }
    if (seat.status === "paid") return;

    await debit(tx, {
      playerId: actor.playerId,
      amount: seat.priceUno,
      type: "session_fee",
      description: "Place — défi SQUAD",
      referenceType: "seat",
      referenceId: seat.id,
      idempotencyKey: `squad:seat:${seat.id}:pay`,
    });

    await markPaid(tx, seat.id, "player");
  });

  return rostersOf(db, input.challengeId, actor.playerId);
}

/**
 * La caisse prend des places à sa charge (décision du fondateur).
 *
 * **Le fondateur seul**, et c'est la demande du client telle quelle : engager
 * la caisse pour autrui n'est pas un pouvoir de capitaine. Les places déjà
 * réglées de la liste sont ignorées plutôt que refusées — désigner cinq
 * joueurs dont deux ont déjà payé est un geste normal, pas une erreur.
 */
export async function coverSeats(
  actor: { userId: number; playerId: number },
  input: { challengeId: number; playerIds: number[] },
): Promise<SquadRosterView[]> {
  await db.transaction(async (tx) => {
    const challenge = await lockChallenge(tx, input.challengeId);
    assertOpenForComposition(challenge);

    const [membership] = await tx
      .select({ squadId: squadMembers.squadId })
      .from(squadMembers)
      .where(
        and(
          eq(squadMembers.playerId, actor.playerId),
          eq(squadMembers.status, "active"),
        ),
      )
      .limit(1);

    if (!membership) {
      throw new AppError("RULE_VIOLATION", "Vous n'appartenez à aucun SQUAD.");
    }

    const squadId = sideOf(challenge, membership.squadId);
    await assertSquadRole(tx, actor.playerId, squadId, "founder");

    const seats = await liveSeats(tx, challenge.id, squadId);
    const byPlayer = new Map(seats.map((seat) => [seat.playerId, seat]));

    for (const playerId of input.playerIds) {
      const seat = byPlayer.get(playerId);
      if (!seat) {
        throw new AppError(
          "RULE_VIOLATION",
          "Un des joueurs désignés n'est pas sur la feuille.",
        );
      }
      if (seat.status === "paid") continue;

      // La caisse refuse d'elle-même un découvert : `moveTreasury` rejette un
      // disponible négatif, et rien n'est écrit.
      await moveTreasury(tx, {
        squadId,
        playerId: seat.playerId,
        available: -seat.priceUno,
        type: "seat_cover",
        description: "Place prise en charge par la caisse",
        referenceType: "seat",
        referenceId: seat.id,
        idempotencyKey: `squad:seat:${seat.id}:cover`,
      });

      await markPaid(tx, seat.id, "treasury");
    }

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "squad.seat.cover",
      entityType: "squad_challenge",
      entityId: challenge.id,
      after: { squadId, playerIds: input.playerIds },
    });
  });

  return rostersOf(db, input.challengeId, actor.playerId);
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/**
 * Les deux compositions d'un défi, dans l'ordre défieur puis défié.
 *
 * Les deux camps voient les deux feuilles : savoir qui l'on affronte fait
 * partie du défi. Ce qui reste privé, c'est la caisse — et elle n'apparaît
 * pas ici.
 */
export async function rostersOf(
  executor: Executor,
  challengeId: number,
  viewerPlayerId: number,
): Promise<SquadRosterView[]> {
  const [challenge] = await executor
    .select()
    .from(squadChallenges)
    .where(eq(squadChallenges.id, challengeId))
    .limit(1);

  if (!challenge) return [];
  // Avant l'acceptation il n'y a rien à composer, et donc rien à montrer.
  if (challenge.status === "pending") return [];

  const rows = await executor
    .select({
      // Aliasé : `publicPlayerColumns` apporte son propre `id`, celui du
      // joueur, et la dernière clé écrite l'emporterait sur celle de la place.
      seatId: squadChallengeSeats.id,
      squadId: squadChallengeSeats.squadId,
      priceUno: squadChallengeSeats.priceUno,
      status: squadChallengeSeats.status,
      paidBy: squadChallengeSeats.paidBy,
      paidAt: squadChallengeSeats.paidAt,
      ...publicPlayerColumns,
    })
    .from(squadChallengeSeats)
    .innerJoin(players, eq(players.id, squadChallengeSeats.playerId))
    .where(
      and(
        eq(squadChallengeSeats.challengeId, challengeId),
        ne(squadChallengeSeats.status, "released"),
      ),
    )
    .orderBy(squadChallengeSeats.id);

  const badges = await executor
    .select({
      id: squads.id,
      name: squads.name,
      slug: squads.slug,
      rating: squads.rating,
      avatarUrl: squads.avatarUrl,
    })
    .from(squads)
    .where(
      inArray(squads.id, [
        challenge.challengerSquadId,
        challenge.challengedSquadId,
      ]),
    );
  const badgeById = new Map(badges.map((badge) => [badge.id, badge]));

  // Le rôle du spectateur décide de ce qu'il peut faire, pas de ce qu'il voit.
  const [viewer] = await executor
    .select({ squadId: squadMembers.squadId, role: squadMembers.role })
    .from(squadMembers)
    .where(
      and(
        eq(squadMembers.playerId, viewerPlayerId),
        eq(squadMembers.status, "active"),
      ),
    )
    .limit(1);

  // Composable tant que le match n'existe pas : après, l'effectif est figé.
  const composable = challenge.status === "accepted" && challenge.matchId === null;

  return [challenge.challengerSquadId, challenge.challengedSquadId].map(
    (squadId) => {
      const seats: SquadSeatView[] = rows
        .filter((row) => row.squadId === squadId)
        .map(({ seatId, squadId: _squadId, priceUno, status, paidBy, paidAt, ...player }) => ({
          id: seatId,
          player: toPublicPlayer(player),
          priceUno,
          status,
          paidBy,
          paidAt: paidAt ? paidAt.toISOString() : null,
        }));

      const isOwnSquad = viewer?.squadId === squadId;
      const mine = isOwnSquad
        ? seats.find((seat) => seat.player.id === viewerPlayerId)
        : undefined;

      return {
        squad: badgeById.get(squadId) ?? null,
        seats,
        openSlots: Math.max(0, SQUAD_ROSTER_SIZE - seats.length),
        dueUno: seats
          .filter((seat) => seat.status !== "paid")
          .reduce((total, seat) => total + seat.priceUno, 0),
        viewer: {
          mayCompose:
            composable &&
            isOwnSquad &&
            (viewer?.role === "founder" || viewer?.role === "captain"),
          mayCover: composable && isOwnSquad && viewer?.role === "founder",
          mySeatId: mine?.id ?? null,
        },
      };
    },
  );
}

/** Nombre de places réglées d'un club pour un défi, pour les vérifications. */
export async function paidSeatCount(
  executor: Executor,
  challengeId: number,
  squadId: number,
): Promise<number> {
  const rows = await executor
    .select({ total: sql<number>`COUNT(*)` })
    .from(squadChallengeSeats)
    .where(
      and(
        eq(squadChallengeSeats.challengeId, challengeId),
        eq(squadChallengeSeats.squadId, squadId),
        eq(squadChallengeSeats.status, "paid"),
      ),
    );
  return Number(rows[0]?.total ?? 0);
}
