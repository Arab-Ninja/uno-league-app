import { and, asc, count, desc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import {
  AppError,
  TOURNAMENT_DURATION_HOURS,
  TOURNAMENT_PROPOSAL_LEAD_DAYS,
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
  type ProposeTournamentInput,
  type RecordTournamentMatchInput,
  type SquadBadge,
  type TournamentDetail,
  type TournamentEntryView,
  type TournamentFormatInput,
  type TournamentFormatView,
  type TournamentMatchView,
  type TournamentRound,
  type TournamentSize,
  type TournamentStatus,
  type TournamentSummary,
  gabarit,
} from "@uno/shared";
import { db, type Executor, type Transaction } from "../db/client.js";
import {
  squads,
  tournamentEntries,
  tournamentFormats,
  tournamentMatches,
  tournaments,
  type TournamentRow,
} from "../db/schema.js";
import { isDuplicateKeyError } from "../lib/errors.js";
import { writeAudit } from "./audit.service.js";
import { recordAdminEvent } from "./admin-events.service.js";
import { requireBookableVenue } from "./venues.service.js";
import { activeMembership, assertSquadRole } from "./squads.service.js";
import { moveTreasury } from "./squad-treasury.service.js";
import { ecriture } from "../i18n/index.js";

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
    formatId: row.formatId,
    proposedBySquadId: row.proposedBySquadId,
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

/**
 * Les tournois, filtrés par le serveur (TOUR-006).
 *
 * Quatre filtres, tous appliqués en SQL. Le dernier n'est pas demandé par
 * l'appelant : **un tournoi annulé ne se montre pas**. Il n'a pas eu lieu, il
 * n'aura pas lieu, et le laisser dans la liste posait deux problèmes — une
 * proposition annulée continuait d'apparaître comme une date possible, et le
 * palmarès s'ouvrait sur des tournois que personne n'avait joués. L'annulation
 * ne l'efface pas pour autant : la ligne reste en base, les droits
 * d'engagement rendus restent au registre, et l'administration peut encore la
 * demander en nommant le statut.
 */
export async function listTournaments(
  viewer: { playerId: number },
  input: ListTournamentsInput,
): Promise<TournamentSummary[]> {
  const conditions = input.status
    ? [eq(tournaments.status, input.status)]
    : [ne(tournaments.status, "cancelled")];

  // Bornes du mois affiché. Sur `localDate` et non sur l'instant UTC : c'est la
  // case du calendrier qu'on remplit, et une salle à l'autre bout du fuseau
  // n'a pas à faire glisser un tournoi d'un jour.
  if (input.from) conditions.push(gte(tournaments.localDate, input.from));
  if (input.to) conditions.push(lte(tournaments.localDate, input.to));
  if (input.formatId !== undefined) {
    conditions.push(eq(tournaments.formatId, input.formatId));
  }

  const rows = await db
    .select()
    .from(tournaments)
    .where(and(...conditions))
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
    homeEntryId: match.homeEntryId,
    awayEntryId: match.awayEntryId,
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
// Formats (administration)
// ---------------------------------------------------------------------------

/**
 * Les formats ouverts par la ligue (TOUR-005).
 *
 * `openCount` dit combien de tournois de ce format attendent encore des
 * clubs : c'est ce qui permet à un dirigeant de choisir entre rejoindre une
 * date déjà posée et en proposer une nouvelle.
 */
export async function listFormats(options: {
  includeInactive: boolean;
}): Promise<TournamentFormatView[]> {
  const rows = await db
    .select()
    .from(tournamentFormats)
    .where(
      options.includeInactive ? undefined : eq(tournamentFormats.active, true),
    )
    .orderBy(asc(tournamentFormats.size), asc(tournamentFormats.id));

  if (rows.length === 0) return [];

  const counts = await db
    .select({ formatId: tournaments.formatId, total: count() })
    .from(tournaments)
    .where(eq(tournaments.status, "open"))
    .groupBy(tournaments.formatId);

  const open = new Map(
    counts
      .filter((row) => row.formatId !== null)
      .map((row) => [row.formatId as number, Number(row.total)]),
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    size: row.size,
    entryFeeUno: row.entryFeeUno,
    prizeUno: row.prizeUno,
    active: row.active,
    coverImageUrl: row.coverImageUrl,
    openCount: open.get(row.id) ?? 0,
  }));
}

export async function saveFormat(
  actor: { userId: number },
  input: TournamentFormatInput & { formatId?: number },
): Promise<void> {
  await db.transaction(async (tx) => {
    if (input.formatId === undefined) {
      await tx.insert(tournamentFormats).values({
        name: input.name,
        size: input.size,
        entryFeeUno: input.entryFeeUno,
        prizeUno: input.prizeUno,
        active: input.active,
        coverImageUrl: input.coverImageUrl ?? null,
      });
    } else {
      /*
       * Retoucher un format ne réécrit aucun tournoi déjà posé : chacun porte
       * sa propre copie de la taille et des prix. Sans cela, relever la
       * dotation aurait enrichi rétroactivement des clubs qui n'avaient pas
       * joué pour cela.
       */
      await tx
        .update(tournamentFormats)
        .set({
          name: input.name,
          size: input.size,
          entryFeeUno: input.entryFeeUno,
          prizeUno: input.prizeUno,
          active: input.active,
          coverImageUrl: input.coverImageUrl ?? null,
          updatedAt: new Date(),
        })
        .where(eq(tournamentFormats.id, input.formatId));
    }

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "tournament.format.save",
      entityType: "tournament_format",
      entityId: input.formatId ?? null,
      after: { name: input.name, size: input.size, prizeUno: input.prizeUno },
    });
  });
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

  // Le préavis d'un tournoi, pas celui d'une séance : il court sur une semaine,
  // le temps qu'un plateau de clubs entiers se remplisse (TOUR-006). La règle
  // vaut aussi pour l'administration — un tournoi qu'elle poserait pour
  // après-demain resterait vide pour la même raison.
  const earliest = addDaysIso(
    todayIso(venue.timezone),
    TOURNAMENT_PROPOSAL_LEAD_DAYS,
  );
  if (diffDaysIso(earliest, input.date) < 0) {
    throw new AppError(
      "RULE_VIOLATION",
      gabarit("Un tournoi doit être créé au moins {jours} jours à l'avance.", {
        jours: TOURNAMENT_PROPOSAL_LEAD_DAYS,
      }),
      {
        date: gabarit("Date la plus proche possible : {date}", {
          date: earliest,
        }),
      },
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

    await releaseEntryFees(tx, row, "tournament_refund");

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

/**
 * Un club pose une date sur un format, et s'y engage aussitôt (TOUR-005).
 *
 * C'est le pendant, à l'échelle des clubs, de ce que fait un joueur au
 * calendrier : la ligue fixe les règles du plateau — combien d'équipes,
 * combien coûte l'engagement, combien rapporte la victoire — et ceux qui
 * veulent jouer choisissent le jour et la salle.
 *
 * Proposer, c'est s'engager. Une proposition dont l'auteur ne serait pas
 * inscrit laisserait un plateau ouvert que personne ne défend, et le premier
 * arrivant se retrouverait à attendre un club fantôme.
 */
export async function proposeTournament(
  actor: { playerId: number; userId: number },
  input: ProposeTournamentInput & { squadId: number },
): Promise<TournamentSummary> {
  // Seuls le fondateur et les capitaines engagent le nom du club et sa caisse.
  await assertSquadRole(db, actor.playerId, input.squadId, "captain");

  const [format] = await db
    .select()
    .from(tournamentFormats)
    .where(eq(tournamentFormats.id, input.formatId))
    .limit(1);

  if (!format) throw new AppError("NOT_FOUND", "Ce format est introuvable.");
  if (!format.active) {
    throw new AppError(
      "RULE_VIOLATION",
      "Ce format n'accueille plus de nouveaux tournois.",
    );
  }

  const venue = await requireBookableVenue(db, input.venueId);

  const earliest = addDaysIso(
    todayIso(venue.timezone),
    TOURNAMENT_PROPOSAL_LEAD_DAYS,
  );
  if (diffDaysIso(earliest, input.date) < 0) {
    throw new AppError(
      "RULE_VIOLATION",
      gabarit(
        "Un tournoi doit être proposé au moins {jours} jours à l'avance.",
        { jours: TOURNAMENT_PROPOSAL_LEAD_DAYS },
      ),
      {
        date: gabarit("Date la plus proche possible : {date}", {
          date: earliest,
        }),
      },
    );
  }

  const tournamentId = await db.transaction(async (tx) => {
    const inserted = await tx.insert(tournaments).values({
      // « Demi-finales du 25/09 » plutôt que « — 2026-09-25 » : le nom est lu
      // dans des listes et dans le registre de la caisse, pas par une machine.
      name: `${format.name} du ${input.date.slice(8, 10)}/${input.date.slice(5, 7)}`,
      venueId: venue.slug,
      venueName: venue.name,
      startsAtUtc: zonedTimeToUtc(
        input.date,
        input.slotStartHour,
        venue.timezone,
      ),
      localDate: input.date,
      slotStartHour: input.slotStartHour,
      localTimeLabel: tournamentSlotLabel(input.slotStartHour),
      timezone: venue.timezone,
      // Copiés du format, jamais relus : un format retouché ne réécrit pas
      // un tournoi déjà proposé.
      size: format.size,
      entryFeeUno: format.entryFeeUno,
      prizeUno: format.prizeUno,
      status: "open",
      formatId: format.id,
      proposedBySquadId: input.squadId,
      createdByUserId: actor.userId,
    });
    const id = Number(inserted[0].insertId);

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "tournament.propose",
      entityType: "tournament",
      entityId: id,
      after: { formatId: format.id, squadId: input.squadId, date: input.date },
    });

    await recordAdminEvent(
      {
        type: "tournament.created",
        body:
          `Un club propose ${format.name} le ${input.date} à ${venue.name} ` +
          `(${format.size} clubs attendus).`,
        entityType: "tournament",
        entityId: id,
        playerId: actor.playerId,
        key: `tournament:${id}:created`,
      },
      tx,
    );

    return id;
  });

  // L'auteur s'inscrit par le chemin ordinaire : même contrôle de caisse,
  // même écriture au registre, même bascule quand le plateau se remplit.
  return registerSquad(actor, { tournamentId, squadId: input.squadId });
}

/** Créneau d'un tournoi : deux heures pleines (TOUR-005). */
function tournamentSlotLabel(startHour: number): string {
  const end = (startHour + TOURNAMENT_DURATION_HOURS) % 24;
  const pad = (hour: number) => String(hour).padStart(2, "0");
  return `${pad(startHour)}:00 - ${pad(end)}:00`;
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
      .select({
        id: squads.id,
        name: squads.name,
        rating: squads.rating,
        status: squads.status,
      })
      .from(squads)
      .where(eq(squads.id, input.squadId))
      .limit(1);

    if (!squad) throw new AppError("NOT_FOUND", "Ce club est introuvable.");
    if (squad.status !== "active") {
      throw new AppError(
        "RULE_VIOLATION",
        "Un club dissous ne s'engage pas en tournoi.",
      );
    }

    let entryId: number;
    try {
      const inserted = await tx.insert(tournamentEntries).values({
        tournamentId: input.tournamentId,
        squadId: input.squadId,
        registeredByPlayerId: actor.playerId,
        // Figée ici : sans cela, un club pourrait améliorer sa tête de série en
        // jouant des défis entre l'engagement et le tirage.
        ratingAtEntry: squad.rating,
        entryFeeUno: row.entryFeeUno,
      });
      entryId = Number(inserted[0].insertId);
    } catch (error) {
      // Seul le doublon se traduit en « déjà engagé » : tout attraper aurait
      // présenté n'importe quelle panne de base comme une seconde inscription,
      // et envoyé chercher un problème qui n'existe pas.
      if (!isDuplicateKeyError(error)) throw error;
      throw new AppError(
        "CONFLICT",
        "Ce club est déjà engagé dans ce tournoi.",
      );
    }

    if (row.entryFeeUno > 0) {
      const moved = await moveTreasury(tx, {
        squadId: input.squadId,
        playerId: actor.playerId,
        // Le total ne bouge pas : le droit passe du disponible à l'engagé.
        available: -row.entryFeeUno,
        locked: row.entryFeeUno,
        type: "tournament_entry",
        description: ecriture("Engagement — {tournoi}", { tournoi: row.name }),
        referenceType: "tournament",
        referenceId: row.id,
        /*
         * La clé porte l'inscription, pas le couple club/tournoi.
         *
         * Un club qui se retire puis se réengage crée une nouvelle
         * inscription : une clé au nom du tournoi aurait fait passer son
         * second droit pour un rejeu, et il serait rentré sans payer — ou,
         * ce qui est arrivé, se serait vu refuser l'engagement au motif
         * qu'il était « déjà engagé ».
         */
        idempotencyKey: `squad:${input.squadId}:tournament:${row.id}:entry:${entryId}`,
      });

      if (moved === null) {
        throw new AppError("CONFLICT", "Cet engagement a déjà été enregistré.");
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

    /*
     * Le plateau complet se tire sur-le-champ (TOUR-005).
     *
     * Attendre un geste de l'administration laissait des clubs payés,
     * engagés, et sans affiche — parfois jusqu'au lendemain. Or il n'y a plus
     * rien à décider à cet instant : le plateau est plein, les têtes de série
     * sont figées depuis les inscriptions, et le tableau n'a qu'une forme
     * possible. Ce qui n'a qu'une réponse ne se demande pas.
     */
    const full = entryCount + 1 >= row.size;
    if (full) await drawBracket(tx, actor, row);

    return toSummary(
      full ? { ...row, status: "drawn" } : row,
      entryCount + 1,
      null,
      { squadId: input.squadId, isRegistered: true, mayRegister: false },
    );
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
      throw new AppError("NOT_FOUND", "Ce club n'est pas engagé.");
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
        description: ecriture("Engagement rendu — {tournoi}", {
          tournoi: row.name,
        }),
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
      description: ecriture("Engagement rendu — {tournoi} annulé", {
        tournoi: row.name,
      }),
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
  actor: { userId: number; playerId: number },
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

    await drawBracket(tx, actor, row);
  });

  // Relu hors transaction : la vue complète refait ses jointures, et la
  // construire deux fois serait la maintenir deux fois. Elle est relue **du
  // point de vue de l'appelant** : l'administrateur qui tire un tableau est
  // souvent membre d'un club, et son club doit rester mis en avant.
  return getTournament({ playerId: actor.playerId }, tournamentId);
}

/**
 * Le tirage lui-même, sous le verrou du tournoi.
 *
 * Extrait pour être appelé des deux côtés : par le dernier engagement, qui
 * complète le plateau, et par l'administration, qui peut vouloir tirer un
 * tableau qu'elle a rempli autrement. Deux chemins, une seule règle.
 */
async function drawBracket(
  tx: Transaction,
  actor: { userId: number },
  row: TournamentRow,
): Promise<void> {
  const tournamentId = row.id;

  const entries = await tx
    .select()
    .from(tournamentEntries)
    .where(eq(tournamentEntries.tournamentId, tournamentId));

  if (entries.length !== row.size) {
    throw new AppError(
      "RULE_VIOLATION",
      gabarit(
        "Le plateau n'est pas complet : {inscrits} club(s) sur {taille}.",
        { inscrits: entries.length, taille: row.size },
      ),
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
  actor: { userId: number; playerId: number },
  input: RecordTournamentMatchInput,
): Promise<TournamentDetail> {
  const tournamentId = await db.transaction(async (tx) => {
    const [match] = await tx
      .select()
      .from(tournamentMatches)
      .where(eq(tournamentMatches.id, input.matchId))
      .limit(1);

    if (!match)
      throw new AppError("NOT_FOUND", "Cette affiche est introuvable.");

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

    const round = match.round as TournamentRound;
    const following = nextRound(round);

    /*
     * Une correction ne remonte pas le tableau.
     *
     * Changer le vainqueur d'un quart alors que la demie est jouée
     * remplacerait un demi-finaliste sans toucher au résultat de cette demie :
     * on se retrouverait avec une rencontre gagnée par un club qui n'y figure
     * plus. Plutôt que de défaire en cascade des résultats que quelqu'un a
     * saisis, on refuse et l'on dit par où commencer.
     */
    if (following !== null && match.winnerEntryId !== null) {
      const [downstream] = await tx
        .select({ winnerEntryId: tournamentMatches.winnerEntryId })
        .from(tournamentMatches)
        .where(
          and(
            eq(tournamentMatches.tournamentId, row.id),
            eq(tournamentMatches.round, following),
            eq(tournamentMatches.slot, nextSlot(match.slot)),
          ),
        )
        .limit(1);

      if (downstream?.winnerEntryId != null) {
        throw new AppError(
          "RULE_VIOLATION",
          gabarit(
            "Le tour suivant est déjà joué ({tour}) : corrigez-le d'abord.",
            { tour: { libelle: "tournamentRound", cle: following } },
          ),
        );
      }
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

  return getTournament({ playerId: actor.playerId }, tournamentId);
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
        `${squad?.name ?? "Un club"} remporte « ${row.name} »` +
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
      "Rejoignez un club pour participer à un tournoi.",
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

  const byId = new Map(
    counts.map((row) => [row.tournamentId, Number(row.total)]),
  );
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
