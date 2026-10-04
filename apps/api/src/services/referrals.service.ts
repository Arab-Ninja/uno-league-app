import { randomInt } from "node:crypto";
import {
  and,
  asc,
  countDistinct,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import {
  AppError,
  REFERRAL_MODE_ID,
  REFERRAL_REWARDS,
  gabarit,
} from "@uno/shared";
import { db, type Executor, type Transaction } from "../db/client.js";
import {
  payments,
  players,
  proposalParticipants,
  proposals,
  referrals,
  transactions,
} from "../db/schema.js";
import { ecriture } from "../i18n/index.js";
import { isDuplicateKeyError } from "../lib/errors.js";
import { writeAudit } from "./audit.service.js";
import { credit, debit } from "./ledger.service.js";
import { notifyPlayer } from "./notifications.service.js";

/**
 * Parrainage (REF-001).
 *
 * Un joueur partage son code ; un nouveau venu le saisit **à son
 * inscription**. Le parrain touche {@link REFERRAL_REWARDS.firstSessionUno}
 * UNO quand son filleul a joué sa première séance UNO League payée, puis
 * {@link REFERRAL_REWARDS.milestoneUno} de plus à la cinquième.
 *
 * Tout se décide à la **clôture** d'une séance, au même endroit que les autres
 * récompenses : une séance jouée est une séance clôturée, avec le filleul
 * inscrit et sa place payée. Chaque versement porte une clé d'idempotence
 * propre au parrainage — une clôture rejouée après correction (MATCH-007) ne
 * paie jamais deux fois.
 */

/** Caractères tirés au sort : ni 0/O, ni 1/I/L, qu'on confond à l'oral. */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** « Élodie » → « ELODIE » ; un prénom sans lettre latine donne « UNO ». */
function prefixFrom(firstName: string): string {
  const letters = firstName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 10);
  return letters.length > 0 ? letters : "UNO";
}

function randomSuffix(): string {
  let suffix = "";
  for (let index = 0; index < 4; index++) {
    suffix += ALPHABET[randomInt(ALPHABET.length)];
  }
  return suffix;
}

/**
 * Le code du joueur, créé à la première demande.
 *
 * Trente-et-un caractères sur quatre places font près d'un million de codes
 * par prénom : une collision est rare, et l'index unique la rattrape — on
 * retire simplement un autre suffixe.
 */
export async function ensureReferralCode(playerId: number): Promise<string> {
  const [row] = await db
    .select({ code: players.referralCode, firstName: players.firstName })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);
  if (!row) throw new AppError("NOT_FOUND");
  if (row.code) return row.code;

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = `${prefixFrom(row.firstName)}-${randomSuffix()}`;
    try {
      await db
        .update(players)
        .set({ referralCode: code })
        .where(and(eq(players.id, playerId), isNull(players.referralCode)));
    } catch (error) {
      if (isDuplicateKeyError(error)) continue;
      throw error;
    }
    // Relu plutôt que supposé : deux onglets ouverts au même instant ne
    // doivent pas afficher deux codes différents.
    const [after] = await db
      .select({ code: players.referralCode })
      .from(players)
      .where(eq(players.id, playerId))
      .limit(1);
    if (after?.code) return after.code;
  }
  throw new AppError("CONFLICT");
}

/**
 * Rattache un compte qui vient d'être créé à son parrain.
 *
 * Appelé dans la transaction d'inscription : un code inconnu fait échouer
 * l'inscription entière, pour que le joueur corrige sa saisie plutôt que de
 * découvrir plus tard que son parrain n'a rien touché.
 */
export async function attachReferral(
  tx: Transaction,
  referredPlayerId: number,
  code: string,
): Promise<void> {
  const [referrer] = await tx
    .select({ id: players.id })
    .from(players)
    .where(eq(players.referralCode, code.trim().toUpperCase()))
    .limit(1);

  if (!referrer || referrer.id === referredPlayerId) {
    throw new AppError("VALIDATION_ERROR", "Code de parrainage inconnu.", {
      referralCode: "Code de parrainage inconnu.",
    });
  }

  await tx.insert(referrals).values({
    referrerPlayerId: referrer.id,
    referredPlayerId,
  });
}

/**
 * Le nombre de séances UNO League **payées** et clôturées d'un joueur.
 *
 * « Payée » se lit sur le paiement, pas sur la case `has_paid` : une place
 * offerte, ou posée par l'administration sans paiement, ne compte pas. La
 * séance en cours de clôture n'est pas encore « terminée » : elle s'ajoute à
 * part, par `includeProposalId`.
 */
async function paidLeagueSessions(
  executor: Executor,
  playerId: number,
  includeProposalId: number,
): Promise<number> {
  const [row] = await executor
    .select({ total: countDistinct(proposals.id) })
    .from(proposalParticipants)
    .innerJoin(proposals, eq(proposals.id, proposalParticipants.proposalId))
    .innerJoin(
      payments,
      and(
        eq(payments.proposalId, proposalParticipants.proposalId),
        eq(payments.playerId, proposalParticipants.playerId),
        eq(payments.status, "paid"),
        or(gt(payments.amountUno, 0), gt(payments.amountEurCents, 0)),
      ),
    )
    .where(
      and(
        eq(proposalParticipants.playerId, playerId),
        eq(proposalParticipants.hasPaid, true),
        eq(proposals.modeId, REFERRAL_MODE_ID),
        or(
          eq(proposals.status, "completed"),
          eq(proposals.id, includeProposalId),
        ),
      ),
    );
  return Number(row?.total ?? 0);
}

/**
 * Verse ce qui est dû aux parrains des joueurs d'une séance qui se clôture.
 *
 * Appelé par la clôture (`applySessionCompletion`), dans sa transaction, pour
 * une séance UNO League seulement. Un parrainage annulé ne verse plus rien.
 */
export async function rewardReferrers(
  tx: Transaction,
  proposalId: number,
  participantIds: number[],
): Promise<number> {
  if (participantIds.length === 0) return 0;

  const rows = await tx
    .select({
      id: referrals.id,
      referrerPlayerId: referrals.referrerPlayerId,
      referredPlayerId: referrals.referredPlayerId,
      firstRewardedAt: referrals.firstRewardedAt,
      milestoneRewardedAt: referrals.milestoneRewardedAt,
      referredName: players.displayName,
    })
    .from(referrals)
    .innerJoin(players, eq(players.id, referrals.referredPlayerId))
    .where(
      and(
        inArray(referrals.referredPlayerId, participantIds),
        isNull(referrals.cancelledAt),
      ),
    );

  let paid = 0;
  for (const row of rows) {
    if (row.firstRewardedAt && row.milestoneRewardedAt) continue;

    const played = await paidLeagueSessions(
      tx,
      row.referredPlayerId,
      proposalId,
    );

    if (played >= 1 && !row.firstRewardedAt) {
      await credit(tx, {
        playerId: row.referrerPlayerId,
        amount: REFERRAL_REWARDS.firstSessionUno,
        type: "reward",
        description: ecriture("Parrainage — {nom} a joué sa première séance", {
          nom: row.referredName,
        }),
        referenceType: "referral",
        referenceId: row.id,
        idempotencyKey: `referral:${row.id}:first`,
      });
      await tx
        .update(referrals)
        .set({ firstRewardedAt: new Date() })
        .where(eq(referrals.id, row.id));
      await notifyPlayer(
        {
          playerId: row.referrerPlayerId,
          eventKey: `referral:${row.id}:first`,
          title: gabarit("Parrainage récompensé"),
          body: gabarit(
            "{nom} a joué sa première séance UNO League : {montant} UNO pour vous.",
            {
              nom: row.referredName,
              montant: REFERRAL_REWARDS.firstSessionUno,
            },
          ),
          url: "/parrainage",
        },
        tx,
      );
      paid++;
    }

    if (
      played >= REFERRAL_REWARDS.milestoneSessions &&
      !row.milestoneRewardedAt
    ) {
      await credit(tx, {
        playerId: row.referrerPlayerId,
        amount: REFERRAL_REWARDS.milestoneUno,
        type: "reward",
        description: ecriture("Parrainage — {nom} a joué {seances} séances", {
          nom: row.referredName,
          seances: REFERRAL_REWARDS.milestoneSessions,
        }),
        referenceType: "referral",
        referenceId: row.id,
        idempotencyKey: `referral:${row.id}:milestone`,
      });
      await tx
        .update(referrals)
        .set({ milestoneRewardedAt: new Date() })
        .where(eq(referrals.id, row.id));
      await notifyPlayer(
        {
          playerId: row.referrerPlayerId,
          eventKey: `referral:${row.id}:milestone`,
          title: gabarit("Parrainage récompensé"),
          body: gabarit(
            "{nom} a joué {seances} séances UNO League : {montant} UNO de plus pour vous.",
            {
              nom: row.referredName,
              seances: REFERRAL_REWARDS.milestoneSessions,
              montant: REFERRAL_REWARDS.milestoneUno,
            },
          ),
          url: "/parrainage",
        },
        tx,
      );
      paid++;
    }
  }
  return paid;
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export interface ReferralSummary {
  code: string;
  rewards: typeof REFERRAL_REWARDS;
  earnedUno: number;
  referrals: Array<{
    id: number;
    playerId: number;
    displayName: string;
    profilePhotoUrl: string | null;
    joinedAt: Date;
    paidSessions: number;
    firstRewarded: boolean;
    milestoneRewarded: boolean;
    cancelled: boolean;
  }>;
}

/** Ce que le joueur voit sur son écran Parrainage. */
export async function referralSummary(
  playerId: number,
): Promise<ReferralSummary> {
  const code = await ensureReferralCode(playerId);

  const rows = await db
    .select({
      id: referrals.id,
      playerId: players.id,
      displayName: players.displayName,
      profilePhotoUrl: players.profilePhotoUrl,
      joinedAt: referrals.createdAt,
      firstRewardedAt: referrals.firstRewardedAt,
      milestoneRewardedAt: referrals.milestoneRewardedAt,
      cancelledAt: referrals.cancelledAt,
    })
    .from(referrals)
    .innerJoin(players, eq(players.id, referrals.referredPlayerId))
    .where(eq(referrals.referrerPlayerId, playerId))
    .orderBy(desc(referrals.createdAt));

  const list: ReferralSummary["referrals"] = [];
  for (const row of rows) {
    list.push({
      id: row.id,
      playerId: row.playerId,
      displayName: row.displayName,
      profilePhotoUrl: row.profilePhotoUrl,
      joinedAt: row.joinedAt,
      paidSessions: await paidLeagueSessions(db, row.playerId, 0),
      firstRewarded: row.firstRewardedAt !== null,
      milestoneRewarded: row.milestoneRewardedAt !== null,
      cancelled: row.cancelledAt !== null,
    });
  }

  return {
    code,
    rewards: REFERRAL_REWARDS,
    earnedUno: await earnedFromReferrals(db, playerId),
    referrals: list,
  };
}

/** Le net touché au titre du parrainage : versements moins reprises. */
async function earnedFromReferrals(
  executor: Executor,
  playerId: number,
): Promise<number> {
  const [row] = await executor
    .select({ total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)` })
    .from(transactions)
    .where(
      and(
        eq(transactions.playerId, playerId),
        eq(transactions.referenceType, "referral"),
      ),
    );
  return Number(row?.total ?? 0);
}

// ---------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------

export interface AdminReferralRow {
  id: number;
  createdAt: Date;
  referrer: { id: number; displayName: string };
  referred: { id: number; displayName: string; profilePhotoUrl: string | null };
  paidSessions: number;
  rewardedUno: number;
  cancelledAt: Date | null;
}

/** Tous les parrainages, du plus récent au plus ancien. */
export async function listReferrals(): Promise<AdminReferralRow[]> {
  const referrer = players;
  const rows = await db
    .select({
      id: referrals.id,
      createdAt: referrals.createdAt,
      referrerId: referrals.referrerPlayerId,
      referredId: referrals.referredPlayerId,
      cancelledAt: referrals.cancelledAt,
    })
    .from(referrals)
    .orderBy(desc(referrals.createdAt), desc(referrals.id))
    .limit(500);

  const ids = [
    ...new Set(rows.flatMap((row) => [row.referrerId, row.referredId])),
  ];
  const people = ids.length
    ? await db
        .select({
          id: referrer.id,
          displayName: referrer.displayName,
          profilePhotoUrl: referrer.profilePhotoUrl,
        })
        .from(referrer)
        .where(inArray(referrer.id, ids))
        .orderBy(asc(referrer.id))
    : [];
  const byId = new Map(people.map((person) => [person.id, person]));

  const result: AdminReferralRow[] = [];
  for (const row of rows) {
    const [granted] = await db
      .select({ total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)` })
      .from(transactions)
      .where(
        and(
          eq(transactions.referenceType, "referral"),
          eq(transactions.referenceId, row.id),
          gt(transactions.amount, 0),
        ),
      );
    const referrerRow = byId.get(row.referrerId);
    const referredRow = byId.get(row.referredId);
    result.push({
      id: row.id,
      createdAt: row.createdAt,
      referrer: {
        id: row.referrerId,
        displayName: referrerRow?.displayName ?? "—",
      },
      referred: {
        id: row.referredId,
        displayName: referredRow?.displayName ?? "—",
        profilePhotoUrl: referredRow?.profilePhotoUrl ?? null,
      },
      paidSessions: await paidLeagueSessions(db, row.referredId, 0),
      rewardedUno: Number(granted?.total ?? 0),
      cancelledAt: row.cancelledAt,
    });
  }
  return result;
}

/**
 * Annule un parrainage (un même joueur sur deux comptes, un abus constaté).
 *
 * Les versements à venir s'arrêtent, et ceux déjà faits sont **repris** au
 * parrain — dans la limite de son solde : un solde ne descend jamais sous
 * zéro (CHECK en base), et ce qui a déjà été dépensé ne se reprend pas.
 */
export async function cancelReferral(
  actor: { userId: number; playerId: number },
  referralId: number,
): Promise<{ reclaimedUno: number }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: referrals.id,
        referrerPlayerId: referrals.referrerPlayerId,
        cancelledAt: referrals.cancelledAt,
      })
      .from(referrals)
      .where(eq(referrals.id, referralId))
      .for("update")
      .limit(1);

    if (!row) throw new AppError("NOT_FOUND");
    if (row.cancelledAt) {
      throw new AppError("RULE_VIOLATION", "Ce parrainage est déjà annulé.");
    }

    await tx
      .update(referrals)
      .set({ cancelledAt: new Date(), cancelledByPlayerId: actor.playerId })
      .where(eq(referrals.id, referralId));

    const [granted] = await tx
      .select({ total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)` })
      .from(transactions)
      .where(
        and(
          eq(transactions.referenceType, "referral"),
          eq(transactions.referenceId, referralId),
        ),
      );
    const owed = Number(granted?.total ?? 0);

    let reclaimed = 0;
    if (owed > 0) {
      const [balance] = await tx
        .select({ uno: players.unoPoints })
        .from(players)
        .where(eq(players.id, row.referrerPlayerId))
        .limit(1);
      reclaimed = Math.min(owed, balance?.uno ?? 0);
      if (reclaimed > 0) {
        await debit(tx, {
          playerId: row.referrerPlayerId,
          amount: reclaimed,
          type: "admin_debit",
          description: ecriture("Parrainage annulé"),
          referenceType: "referral",
          referenceId: referralId,
          idempotencyKey: `referral:${referralId}:cancel`,
        });
      }
    }

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "referral.cancel",
      entityType: "referral",
      entityId: referralId,
      after: { reclaimedUno: reclaimed, owedUno: owed },
    });

    return { reclaimedUno: reclaimed };
  });
}
