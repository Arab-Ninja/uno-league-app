import { and, eq, isNull, sql } from "drizzle-orm";
import { AppError, getGameMode, type PublicPlayer } from "@uno/shared";
import { db, type Executor, type Transaction } from "../db/client.js";
import { players, proposals } from "../db/schema.js";
import { writeAudit } from "./audit.service.js";
import { recordAdminEvent } from "./admin-events.service.js";
import { credit } from "./ledger.service.js";
import { notifyPlayer } from "./notifications.service.js";

import { lockProposal, refereeOf } from "./proposals.service.js";

/**
 * Arbitrage des sessions UNO League (ROLE-003).
 *
 * L'arbitre n'est pas un participant : il ne paie pas sa place, ne compte pas
 * dans le quota, n'entre dans aucune équipe et n'apparaît pas au classement.
 * Il est rattaché à la session par une colonne dédiée, et non par la table des
 * participants — les confondre aurait faussé le quota, les paiements, le
 * tirage des équipes et le classement de session d'un seul coup.
 *
 * Une seule place d'arbitre par session, garantie par un verrou **et** par une
 * condition `IS NULL` dans la mise à jour : deux arbitres qui se proposent au
 * même instant ne peuvent pas être acceptés tous les deux.
 */

/** Un arbitre officie en UNO League uniquement : l'amical n'est pas arbitré. */
function assertRefereeableMode(modeId: string): void {
  const mode = getGameMode(modeId);
  if (!mode?.ranked) {
    throw new AppError(
      "RULE_VIOLATION",
      "Seules les sessions UNO League sont arbitrées.",
    );
  }
}

async function assertIsReferee(
  executor: Executor,
  playerId: number,
): Promise<void> {
  const [player] = await executor
    .select({ accountType: players.accountType })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  if (player?.accountType !== "referee") {
    throw new AppError(
      "RULE_VIOLATION",
      "Seul un compte arbitre peut se proposer pour arbitrer une session.",
    );
  }
}

/**
 * Un arbitre se propose sur une session UNO League.
 *
 * Possible tant que la session n'est pas jouée : une session peut trouver son
 * arbitre après avoir trouvé ses joueurs, et l'inverse est vrai aussi.
 */
export async function volunteerAsReferee(
  actor: { playerId: number; userId: number },
  proposalId: number,
): Promise<PublicPlayer> {
  return db.transaction(async (tx) => {
    const proposal = await lockProposal(tx, proposalId);

    assertRefereeableMode(proposal.modeId);
    await assertIsReferee(tx, actor.playerId);

    if (proposal.status === "completed" || proposal.status === "cancelled") {
      throw new AppError(
        "RULE_VIOLATION",
        "Cette session est terminée : elle n'attend plus d'arbitre.",
      );
    }

    if (proposal.refereePlayerId !== null) {
      // Idempotent pour l'arbitre déjà en place, refus explicite pour un autre.
      if (proposal.refereePlayerId === actor.playerId) {
        const current = await refereeOf(tx, proposalId);
        if (current) return current;
      }
      throw new AppError("CONFLICT", "Cette session a déjà un arbitre.");
    }

    // La condition `IS NULL` double le verrou : même si deux transactions
    // passaient le test ci-dessus, une seule écrirait.
    const result = await tx
      .update(proposals)
      .set({ refereePlayerId: actor.playerId, updatedAt: new Date() })
      .where(
        and(eq(proposals.id, proposalId), isNull(proposals.refereePlayerId)),
      );

    if (Number(result[0].affectedRows ?? 0) === 0) {
      throw new AppError("CONFLICT", "Cette session a déjà un arbitre.");
    }

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "referee.assign",
      entityType: "proposal",
      entityId: proposalId,
      after: { refereePlayerId: actor.playerId },
    });

    await recordAdminEvent(
      {
        type: "referee.assigned",
        body:
          `Un arbitre s'est proposé pour la session du ${proposal.localDate} ` +
          `à ${proposal.venueName}.`,
        entityType: "proposal",
        entityId: proposalId,
        playerId: actor.playerId,
        key: `proposal:${proposalId}:referee`,
      },
      tx,
    );

    const assigned = await refereeOf(tx, proposalId);
    if (!assigned) throw new AppError("INTERNAL", "Arbitre introuvable.");
    return assigned;
  });
}

/** L'arbitre se retire ; la session redevient sans arbitre. */
export async function withdrawAsReferee(
  actor: { playerId: number; userId: number },
  proposalId: number,
): Promise<{ withdrawn: boolean }> {
  return db.transaction(async (tx) => {
    const proposal = await lockProposal(tx, proposalId);

    if (proposal.refereePlayerId !== actor.playerId) {
      return { withdrawn: false };
    }
    if (proposal.status === "completed") {
      throw new AppError(
        "RULE_VIOLATION",
        "Cette session est clôturée : l'arbitrage est acquis.",
      );
    }

    await tx
      .update(proposals)
      .set({ refereePlayerId: null, updatedAt: new Date() })
      .where(eq(proposals.id, proposalId));

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "referee.assign",
      entityType: "proposal",
      entityId: proposalId,
      before: { refereePlayerId: actor.playerId },
      after: { refereePlayerId: null },
    });

    return { withdrawn: true };
  });
}

/**
 * Sessions UNO League à venir qui n'ont pas encore d'arbitre.
 * C'est l'écran d'accueil d'un arbitre : ce qu'il peut prendre.
 */
export async function openRefereeSlots(
  executor: Executor,
  limit = 20,
): Promise<number[]> {
  const rows = await executor
    .select({ id: proposals.id })
    .from(proposals)
    .where(
      and(
        isNull(proposals.refereePlayerId),
        eq(proposals.modeId, "league"),
        sql`${proposals.status} IN ('proposal', 'reservation', 'session')`,
      ),
    )
    .limit(limit);

  return rows.map((row) => row.id);
}

/**
 * Rémunère l'arbitre à la clôture d'une session classée (§8.2).
 *
 * Appelée dans la transaction de clôture : la rémunération et la fin de
 * session sont indissociables. La clé d'idempotence porte l'identifiant de
 * session, si bien qu'une clôture rejouée ne paie pas deux fois.
 */
export async function payReferee(
  tx: Transaction,
  params: { proposalId: number; refereePlayerId: number | null; amount: number },
): Promise<boolean> {
  if (params.refereePlayerId === null) return false;

  await credit(tx, {
    playerId: params.refereePlayerId,
    amount: params.amount,
    type: "reward",
    description: "Arbitrage d'une session",
    referenceType: "proposal",
    referenceId: params.proposalId,
    idempotencyKey: `reward:session:${params.proposalId}:referee`,
  });

  await tx
    .update(players)
    .set({ sessionsRefereed: sql`${players.sessionsRefereed} + 1` })
    .where(eq(players.id, params.refereePlayerId));

  await notifyPlayer(
    {
      playerId: params.refereePlayerId,
      eventKey: `proposal:${params.proposalId}:refereed`,
      title: "Session arbitrée",
      body: `${params.amount} UNO vous ont été crédités pour votre arbitrage.`,
    },
    tx,
  );

  return true;
}
