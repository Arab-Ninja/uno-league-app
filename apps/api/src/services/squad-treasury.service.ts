import { and, desc, eq, sql } from "drizzle-orm";
import { AppError, type SquadTreasuryEntry } from "@uno/shared";
import { db, type Executor, type Transaction } from "../db/client.js";
import { isDuplicateKeyError } from "../lib/errors.js";
import { players, squadTreasuryTransactions, squads } from "../db/schema.js";
import { debit } from "./ledger.service.js";
import { activeMembership } from "./squads.service.js";

/**
 * Trésorerie d'un SQUAD (SQUAD-003, AC03).
 *
 * **Distincte du portefeuille personnel, et volontairement à sens unique.**
 * Un membre y verse des UNO ; il ne les reprend pas. Sans cette règle, la
 * trésorerie ne serait qu'un portefeuille commun où chacun puiserait, et
 * aucune mise de défi ne pourrait être garantie — l'argent promis pourrait
 * disparaître entre l'acceptation et le coup d'envoi.
 *
 * Ce qui en sort relève d'opérations du club : mise de défi, indemnité de
 * transfert, prise en charge d'une place. Chacune passe par ce service, et
 * laisse une trace.
 *
 * Le modèle reprend celui des portefeuilles : un solde sur la ligne du club,
 * un registre immuable à côté, une clé d'idempotence par mouvement. Deux
 * modèles financiers qui se ressembleraient auraient fini par diverger.
 */

/** Verrouille la trésorerie le temps d'une transaction. */
async function lockTreasury(tx: Transaction, squadId: number) {
  const [row] = await tx
    .select({
      id: squads.id,
      name: squads.name,
      status: squads.status,
      available: squads.treasuryAvailable,
      locked: squads.treasuryLocked,
    })
    .from(squads)
    .where(eq(squads.id, squadId))
    .for("update")
    .limit(1);

  if (!row) throw new AppError("NOT_FOUND", "Ce SQUAD est introuvable.");
  return row;
}

interface TreasuryMovement {
  squadId: number;
  playerId?: number | null;
  /** Variation du disponible : positive pour une entrée, négative pour une sortie. */
  available: number;
  /** Variation de la part engagée : positive au verrouillage, négative à la libération. */
  locked?: number;
  type: string;
  description: string;
  referenceType?: string;
  referenceId?: number;
  idempotencyKey?: string;
}

/**
 * Applique un mouvement et l'inscrit au registre.
 *
 * Rendu `null` quand la clé d'idempotence a déjà servi : l'opération a déjà
 * eu lieu, et la rejouer ne doit rien changer (SQUAD-003).
 */
export async function moveTreasury(
  tx: Transaction,
  movement: TreasuryMovement,
): Promise<{ available: number; locked: number } | null> {
  const current = await lockTreasury(tx, movement.squadId);

  const available = current.available + movement.available;
  const locked = current.locked + (movement.locked ?? 0);

  if (available < 0) {
    throw new AppError(
      "RULE_VIOLATION",
      "La trésorerie du SQUAD ne couvre pas cette opération.",
    );
  }
  if (locked < 0) {
    throw new AppError("RULE_VIOLATION", "Montant engagé incohérent.");
  }

  await tx
    .update(squads)
    .set({ treasuryAvailable: available, treasuryLocked: locked, updatedAt: new Date() })
    .where(eq(squads.id, movement.squadId));

  try {
    await tx.insert(squadTreasuryTransactions).values({
      squadId: movement.squadId,
      playerId: movement.playerId ?? null,
      type: movement.type,
      // Le montant signé du registre est la variation du **total possédé** :
      // un verrouillage déplace des UNO entre deux poches du même club, il ne
      // fait ni entrer ni sortir d'argent.
      amount: movement.available + (movement.locked ?? 0),
      availableAfter: available,
      lockedAfter: locked,
      referenceType: movement.referenceType ?? null,
      referenceId: movement.referenceId ?? null,
      description: movement.description,
      idempotencyKey: movement.idempotencyKey ?? null,
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) return null;
    throw error;
  }

  return { available, locked };
}

/**
 * Verse des UNO de son portefeuille vers la caisse du club (AC03).
 *
 * Les deux écritures sont dans la même transaction : un débit sans crédit
 * ferait disparaître des UNO, et l'inverse en créerait.
 */
export async function contribute(
  actor: { userId: number; playerId: number },
  input: { squadId: number; amount: number },
): Promise<{ available: number; locked: number }> {
  return db.transaction(async (tx) => {
    const membership = await activeMembership(tx, actor.playerId);
    if (!membership || membership.squadId !== input.squadId) {
      throw new AppError(
        "RULE_VIOLATION",
        "Vous n'êtes pas membre de ce SQUAD.",
      );
    }

    const squad = await lockTreasury(tx, input.squadId);
    if (squad.status !== "active") {
      throw new AppError("RULE_VIOLATION", "Ce SQUAD est dissous.");
    }

    // `debit` refuse un solde insuffisant et verrouille la ligne du joueur :
    // deux contributions simultanées ne peuvent pas dépasser le portefeuille.
    await debit(tx, {
      playerId: actor.playerId,
      amount: input.amount,
      type: "squad_contribution",
      description: `Contribution à la trésorerie ${squad.name}`,
      referenceType: "squad",
      referenceId: input.squadId,
    });

    const result = await moveTreasury(tx, {
      squadId: input.squadId,
      playerId: actor.playerId,
      available: input.amount,
      type: "contribution",
      description: "Contribution d'un membre",
      referenceType: "player",
      referenceId: actor.playerId,
    });

    // `moveTreasury` ne rend `null` que sur clé d'idempotence déjà vue ; il
    // n'y en a pas ici, une contribution étant toujours un geste nouveau.
    return result ?? { available: squad.available, locked: squad.locked };
  });
}

/** Registre de la trésorerie, du plus récent au plus ancien. */
export async function listTreasuryEntries(
  executor: Executor,
  params: { squadId: number; playerId: number; limit: number },
): Promise<SquadTreasuryEntry[]> {
  const membership = await activeMembership(executor, params.playerId);
  if (!membership || membership.squadId !== params.squadId) {
    throw new AppError(
      "RULE_VIOLATION",
      "Le registre d'un SQUAD est réservé à ses membres.",
    );
  }

  const rows = await executor
    .select({
      id: squadTreasuryTransactions.id,
      type: squadTreasuryTransactions.type,
      amount: squadTreasuryTransactions.amount,
      availableAfter: squadTreasuryTransactions.availableAfter,
      description: squadTreasuryTransactions.description,
      createdAt: squadTreasuryTransactions.createdAt,
      playerName: players.displayName,
    })
    .from(squadTreasuryTransactions)
    .leftJoin(players, eq(players.id, squadTreasuryTransactions.playerId))
    .where(eq(squadTreasuryTransactions.squadId, params.squadId))
    .orderBy(desc(squadTreasuryTransactions.id))
    .limit(params.limit);

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    amount: row.amount,
    balanceAfter: row.availableAfter,
    description: row.description,
    playerName: row.playerName,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** Total versé par chaque membre, pour le tableau des contributions. */
export async function contributionsBy(
  executor: Executor,
  squadId: number,
): Promise<{ playerId: number; total: number }[]> {
  const rows = await executor
    .select({
      playerId: squadTreasuryTransactions.playerId,
      total: sql<number>`SUM(${squadTreasuryTransactions.amount})`,
    })
    .from(squadTreasuryTransactions)
    .where(
      and(
        eq(squadTreasuryTransactions.squadId, squadId),
        eq(squadTreasuryTransactions.type, "contribution"),
      ),
    )
    .groupBy(squadTreasuryTransactions.playerId);

  return rows
    .filter((row): row is { playerId: number; total: number } => row.playerId !== null)
    .map((row) => ({ playerId: row.playerId, total: Number(row.total) }));
}
