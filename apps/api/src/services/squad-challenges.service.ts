import { and, desc, eq, inArray, lte, or, sql } from "drizzle-orm";
import {
  AppError,
  SQUAD_LIMITS,
  challengeExpiry,
  isAllowedDuration,
  mayCounterOffer,
  minimumCounterStake,
  zonedTimeToUtc,
  type SquadChallengeDetail,
  type SquadChallengeView,
} from "@uno/shared";
import { db, type Executor, type Transaction } from "../db/client.js";
import {
  matches,
  players,
  squadChallengeOffers,
  squadChallenges,
  squads,
} from "../db/schema.js";
import { listActiveVenues } from "./venues.service.js";
import { assertSquadRole } from "./squads.service.js";
import { moveTreasury } from "./squad-treasury.service.js";
import { releaseAllSeats, rostersOf } from "./squad-seats.service.js";
import { writeAudit } from "./audit.service.js";

/**
 * Défis entre SQUADs (SQUAD-004).
 *
 * Un défi porte une proposition de rencontre et une mise qui se négocie. Trois
 * règles en dessinent la forme, et chacune répare un abus possible :
 *
 *  - **la mise ne peut que monter.** Autoriser la baisse ferait du marchandage
 *    une partie d'usure où le club le plus patient gagne, alors que la mise
 *    est censée mesurer la confiance qu'on a dans son équipe ;
 *  - **le nombre de contre-offres est borné.** Sans plafond, un défi se
 *    négocierait jusqu'à ce que le créneau soit passé ;
 *  - **l'échéance ne se repousse pas.** Elle est calculée à la création :
 *    sinon, contre-offrir suffirait à gagner du temps indéfiniment.
 *
 * **Les mises sont verrouillées au moment de l'accord**, pas avant, pas
 * après. Avant, on immobiliserait l'argent d'un club pour un défi qui peut
 * être refusé ; après, rien ne garantirait que la somme est toujours là au
 * coup d'envoi.
 */

/** Verrouille un défi et rend sa ligne. */
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

/** Les deux clubs d'un défi, dans l'ordre défiant puis défié. */
async function squadsOf(
  executor: Executor,
  row: typeof squadChallenges.$inferSelect,
) {
  const rows = await executor
    .select({
      id: squads.id,
      name: squads.name,
      slug: squads.slug,
      rating: squads.rating,
      avatarUrl: squads.avatarUrl,
    })
    .from(squads)
    .where(inArray(squads.id, [row.challengerSquadId, row.challengedSquadId]));

  const byId = new Map(rows.map((squad) => [squad.id, squad]));
  return {
    challenger: byId.get(row.challengerSquadId) ?? null,
    challenged: byId.get(row.challengedSquadId) ?? null,
  };
}

function toChallengeView(
  row: typeof squadChallenges.$inferSelect,
  sides: Awaited<ReturnType<typeof squadsOf>>,
  viewerSquadId: number | null,
): SquadChallengeView {
  return {
    id: row.id,
    challenger: sides.challenger,
    challenged: sides.challenged,
    venueId: row.venueId,
    venueName: row.venueName,
    scheduledAt: row.scheduledAtUtc.toISOString(),
    durationMinutes: row.durationMinutes,
    initialStake: row.initialStakeUno,
    currentStake: row.currentStakeUno,
    negotiationRound: row.negotiationRound,
    counterOffersLeft: mayCounterOffer(row.negotiationRound)
      ? SQUAD_LIMITS.negotiationRounds - (row.negotiationRound - 1)
      : 0,
    status: row.status,
    expiresAt: row.expiresAt.toISOString(),
    matchId: row.matchId,
    createdAt: row.createdAt.toISOString(),
    viewer: {
      squadId: viewerSquadId,
      /** Vrai quand c'est à ce club de répondre. */
      awaitingReply:
        row.status === "pending" && row.awaitingSquadId === viewerSquadId,
      isChallenger: viewerSquadId === row.challengerSquadId,
    },
  };
}

/**
 * Lance un défi (AC04).
 *
 * Réservé au fondateur et aux capitaines : engager la trésorerie de son club
 * et son créneau du samedi n'est pas un geste de membre ordinaire.
 */
export async function createChallenge(
  actor: { userId: number; playerId: number },
  input: {
    squadId: number;
    opponentSquadId: number;
    venueId: string;
    date: string;
    startHour: number;
    durationMinutes: number;
    stakeUno: number;
    message?: string | null | undefined;
  },
): Promise<SquadChallengeView> {
  if (!isAllowedDuration(input.durationMinutes)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Un défi dure 60 ou 120 minutes.",
      { durationMinutes: "Choisissez 60 ou 120 minutes." },
    );
  }

  return db.transaction(async (tx) => {
    await assertSquadRole(tx, actor.playerId, input.squadId, "captain");

    if (input.opponentSquadId === input.squadId) {
      throw new AppError(
        "RULE_VIOLATION",
        "Un SQUAD ne se défie pas lui-même.",
      );
    }

    const [opponent] = await tx
      .select({ id: squads.id, status: squads.status })
      .from(squads)
      .where(eq(squads.id, input.opponentSquadId))
      .limit(1);

    if (!opponent || opponent.status !== "active") {
      throw new AppError("NOT_FOUND", "Ce SQUAD est introuvable.");
    }

    const venue = (await listActiveVenues()).find(
      (row) => row.slug === input.venueId,
    );
    if (!venue) {
      throw new AppError("VALIDATION_ERROR", "Cette salle n'est pas disponible.");
    }

    // Le créneau est converti dans le fuseau de la salle : une heure locale
    // n'a de sens que là où elle se joue (TECH-002).
    const scheduledAt = zonedTimeToUtc(input.date, input.startHour, venue.timezone);
    if (scheduledAt.getTime() <= Date.now()) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Un défi se fixe à une date à venir.",
      );
    }

    const createdAt = new Date();
    const inserted = await tx.insert(squadChallenges).values({
      challengerSquadId: input.squadId,
      challengedSquadId: input.opponentSquadId,
      createdByPlayerId: actor.playerId,
      venueId: venue.slug,
      venueName: venue.name,
      scheduledAtUtc: scheduledAt,
      durationMinutes: input.durationMinutes,
      initialStakeUno: input.stakeUno,
      currentStakeUno: input.stakeUno,
      negotiationRound: 1,
      // La balle est dans le camp du défié.
      awaitingSquadId: input.opponentSquadId,
      expiresAt: challengeExpiry(createdAt),
    });

    const challengeId = Number(inserted[0].insertId);

    await tx.insert(squadChallengeOffers).values({
      challengeId,
      offeredBySquadId: input.squadId,
      createdByPlayerId: actor.playerId,
      stakeUno: input.stakeUno,
      roundNumber: 1,
    });

    const row = await lockChallenge(tx, challengeId);
    return toChallengeView(row, await squadsOf(tx, row), input.squadId);
  });
}

/**
 * Contre-offre sur la mise (AC05).
 *
 * Seul le club dont c'est le tour peut répondre : sans cette règle, deux
 * contre-offres simultanées se chevaucheraient et la dernière écrirait
 * par-dessus l'autre.
 */
export async function counterOffer(
  actor: { userId: number; playerId: number },
  input: { challengeId: number; stakeUno: number },
): Promise<SquadChallengeView> {
  return db.transaction(async (tx) => {
    const row = await lockChallenge(tx, input.challengeId);
    assertNegotiable(row);

    const squadId = row.awaitingSquadId!;
    await assertSquadRole(tx, actor.playerId, squadId, "captain");

    if (!mayCounterOffer(row.negotiationRound)) {
      throw new AppError(
        "RULE_VIOLATION",
        `La négociation est limitée à ${SQUAD_LIMITS.negotiationRounds} contre-offres. ` +
          "Acceptez la mise en vigueur ou refusez le défi.",
      );
    }

    const minimum = minimumCounterStake(row.currentStakeUno);
    if (input.stakeUno < minimum) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Une contre-offre monte la mise : au moins ${minimum} UNO.`,
        { stakeUno: `Au moins ${minimum} UNO.` },
      );
    }

    const round = row.negotiationRound + 1;
    await tx.insert(squadChallengeOffers).values({
      challengeId: row.id,
      offeredBySquadId: squadId,
      createdByPlayerId: actor.playerId,
      stakeUno: input.stakeUno,
      roundNumber: round,
    });

    await tx
      .update(squadChallenges)
      .set({
        currentStakeUno: input.stakeUno,
        negotiationRound: round,
        // La balle repasse dans l'autre camp.
        awaitingSquadId:
          squadId === row.challengerSquadId
            ? row.challengedSquadId
            : row.challengerSquadId,
        updatedAt: new Date(),
      })
      .where(eq(squadChallenges.id, row.id));

    const updated = await lockChallenge(tx, row.id);
    return toChallengeView(updated, await squadsOf(tx, updated), squadId);
  });
}

/** Un défi tranché, expiré ou déjà joué ne se négocie plus. */
function assertNegotiable(row: typeof squadChallenges.$inferSelect): void {
  if (row.status !== "pending") {
    throw new AppError("RULE_VIOLATION", "Ce défi n'est plus en négociation.");
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    throw new AppError(
      "RULE_VIOLATION",
      "Ce défi a expiré : les deux SQUADs doivent en relancer un.",
    );
  }
}

/**
 * Accepte un défi et **verrouille les deux mises** (AC06).
 *
 * C'est l'opération la plus délicate du mode, et la spécification la signale
 * comme critique. Trois exigences :
 *
 *  1. les deux trésoreries sont vérifiées **et** débitées dans la même
 *     transaction. Vérifier puis verrouiller en deux temps laisserait une
 *     dépense se glisser entre les deux ;
 *  2. les lignes sont verrouillées dans un ordre stable — par identifiant
 *     croissant. Deux défis croisés entre les mêmes clubs, acceptés en même
 *     temps, se bloqueraient mutuellement sans cette précaution ;
 *  3. les UNO ne quittent pas le club : ils passent du disponible à
 *     l'engagé. Le total possédé ne change pas, c'est ce qu'on peut en faire
 *     qui change.
 *
 * Une mise nulle est permise — un défi d'honneur — et ne verrouille rien.
 */
export async function acceptChallenge(
  actor: { userId: number; playerId: number },
  challengeId: number,
): Promise<SquadChallengeView> {
  return db.transaction(async (tx) => {
    const row = await lockChallenge(tx, challengeId);
    assertNegotiable(row);

    const squadId = row.awaitingSquadId!;
    await assertSquadRole(tx, actor.playerId, squadId, "captain");

    const stake = row.currentStakeUno;

    if (stake > 0) {
      // Ordre stable : sans lui, deux défis croisés acceptés simultanément
      // se verrouilleraient l'un l'autre.
      const ordered = [row.challengerSquadId, row.challengedSquadId].sort(
        (a, b) => a - b,
      );

      for (const side of ordered) {
        const moved = await moveTreasury(tx, {
          squadId: side,
          playerId: actor.playerId,
          // Le total ne bouge pas : on déplace du disponible vers l'engagé.
          available: -stake,
          locked: stake,
          type: "challenge_lock",
          description: `Mise engagée — défi #${row.id}`,
          referenceType: "challenge",
          referenceId: row.id,
          idempotencyKey: `squad:${side}:challenge:${row.id}:lock`,
        });

        if (moved === null) {
          // Clé déjà vue : l'acceptation a déjà eu lieu. Rien à refaire.
          continue;
        }
      }
    }

    await tx
      .update(squadChallenges)
      .set({ status: "accepted", awaitingSquadId: null, updatedAt: new Date() })
      .where(eq(squadChallenges.id, row.id));

    const updated = await lockChallenge(tx, row.id);
    return toChallengeView(updated, await squadsOf(tx, updated), squadId);
  });
}

/** Refuse un défi : rien n'a été engagé, rien n'est à rendre. */
export async function rejectChallenge(
  actor: { userId: number; playerId: number },
  challengeId: number,
): Promise<SquadChallengeView> {
  return db.transaction(async (tx) => {
    const row = await lockChallenge(tx, challengeId);
    assertNegotiable(row);

    const squadId = row.awaitingSquadId!;
    await assertSquadRole(tx, actor.playerId, squadId, "captain");

    await tx
      .update(squadChallenges)
      .set({ status: "rejected", awaitingSquadId: null, updatedAt: new Date() })
      .where(eq(squadChallenges.id, row.id));

    const updated = await lockChallenge(tx, row.id);
    return toChallengeView(updated, await squadsOf(tx, updated), squadId);
  });
}

/**
 * Règle un défi : la mise séquestrée revient au vainqueur (SQUAD-006).
 *
 * Trois mouvements, et pas un de plus :
 *
 *  - **match nul** — chacun récupère sa propre mise. L'engagé redevient
 *    disponible, le total possédé ne bouge d'aucun côté ;
 *  - **victoire** — le vainqueur récupère la sienne *et* prend celle d'en
 *    face ; le perdant voit la sienne quitter la caisse ;
 *  - **mise nulle** — rien à déplacer, le défi d'honneur se règle en un mot.
 *
 * Les places, elles, ne sont pas rendues : elles ont payé la salle, et la
 * salle a été jouée. Confondre les deux reviendrait à croire qu'une équipe
 * qui gagne joue gratuitement.
 *
 * Les caisses sont verrouillées par identifiant croissant, comme à
 * l'acceptation : c'est le même ordre partout qui empêche deux règlements
 * simultanés de se bloquer l'un l'autre.
 */
export async function applySettlement(
  tx: Transaction,
  row: typeof squadChallenges.$inferSelect,
  winnerSquadId: number | null,
): Promise<void> {
  if (row.status !== "accepted") {
    throw new AppError(
      "RULE_VIOLATION",
      "Seul un défi accepté peut être réglé.",
    );
  }

  if (
    winnerSquadId !== null &&
    winnerSquadId !== row.challengerSquadId &&
    winnerSquadId !== row.challengedSquadId
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Le vainqueur désigné ne participe pas à ce défi.",
    );
  }

  const stake = row.currentStakeUno;

  if (stake > 0) {
    const ordered = [row.challengerSquadId, row.challengedSquadId].sort(
      (a, b) => a - b,
    );

    for (const side of ordered) {
      const won = winnerSquadId !== null && side === winnerSquadId;
      const lost = winnerSquadId !== null && side !== winnerSquadId;

      await moveTreasury(tx, {
        squadId: side,
        // Le vainqueur retrouve sa mise **et** encaisse celle d'en face ; le
        // perdant voit la sienne sortir sans rien revenir au disponible.
        available: lost ? 0 : won ? stake * 2 : stake,
        locked: -stake,
        type: won ? "challenge_win" : lost ? "challenge_loss" : "challenge_draw",
        description:
          winnerSquadId === null
            ? `Mise rendue — défi #${row.id} (nul)`
            : won
              ? `Mise gagnée — défi #${row.id}`
              : `Mise perdue — défi #${row.id}`,
        referenceType: "challenge",
        referenceId: row.id,
        idempotencyKey: `squad:${side}:challenge:${row.id}:settle`,
      });
    }

    if (winnerSquadId !== null) {
      await tx
        .update(squads)
        .set({
          totalUnoWon: sql`${squads.totalUnoWon} + ${stake}`,
          updatedAt: new Date(),
        })
        .where(eq(squads.id, winnerSquadId));
    }
  }

  await tx
    .update(squadChallenges)
    .set({ status: "completed", awaitingSquadId: null, updatedAt: new Date() })
    .where(eq(squadChallenges.id, row.id));
}

/**
 * Règlement demandé par l'administration.
 *
 * En phase 5, c'est le résultat du match qui appellera `applySettlement` ;
 * cette route existe pour trancher un défi à la main — et pour que le
 * mouvement d'argent soit éprouvé avant que le match n'en dépende.
 *
 * Le bilan sportif — victoires, défaites, cote — n'est pas touché ici : il se
 * déduira du match, pas d'une décision d'administration.
 */
export async function settleChallenge(
  actor: { userId: number },
  input: { challengeId: number; winnerSquadId?: number | null },
): Promise<SquadChallengeView> {
  return db.transaction(async (tx) => {
    const row = await lockChallenge(tx, input.challengeId);
    await applySettlement(tx, row, input.winnerSquadId ?? null);

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "squad.challenge.settle",
      entityType: "squad_challenge",
      entityId: row.id,
      after: { winnerSquadId: input.winnerSquadId ?? null, stake: row.currentStakeUno },
    });

    const updated = await lockChallenge(tx, row.id);
    return toChallengeView(updated, await squadsOf(tx, updated), null);
  });
}

/**
 * Annule un défi déjà accepté, et défait tout ce qu'il avait engagé.
 *
 * **Réservé à l'administration.** Un capitaine qui pourrait annuler seul un
 * défi accepté aurait de quoi se dérober dès que l'affiche tourne mal ; la
 * décision revient donc à celui qui arbitre les litiges.
 *
 * Les mises retournent au disponible de chaque club, et les places déjà
 * réglées sont remboursées là d'où l'argent venait : le match n'ayant pas eu
 * lieu, la salle n'est due par personne.
 */
export async function annulChallenge(
  actor: { userId: number },
  input: { challengeId: number; reason?: string | null },
): Promise<SquadChallengeView> {
  return db.transaction(async (tx) => {
    const row = await lockChallenge(tx, input.challengeId);
    if (row.status !== "accepted") {
      throw new AppError(
        "RULE_VIOLATION",
        "Seul un défi accepté peut être annulé.",
      );
    }

    const stake = row.currentStakeUno;
    if (stake > 0) {
      const ordered = [row.challengerSquadId, row.challengedSquadId].sort(
        (a, b) => a - b,
      );
      for (const side of ordered) {
        await moveTreasury(tx, {
          squadId: side,
          available: stake,
          locked: -stake,
          type: "challenge_release",
          description: `Mise rendue — défi #${row.id} annulé`,
          referenceType: "challenge",
          referenceId: row.id,
          idempotencyKey: `squad:${side}:challenge:${row.id}:annul`,
        });
      }
    }

    const released = await releaseAllSeats(tx, row.id, "Défi annulé");

    await tx
      .update(squadChallenges)
      .set({ status: "cancelled", awaitingSquadId: null, updatedAt: new Date() })
      .where(eq(squadChallenges.id, row.id));

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "squad.challenge.annul",
      entityType: "squad_challenge",
      entityId: row.id,
      after: { stake, seatsReleased: released, reason: input.reason ?? null },
    });

    const updated = await lockChallenge(tx, row.id);
    return toChallengeView(updated, await squadsOf(tx, updated), null);
  });
}

/**
 * Retire un défi qu'on a lancé.
 *
 * Possible tant qu'il n'est pas accepté, et par le camp qui attend une
 * réponse de l'autre : on retire sa propre proposition, on n'annule pas
 * celle d'en face.
 */
export async function cancelChallenge(
  actor: { userId: number; playerId: number },
  challengeId: number,
): Promise<SquadChallengeView> {
  return db.transaction(async (tx) => {
    const row = await lockChallenge(tx, challengeId);

    if (row.status !== "pending") {
      throw new AppError("RULE_VIOLATION", "Ce défi n'est plus en cours.");
    }

    // Celui qui peut retirer est celui qui a la dernière offre en attente —
    // c'est-à-dire le camp opposé à celui qui doit répondre.
    const ownerSquadId =
      row.awaitingSquadId === row.challengerSquadId
        ? row.challengedSquadId
        : row.challengerSquadId;

    await assertSquadRole(tx, actor.playerId, ownerSquadId, "captain");

    await tx
      .update(squadChallenges)
      .set({ status: "cancelled", awaitingSquadId: null, updatedAt: new Date() })
      .where(eq(squadChallenges.id, row.id));

    const updated = await lockChallenge(tx, row.id);
    return toChallengeView(updated, await squadsOf(tx, updated), ownerSquadId);
  });
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/** Défis d'un club : reçus, envoyés, et ceux déjà tranchés. */
export async function listChallenges(
  executor: Executor,
  params: { squadId: number; limit: number },
): Promise<SquadChallengeView[]> {
  const rows = await executor
    .select()
    .from(squadChallenges)
    .where(
      or(
        eq(squadChallenges.challengerSquadId, params.squadId),
        eq(squadChallenges.challengedSquadId, params.squadId),
      ),
    )
    // Les défis à trancher d'abord, puis les plus récents : c'est ce qui
    // demande une action qu'on vient chercher.
    .orderBy(
      sql`FIELD(${squadChallenges.status}, 'pending', 'accepted') DESC`,
      desc(squadChallenges.id),
    )
    .limit(params.limit);

  const views: SquadChallengeView[] = [];
  for (const row of rows) {
    views.push(toChallengeView(row, await squadsOf(executor, row), params.squadId));
  }
  return views;
}

/** Un défi et toute sa négociation. */
export async function getChallenge(
  executor: Executor,
  challengeId: number,
  viewerSquadId: number | null,
  viewerPlayerId: number,
): Promise<SquadChallengeDetail> {
  const [row] = await executor
    .select()
    .from(squadChallenges)
    .where(eq(squadChallenges.id, challengeId))
    .limit(1);

  if (!row) throw new AppError("NOT_FOUND", "Ce défi est introuvable.");

  const offers = await executor
    .select({
      id: squadChallengeOffers.id,
      squadId: squadChallengeOffers.offeredBySquadId,
      squadName: squads.name,
      playerName: players.displayName,
      stakeUno: squadChallengeOffers.stakeUno,
      roundNumber: squadChallengeOffers.roundNumber,
      createdAt: squadChallengeOffers.createdAt,
    })
    .from(squadChallengeOffers)
    .innerJoin(squads, eq(squads.id, squadChallengeOffers.offeredBySquadId))
    .innerJoin(players, eq(players.id, squadChallengeOffers.createdByPlayerId))
    .where(eq(squadChallengeOffers.challengeId, challengeId))
    .orderBy(squadChallengeOffers.roundNumber);

  return {
    ...toChallengeView(row, await squadsOf(executor, row), viewerSquadId),
    offers: offers.map((offer) => ({
      ...offer,
      createdAt: offer.createdAt.toISOString(),
    })),
    rosters: await rostersOf(executor, challengeId, viewerPlayerId),
    sessionId: await sessionOfChallenge(executor, row.matchId),
  };
}

/** La session qui porte ce match, s'il existe. */
async function sessionOfChallenge(
  executor: Executor,
  matchId: number | null,
): Promise<number | null> {
  if (matchId === null) return null;
  const [row] = await executor
    .select({ proposalId: matches.proposalId })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
  return row?.proposalId ?? null;
}

/**
 * Fait expirer les défis restés sans réponse (SQUAD-004).
 *
 * Appelé par l'entretien périodique. Rien n'est à rendre : la mise n'est
 * verrouillée qu'à l'acceptation, et un défi expiré n'a jamais été accepté.
 */
export async function expireStaleChallenges(): Promise<number> {
  const result = await db
    .update(squadChallenges)
    .set({ status: "expired", awaitingSquadId: null, updatedAt: new Date() })
    .where(
      and(
        eq(squadChallenges.status, "pending"),
        lte(squadChallenges.expiresAt, new Date()),
      ),
    );

  // Drizzle rend le couple [en-tête, champs] du pilote MySQL : le compte de
  // lignes touchées se lit sur le premier élément, pas sur le résultat.
  const [header] = result as unknown as [{ affectedRows?: number }];
  return Number(header?.affectedRows ?? 0);
}
