import { and, desc, eq, inArray, lte, ne, or, sql } from "drizzle-orm";
import {
  AppError,
  isInTransferCooldown,
  mayCounterTransfer,
  minimumCounterFee,
  transferCooldownDaysLeft,
  transferExpiry,
  transferTotalCost,
  type SquadTransferView,
} from "@uno/shared";
import { db, type Executor, type Transaction } from "../db/client.js";
import { isDuplicateKeyError } from "../lib/errors.js";
import {
  players,
  squadChallengeSeats,
  squadChallenges,
  squadMembers,
  squadTransfers,
  squads,
} from "../db/schema.js";
import { publicPlayerColumns, toPublicPlayer } from "./players.service.js";
import { credit } from "./ledger.service.js";
import { moveTreasury } from "./squad-treasury.service.js";
import { activeMembership, assertSquadRole } from "./squads.service.js";
import { writeAudit } from "./audit.service.js";

/**
 * Marché des transferts (SQUAD-008).
 *
 * **Un transfert se conclut à trois**, et c'est ce qui le distingue d'un défi.
 * Le club acheteur propose, le club vendeur cède ou réclame plus, et le joueur
 * tranche en dernier. Chacun des trois peut dire non.
 *
 * L'ordre n'est pas indifférent : le joueur décide **en connaissant les
 * montants définitifs**, une fois la négociation entre clubs terminée. Lui
 * demander son accord d'abord reviendrait à lui faire signer un chèque en
 * blanc, et le redemander après chaque contre-offre transformerait le dossier
 * en va-et-vient sans fin.
 *
 * Deux mouvements d'argent, une seule sortie de caisse : l'indemnité va au
 * club vendeur, la prime de signature au joueur. Les deux sont séquestrées
 * ensemble à l'acceptation du vendeur, pour que l'offre faite au joueur soit
 * couverte pendant tout le temps de sa réflexion.
 */

/** Verrouille un dossier le temps d'une transaction. */
async function lockTransfer(tx: Transaction, transferId: number) {
  const [row] = await tx
    .select()
    .from(squadTransfers)
    .where(eq(squadTransfers.id, transferId))
    .for("update")
    .limit(1);

  if (!row) throw new AppError("NOT_FOUND", "Ce dossier est introuvable.");
  return row;
}

/** Date du dernier transfert abouti de ce joueur, `null` s'il n'en a aucun. */
async function lastCompletedTransfer(
  executor: Executor,
  playerId: number,
): Promise<Date | null> {
  const [row] = await executor
    .select({ decidedAt: squadTransfers.decidedAt })
    .from(squadTransfers)
    .where(
      and(
        eq(squadTransfers.playerId, playerId),
        eq(squadTransfers.status, "accepted"),
      ),
    )
    .orderBy(desc(squadTransfers.decidedAt))
    .limit(1);

  return row?.decidedAt ?? null;
}

/**
 * Refuse le transfert d'un joueur engagé dans un défi en cours.
 *
 * Sa place est tenue et réglée, et l'effectif est peut-être déjà figé : le
 * laisser partir ferait jouer un club avec quatre joueurs, ou ferait
 * disputer la rencontre à quelqu'un qui n'y appartient plus.
 */
async function assertNotEngaged(
  executor: Executor,
  playerId: number,
): Promise<void> {
  const [row] = await executor
    .select({ challengeId: squadChallenges.id })
    .from(squadChallengeSeats)
    .innerJoin(
      squadChallenges,
      eq(squadChallenges.id, squadChallengeSeats.challengeId),
    )
    .where(
      and(
        eq(squadChallengeSeats.playerId, playerId),
        ne(squadChallengeSeats.status, "released"),
        eq(squadChallenges.status, "accepted"),
      ),
    )
    .limit(1);

  if (row) {
    throw new AppError(
      "RULE_VIOLATION",
      "Ce joueur est inscrit sur la feuille d'un défi à venir. " +
        "Retirez-le de la composition avant de le transférer.",
    );
  }
}

/** Le joueur, son club, et de quoi refuser tout de suite si besoin. */
async function assertTransferable(
  tx: Transaction,
  playerId: number,
): Promise<{ fromSquadId: number }> {
  const membership = await activeMembership(tx, playerId);
  if (!membership) {
    throw new AppError(
      "RULE_VIOLATION",
      "Ce joueur n'appartient à aucun SQUAD : il peut demander à rejoindre le vôtre.",
    );
  }

  /**
   * Un fondateur ne se transfère pas.
   *
   * Même raison qu'au départ volontaire : son club se retrouverait sans
   * personne pour l'administrer. Qu'il transmette d'abord.
   */
  if (membership.role === "founder") {
    throw new AppError(
      "RULE_VIOLATION",
      "Un fondateur ne peut pas être transféré : il doit d'abord transmettre son SQUAD.",
    );
  }

  const last = await lastCompletedTransfer(tx, playerId);
  if (isInTransferCooldown(last)) {
    const jours = transferCooldownDaysLeft(last);
    throw new AppError(
      "RULE_VIOLATION",
      `Ce joueur vient d'être transféré : il reste ${jours} jour(s) de carence.`,
    );
  }

  await assertNotEngaged(tx, playerId);

  return { fromSquadId: membership.squadId };
}

// ---------------------------------------------------------------------------
// Liste des transferts
// ---------------------------------------------------------------------------

/**
 * Place un membre sur la liste des transferts, ou l'en retire.
 *
 * Acte du fondateur : afficher un joueur comme cessible engage l'image du
 * club et ouvre la porte aux offres.
 */
export async function setListed(
  actor: { userId: number; playerId: number },
  input: { playerId: number; listed: boolean },
): Promise<void> {
  await db.transaction(async (tx) => {
    const membership = await activeMembership(tx, input.playerId);
    if (!membership) {
      throw new AppError("NOT_FOUND", "Ce joueur n'appartient à aucun SQUAD.");
    }

    await assertSquadRole(tx, actor.playerId, membership.squadId, "founder");

    if (membership.role === "founder") {
      throw new AppError(
        "RULE_VIOLATION",
        "Un fondateur ne se met pas sur la liste des transferts.",
      );
    }

    await tx
      .update(squadMembers)
      .set({ listedAt: input.listed ? new Date() : null })
      .where(
        and(
          eq(squadMembers.playerId, input.playerId),
          eq(squadMembers.status, "active"),
        ),
      );

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "squad.transfer.list",
      entityType: "squad",
      entityId: membership.squadId,
      after: { playerId: input.playerId, listed: input.listed },
    });
  });
}

/** Les joueurs que leur club a placés sur la liste, hors club du visiteur. */
export async function listMarket(
  executor: Executor,
  params: { viewerPlayerId: number; limit: number },
): Promise<SquadTransferView["target"][]> {
  const own = await activeMembership(executor, params.viewerPlayerId);

  const rows = await executor
    .select({
      squadId: squadMembers.squadId,
      squadName: squads.name,
      listedAt: squadMembers.listedAt,
      ...publicPlayerColumns,
    })
    .from(squadMembers)
    .innerJoin(players, eq(players.id, squadMembers.playerId))
    .innerJoin(squads, eq(squads.id, squadMembers.squadId))
    .where(
      and(
        eq(squadMembers.status, "active"),
        sql`${squadMembers.listedAt} IS NOT NULL`,
        eq(squads.status, "active"),
        // Son propre club n'est pas un marché : on ne s'achète pas soi-même.
        ...(own ? [ne(squadMembers.squadId, own.squadId)] : []),
      ),
    )
    .orderBy(desc(squadMembers.listedAt))
    .limit(params.limit);

  return rows.map(({ squadId, squadName, listedAt, ...player }) => ({
    player: toPublicPlayer(player),
    squadId,
    squadName,
    listedAt: listedAt ? listedAt.toISOString() : null,
  }));
}

// ---------------------------------------------------------------------------
// Négociation
// ---------------------------------------------------------------------------

/**
 * Ouvre un dossier : le club acheteur fait une offre.
 *
 * **Réservé au fondateur.** L'offre engage la caisse dès que le vendeur
 * l'accepte, et engager l'argent des autres n'est pas un pouvoir de
 * capitaine — c'est la règle déjà posée pour la prise en charge des places.
 */
export async function openTransfer(
  actor: { userId: number; playerId: number },
  input: { squadId: number; playerId: number; feeUno: number; signingBonusUno: number },
): Promise<SquadTransferView> {
  const id = await db.transaction(async (tx) => {
    await assertSquadRole(tx, actor.playerId, input.squadId, "founder");

    const [buyer] = await tx
      .select({ status: squads.status, available: squads.treasuryAvailable })
      .from(squads)
      .where(eq(squads.id, input.squadId))
      .for("update")
      .limit(1);

    if (!buyer || buyer.status !== "active") {
      throw new AppError("NOT_FOUND", "Ce SQUAD est introuvable.");
    }

    const { fromSquadId } = await assertTransferable(tx, input.playerId);
    if (fromSquadId === input.squadId) {
      throw new AppError(
        "RULE_VIOLATION",
        "Ce joueur est déjà chez vous.",
      );
    }

    /**
     * Contrôle de solde dès l'offre, en plus de celui du séquestre.
     *
     * Le séquestre reste l'autorité — la caisse peut avoir bougé entre les
     * deux — mais échouer ici donne l'erreur au moment où l'on clique, et non
     * plus tard dans la boîte de réception du vendeur.
     */
    const cost = transferTotalCost(input.feeUno, input.signingBonusUno);
    if (buyer.available < cost) {
      throw new AppError(
        "RULE_VIOLATION",
        `Votre caisse ne couvre pas cette offre : ${cost} UNO nécessaires.`,
      );
    }

    const now = new Date();
    const inserted = await tx.insert(squadTransfers).values({
      playerId: input.playerId,
      fromSquadId,
      toSquadId: input.squadId,
      createdByPlayerId: actor.playerId,
      feeUno: input.feeUno,
      signingBonusUno: input.signingBonusUno,
      expiresAt: transferExpiry(now),
    });
    const transferId = Number(inserted[0].insertId);

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "squad.transfer.open",
      entityType: "squad_transfer",
      entityId: transferId,
      after: { playerId: input.playerId, fee: input.feeUno, bonus: input.signingBonusUno },
    });

    return transferId;
  });

  return getTransfer(db, id, actor.playerId);
}

/** Un dossier encore négociable, ou une erreur qui dit pourquoi il ne l'est plus. */
function assertNegotiable(row: typeof squadTransfers.$inferSelect): void {
  if (row.status === "pending") return;
  throw new AppError(
    "RULE_VIOLATION",
    row.status === "awaiting_player"
      ? "L'offre est entre les mains du joueur : elle ne se négocie plus."
      : "Ce dossier est clos.",
  );
}

/**
 * Le club vendeur réclame davantage.
 *
 * L'indemnité ne peut que monter, comme la mise d'un défi : un marchandage
 * qui pourrait redescendre n'a pas de raison de s'arrêter. La prime au joueur
 * n'est pas touchée — elle ne sort pas de la poche du vendeur.
 */
export async function counterTransfer(
  actor: { userId: number; playerId: number },
  input: { transferId: number; feeUno: number },
): Promise<SquadTransferView> {
  await db.transaction(async (tx) => {
    const row = await lockTransfer(tx, input.transferId);
    assertNegotiable(row);
    await assertSquadRole(tx, actor.playerId, row.fromSquadId, "captain");

    if (!mayCounterTransfer(row.negotiationRound)) {
      throw new AppError(
        "RULE_VIOLATION",
        "Le marchandage a assez duré : acceptez ou refusez.",
      );
    }
    const minimum = minimumCounterFee(row.feeUno);
    if (input.feeUno < minimum) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Une contre-offre monte l'indemnité : au moins ${minimum} UNO.`,
        { feeUno: `Au moins ${minimum} UNO.` },
      );
    }

    await tx
      .update(squadTransfers)
      .set({
        feeUno: input.feeUno,
        negotiationRound: row.negotiationRound + 1,
        expiresAt: transferExpiry(new Date()),
        updatedAt: new Date(),
      })
      .where(eq(squadTransfers.id, row.id));
  });

  return getTransfer(db, input.transferId, actor.playerId);
}

/**
 * Le club vendeur tranche.
 *
 * Accepter met l'argent de l'acheteur en séquestre et passe la main au
 * joueur ; refuser ferme le dossier sans que rien n'ait bougé.
 */
export async function respondSelling(
  actor: { userId: number; playerId: number },
  input: { transferId: number; accept: boolean },
): Promise<SquadTransferView> {
  await db.transaction(async (tx) => {
    const row = await lockTransfer(tx, input.transferId);
    assertNegotiable(row);
    await assertSquadRole(tx, actor.playerId, row.fromSquadId, "captain");

    if (!input.accept) {
      await tx
        .update(squadTransfers)
        .set({ status: "rejected", decidedAt: new Date(), updatedAt: new Date() })
        .where(eq(squadTransfers.id, row.id));
      return;
    }

    // Les conditions ont pu changer pendant la négociation : on les revérifie
    // au moment qui engage, et pas seulement à l'ouverture du dossier.
    const { fromSquadId } = await assertTransferable(tx, row.playerId);
    if (fromSquadId !== row.fromSquadId) {
      throw new AppError(
        "RULE_VIOLATION",
        "Ce joueur n'est plus dans votre SQUAD.",
      );
    }

    const cost = transferTotalCost(row.feeUno, row.signingBonusUno);
    if (cost > 0) {
      // `moveTreasury` refuse un disponible négatif : une caisse qui s'est
      // vidée depuis l'offre fait échouer l'acceptation, sans rien écrire.
      await moveTreasury(tx, {
        squadId: row.toSquadId,
        playerId: row.playerId,
        available: -cost,
        locked: cost,
        type: "transfer_lock",
        description: `Transfert #${row.id} — montants engagés`,
        referenceType: "transfer",
        referenceId: row.id,
        idempotencyKey: `squad:${row.toSquadId}:transfer:${row.id}:lock`,
      });
    }

    try {
      await tx
        .update(squadTransfers)
        .set({
          status: "awaiting_player",
          // Le joueur a droit au même délai de réflexion que les clubs.
          expiresAt: transferExpiry(new Date()),
          updatedAt: new Date(),
        })
        .where(eq(squadTransfers.id, row.id));
    } catch (error) {
      // L'index unique sur `locked_player_id` : un autre club a déjà un
      // séquestre en cours pour ce joueur. C'est la base qui l'interdit, pas
      // une lecture préalable — deux acceptations simultanées ne peuvent donc
      // pas passer toutes les deux.
      if (isDuplicateKeyError(error)) {
        throw new AppError(
          "CONFLICT",
          "Une autre offre est déjà entre les mains de ce joueur.",
        );
      }
      throw error;
    }

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "squad.transfer.accept",
      entityType: "squad_transfer",
      entityId: row.id,
      after: { side: "selling", fee: row.feeUno, bonus: row.signingBonusUno },
    });
  });

  return getTransfer(db, input.transferId, actor.playerId);
}

/**
 * Le joueur tranche, et c'est lui qui conclut.
 *
 * Accepter déplace l'argent et l'appartenance dans la même transaction :
 * l'indemnité au club vendeur, la prime au joueur, et le changement de club.
 * Refuser rend à l'acheteur ce qui avait été engagé.
 */
export async function respondPlayer(
  actor: { userId: number; playerId: number },
  input: { transferId: number; accept: boolean },
): Promise<SquadTransferView> {
  await db.transaction(async (tx) => {
    const row = await lockTransfer(tx, input.transferId);

    if (row.status !== "awaiting_player") {
      throw new AppError(
        "RULE_VIOLATION",
        "Ce dossier n'attend pas votre décision.",
      );
    }
    if (row.playerId !== actor.playerId) {
      throw new AppError(
        "RULE_VIOLATION",
        "Seul le joueur concerné peut trancher.",
      );
    }

    const cost = transferTotalCost(row.feeUno, row.signingBonusUno);

    if (!input.accept) {
      if (cost > 0) await releaseEscrow(tx, row, "refusé par le joueur");
      await tx
        .update(squadTransfers)
        .set({ status: "rejected", decidedAt: new Date(), updatedAt: new Date() })
        .where(eq(squadTransfers.id, row.id));
      return;
    }

    // Dernier contrôle avant de conclure : le joueur a pu quitter son club ou
    // s'engager sur un défi pendant sa réflexion.
    const { fromSquadId } = await assertTransferable(tx, row.playerId);
    if (fromSquadId !== row.fromSquadId) {
      throw new AppError(
        "RULE_VIOLATION",
        "Vous n'êtes plus dans le SQUAD qui vous cédait.",
      );
    }

    if (cost > 0) {
      // L'engagé sort de la caisse de l'acheteur : il ne revient pas au
      // disponible, il part chez le vendeur et chez le joueur.
      await moveTreasury(tx, {
        squadId: row.toSquadId,
        playerId: row.playerId,
        available: 0,
        locked: -cost,
        type: "transfer_out",
        description: `Transfert #${row.id} — indemnité et prime versées`,
        referenceType: "transfer",
        referenceId: row.id,
        idempotencyKey: `squad:${row.toSquadId}:transfer:${row.id}:settle`,
      });
    }

    if (row.feeUno > 0) {
      await moveTreasury(tx, {
        squadId: row.fromSquadId,
        playerId: row.playerId,
        available: row.feeUno,
        type: "transfer_in",
        description: `Transfert #${row.id} — indemnité reçue`,
        referenceType: "transfer",
        referenceId: row.id,
        idempotencyKey: `squad:${row.fromSquadId}:transfer:${row.id}:fee`,
      });
    }

    if (row.signingBonusUno > 0) {
      await credit(tx, {
        playerId: row.playerId,
        amount: row.signingBonusUno,
        type: "squad_payout",
        description: "Prime de signature",
        referenceType: "transfer",
        referenceId: row.id,
        idempotencyKey: `transfer:${row.id}:signing`,
      });
    }

    /**
     * L'appartenance change dans le bon ordre.
     *
     * L'ancienne ligne se ferme **avant** que la nouvelle s'ouvre : l'index
     * unique sur `active_player_id` n'admet qu'une appartenance vivante, et
     * l'ordre inverse échouerait. La ligne fermée reste — c'est l'histoire du
     * joueur, et les compositions passées s'y adossent.
     */
    await tx
      .update(squadMembers)
      .set({ status: "left", leftAt: new Date(), listedAt: null })
      .where(
        and(
          eq(squadMembers.playerId, row.playerId),
          eq(squadMembers.status, "active"),
        ),
      );

    await tx.insert(squadMembers).values({
      squadId: row.toSquadId,
      playerId: row.playerId,
      role: "member",
    });

    await tx
      .update(squadTransfers)
      .set({ status: "accepted", decidedAt: new Date(), updatedAt: new Date() })
      .where(eq(squadTransfers.id, row.id));

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "squad.transfer.accept",
      entityType: "squad_transfer",
      entityId: row.id,
      after: { side: "player", from: row.fromSquadId, to: row.toSquadId },
    });
  });

  return getTransfer(db, input.transferId, actor.playerId);
}

/** Rend à l'acheteur les montants engagés. */
async function releaseEscrow(
  tx: Transaction,
  row: typeof squadTransfers.$inferSelect,
  reason: string,
): Promise<void> {
  const cost = transferTotalCost(row.feeUno, row.signingBonusUno);
  if (cost <= 0) return;

  await moveTreasury(tx, {
    squadId: row.toSquadId,
    playerId: row.playerId,
    available: cost,
    locked: -cost,
    type: "transfer_release",
    description: `Transfert #${row.id} — ${reason}`,
    referenceType: "transfer",
    referenceId: row.id,
    idempotencyKey: `squad:${row.toSquadId}:transfer:${row.id}:release`,
  });
}

/**
 * Le club acheteur retire son offre.
 *
 * Possible tant que le joueur ne l'a pas entre les mains : après, le retrait
 * unilatéral reviendrait à faire miroiter une prime puis à la retirer au
 * moment de signer.
 */
export async function cancelTransfer(
  actor: { userId: number; playerId: number },
  input: { transferId: number },
): Promise<SquadTransferView> {
  await db.transaction(async (tx) => {
    const row = await lockTransfer(tx, input.transferId);
    assertNegotiable(row);
    await assertSquadRole(tx, actor.playerId, row.toSquadId, "founder");

    await tx
      .update(squadTransfers)
      .set({ status: "cancelled", decidedAt: new Date(), updatedAt: new Date() })
      .where(eq(squadTransfers.id, row.id));

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "squad.transfer.cancel",
      entityType: "squad_transfer",
      entityId: row.id,
    });
  });

  return getTransfer(db, input.transferId, actor.playerId);
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

async function toView(
  executor: Executor,
  row: typeof squadTransfers.$inferSelect,
  viewerPlayerId: number,
): Promise<SquadTransferView> {
  const [target] = await executor
    .select(publicPlayerColumns)
    .from(players)
    .where(eq(players.id, row.playerId))
    .limit(1);

  const clubs = await executor
    .select({ id: squads.id, name: squads.name, slug: squads.slug })
    .from(squads)
    .where(inArray(squads.id, [row.fromSquadId, row.toSquadId]));
  const byId = new Map(clubs.map((club) => [club.id, club]));

  const viewer = await activeMembership(executor, viewerPlayerId);

  return {
    id: row.id,
    target: {
      player: target ? toPublicPlayer(target) : null,
      squadId: row.fromSquadId,
      squadName: byId.get(row.fromSquadId)?.name ?? "?",
      listedAt: null,
    },
    from: byId.get(row.fromSquadId) ?? null,
    to: byId.get(row.toSquadId) ?? null,
    feeUno: row.feeUno,
    signingBonusUno: row.signingBonusUno,
    totalUno: transferTotalCost(row.feeUno, row.signingBonusUno),
    negotiationRound: row.negotiationRound,
    status: row.status,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    viewer: {
      isTarget: viewerPlayerId === row.playerId,
      isSelling: viewer?.squadId === row.fromSquadId,
      isBuying: viewer?.squadId === row.toSquadId,
    },
  };
}

export async function getTransfer(
  executor: Executor,
  transferId: number,
  viewerPlayerId: number,
): Promise<SquadTransferView> {
  const [row] = await executor
    .select()
    .from(squadTransfers)
    .where(eq(squadTransfers.id, transferId))
    .limit(1);

  if (!row) throw new AppError("NOT_FOUND", "Ce dossier est introuvable.");
  return toView(executor, row, viewerPlayerId);
}

/** Les dossiers qui concernent un club, reçus comme envoyés. */
export async function listTransfers(
  executor: Executor,
  params: { squadId: number; viewerPlayerId: number; limit: number },
): Promise<SquadTransferView[]> {
  const rows = await executor
    .select()
    .from(squadTransfers)
    .where(
      or(
        eq(squadTransfers.fromSquadId, params.squadId),
        eq(squadTransfers.toSquadId, params.squadId),
      ),
    )
    .orderBy(desc(squadTransfers.id))
    .limit(params.limit);

  const views: SquadTransferView[] = [];
  for (const row of rows) {
    views.push(await toView(executor, row, params.viewerPlayerId));
  }
  return views;
}

/** Les dossiers qui attendent la décision du joueur connecté. */
export async function myTransferOffers(
  executor: Executor,
  playerId: number,
): Promise<SquadTransferView[]> {
  const rows = await executor
    .select()
    .from(squadTransfers)
    .where(
      and(
        eq(squadTransfers.playerId, playerId),
        eq(squadTransfers.status, "awaiting_player"),
      ),
    )
    .orderBy(desc(squadTransfers.id));

  const views: SquadTransferView[] = [];
  for (const row of rows) {
    views.push(await toView(executor, row, playerId));
  }
  return views;
}

/**
 * Fait expirer les dossiers restés sans réponse (SQUAD-008).
 *
 * Ceux qui attendaient le joueur avaient de l'argent en séquestre : il est
 * rendu ici, faute de quoi une offre oubliée immobiliserait une caisse
 * indéfiniment.
 */
export async function expireStaleTransfers(): Promise<number> {
  return db.transaction(async (tx) => {
    const stale = await tx
      .select()
      .from(squadTransfers)
      .where(
        and(
          inArray(squadTransfers.status, ["pending", "awaiting_player"]),
          lte(squadTransfers.expiresAt, new Date()),
        ),
      )
      .for("update");

    for (const row of stale) {
      if (row.status === "awaiting_player") {
        await releaseEscrow(tx, row, "offre expirée");
      }
      await tx
        .update(squadTransfers)
        .set({ status: "expired", decidedAt: new Date(), updatedAt: new Date() })
        .where(eq(squadTransfers.id, row.id));
    }

    return stale.length;
  });
}
