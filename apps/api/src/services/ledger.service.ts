import { and, desc, eq, lt, sql } from "drizzle-orm";
import type { TransactionType } from "@uno/shared";
import { AppError } from "@uno/shared";
import type { Executor, Transaction } from "../db/client.js";
import { players, transactions } from "../db/schema.js";
import { isDuplicateKeyError } from "../lib/errors.js";

/**
 * Registre financier UNO (CDC §11).
 *
 * C'EST LE SEUL POINT D'ENTRÉE autorisé pour modifier un solde. Aucun autre
 * service ne fait de `UPDATE players SET uno_points`, afin que chaque
 * mouvement de solde ait obligatoirement son écriture au registre (WAL-006).
 *
 * Garanties :
 *  - le solde du joueur est verrouillé (SELECT ... FOR UPDATE) pendant toute
 *    l'opération, ce qui sérialise deux débits concurrents (E2E-009) ;
 *  - un débit supérieur au solde est refusé sans écrire la moindre ligne
 *    (DATA-002, WAL-001) ;
 *  - `balanceAfter` est figé à l'écriture pour permettre l'audit (WAL-006) ;
 *  - une clé d'idempotence rejoue le résultat au lieu de débiter deux fois
 *    (STATE-002).
 *
 * Toutes les fonctions exigent une transaction ouverte par l'appelant : le
 * mouvement de solde et son effet métier (paiement, commande) forment un seul
 * tout indivisible (TECH-003).
 */

export interface LedgerEntryInput {
  playerId: number;
  /** Montant positif ; le sens est porté par la fonction appelée. */
  amount: number;
  type: TransactionType;
  description: string;
  referenceType?: string;
  referenceId?: number;
  fromPlayerId?: number;
  toPlayerId?: number;
  /** Rend l'opération rejouable sans effet de bord (STATE-002). */
  idempotencyKey?: string;
}

export interface LedgerEntry {
  transactionId: number;
  balanceAfter: number;
  /** true si l'opération avait déjà été appliquée sous cette clé. */
  replayed: boolean;
}

function assertPositiveInteger(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Le montant doit être un nombre entier positif.",
    );
  }
}

/**
 * Verrouille la ligne joueur et renvoie son solde courant.
 *
 * `.for("update")` passe par le constructeur de requêtes de Drizzle : les
 * colonnes reviennent donc mappées sur les propriétés du schéma. Un
 * `SELECT *` brut renverrait des noms en snake_case et produirait
 * silencieusement des valeurs `undefined`.
 */
async function lockBalance(tx: Transaction, playerId: number): Promise<number> {
  const [row] = await tx
    .select({ unoPoints: players.unoPoints })
    .from(players)
    .where(eq(players.id, playerId))
    .for("update");

  if (!row) {
    throw new AppError("NOT_FOUND", "Joueur introuvable.");
  }
  return Number(row.unoPoints);
}

/** Retrouve une écriture déjà appliquée sous cette clé d'idempotence. */
async function findByIdempotencyKey(
  tx: Transaction,
  key: string,
): Promise<LedgerEntry | null> {
  const [existing] = await tx
    .select({ id: transactions.id, balanceAfter: transactions.balanceAfter })
    .from(transactions)
    .where(eq(transactions.idempotencyKey, key))
    .limit(1);

  return existing
    ? {
        transactionId: existing.id,
        balanceAfter: existing.balanceAfter,
        replayed: true,
      }
    : null;
}

async function writeEntry(
  tx: Transaction,
  input: LedgerEntryInput,
  signedAmount: number,
  balanceAfter: number,
): Promise<number> {
  try {
    const result = await tx.insert(transactions).values({
      playerId: input.playerId,
      type: input.type,
      amount: signedAmount,
      balanceAfter,
      fromPlayerId: input.fromPlayerId ?? null,
      toPlayerId: input.toPlayerId ?? null,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      description: input.description,
      idempotencyKey: input.idempotencyKey ?? null,
    });
    return Number(result[0].insertId);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      // Deux requêtes concurrentes portant la même clé : la seconde perd la
      // course. On remonte un conflit plutôt qu'un double débit.
      throw new AppError(
        "CONFLICT",
        "Cette opération est déjà en cours de traitement.",
      );
    }
    throw error;
  }
}

/** Crédite un joueur. */
export async function credit(
  tx: Transaction,
  input: LedgerEntryInput,
): Promise<LedgerEntry> {
  assertPositiveInteger(input.amount);

  if (input.idempotencyKey) {
    const replay = await findByIdempotencyKey(tx, input.idempotencyKey);
    if (replay) return replay;
  }

  const current = await lockBalance(tx, input.playerId);
  const balanceAfter = current + input.amount;

  await tx
    .update(players)
    .set({ unoPoints: balanceAfter, updatedAt: new Date() })
    .where(eq(players.id, input.playerId));

  const transactionId = await writeEntry(tx, input, input.amount, balanceAfter);
  return { transactionId, balanceAfter, replayed: false };
}

/**
 * Débite un joueur. Refuse si le solde est insuffisant : aucune ligne n'est
 * écrite et le solde reste inchangé (E2E-008, SHOP-005).
 */
export async function debit(
  tx: Transaction,
  input: LedgerEntryInput,
): Promise<LedgerEntry> {
  assertPositiveInteger(input.amount);

  if (input.idempotencyKey) {
    const replay = await findByIdempotencyKey(tx, input.idempotencyKey);
    if (replay) return replay;
  }

  const current = await lockBalance(tx, input.playerId);
  if (current < input.amount) {
    throw new AppError("INSUFFICIENT_FUNDS");
  }
  const balanceAfter = current - input.amount;

  await tx
    .update(players)
    .set({ unoPoints: balanceAfter, updatedAt: new Date() })
    .where(eq(players.id, input.playerId));

  const transactionId = await writeEntry(tx, input, -input.amount, balanceAfter);
  return { transactionId, balanceAfter, replayed: false };
}

/**
 * Transfert entre deux joueurs (WAL-002, WAL-003).
 * Débit, crédit et les deux écritures du registre sont dans la même
 * transaction : si le crédit échoue, le débit est annulé.
 */
export async function transfer(
  tx: Transaction,
  params: {
    fromPlayerId: number;
    toPlayerId: number;
    amount: number;
    note?: string;
    idempotencyKey: string;
  },
): Promise<{ senderBalance: number; replayed: boolean }> {
  assertPositiveInteger(params.amount);

  if (params.fromPlayerId === params.toPlayerId) {
    throw new AppError(
      "RULE_VIOLATION",
      "Vous ne pouvez pas vous envoyer des points à vous-même.",
    );
  }

  const replay = await findByIdempotencyKey(tx, `${params.idempotencyKey}:out`);
  if (replay) {
    return { senderBalance: replay.balanceAfter, replayed: true };
  }

  const [recipient] = await tx
    .select({ id: players.id, displayName: players.displayName })
    .from(players)
    .where(eq(players.id, params.toPlayerId))
    .limit(1);

  if (!recipient) {
    // WAL : on n'envoie jamais vers un joueur qui n'existe pas en base.
    throw new AppError("NOT_FOUND", "Ce joueur est introuvable.");
  }

  const [sender] = await tx
    .select({ displayName: players.displayName })
    .from(players)
    .where(eq(players.id, params.fromPlayerId))
    .limit(1);

  if (!sender) {
    throw new AppError("NOT_FOUND", "Joueur introuvable.");
  }

  // Les lignes sont verrouillées dans l'ordre croissant des identifiants,
  // afin que deux transferts croisés simultanés ne s'interbloquent pas.
  const first = Math.min(params.fromPlayerId, params.toPlayerId);
  const second = Math.max(params.fromPlayerId, params.toPlayerId);
  await lockBalance(tx, first);
  await lockBalance(tx, second);

  const note = params.note?.trim();

  const out = await debit(tx, {
    playerId: params.fromPlayerId,
    amount: params.amount,
    type: "send",
    description: note
      ? `Envoi à ${recipient.displayName} — ${note}`
      : `Envoi à ${recipient.displayName}`,
    toPlayerId: params.toPlayerId,
    fromPlayerId: params.fromPlayerId,
    referenceType: "transfer",
    idempotencyKey: `${params.idempotencyKey}:out`,
  });

  await credit(tx, {
    playerId: params.toPlayerId,
    amount: params.amount,
    type: "receive",
    description: note
      ? `Reçu de ${sender.displayName} — ${note}`
      : `Reçu de ${sender.displayName}`,
    fromPlayerId: params.fromPlayerId,
    toPlayerId: params.toPlayerId,
    referenceType: "transfer",
    referenceId: out.transactionId,
    idempotencyKey: `${params.idempotencyKey}:in`,
  });

  return { senderBalance: out.balanceAfter, replayed: false };
}

/** Historique paginé, du plus récent au plus ancien (WAL-004). */
export async function listTransactions(
  executor: Executor,
  params: { playerId: number; limit: number; cursor?: number | null },
): Promise<{ items: (typeof transactions.$inferSelect)[]; nextCursor: number | null }> {
  const rows = await executor
    .select()
    .from(transactions)
    .where(
      params.cursor
        ? and(
            eq(transactions.playerId, params.playerId),
            lt(transactions.id, params.cursor),
          )
        : eq(transactions.playerId, params.playerId),
    )
    .orderBy(desc(transactions.id))
    .limit(params.limit + 1);

  const hasMore = rows.length > params.limit;
  const items = hasMore ? rows.slice(0, params.limit) : rows;
  return {
    items,
    nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
  };
}

/**
 * Contrôle de cohérence du registre (WAL-006) : le solde du joueur doit être
 * égal au `balanceAfter` de sa dernière écriture, et à la somme de ses
 * mouvements. Utilisé par les tests et par l'écran d'administration.
 */
export async function auditPlayerBalance(
  executor: Executor,
  playerId: number,
): Promise<{ consistent: boolean; balance: number; ledgerSum: number; lastBalanceAfter: number | null }> {
  const [player] = await executor
    .select({ unoPoints: players.unoPoints })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  if (!player) throw new AppError("NOT_FOUND", "Joueur introuvable.");

  const [aggregate] = await executor
    .select({ total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)` })
    .from(transactions)
    .where(eq(transactions.playerId, playerId));

  const [last] = await executor
    .select({ balanceAfter: transactions.balanceAfter })
    .from(transactions)
    .where(eq(transactions.playerId, playerId))
    .orderBy(desc(transactions.id))
    .limit(1);

  const ledgerSum = Number(aggregate?.total ?? 0);
  const lastBalanceAfter = last ? last.balanceAfter : null;

  return {
    consistent:
      player.unoPoints === ledgerSum &&
      (lastBalanceAfter === null
        ? player.unoPoints === 0
        : lastBalanceAfter === player.unoPoints),
    balance: player.unoPoints,
    ledgerSum,
    lastBalanceAfter,
  };
}

/** Nombre de joueurs dont le solde diverge du registre (contrôle NFR-005). */
export async function countInconsistentBalances(
  executor: Executor,
): Promise<number> {
  const rows = await executor.execute<{ total: number }>(sql`
    SELECT COUNT(*) AS total
    FROM players p
    LEFT JOIN (
      SELECT player_id, SUM(amount) AS ledger_sum
      FROM transactions
      GROUP BY player_id
    ) t ON t.player_id = p.id
    WHERE p.uno_points <> COALESCE(t.ledger_sum, 0)
  `);
  const row = (rows[0] as unknown as { total: number }[])[0];
  return Number(row?.total ?? 0);
}

