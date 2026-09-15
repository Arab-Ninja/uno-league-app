import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import {
  AppError,
  MIN_PROPOSAL_LEAD_DAYS,
  TOURNAMENT_ROUND_LABELS,
  addDaysIso,
  diffDaysIso,
  hourLabel,
  matchesInRound,
  nextRound,
  nextSide,
  nextSlot,
  roundsOf,
  seedPairs,
  todayIso,
  zonedTimeToUtc,
  type CreateTournamentInput,
  type ListTournamentsInput,
  type RecordTournamentMatchInput,
  type SquadBadge,
  type TournamentDetail,
  type TournamentEntryView,
  type TournamentMatchView,
  type TournamentRound,
  type TournamentSize,
  type TournamentStatus,
  type TournamentSummary,
} from "@uno/shared";
import { db, type Executor, type Transaction } from "../db/client.js";
import {
  squads,
  tournamentEntries,
  tournamentMatches,
  tournaments,
  type TournamentEntryRow,
  type TournamentMatchRow,
  type TournamentRow,
} from "../db/schema.js";
import { writeAudit } from "./audit.service.js";
import { recordAdminEvent } from "./admin-events.service.js";
import { requireBookableVenue } from "./venues.service.js";
import { activeMembership, assertSquadRole } from "./squads.service.js";
import { moveTreasury } from "./squad-treasury.service.js";

/**
 * Tournois entre SQUADs (TOUR-001).
 *
 * Un tournoi réunit des clubs — pas des joueurs — autour d'un tableau à
 * élimination directe. Trois règles en dessinent la forme, et chacune répond à
 * une question qu'on se pose une fois le premier tournoi lancé :
 *
 *  - **le plateau est une puissance de deux.** Quatre, huit, seize ou
 *    trente-deux clubs : les seules formes où chaque tour divise exactement le
 *    plateau. Un tableau à six aurait exigé des exempts, donc un critère pour
 *    désigner qui passe sans jouer — une faveur qu'aucun règlement amateur ne
 *    justifie ;
 *  - **le droit d'engagement est séquestré, pas dépensé.** Tant que le tournoi
 *    n'a pas eu lieu, il reste dans la caisse du club, en part engagée. Si le
 *    tournoi est annulé, chacun le retrouve ; c'est exactement le traitement
 *    d'une mise de défi (SQUAD-003) ;
 *  - **le tirage fige les têtes de série.** La cote de chaque club est
 *    enregistrée à l'inscription : sans cela, un club pourrait améliorer sa
 *    place dans le tableau en jouant des défis entre l'engagement et le
 *    tirage.
 */

// ---------------------------------------------------------------------------
// Lectures
// ---------------------------------------------------------------------------

const badgeColumns = {
  id: squads.id,
  name: squads.name,
  slug: squads.slug,
  rating: squads.rating,
  avatarUrl: squads.avatarUrl,
};

async function badgesFor(
  executor: Executor,
  squadIds: number[],
): Promise<Map<number, SquadBadge>> {
  if (squadIds.length === 0) return new Map();

  const rows = await executor
    .select(badgeColumns)
    .from(squads)
    .where(inArray(squads.id, squadIds));

  return new Map(rows.map((row) => [row.id, row]));
}

function toSummary(
  row: TournamentRow,
  entryCount: number,
  winner: SquadBadge | null,
  viewer: TournamentSummary["viewer"],
): TournamentSummary {
  return {
    id: row.id,
    name: row.name,
    venueId: row.venueId,
    venueName: row.venueName,
    startsAtUtc: row.startsAtUtc.toISOString(),
    localDate: row.localDate,
    localTimeLabel: row.localTimeLabel,
    timezone: row.timezone,
    size: row.size,
    entryFeeUno: row.entryFeeUno,
    prizeUno: row.prizeUno,
    status: row.status as TournamentStatus,
    entryCount,
    winner,
    viewer,
  };
}

/**
 * Ce que le club du joueur qui regarde peut faire de ce tournoi.
 *
 * Tranché ici plutôt qu'à l'écran : « puis-je engager mon club ? » mêle un
 * rôle, un état de tournoi et un plateau qui peut être complet. Trois
 * conditions que le client aurait fini par évaluer autrement que le serveur.
 */
function viewerOf(
  row: TournamentRow,
  entryCount: number,
  membership: { squadId: number; role: string } | null,
  registeredSquadIds: Set<number>,
): TournamentSummary["viewer"] {
  const squadId = membership?.squadId ?? null;
  const isRegistered = squadId !== null && registeredSquadIds.has(squadId);
  const mayLead =
    membership !== null &&
    (membership.role === "founder" || membership.role === "captain");

  return {
    squadId,
    isRegistered,
    mayRegister:
      mayLead &&
      !isRegistered &&
      row.status === "open" &&
      entryCount < row.size,
  };
}

export async function listTournaments(
  viewer: { playerId: number },
  input: ListTournamentsInput,
): Promise<TournamentSummary[]> {
  const conditions = input.status
    ? [eq(tournaments.status, input.status)]
    : [];

  const rows = await db
    .select()
    .from(tournaments)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(tournaments.startsAtUtc))
    .limit(100);

  if (rows.length === 0) return [];

  const membership = await activeMembership(db, viewer.playerId);
  const ids = rows.map((row) => row.id);

  const entries = await db
    .select({
      tournamentId: tournamentEntries.tournamentId,
      squadId: tournamentEntries.squadId,
    })
    .from(tournamentEntries)
    .where(inArray(tournamentEntries.tournamentId, ids));

  const counts = new Map<number, number>();
  const mine = new Map<number, Set<number>>();
  for (const entry of entries) {
    counts.set(entry.tournamentId, (counts.get(entry.tournamentId) ?? 0) + 1);
    const set = mine.get(entry.tournamentId) ?? new Set<number>();
    set.add(entry.squadId);
    mine.set(entry.tournamentId, set);
  }

  const winnerIds = rows
    .map((row) => row.winnerSquadId)
    .filter((id): id is number => id !== null);
  const badges = await badgesFor(db, winnerIds);

  const summaries = rows.map((row) => {
    const entryCount = counts.get(row.id) ?? 0;
    return toSummary(
      row,
      entryCount,
      row.winnerSquadId ? (badges.get(row.winnerSquadId) ?? null) : null,
      viewerOf(row, entryCount, membership, mine.get(row.id) ?? new Set()),
    );
  });

  if (!input.mineOnly) return summaries;
  return summaries.filter((summary) => summary.viewer.isRegistered);
}

export async function getTournament(
  viewer: { playerId: number },
  tournamentId: number,
): Promise<TournamentDetail> {
  const [row] = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .limit(1);

  if (!row) throw new AppError("NOT_FOUND", "Ce tournoi est introuvable.");

  const entryRows = await db
    .select()
    .from(tournamentEntries)
    .where(eq(tournamentEntries.tournamentId, tournamentId))
    .orderBy(asc(tournamentEntries.seed), asc(tournamentEntries.id));

  const matchRows = await db
    .select()
    .from(tournamentMatches)
    .where(eq(tournamentMatches.tournamentId, tournamentId))
    .orderBy(asc(tournamentMatches.id));

  const badges = await badgesFor(db, [
    ...entryRows.map((entry) => entry.squadId),
    ...(row.winnerSquadId ? [row.winnerSquadId] : []),
  ]);

  const entries: TournamentEntryView[] = entryRows.flatMap((entry) => {
    const squad = badges.get(entry.squadId);
    if (!squad) return [];
    return [
      {
        id: entry.id,
        squad,
        seed: entry.seed,
        registeredAt: entry.createdAt.toISOString(),
      },
    ];
  });

  const squadOfEntry = new Map(
    entryRows.map((entry) => [entry.id, entry.squadId]),
  );
  const badgeOfEntry = (entryId: number | null): SquadBadge | null => {
    if (entryId === null) return null;
    const squadId = squadOfEntry.get(entryId);
    return squadId === undefined ? null : (badges.get(squadId) ?? null);
  };

  const matches: TournamentMatchView[] = matchRows.map((match) => ({
    id: match.id,
    round: match.round as TournamentRound,
    roundLabel: TOURNAMENT_ROUND_LABELS[match.round as TournamentRound],
    slot: match.slot,
    home: badgeOfEntry(match.homeEntryId),
    away: badgeOfEntry(match.awayEntryId),
    scoreHome: match.scoreHome,
    scoreAway: match.scoreAway,
    winnerEntryId: match.winnerEntryId,
    winnerSquadId:
      match.winnerEntryId === null
        ? null
        : (squadOfEntry.get(match.winnerEntryId) ?? null),
    playedAt: match.playedAt ? match.playedAt.toISOString() : null,
  }));

  const membership = await activeMembership(db, viewer.playerId);
  const registered = new Set(entryRows.map((entry) => entry.squadId));

  return {
    ...toSummary(
      row,
      entryRows.length,
      row.winnerSquadId ? (badges.get(row.winnerSquadId) ?? null) : null,
      viewerOf(row, entryRows.length, membership, registered),
    ),
    entries,
    matches,
    rounds: roundsOf(row.size as TournamentSize).map((round) => ({
      round,
      label: TOURNAMENT_ROUND_LABELS[round],
    })),
  };
}

// ---------------------------------------------------------------------------
// Création (administration)
// ---------------------------------------------------------------------------

/** Verrouille un tournoi le temps d'une transaction. */
async function lockTournament(
  tx: Transaction,
  tournamentId: number,
): Promise<TournamentRow> {
  const [row] = await tx
    .select()
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .for("update")
    .limit(1);

  if (!row) throw new AppError("NOT_FOUND", "Ce tournoi est introuvable.");
  return row;
}

export async function createTournament(
  actor: { userId: number },
  input: CreateTournamentInput,
): Promise<TournamentSummary> {
  // La salle est relue en base, comme pour une proposition : elle est
  // administrable, et une salle retirée ne doit plus accueillir personne.
  const venue = await requireBookableVenue(db, input.venueId);

  // Même préavis que pour une séance du calendrier : un tournoi annoncé pour
  // demain ne laisse à aucun club le temps d'engager son effectif.
  const earliest = addDaysIso(todayIso(venue.timezone), MIN_PROPOSAL_LEAD_DAYS);
  if (diffDaysIso(earliest, input.date) < 0) {
    throw new AppError(
      "RULE_VIOLATION",
      `Un tournoi doit être créé au moins ${MIN_PROPOSAL_LEAD_DAYS} jours à l'avance.`,
      { date: `Date la plus proche possible : ${earliest}` },
    );
  }

  const startsAtUtc = zonedTimeToUtc(
    input.date,
    input.slotStartHour,
    venue.timezone,
  );

  const row = await db.transaction(async (tx) => {
    const inserted = await tx.insert(tournaments).values({
      name: input.name,
      venueId: venue.slug,
      venueName: venue.name,
      startsAtUtc,
      localDate: input.date,
      slotStartHour: input.slotStartHour,
      localTimeLabel: hourLabel(input.slotStartHour),
      timezone: venue.timezone,
      size: input.size,
      entryFeeUno: input.entryFeeUno,
      prizeUno: input.prizeUno,
      status: "open",
      createdByUserId: actor.userId,
    });
    const tournamentId = Number(inserted[0].insertId);

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "tournament.create",
      entityType: "tournament",
      entityId: tournamentId,
      after: { name: input.name, size: input.size, date: input.date },
    });

    await recordAdminEvent(
      {
        type: "tournament.created",
        body:
          `${input.name} — ${input.size} clubs, ${venue.name}, ${input.date} ` +
          `${hourLabel(input.slotStartHour)}.`,
        entityType: "tournament",
        entityId: tournamentId,
        key: `tournament:${tournamentId}:created`,
      },
      tx,
    );

    return lockTournament(tx, tournamentId);
  });

  return toSummary(row, 0, null, {
    squadId: null,
    isRegistered: false,
    mayRegister: false,
  });
}

export async function cancelTournament(
  actor: { userId: number },
  tournamentId: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockTournament(tx, tournamentId);

    if (row.status === "completed") {
      throw new AppError(
        "RULE_VIOLATION",
        "Un tournoi terminé ne s'annule pas : corrigez ses résultats.",
      );
    }
    if (row.status === "cancelled") return;

    await releaseEntryFees(tx, row, "tournament_refund", "annulé");

    await tx
      .update(tournaments)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(tournaments.id, tournamentId));

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "tournament.cancel",
      entityType: "tournament",
      entityId: tournamentId,
      before: { status: row.status },
      after: { status: "cancelled" },
    });
  });
}

// ---------------------------------------------------------------------------
// Engagement d'un club
// ---------------------------------------------------------------------------

/**
 * Engage un club, droit d'inscription prélevé sur sa caisse (TOUR-002).
 *
 * Le droit est **séquestré** et non dépensé : il passe du disponible à la part
 * engagée, exactement comme une mise de défi. Un tournoi annulé le rend ; un
 * tournoi joué le consomme. Le prélever sèchement aurait rendu toute annulation
 * impossible à réparer.
 */
export async function registerSquad(
  actor: { playerId: number; userId: number },
  input: { tournamentId: number; squadId: number },
): Promise<TournamentSummary> {
  return db.transaction(async (tx) => {
    // Un SQUAD appartient à ses membres : c'est le club qui engage son nom et
    // sa caisse, et seuls un fondateur ou un capitaine le peuvent.
    await assertSquadRole(tx, actor.playerId, input.squadId, "captain");

    const row = await lockTournament(tx, input.tournamentId);

    if (row.status !== "open") {
      throw new AppError(
        "RULE_VIOLATION",
        row.status === "drawn"
          ? "Le tableau de ce tournoi est déjà tiré."
          : "Ce tournoi n'accueille plus d'inscriptions.",
      );
    }

    const [countRow] = await tx
      .select({ total: count() })
      .from(tournamentEntries)
      .where(eq(tournamentEntries.tournamentId, input.tournamentId));

    const entryCount = Number(countRow?.total ?? 0);
    if (entryCount >= row.size) {
      throw new AppError("CONFLICT", "Le plateau de ce tournoi est complet.");
    }

    const [squad] = await tx
      .select({ id: squads.id, name: squads.name, rating: squads.rating, status: squads.status })
      .from(squads)
      .where(eq(squads.id, input.squadId))
      .limit(1);

    if (!squad) throw new AppError("NOT_FOUND", "Ce SQUAD est introuvable.");
    if (squad.status !== "active") {
      throw new AppError(
        "RULE_VIOLATION",
        "Un SQUAD dissous ne s'engage pas en tournoi.",
      );
    }

    try {
      await tx.insert(tournamentEntries).values({
        tournamentId: input.tournamentId,
        squadId: input.squadId,
        registeredByPlayerId: actor.playerId,
        // Figée ici : sans cela, un club pourrait améliorer sa tête de série en
        // jouant des défis entre l'engagement et le tirage.
        ratingAtEntry: squad.rating,
        entryFeeUno: row.entryFeeUno,
      });
    } catch {
      throw new AppError("CONFLICT", "Ce SQUAD est déjà engagé dans ce tournoi.");
    }

    if (row.entryFeeUno > 0) {
      const moved = await moveTreasury(tx, {
        squadId: input.squadId,
        playerId: actor.playerId,
        // Le total ne bouge pas : le droit passe du disponible à l'engagé.
        available: -row.entryFeeUno,
        locked: row.entryFeeUno,
        type: "tournament_entry",
        description: `Engagement — ${row.name}`,
        referenceType: "tournament",
        referenceId: row.id,
        idempotencyKey: `squad:${input.squadId}:tournament:${row.id}:entry`,
      });

      if (moved === null) {
        throw new AppError(
          "CONFLICT",
          "Ce SQUAD est déjà engagé dans ce tournoi.",
        );
      }
    }

    await recordAdminEvent(
      {
        type: "tournament.entry",
        body: `${squad.name} s'engage dans « ${row.name} » (${entryCount + 1}/${row.size}).`,
        entityType: "tournament",
        entityId: row.id,
        playerId: actor.playerId,
        key: `tournament:${row.id}:entry:${input.squadId}`,
      },
      tx,
    );

    return toSummary(row, entryCount + 1, null, {
      squadId: input.squadId,
      isRegistered: true,
      mayRegister: false,
    });
  });
}

/** Retire un club encore engagé, et lui rend son droit. */
export async function withdrawSquad(
  actor: { playerId: number; userId: number },
  input: { tournamentId: number; squadId: number },
): Promise<void> {
  await db.transaction(async (tx) => {
    await assertSquadRole(tx, actor.playerId, input.squadId, "captain");

    const row = await lockTournament(tx, input.tournamentId);

    // Après le tirage, un forfait laisserait un trou dans le tableau : c'est à
    // l'administration de trancher, pas au club de se retirer seul.
    if (row.status !== "open") {
      throw new AppError(
        "RULE_VIOLATION",
        "Le tableau est tiré : le retrait passe désormais par l'administration.",
      );
    }

    const [entry] = await tx
      .select()
      .from(tournamentEntries)
      .where(
        and(
          eq(tournamentEntries.tournamentId, input.tournamentId),
          eq(tournamentEntries.squadId, input.squadId),
        ),
      )
      .limit(1);

    if (!entry) {
      throw new AppError("NOT_FOUND", "Ce SQUAD n'est pas engagé.");
    }

    await tx
      .delete(tournamentEntries)
      .where(eq(tournamentEntries.id, entry.id));

    if (entry.entryFeeUno > 0) {
      await moveTreasury(tx, {
        squadId: input.squadId,
        playerId: actor.playerId,
        available: entry.entryFeeUno,
        locked: -entry.entryFeeUno,
        type: "tournament_refund",
        description: `Engagement rendu — ${row.name}`,
        referenceType: "tournament",
        referenceId: row.id,
        idempotencyKey: `squad:${input.squadId}:tournament:${row.id}:withdraw:${entry.id}`,
      });
    }
  });
}

/**
 * Rend à chaque club engagé le droit qu'il avait séquestré.
 *
 * Employé à l'annulation d'un tournoi. La clé d'idempotence porte l'identifiant
 * de l'inscription : un même club annulé deux fois ne serait remboursé qu'une.
 */
async function releaseEntryFees(
  tx: Transaction,
  row: TournamentRow,
  type: string,
  reason: string,
): Promise<void> {
  const entries = await tx
    .select()
    .from(tournamentEntries)
    .where(eq(tournamentEntries.tournamentId, row.id))
    // Deux clubs verrouillés dans un ordre stable : sans cela, deux
    // transactions concurrentes se verrouilleraient l'une l'autre.
    .orderBy(asc(tournamentEntries.squadId));

  for (const entry of entries) {
    if (entry.entryFeeUno <= 0) continue;
    await moveTreasury(tx, {
      squadId: entry.squadId,
      available: entry.entryFeeUno,
      locked: -entry.entryFeeUno,
      type,
      description: `Engagement rendu — ${row.name} ${reason}`,
      referenceType: "tournament",
      referenceId: row.id,
      idempotencyKey: `squad:${entry.squadId}:tournament:${row.id}:release:${entry.id}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Tirage et résultats
// ---------------------------------------------------------------------------

/**
 * Tire le tableau : têtes de série, premier tour, et les tours suivants vides.
 *
 * Les affiches des tours suivants sont créées tout de suite, sans opposants :
 * c'est ce qui donne à l'écran un tableau complet dès le tirage, où chacun voit
 * le chemin qui mène à la finale plutôt qu'une liste qui s'allonge.
 */
export async function drawTournament(
  actor: { userId: number },
  tournamentId: number,
): Promise<TournamentDetail> {
  await db.transaction(async (tx) => {
    const row = await lockTournament(tx, tournamentId);

    if (row.status !== "open") {
      throw new AppError(
        "RULE_VIOLATION",
        "Le tableau de ce tournoi est déjà tiré.",
      );
    }

    const entries = await tx
      .select()
      .from(tournamentEntries)
      .where(eq(tournamentEntries.tournamentId, tournamentId));

    if (entries.length !== row.size) {
      throw new AppError(
        "RULE_VIOLATION",
        `Le plateau n'est pas complet : ${entries.length} club(s) sur ${row.size}.`,
      );
    }

    // Du plus fort au plus faible, l'identifiant départageant les ex æquo :
    // sans ce second critère, deux clubs de même cote donneraient un tableau
    // différent à chaque tirage, pour un résultat qui se veut reproductible.
    const seeded = [...entries].sort(
      (a, b) => b.ratingAtEntry - a.ratingAtEntry || a.id - b.id,
    );

    for (const [index, entry] of seeded.entries()) {
      await tx
        .update(tournamentEntries)
        .set({ seed: index + 1 })
        .where(eq(tournamentEntries.id, entry.id));
    }

    const rounds = roundsOf(row.size as TournamentSize);
    const firstRound = rounds[0]!;

    for (const [slot, [home, away]] of seedPairs(seeded).entries()) {
      await tx.insert(tournamentMatches).values({
        tournamentId,
        round: firstRound,
        slot,
        homeEntryId: home.id,
        awayEntryId: away.id,
      });
    }

    for (const round of rounds.slice(1)) {
      for (let slot = 0; slot < matchesInRound(round); slot++) {
        await tx.insert(tournamentMatches).values({ tournamentId, round, slot });
      }
    }

    await tx
      .update(tournaments)
      .set({ status: "drawn", updatedAt: new Date() })
      .where(eq(tournaments.id, tournamentId));

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "tournament.draw",
      entityType: "tournament",
      entityId: tournamentId,
      after: { seeds: seeded.map((entry) => entry.squadId) },
    });

    await recordAdminEvent(
      {
        type: "tournament.drawn",
        body: `Le tableau de « ${row.name} » est tiré : ${row.size} clubs engagés.`,
        entityType: "tournament",
        entityId: tournamentId,
        key: `tournament:${tournamentId}:drawn`,
      },
      tx,
    );
  });

  // Relu hors transaction : la vue complète refait ses jointures, et la
  // construire deux fois serait la maintenir deux fois.
  return getTournament({ playerId: 0 }, tournamentId);
}

/**
 * Inscrit le résultat d'une affiche et qualifie le vainqueur (TOUR-003).
 *
 * Le vainqueur est fourni, pas déduit : une élimination directe ne connaît pas
 * le nul, et un 2-2 se tranche aux tirs au but que le score du temps
 * réglementaire ne dit pas. En revanche, un vainqueur qui contredirait un score
 * non nul est refusé — c'est une faute de saisie, pas une règle.
 */
export async function recordMatch(
  actor: { userId: number },
  input: RecordTournamentMatchInput,
): Promise<TournamentDetail> {
  const tournamentId = await db.transaction(async (tx) => {
    const [match] = await tx
      .select()
      .from(tournamentMatches)
      .where(eq(tournamentMatches.id, input.matchId))
      .limit(1);

    if (!match) throw new AppError("NOT_FOUND", "Cette affiche est introuvable.");

    const row = await lockTournament(tx, match.tournamentId);

    if (row.status !== "drawn") {
      throw new AppError(
        "RULE_VIOLATION",
        row.status === "completed"
          ? "Ce tournoi est terminé."
          : "Le tableau de ce tournoi n'est pas tiré.",
      );
    }

    if (match.homeEntryId === null || match.awayEntryId === null) {
      throw new AppError(
        "RULE_VIOLATION",
        "Cette affiche attend encore ses qualifiés.",
      );
    }

    if (
      input.winnerEntryId !== match.homeEntryId &&
      input.winnerEntryId !== match.awayEntryId
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Le vainqueur doit être l'un des deux clubs de l'affiche.",
      );
    }

    const decidedByScore =
      input.scoreHome > input.scoreAway
        ? match.homeEntryId
        : input.scoreAway > input.scoreHome
          ? match.awayEntryId
          : null;

    if (decidedByScore !== null && decidedByScore !== input.winnerEntryId) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Le vainqueur désigné ne correspond pas au score saisi.",
      );
    }

    await tx
      .update(tournamentMatches)
      .set({
        scoreHome: input.scoreHome,
        scoreAway: input.scoreAway,
        winnerEntryId: input.winnerEntryId,
        playedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tournamentMatches.id, match.id));

    const round = match.round as TournamentRound;
    const following = nextRound(round);

    if (following === null) {
      await finishTournament(tx, row, input.winnerEntryId, actor);
    } else {
      // Le qualifié prend sa place dans l'affiche suivante, du côté que lui
      // donne sa position : sans ce côté, deux vainqueurs voisins écriraient
      // dans la même case et l'un effacerait l'autre.
      const side = nextSide(match.slot);
      await tx
        .update(tournamentMatches)
        .set(
          side === "home"
            ? { homeEntryId: input.winnerEntryId, updatedAt: new Date() }
            : { awayEntryId: input.winnerEntryId, updatedAt: new Date() },
        )
        .where(
          and(
            eq(tournamentMatches.tournamentId, row.id),
            eq(tournamentMatches.round, following),
            eq(tournamentMatches.slot, nextSlot(match.slot)),
          ),
        );
    }

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "tournament.match.record",
      entityType: "tournament",
      entityId: row.id,
      before: { scoreHome: match.scoreHome, scoreAway: match.scoreAway },
      after: {
        matchId: match.id,
        scoreHome: input.scoreHome,
        scoreAway: input.scoreAway,
        winnerEntryId: input.winnerEntryId,
      },
    });

    return row.id;
  });

  return getTournament({ playerId: 0 }, tournamentId);
}

/**
 * La finale est jouée : le tournoi se clôt, la dotation part au vainqueur.
 *
 * Les droits d'engagement sortent des caisses à cet instant, et pas avant : ce
 * qui est joué est dû. La dotation, elle, entre dans la caisse du vainqueur —
 * c'est le club qui gagne, pas ses cinq joueurs du jour.
 */
async function finishTournament(
  tx: Transaction,
  row: TournamentRow,
  winnerEntryId: number,
  actor: { userId: number },
): Promise<void> {
  const entries = await tx
    .select()
    .from(tournamentEntries)
    .where(eq(tournamentEntries.tournamentId, row.id))
    .orderBy(asc(tournamentEntries.squadId));

  const winner = entries.find((entry) => entry.id === winnerEntryId);
  if (!winner) {
    throw new AppError("NOT_FOUND", "Le vainqueur n'est pas un club engagé.");
  }

  for (const entry of entries) {
    const isWinner = entry.id === winnerEntryId;
    const fee = entry.entryFeeUno;
    const prize = isWinner ? row.prizeUno : 0;

    if (fee <= 0 && prize <= 0) continue;

    await moveTreasury(tx, {
      squadId: entry.squadId,
      // Le droit séquestré quitte la caisse ; la dotation y entre.
      available: prize,
      locked: -fee,
      type: isWinner ? "tournament_prize" : "tournament_fee",
      description: isWinner
        ? `Tournoi remporté — ${row.name}`
        : `Droit d'engagement — ${row.name}`,
      referenceType: "tournament",
      referenceId: row.id,
      idempotencyKey: `squad:${entry.squadId}:tournament:${row.id}:settle`,
    });
  }

  await tx
    .update(tournaments)
    .set({
      status: "completed",
      winnerSquadId: winner.squadId,
      updatedAt: new Date(),
    })
    .where(eq(tournaments.id, row.id));

  const [squad] = await tx
    .select({ name: squads.name })
    .from(squads)
    .where(eq(squads.id, winner.squadId))
    .limit(1);

  await recordAdminEvent(
    {
      type: "tournament.completed",
      body:
        `${squad?.name ?? "Un SQUAD"} remporte « ${row.name} »` +
        (row.prizeUno > 0 ? ` et ${row.prizeUno} UNO.` : "."),
      entityType: "tournament",
      entityId: row.id,
      key: `tournament:${row.id}:completed`,
    },
    tx,
  );

  await writeAudit(tx, {
    actorUserId: actor.userId,
    action: "tournament.complete",
    entityType: "tournament",
    entityId: row.id,
    after: { winnerSquadId: winner.squadId, prizeUno: row.prizeUno },
  });
}

/**
 * Le club au nom duquel ce joueur agit.
 *
 * Le client n'envoie pas d'identifiant de club : un joueur n'appartient qu'à
 * un seul à la fois, et le lui faire choisir aurait ouvert la porte à engager
 * la caisse d'un club dont on n'est pas membre — le service le refuserait,
 * mais la question n'a pas à être posée.
 */
export async function squadOfPlayer(playerId: number): Promise<number> {
  const membership = await activeMembership(db, playerId);
  if (!membership) {
    throw new AppError(
      "RULE_VIOLATION",
      "Rejoignez un SQUAD pour participer à un tournoi.",
    );
  }
  return membership.squadId;
}

/** Les tournois où ce club est engagé, pour l'onglet SQUAD (TOUR-004). */
export async function tournamentsOfSquad(
  squadId: number,
): Promise<TournamentSummary[]> {
  const rows = await db
    .select({ tournament: tournaments })
    .from(tournamentEntries)
    .innerJoin(tournaments, eq(tournaments.id, tournamentEntries.tournamentId))
    .where(eq(tournamentEntries.squadId, squadId))
    .orderBy(desc(tournaments.startsAtUtc))
    .limit(50);

  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.tournament.id);
  const counts = await db
    .select({
      tournamentId: tournamentEntries.tournamentId,
      total: count(),
    })
    .from(tournamentEntries)
    .where(inArray(tournamentEntries.tournamentId, ids))
    .groupBy(tournamentEntries.tournamentId);

  const byId = new Map(counts.map((row) => [row.tournamentId, Number(row.total)]));
  const winners = await badgesFor(
    db,
    rows
      .map((row) => row.tournament.winnerSquadId)
      .filter((id): id is number => id !== null),
  );

  return rows.map((row) =>
    toSummary(
      row.tournament,
      byId.get(row.tournament.id) ?? 0,
      row.tournament.winnerSquadId
        ? (winners.get(row.tournament.winnerSquadId) ?? null)
        : null,
      { squadId, isRegistered: true, mayRegister: false },
    ),
  );
}
