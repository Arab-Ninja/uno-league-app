import { and, eq, ne, sql } from "drizzle-orm";
import {
  AppError,
  SQUAD_ROSTER_SIZE,
  hourLabel,
  utcToZonedParts,
} from "@uno/shared";
import { db, type Transaction } from "../db/client.js";
import {
  matches,
  proposalParticipants,
  proposals,
  squadChallengeSeats,
  squadChallenges,
  squads,
  teamMembers,
  teams,
} from "../db/schema.js";
import { listActiveVenues } from "./venues.service.js";
import { writeAudit } from "./audit.service.js";
import { applySettlement } from "./squad-challenges.service.js";

/**
 * Le match d'un défi SQUAD (SQUAD-005).
 *
 * **Il emprunte les rails existants plutôt que d'en poser de nouveaux.** Le
 * client l'a dit en une phrase : « je rentrerai les résultats d'un match squad
 * de la même façon qu'un match amical ou uno league ». Un match SQUAD est donc
 * une `proposals` ordinaire, en mode `squad`, avec ses deux équipes et sa
 * rencontre — ce qui lui donne gratuitement la feuille de match, la saisie en
 * visionnage, l'historique de session et la correction.
 *
 * Ce qui le distingue tient dans deux endroits seulement :
 *
 *  - il **ne naît pas du calendrier** mais d'un défi accepté dont les deux
 *    feuilles sont complètes et réglées ;
 *  - sa clôture **règle la mise** et inscrit le résultat au palmarès des deux
 *    clubs, là où une session ordinaire s'arrête aux joueurs.
 */

/** Verrouille un défi le temps d'une transaction. */
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
 * Crée le match d'un défi accepté, et fige les deux effectifs.
 *
 * **Tout doit être réglé avant.** Dix places tenues, dix places payées : une
 * feuille incomplète donnerait un cinq contre quatre, et une place impayée
 * ferait jouer quelqu'un aux frais des autres. Les deux se vérifient ici, sous
 * le verrou du défi, et pas à l'écran.
 *
 * À partir de cet instant la composition ne bouge plus : `squad-seats` refuse
 * toute modification dès qu'un match existe. C'est le sens de « effectif figé
 * au coup d'envoi » — après, ce serait réécrire qui a joué.
 */
export async function createSquadMatch(
  actor: { userId: number },
  input: { challengeId: number },
): Promise<{ proposalId: number; matchId: number }> {
  return db.transaction(async (tx) => {
    const challenge = await lockChallenge(tx, input.challengeId);

    if (challenge.status !== "accepted") {
      throw new AppError(
        "RULE_VIOLATION",
        "Seul un défi accepté donne lieu à un match.",
      );
    }
    if (challenge.matchId !== null) {
      throw new AppError("CONFLICT", "Le match de ce défi existe déjà.");
    }

    const sides = [challenge.challengerSquadId, challenge.challengedSquadId];

    const seats = await tx
      .select()
      .from(squadChallengeSeats)
      .where(
        and(
          eq(squadChallengeSeats.challengeId, challenge.id),
          ne(squadChallengeSeats.status, "released"),
        ),
      )
      .orderBy(squadChallengeSeats.id);

    const named = await tx
      .select({ id: squads.id, name: squads.name })
      .from(squads)
      .where(sql`${squads.id} IN (${sides[0]}, ${sides[1]})`);
    const nameOf = new Map(named.map((row) => [row.id, row.name]));

    for (const squadId of sides) {
      const own = seats.filter((seat) => seat.squadId === squadId);
      if (own.length !== SQUAD_ROSTER_SIZE) {
        throw new AppError(
          "RULE_VIOLATION",
          `${nameOf.get(squadId) ?? "Un SQUAD"} n'a pas ses ` +
            `${SQUAD_ROSTER_SIZE} joueurs : ${own.length} inscrit(s).`,
        );
      }
      const unpaid = own.filter((seat) => seat.status !== "paid").length;
      if (unpaid > 0) {
        throw new AppError(
          "RULE_VIOLATION",
          `${nameOf.get(squadId) ?? "Un SQUAD"} a ${unpaid} place(s) non réglée(s).`,
        );
      }
    }

    const venue = (await listActiveVenues()).find(
      (row) => row.slug === challenge.venueId,
    );
    if (!venue) {
      throw new AppError("VALIDATION_ERROR", "Cette salle n'est plus disponible.");
    }

    const local = utcToZonedParts(challenge.scheduledAtUtc, venue.timezone);

    /**
     * La session naît directement à l'état « session » : la place de chacun
     * est déjà payée, il n'y a ni proposition à remplir ni échéance à tenir.
     *
     * `activeSlotKey` reste nul à dessein. Cette clé sert à empêcher deux
     * propositions au même créneau dans le calendrier public ; un match SQUAD
     * s'arrange entre deux clubs et n'a pas à bloquer ce créneau pour la
     * League, ni à s'y heurter.
     */
    const insertedProposal = await tx.insert(proposals).values({
      startsAtUtc: challenge.scheduledAtUtc,
      localDate: local.isoDate,
      slotStartHour: local.hour,
      localTimeLabel: hourLabel(local.hour),
      timezone: venue.timezone,
      venueId: venue.slug,
      venueName: venue.name,
      modeId: "squad",
      // Un match SQUAD ne relève d'aucune division : les deux clubs mêlent
      // les leurs, et le résultat n'y change rien (MODE-002).
      division: null,
      minParticipants: SQUAD_ROSTER_SIZE * 2,
      priceEur: 0,
      priceUno: 0,
      status: "session",
      participantCount: seats.length,
      paidCount: seats.length,
      paymentComplete: true,
      creatorPlayerId: challenge.createdByPlayerId,
      activeSlotKey: null,
    });
    const proposalId = Number(insertedProposal[0].insertId);

    for (const seat of seats) {
      await tx.insert(proposalParticipants).values({
        proposalId,
        playerId: seat.playerId,
        // La place a été réglée au défi, par le joueur ou par la caisse : la
        // session n'a pas à la redemander (SQUAD-006).
        hasPaid: true,
      });
    }

    const teamIds: number[] = [];
    for (const [index, squadId] of sides.entries()) {
      const insertedTeam = await tx.insert(teams).values({
        proposalId,
        name: nameOf.get(squadId) ?? `SQUAD ${squadId}`,
        teamIndex: index,
      });
      const teamId = Number(insertedTeam[0].insertId);
      teamIds.push(teamId);

      for (const seat of seats.filter((row) => row.squadId === squadId)) {
        await tx.insert(teamMembers).values({ teamId, playerId: seat.playerId });
      }
    }

    const insertedMatch = await tx.insert(matches).values({
      proposalId,
      teamAId: teamIds[0]!,
      teamBId: teamIds[1]!,
      matchOrder: 1,
    });
    const matchId = Number(insertedMatch[0].insertId);

    await tx
      .update(squadChallenges)
      .set({ matchId, updatedAt: new Date() })
      .where(eq(squadChallenges.id, challenge.id));

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "squad.match.create",
      entityType: "squad_challenge",
      entityId: challenge.id,
      after: { proposalId, matchId },
    });

    return { proposalId, matchId };
  });
}

/**
 * Le défi dont cette session est le match, s'il y en a un.
 *
 * Passe par `matches` : c'est le match qui porte la session, et le défi qui
 * porte le match.
 */
async function challengeOfSession(tx: Transaction, proposalId: number) {
  const [row] = await tx
    .select({ challenge: squadChallenges })
    .from(squadChallenges)
    .innerJoin(matches, eq(matches.id, squadChallenges.matchId))
    .where(eq(matches.proposalId, proposalId))
    .limit(1);

  return row?.challenge ?? null;
}

/**
 * Clôture côté clubs : palmarès, série, et règlement de la mise (SQUAD-006).
 *
 * Appelée par la clôture de session, dans **sa** transaction : le résultat
 * sportif et le mouvement d'argent forment un seul tout. Une victoire
 * enregistrée sans que la mise suive laisserait un club créditeur d'un gain
 * qu'il ne verrait jamais.
 *
 * Rend `null` quand la session n'est pas un match SQUAD — le cas courant.
 */
export async function settleSquadSession(
  tx: Transaction,
  proposalId: number,
): Promise<{ challengeId: number; winnerSquadId: number | null } | null> {
  const challenge = await challengeOfSession(tx, proposalId);
  if (!challenge || challenge.status !== "accepted") return null;

  const [match] = await tx
    .select()
    .from(matches)
    .where(eq(matches.id, challenge.matchId!))
    .limit(1);

  /**
   * Le score doit avoir été saisi **et validé**.
   *
   * `score_a` et `score_b` valent 0 par défaut : un match jamais rempli se
   * lirait comme un 0-0, donc comme un match nul, et rendrait les mises comme
   * si la rencontre avait été jouée. C'est le statut, et non le score, qui
   * dit qu'il s'est passé quelque chose.
   */
  if (!match || match.status !== "validated") {
    throw new AppError(
      "RULE_VIOLATION",
      "Le résultat du match doit être saisi et validé avant la clôture.",
    );
  }

  // L'équipe A est celle du défieur : c'est l'ordre dans lequel les deux
  // équipes ont été créées, et il ne change plus.
  const winnerSquadId =
    match.scoreA === match.scoreB
      ? null
      : match.scoreA > match.scoreB
        ? challenge.challengerSquadId
        : challenge.challengedSquadId;

  for (const squadId of [
    challenge.challengerSquadId,
    challenge.challengedSquadId,
  ].sort((a, b) => a - b)) {
    const won = winnerSquadId !== null && squadId === winnerSquadId;
    const lost = winnerSquadId !== null && squadId !== winnerSquadId;

    await tx
      .update(squads)
      .set({
        matchesPlayed: sql`${squads.matchesPlayed} + 1`,
        wins: won ? sql`${squads.wins} + 1` : sql`${squads.wins}`,
        losses: lost ? sql`${squads.losses} + 1` : sql`${squads.losses}`,
        draws:
          winnerSquadId === null ? sql`${squads.draws} + 1` : sql`${squads.draws}`,
        /**
         * La série compte dans un sens ou dans l'autre : positive pour des
         * victoires, négative pour des défaites, remise à zéro par un nul.
         * Une victoire après trois défaites vaut 1, et non -2.
         */
        streak: won
          ? sql`CASE WHEN ${squads.streak} > 0 THEN ${squads.streak} + 1 ELSE 1 END`
          : lost
            ? sql`CASE WHEN ${squads.streak} < 0 THEN ${squads.streak} - 1 ELSE -1 END`
            : sql`0`,
        updatedAt: new Date(),
      })
      .where(eq(squads.id, squadId));
  }

  await applySettlement(tx, challenge, winnerSquadId);

  return { challengeId: challenge.id, winnerSquadId };
}

/** Vrai si la session est le match d'un défi déjà réglé. */
export async function isSettledSquadSession(
  tx: Transaction,
  proposalId: number,
): Promise<boolean> {
  const challenge = await challengeOfSession(tx, proposalId);
  return challenge !== null && challenge.status === "completed";
}
