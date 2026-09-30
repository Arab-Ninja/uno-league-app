import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gte,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  AppError,
  CUSTOM_MATCH,
  CUSTOM_VENUE_ID,
  DEFAULT_REWARD_POLICY,
  DEFAULT_TIMEZONE,
  MIN_PROPOSAL_LEAD_DAYS,
  PAYMENT_DEADLINE_HOURS,
  REWARD_KIND_LABELS,
  REWARD_POLICY_VERSION,
  addDaysIso,
  diffDaysIso,
  eurToUno,
  findSlot,
  getGameMode,
  hourLabel,
  isFormation,
  isPitchSlot,
  modeAllowsVisibility,
  requireSchedulableMode,
  todayIso,
  zonedTimeToUtc,
  type CreateCustomMatchInput,
  type CreateProposalInput,
  type CustomMatchDetails,
  type Division,
  type GameMode,
  type ListProposalsInput,
  type ProposalDetail,
  type ProposalInviteeView,
  type ProposalSummary,
  type ProposalVisibility,
  type PublicPlayer,
  type RewardKind,
  type Side,
  type SubstituteView,
  gabarit,
} from "@uno/shared";
import { db, type Executor, type Transaction } from "../db/client.js";
import { env } from "../env.js";
import {
  players,
  proposalInvitations,
  proposalParticipants,
  proposalSubstitutes,
  proposals,
  teamMembers,
  teams,
  type ProposalRow,
} from "../db/schema.js";
import { isDuplicateKeyError } from "../lib/errors.js";
import { writeAudit } from "./audit.service.js";
import { recordAdminEvent } from "./admin-events.service.js";
import { notifyPlayer } from "./notifications.service.js";
import { requireBookableVenue } from "./venues.service.js";
import {
  composeTeams,
  ensureTeams,
  teamName,
} from "./session-teams.service.js";

import { publicPlayerColumns, toPublicPlayer } from "./players.service.js";

/**
 * Cycle de vie des propositions (CDC §8).
 *
 *   proposition ──(quota atteint)──▶ réservation ──(tous payés)──▶ session
 *
 * Toutes les transitions verrouillent d'abord la ligne `proposals`
 * (SELECT ... FOR UPDATE) puis relisent l'état réel en base : deux joueurs
 * qui visent la dernière place en même temps sont sérialisés, un seul
 * réussit, l'autre reçoit un conflit (STATE-001).
 */

/** Clé de déduplication d'un créneau actif (CAL-005). */
function buildSlotKey(input: {
  venueId: string;
  localDate: string;
  slotStartHour: number;
  modeId: string;
}): string {
  return `${input.venueId}|${input.localDate}|${input.slotStartHour}|${input.modeId}`;
}

/**
 * Verrouille la proposition et renvoie son état courant.
 *
 * Le verrou est posé via le constructeur de requêtes (`.for("update")`) et
 * non par du SQL brut : les colonnes reviennent ainsi mappées sur les
 * propriétés du schéma, sans risque de lire `undefined` sur un nom de colonne
 * en snake_case.
 */
async function lockProposal(
  tx: Transaction,
  proposalId: number,
): Promise<ProposalRow> {
  const [row] = await tx
    .select()
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .for("update");

  if (!row) throw new AppError("NOT_FOUND", "Cette session est introuvable.");
  return row;
}

/**
 * Récompenses réellement attribuables pour cette session (§8.2).
 *
 * Un mode non classé n'alimente pas le classement : les primes de meilleur
 * buteur, passeur et défenseur ne s'y appliquent pas. On n'affiche donc que
 * ce que le joueur peut effectivement gagner — afficher le barème complet
 * sur un match amical serait trompeur.
 */
/**
 * Récompenses réellement versées par une session (§8.2).
 *
 * Un mode non classé n'en verse **aucune** : ni participation, ni meilleure
 * équipe, ni distinction. La liste est donc vide, et non pas amputée — en
 * annoncer qui ne seront jamais créditées serait mentir au joueur avant même
 * qu'il paie sa place.
 */
function rewardsFor(
  division: Division | null,
  modeId: string,
): ProposalDetail["rewards"] {
  const ranked = getGameMode(modeId)?.ranked ?? false;
  if (!ranked) return [];

  // Une session sans division retombe sur le barème de base.
  const applicable: Division = division ?? "D3";

  return (Object.keys(DEFAULT_REWARD_POLICY) as RewardKind[]).map((kind) => ({
    kind,
    label: REWARD_KIND_LABELS[kind],
    amountUno: DEFAULT_REWARD_POLICY[kind][applicable],
  }));
}

export function toSummary(
  row: ProposalRow,
  viewer?: { isParticipant: boolean; hasPaid: boolean },
): ProposalSummary {
  return {
    id: row.id,
    status: row.status,
    modeId: row.modeId as ProposalSummary["modeId"],
    venueId: row.venueId,
    venueName: row.venueName,
    startsAtUtc: row.startsAtUtc.toISOString(),
    localTimeLabel: row.localTimeLabel,
    localDate: row.localDate,
    timezone: row.timezone,
    division: row.division,
    priceEur: row.priceEur,
    priceUno: row.priceUno,
    minParticipants: row.minParticipants,
    participantCount: row.participantCount,
    paidCount: row.paidCount,
    paymentComplete: row.paymentComplete,
    paymentDeadline: row.paymentDeadline
      ? row.paymentDeadline.toISOString()
      : null,
    creatorPlayerId: row.creatorPlayerId,
    visibility: visibilityOf(row),
    custom: row.customDetails ?? null,
    ...(viewer ? { viewer } : {}),
  };
}

/** La visibilité d'une ligne : tout ce qui n'est pas « private » est public. */
function visibilityOf(row: { visibility: string }): ProposalVisibility {
  return row.visibility === "private" ? "private" : "public";
}

/**
 * Le jeton du lien d'invitation d'une séance privée (PRIV-002).
 *
 * Seize octets tirés au hasard, en base64url : assez pour qu'on ne le devine
 * pas, assez court pour tenir dans un lien partagé par message.
 */
function newInviteToken(): string {
  return randomBytes(16).toString("base64url");
}

/** Compare deux jetons sans que le temps de réponse trahisse le préfixe. */
function sameToken(
  given: string | undefined,
  expected: string | null,
): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Contrôle des règles de création (CAL-003, CAL-004).
 * Renvoie les valeurs dérivées côté serveur : le client ne fournit jamais
 * ni le prix, ni la division, ni le nombre de participants requis.
 */
function resolveNewProposal(
  input: CreateProposalInput,
  playerDivision: Division,
  venue: {
    id: string;
    name: string;
    timezone: string;
    reservedModeId?: string | null;
  },
  options: { skipLeadTime: boolean } = { skipLeadTime: false },
): {
  mode: GameMode;
  venue: { id: string; name: string; timezone: string };
  startsAtUtc: Date;
  localTimeLabel: string;
  division: Division | null;
  minParticipants: number;
} {
  const mode = requireSchedulableMode(input.modeId);

  /*
   * Un mode fermé n'existe pas (MODE-003).
   *
   * Le drapeau ne se contente pas de masquer un onglet : il refuse la
   * création côté serveur. Une fonctionnalité seulement cachée reste
   * appelable par qui regarde le réseau — et le contrôle est ici, dans la
   * résolution commune, plutôt que dans une route : l'administration compose
   * elle aussi des sessions, et elle passe par le même chemin.
   */
  if (mode.id === "bigfoot" && !env.FEATURE_BIGFOOT) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Ce mode de jeu n'est pas disponible.",
      { modeId: "Mode fermé" },
    );
  }

  const slot = findSlot(mode, input.slotStartHour);
  if (!slot) {
    throw new AppError("VALIDATION_ERROR", "Ce créneau n'est pas disponible.", {
      slotStartHour: "Créneau invalide pour ce mode",
    });
  }

  /*
   * Un lieu réservé n'accueille que son mode (MODE-003).
   *
   * Le contrôle est ici et non seulement dans la liste proposée à l'écran :
   * un client qui envoie l'identifiant d'un terrain à onze pour un futsal à
   * cinq ne doit pas y parvenir parce que le menu ne l'affichait pas.
   */
  if (venue.reservedModeId && venue.reservedModeId !== mode.id) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Ce terrain n'accueille pas ce mode de jeu.",
      { venueId: "Terrain réservé à un autre mode" },
    );
  }

  /*
   * L'effectif par équipe : choisi à la création pour les modes qui le
   * permettent, absent partout ailleurs. Le quota de la proposition en
   * découle — sept contre sept se complète à quatorze.
   */
  let minParticipants = mode.minParticipants;
  if (mode.teamSizeRange) {
    const { min, max } = mode.teamSizeRange;
    const chosen = input.playersPerTeam;
    if (chosen === undefined) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Choisissez le nombre de joueurs par équipe.",
        { playersPerTeam: "Valeur requise pour ce mode" },
      );
    }
    if (chosen < min || chosen > max) {
      throw new AppError(
        "VALIDATION_ERROR",
        gabarit(
          "L'effectif doit être compris entre {min} et {max} joueurs par équipe.",
          { min, max },
        ),
        { playersPerTeam: gabarit("Entre {min} et {max}", { min, max }) },
      );
    }
    minParticipants = chosen * mode.teamCount;
  } else if (input.playersPerTeam !== undefined) {
    // Refuser plutôt qu'ignorer : un effectif accepté en silence puis sans
    // effet est la pire des réponses.
    throw new AppError(
      "VALIDATION_ERROR",
      "Ce mode a un format fixe : l'effectif ne se choisit pas.",
      { playersPerTeam: "Sans objet pour ce mode" },
    );
  }

  /*
   * CAL-003 : la date doit être au moins à J+2 dans le fuseau du lieu.
   *
   * Le préavis protège les joueurs — il leur laisse le temps de voir passer
   * la proposition et de s'inscrire. Il ne protège pas l'administration, qui
   * ouvre parfois une séance pour aujourd'hui, voire pour hier : une partie
   * s'est jouée, elle doit entrer au classement. Le contournement est donc
   * réservé à `adminProcedure` et à lui seul (ADMIN-008).
   */
  const startsAtUtc = zonedTimeToUtc(
    input.date,
    slot.startHour,
    venue.timezone,
  );

  if (!options.skipLeadTime) {
    if (mode.minLeadHours !== undefined) {
      /*
       * Un délai en heures plutôt qu'en jours (MODE-003).
       *
       * Le préavis de deux jours sert à réunir quinze personnes qui paieront
       * leur place. Un terrain gratuit ne demande pas cette prudence : le
       * match du dimanche se décide le vendredi soir, et refuser la
       * proposition parce qu'il manque six heures ne protège personne.
       */
      const earliest = Date.now() + mode.minLeadHours * 3_600_000;
      if (startsAtUtc.getTime() < earliest) {
        throw new AppError(
          "RULE_VIOLATION",
          gabarit(
            "Une session de ce mode se crée au moins {heures} heures à l'avance.",
            { heures: mode.minLeadHours },
          ),
          { date: "Créneau trop proche" },
        );
      }
    } else {
      const today = todayIso(venue.timezone);
      const earliest = addDaysIso(today, MIN_PROPOSAL_LEAD_DAYS);
      if (diffDaysIso(earliest, input.date) < 0) {
        throw new AppError(
          "RULE_VIOLATION",
          gabarit(
            "Une session doit être créée au moins {jours} jours à l'avance.",
            { jours: MIN_PROPOSAL_LEAD_DAYS },
          ),
          {
            date: gabarit("Date la plus proche possible : {date}", {
              date: earliest,
            }),
          },
        );
      }
    }
  }

  return {
    mode,
    venue,
    startsAtUtc,
    localTimeLabel: slot.label,
    // CAL-002 : UNO League est cloisonné par division, l'amical ne l'est pas.
    division: mode.divisionLocked ? playerDivision : null,
    minParticipants,
  };
}

export interface CreateProposalResult {
  proposal: ProposalSummary;
  /**
   * true lorsqu'une proposition identique existait déjà et que le joueur y a
   * été inscrit au lieu d'en créer une seconde (CAL-005).
   */
  joinedExisting: boolean;
}

export async function createProposal(
  actor: { playerId: number; userId: number },
  input: CreateProposalInput,
  options: { skipLeadTime?: boolean } = {},
): Promise<CreateProposalResult> {
  const [player] = await db
    .select({ division: players.division })
    .from(players)
    .where(eq(players.id, actor.playerId))
    .limit(1);

  if (!player) throw new AppError("NOT_FOUND", "Joueur introuvable.");

  /*
   * Publique ou privée (PRIV-001). Le match personnalisé a son propre
   * chemin, `createCustomMatch` : ce qui le définit — une adresse, une heure
   * au quart d'heure — n'existe pas ici.
   */
  const visibility: ProposalVisibility = input.visibility ?? "public";
  if (input.modeId === "custom") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Un match personnalisé se crée avec son adresse et son heure.",
      { modeId: "Mode à créer depuis son propre formulaire" },
    );
  }
  if (!modeAllowsVisibility(input.modeId, visibility)) {
    throw new AppError(
      "RULE_VIOLATION",
      "La UNO League se joue en public : une séance privée est un match amical ou de football.",
      { visibility: "Mode réservé aux séances publiques" },
    );
  }

  // La salle est relue en base : elle est administrable, donc sa liste n'est
  // plus connue à la compilation, et une salle retirée doit être refusée.
  const venue = await requireBookableVenue(db, input.venueId);
  const resolved = resolveNewProposal(
    input,
    player.division,
    {
      id: venue.slug,
      name: venue.name,
      timezone: venue.timezone,
      reservedModeId: venue.reservedModeId,
    },
    { skipLeadTime: options.skipLeadTime ?? false },
  );
  /*
   * Une séance privée ne prend pas de clé de créneau (PRIV-001) : elle ne se
   * fond pas dans la proposition publique du même créneau, et deux groupes
   * d'amis peuvent réserver la même heure au même endroit.
   */
  const slotKey =
    visibility === "public"
      ? buildSlotKey({
          venueId: input.venueId,
          localDate: input.date,
          slotStartHour: input.slotStartHour,
          modeId: input.modeId,
        })
      : null;

  try {
    const created = await db.transaction(async (tx) => {
      const inserted = await tx.insert(proposals).values({
        startsAtUtc: resolved.startsAtUtc,
        localDate: input.date,
        slotStartHour: input.slotStartHour,
        localTimeLabel: resolved.localTimeLabel,
        timezone: resolved.venue.timezone,
        venueId: resolved.venue.id,
        venueName: resolved.venue.name,
        modeId: resolved.mode.id,
        division: resolved.division,
        minParticipants: resolved.minParticipants,
        priceEur: resolved.mode.priceEur,
        priceUno: eurToUno(resolved.mode.priceEur),
        rewardPolicyVersion: REWARD_POLICY_VERSION,
        status: "proposal",
        participantCount: 1,
        paidCount: 0,
        paymentComplete: false,
        creatorPlayerId: actor.playerId,
        activeSlotKey: slotKey,
        visibility,
        inviteToken: visibility === "private" ? newInviteToken() : null,
      });

      const proposalId = Number(inserted[0].insertId);

      /*
       * CAL-003 : le créateur est automatiquement participant.
       *
       * Et il prend le camp A quand le mode fait choisir aux joueurs — il
       * faut bien un premier côté, et le sien se change comme celui des
       * autres tant que la proposition est ouverte.
       */
      await tx.insert(proposalParticipants).values({
        proposalId,
        playerId: actor.playerId,
        ...(resolved.mode.playersChooseSide ? { side: "A" as const } : {}),
      });

      /*
       * Les trois équipes existent dès maintenant (MODE-005).
       *
       * Elles sont vides, et c'est bien ce qu'on veut montrer : trois
       * terrains où il reste de la place. Les créer à la clôture aurait
       * laissé le premier inscrit devant une liste de noms, sans rien à
       * choisir — et le choix n'a de valeur que tant qu'il reste des places.
       */
      if (resolved.mode.playersChooseTeam) {
        await ensureTeams(tx, proposalId, resolved.mode.teamCount);
      }

      await writeAudit(tx, {
        actorUserId: actor.userId,
        action: "proposal.create",
        entityType: "proposal",
        entityId: proposalId,
        after: {
          slotKey,
          modeId: resolved.mode.id,
          division: resolved.division,
          visibility,
        },
      });

      const [row] = await tx
        .select()
        .from(proposals)
        .where(eq(proposals.id, proposalId))
        .limit(1);
      return row as ProposalRow;
    });

    await recordAdminEvent(
      {
        type: "proposal.created",
        body:
          `${resolved.mode.name}${visibility === "private" ? " (privée)" : ""} ` +
          `le ${input.date} à ${resolved.venue.name} ` +
          `(${resolved.localTimeLabel})${resolved.division ? ` — ${resolved.division}` : ""}.`,
        entityType: "proposal",
        entityId: created.id,
        playerId: actor.playerId,
        key: `proposal:${created.id}:created`,
        // Après commit : la proposition et son créateur sont déjà écrits.
      },
      db,
    );

    return {
      proposal: toSummary(created, { isParticipant: true, hasPaid: false }),
      joinedExisting: false,
    };
  } catch (error) {
    // Seule la clé de créneau peut entrer en conflit ; une séance privée n'en
    // a pas, et toute autre erreur doit remonter telle quelle.
    if (!isDuplicateKeyError(error) || slotKey === null) throw error;

    // CAL-005 : la proposition existe déjà. On n'en crée pas de doublon ; on
    // inscrit le joueur à celle qui existe, ce qui est l'intention réelle.
    const [existing] = await db
      .select({ id: proposals.id })
      .from(proposals)
      .where(eq(proposals.activeSlotKey, slotKey))
      .limit(1);

    if (!existing) {
      throw new AppError(
        "CONFLICT",
        "Ce créneau vient d'être pris. Actualisez la liste.",
      );
    }

    const proposal = await joinProposal(actor, existing.id);
    return { proposal, joinedExisting: true };
  }
}

/**
 * Crée un match personnalisé (PRIV-003).
 *
 * Toujours privé, toujours gratuit dans l'application : le lieu est une
 * adresse libre, l'heure se choisit au quart d'heure, et le prix n'est qu'une
 * information affichée. Le reste du parcours est celui de toute séance —
 * invitations, plateau qui se complète, équipes, feuille de match —, à ceci
 * près que rien ne s'y paie et que rien n'y compte.
 *
 * Le fuseau est celui de la ligue : l'application ne connaît pas le lieu, et
 * une adresse n'en donne pas un de façon fiable.
 */
export async function createCustomMatch(
  actor: { playerId: number; userId: number },
  input: CreateCustomMatchInput,
): Promise<ProposalSummary> {
  const mode = requireSchedulableMode("custom");
  const [hour = 0, minute = 0] = input.startTime.split(":").map(Number);
  const timezone = DEFAULT_TIMEZONE;
  const startsAtUtc = zonedTimeToUtc(input.date, hour, timezone, minute);

  if (
    startsAtUtc.getTime() <
    Date.now() + CUSTOM_MATCH.minLeadMinutes * 60_000
  ) {
    throw new AppError(
      "RULE_VIOLATION",
      gabarit(
        "Un match personnalisé se crée au moins {minutes} minutes à l'avance.",
        { minutes: CUSTOM_MATCH.minLeadMinutes },
      ),
      { startTime: "Heure trop proche" },
    );
  }

  const range = mode.teamSizeRange!;
  if (input.playersPerTeam < range.min || input.playersPerTeam > range.max) {
    throw new AppError(
      "VALIDATION_ERROR",
      gabarit(
        "L'effectif doit être compris entre {min} et {max} joueurs par équipe.",
        { min: range.min, max: range.max },
      ),
      { playersPerTeam: gabarit("Entre {min} et {max}", range) },
    );
  }

  // L'heure de fin peut passer minuit : un match de 23 h 30 finit à 0 h 30,
  // et le libellé le dit tel quel.
  const end = hour * 60 + minute + input.durationMinutes;
  const localTimeLabel =
    `${hourLabel(hour, minute)} - ` +
    `${hourLabel(Math.floor(end / 60) % 24, end % 60)}`;

  const details: CustomMatchDetails = {
    venueAddress: input.venueAddress,
    durationMinutes: input.durationMinutes,
    priceTotalCents: input.priceTotalCents ?? null,
    pricePerPlayerCents: input.pricePerPlayerCents ?? null,
    paymentNote: input.paymentNote ? input.paymentNote : null,
  };

  const created = await db.transaction(async (tx) => {
    const inserted = await tx.insert(proposals).values({
      startsAtUtc,
      localDate: input.date,
      slotStartHour: hour,
      localTimeLabel,
      timezone,
      venueId: CUSTOM_VENUE_ID,
      venueName: input.venueName,
      modeId: mode.id,
      division: null,
      minParticipants: input.playersPerTeam * mode.teamCount,
      priceEur: 0,
      priceUno: 0,
      rewardPolicyVersion: REWARD_POLICY_VERSION,
      status: "proposal",
      participantCount: 1,
      paidCount: 0,
      paymentComplete: false,
      creatorPlayerId: actor.playerId,
      activeSlotKey: null,
      visibility: "private",
      inviteToken: newInviteToken(),
      customDetails: details,
    });

    const proposalId = Number(inserted[0].insertId);

    // L'organisateur joue, et prend le premier camp : il se change comme
    // celui des autres tant que la proposition est ouverte.
    await tx
      .insert(proposalParticipants)
      .values({ proposalId, playerId: actor.playerId, side: "A" });

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "proposal.create",
      entityType: "proposal",
      entityId: proposalId,
      after: { modeId: mode.id, visibility: "private" },
    });

    const [row] = await tx
      .select()
      .from(proposals)
      .where(eq(proposals.id, proposalId))
      .limit(1);
    return row as ProposalRow;
  });

  await recordAdminEvent(
    {
      type: "proposal.created",
      body:
        `${mode.name} (privé) le ${input.date} à ${input.venueName} ` +
        `(${localTimeLabel}).`,
      entityType: "proposal",
      entityId: created.id,
      playerId: actor.playerId,
      key: `proposal:${created.id}:created`,
    },
    db,
  );

  return toSummary(created, { isParticipant: true, hasPaid: false });
}

/**
 * L'invitation d'un joueur à une séance, ou `null` s'il n'en a pas.
 */
async function invitationOf(
  executor: Executor,
  proposalId: number,
  playerId: number,
): Promise<{ id: number; status: string } | null> {
  const [row] = await executor
    .select({ id: proposalInvitations.id, status: proposalInvitations.status })
    .from(proposalInvitations)
    .where(
      and(
        eq(proposalInvitations.proposalId, proposalId),
        eq(proposalInvitations.inviteePlayerId, playerId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Laisse entrer un joueur dans une séance privée, ou refuse (PRIV-002).
 *
 * Deux portes : l'invitation nominative de l'organisateur, ou le jeton du
 * lien qu'il a partagé. Dans les deux cas, l'inscription est consignée comme
 * une invitation acceptée — celui qui est venu par le lien devient un invité
 * comme les autres, et garde l'accès à la séance s'il la quitte ensuite.
 */
async function admitToPrivate(
  tx: Transaction,
  proposal: ProposalRow,
  playerId: number,
  inviteToken: string | undefined,
): Promise<void> {
  if (proposal.creatorPlayerId === playerId) return;

  const invitation = await invitationOf(tx, proposal.id, playerId);
  const now = new Date();

  if (invitation) {
    await tx
      .update(proposalInvitations)
      .set({ status: "accepted", respondedAt: now })
      .where(eq(proposalInvitations.id, invitation.id));
    return;
  }

  if (!sameToken(inviteToken, proposal.inviteToken)) {
    throw new AppError(
      "FORBIDDEN",
      "Cette séance est privée : on n'y entre que sur invitation de son organisateur.",
    );
  }

  await tx.insert(proposalInvitations).values({
    proposalId: proposal.id,
    inviterPlayerId: proposal.creatorPlayerId,
    inviteePlayerId: playerId,
    status: "accepted",
    respondedAt: now,
  });
}

/**
 * Inscription à une proposition (CAL-006, CAL-007).
 * Idempotente : réinscrire un joueur déjà inscrit ne crée pas de doublon et
 * ne renvoie pas d'erreur.
 */
/**
 * Le camp d'un nouvel inscrit (MODE-003).
 *
 * **Le plafond par côté est la règle qui fait tenir le mode.** Sans lui, onze
 * personnes choisissent la même équipe et personne ne joue : la proposition
 * atteint son quota avec vingt-deux joueurs d'un côté et zéro de l'autre. Le
 * côté demandé est donc refusé quand il est plein, et le message nomme celui
 * qui reste — un refus qui ne dit pas quoi faire est une impasse.
 *
 * **Sans camp demandé, le moins rempli l'emporte.** C'est le cas de
 * l'administration qui complète un plateau : elle inscrit des joueurs sans se
 * soucier des couleurs, et le résultat doit rester jouable.
 */
async function assignSide(
  tx: Transaction,
  proposal: ProposalRow,
  wanted: Side | undefined,
): Promise<Side> {
  const perSide = Math.floor(proposal.minParticipants / 2);

  const rows = await tx
    .select({ side: proposalParticipants.side })
    .from(proposalParticipants)
    .where(eq(proposalParticipants.proposalId, proposal.id));

  const compte: Record<Side, number> = { A: 0, B: 0 };
  for (const row of rows) {
    if (row.side === "A" || row.side === "B") compte[row.side] += 1;
  }

  if (!wanted) return compte.A <= compte.B ? "A" : "B";

  if (compte[wanted] >= perSide) {
    const autre = wanted === "A" ? "B" : "A";
    throw new AppError(
      "RULE_VIOLATION",
      gabarit(
        "L'équipe {camp} est complète ({taille} joueurs). Rejoignez l'équipe {autre}.",
        { camp: wanted, taille: perSide, autre },
      ),
    );
  }
  return wanted;
}

/**
 * Change de camp, tant que la proposition n'est pas jouée (MODE-003).
 *
 * Possible même une fois la séance confirmée : rien n'est engagé, et deux
 * joueurs qui veulent échanger de côté la veille du match n'ont aucune raison
 * d'en être empêchés. Seule une séance passée ou annulée refuse.
 */
export async function chooseSide(
  actor: { playerId: number },
  input: { proposalId: number; side: Side },
): Promise<ProposalSummary> {
  return db.transaction(async (tx) => {
    const proposal = await lockProposal(tx, input.proposalId);

    const mode = getGameMode(proposal.modeId);
    if (!mode?.playersChooseSide) {
      throw new AppError(
        "RULE_VIOLATION",
        "Les équipes de ce mode sont composées à la clôture.",
      );
    }

    if (proposal.status === "cancelled" || proposal.status === "completed") {
      throw new AppError(
        "RULE_VIOLATION",
        "Cette séance est terminée : les équipes n'y changent plus.",
      );
    }

    const [participant] = await tx
      .select({
        id: proposalParticipants.id,
        side: proposalParticipants.side,
        hasPaid: proposalParticipants.hasPaid,
      })
      .from(proposalParticipants)
      .where(
        and(
          eq(proposalParticipants.proposalId, input.proposalId),
          eq(proposalParticipants.playerId, actor.playerId),
        ),
      )
      .limit(1);

    if (!participant) throw new AppError("NOT_PARTICIPANT");

    if (participant.side !== input.side) {
      /*
       * Le plafond se vérifie sans compter le demandeur : il quitte son camp
       * en même temps qu'il rejoint l'autre. Le compter des deux côtés
       * refuserait le dernier échange possible d'un plateau complet.
       */
      const perSide = Math.floor(proposal.minParticipants / 2);
      const [occupant] = await tx
        .select({ total: count() })
        .from(proposalParticipants)
        .where(
          and(
            eq(proposalParticipants.proposalId, input.proposalId),
            eq(proposalParticipants.side, input.side),
          ),
        );

      if (Number(occupant?.total ?? 0) >= perSide) {
        throw new AppError(
          "RULE_VIOLATION",
          gabarit("L'équipe {camp} est complète ({taille} joueurs).", {
            camp: input.side,
            taille: perSide,
          }),
        );
      }

      /*
       * Changer de camp libère sa place sur le terrain (MODE-003) : une place
       * appartient à un camp, et la garder en passant en face aurait donné
       * deux gardiens d'un côté et aucun de l'autre. Le joueur se replace
       * dans sa nouvelle équipe.
       */
      await tx
        .update(proposalParticipants)
        .set({ side: input.side, pitchSlot: null })
        .where(eq(proposalParticipants.id, participant.id));
    }

    return toSummary(proposal, {
      isParticipant: true,
      hasPaid: participant.hasPaid,
    });
  });
}

/**
 * L'effectif d'une équipe de cette séance.
 *
 * Il se déduit du quota et du nombre d'équipes : une séance à seize inscrits
 * qui se joue en deux camps aligne huit par camp. Posé ici plutôt que
 * recalculé à trois endroits — c'est ce qui décide de la formation, et deux
 * versions du même calcul finiraient par se contredire.
 */
function teamSizeOf(proposal: {
  modeId: string;
  minParticipants: number;
}): number {
  const mode = getGameMode(proposal.modeId);
  return Math.max(
    1,
    Math.floor(proposal.minParticipants / Math.max(1, mode?.teamCount ?? 2)),
  );
}

/**
 * Déloge ceux dont la place n'existe plus dans la nouvelle forme (PITCH-001).
 *
 * Un 1-2-2 n'a pas de `MIL1` : le joueur qui l'occupait doit repartir sans
 * place, plutôt que d'en garder une que le terrain ne dessine plus. Il est
 * délogé, pas exclu — il se replace d'un geste.
 *
 * Le tri se fait ici et non en SQL : la liste des places valables est une
 * règle du domaine, qui vit dans `@uno/shared` et que le serveur relit comme
 * l'écran.
 */
function slotsToClear(
  places: readonly { id: number; pitchSlot: string | null }[],
  teamSize: number,
  formation: string,
): number[] {
  return places
    .filter(
      (row) =>
        row.pitchSlot !== null &&
        !isPitchSlot(teamSize, row.pitchSlot, formation),
    )
    .map((row) => row.id);
}

/** Le siège d'un joueur dans une équipe de cette séance, s'il en a un. */
async function readSeat(
  tx: Transaction,
  proposalId: number,
  playerId: number,
): Promise<{
  id: number;
  teamId: number;
  teamIndex: number;
  formation: string | null;
} | null> {
  const [seat] = await tx
    .select({
      id: teamMembers.id,
      teamId: teamMembers.teamId,
      teamIndex: teams.teamIndex,
      formation: teams.formation,
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(
      and(eq(teams.proposalId, proposalId), eq(teamMembers.playerId, playerId)),
    )
    .limit(1);

  return seat ?? null;
}

/** Ce que chaque équipe compte de joueurs, rang par rang. */
async function teamHeadcount(
  tx: Transaction,
  rows: readonly { id: number }[],
): Promise<Map<number, number>> {
  if (rows.length === 0) return new Map();

  const rangs = await tx
    .select({ teamId: teamMembers.teamId, total: count() })
    .from(teamMembers)
    .where(
      inArray(
        teamMembers.teamId,
        rows.map((team) => team.id),
      ),
    )
    .groupBy(teamMembers.teamId);

  return new Map(rangs.map((row) => [row.teamId, Number(row.total)]));
}

/**
 * Rejoindre une équipe de la séance, tant qu'il y reste de la place
 * (MODE-005).
 *
 * **Le plafond est toute la règle.** Sans lui, quinze joueurs choisissent la
 * même équipe et il n'y a plus de séance : le choix n'existe que parce que
 * les places sont comptées. Un refus nomme donc les équipes où il en reste —
 * un refus qui ne dit pas où aller est une impasse.
 *
 * **Changer d'équipe libère sa place sur le terrain.** Une place appartient à
 * une équipe, et la garder en passant à côté aurait donné deux gardiens ici
 * et aucun là. Le joueur se replace dans sa nouvelle équipe, d'un geste.
 *
 * Aucun garde-fou de statut au-delà de la séance jouée : après la clôture,
 * les équipes sont pleines, et le plafond suffit à empêcher le mouvement. Une
 * place qui se libère — un désistement — redevient ouverte, ce qui est
 * exactement ce qu'on veut.
 */
async function seatInTeam(
  tx: Transaction,
  actor: { playerId: number },
  proposal: ProposalRow,
  teamIndex: number,
): Promise<{
  id: number;
  teamId: number;
  teamIndex: number;
  formation: string | null;
}> {
  const mode = getGameMode(proposal.modeId);
  if (!mode?.playersChooseTeam) {
    throw new AppError(
      "RULE_VIOLATION",
      "Les équipes de ce mode ne se choisissent pas.",
    );
  }

  if (proposal.status === "cancelled" || proposal.status === "completed") {
    throw new AppError(
      "RULE_VIOLATION",
      "Cette séance est terminée : les équipes n'y changent plus.",
    );
  }

  const [participant] = await tx
    .select({ id: proposalParticipants.id })
    .from(proposalParticipants)
    .where(
      and(
        eq(proposalParticipants.proposalId, proposal.id),
        eq(proposalParticipants.playerId, actor.playerId),
      ),
    )
    .limit(1);

  if (!participant) throw new AppError("NOT_PARTICIPANT");

  const rows = await ensureTeams(tx, proposal.id, mode.teamCount);
  const cible = rows.find((team) => team.teamIndex === teamIndex);

  if (!cible) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Cette équipe n'existe pas dans cette séance.",
      { teamIndex: "Équipe inconnue" },
    );
  }

  const seat = await readSeat(tx, proposal.id, actor.playerId);
  if (seat && seat.teamId === cible.id) return seat;

  const teamSize = teamSizeOf(proposal);
  const effectifs = await teamHeadcount(tx, rows);

  if ((effectifs.get(cible.id) ?? 0) >= teamSize) {
    const libres = rows
      .filter(
        (team) =>
          team.id !== cible.id && (effectifs.get(team.id) ?? 0) < teamSize,
      )
      .map((team) => teamName(team.teamIndex));

    throw new AppError(
      "RULE_VIOLATION",
      libres.length === 0
        ? gabarit("{equipe} est complète ({taille} joueurs).", {
            equipe: { libelle: "team", cle: String(teamIndex) },
            taille: teamSize,
          })
        : libres.length === 1
          ? gabarit(
              "{equipe} est complète ({taille} joueurs). Il reste de la place en {libre}.",
              {
                equipe: { libelle: "team", cle: String(teamIndex) },
                taille: teamSize,
                libre: { libelle: "team", cle: String(libres[0]) },
              },
            )
          : gabarit(
              "{equipe} est complète ({taille} joueurs). Il reste de la place en {libre} et en {autre}.",
              {
                equipe: { libelle: "team", cle: String(teamIndex) },
                taille: teamSize,
                libre: { libelle: "team", cle: String(libres[0]) },
                autre: { libelle: "team", cle: String(libres[1]) },
              },
            ),
    );
  }

  if (seat) {
    await tx
      .update(teamMembers)
      .set({ teamId: cible.id, pitchSlot: null, chosen: true })
      .where(eq(teamMembers.id, seat.id));

    return { ...cible, id: seat.id, teamId: cible.id };
  }

  const inserted = await tx
    .insert(teamMembers)
    .values({ teamId: cible.id, playerId: actor.playerId, chosen: true });

  return { ...cible, id: Number(inserted[0].insertId), teamId: cible.id };
}

/**
 * Choisir son équipe, en UNO League (MODE-005).
 *
 * On peut vouloir jouer avec quelqu'un sans rien dire de son poste : c'est le
 * geste que cette route couvre, et il suffit à lui seul. Le terrain vient
 * après, s'il vient.
 */
export async function chooseTeam(
  actor: { playerId: number },
  input: { proposalId: number; teamIndex: number },
): Promise<ProposalSummary> {
  return db.transaction(async (tx) => {
    const proposal = await lockProposal(tx, input.proposalId);
    await seatInTeam(tx, actor, proposal, input.teamIndex);

    const [participant] = await tx
      .select({ hasPaid: proposalParticipants.hasPaid })
      .from(proposalParticipants)
      .where(
        and(
          eq(proposalParticipants.proposalId, proposal.id),
          eq(proposalParticipants.playerId, actor.playerId),
        ),
      )
      .limit(1);

    return toSummary(proposal, {
      isParticipant: true,
      hasPaid: participant?.hasPaid ?? false,
    });
  });
}

/**
 * Se placer dans son équipe, là où les équipes sont tirées (MODE-004).
 *
 * **Ce que cela change à la UNO League.** On n'y choisit ni ses coéquipiers
 * ni son camp : les trois équipes sortent d'un tirage par chapeaux, et c'est
 * ce qui donne sa valeur au classement. Mais rien n'obligeait à imposer le
 * poste aussi. Une fois l'équipe connue — dès la réservation —, chacun dit ce
 * qu'il vient y jouer, et les vingt-quatre heures du paiement servent aussi à
 * ça.
 *
 * Le placement n'engage rien : aucun classement, aucune carte, aucune
 * statistique. Il se change jusqu'au coup d'envoi.
 *
 * Un joueur sur le banc — inscrit, mais qu'aucune équipe ne porte — n'a pas
 * de terrain où se placer. C'est le sens du banc, et le message le dit
 * plutôt que de laisser chercher.
 */
async function chooseSlotInTeam(
  tx: Transaction,
  actor: { playerId: number },
  proposal: ProposalRow,
  slot: string | null,
  teamIndex?: number,
): Promise<ProposalSummary> {
  let seat = await readSeat(tx, proposal.id, actor.playerId);

  /*
   * Toucher une place dans une autre équipe, c'est la rejoindre (MODE-005).
   *
   * Le geste est le même à l'écran — on pose son doigt sur un terrain —, et
   * le faire en deux temps aurait laissé exister un instant où le joueur a
   * changé d'équipe sans avoir sa place : s'il est refusé à la seconde
   * étape, il a perdu la première.
   */
  if (teamIndex !== undefined && seat?.teamIndex !== teamIndex) {
    seat = await seatInTeam(tx, actor, proposal, teamIndex);
  }

  if (!seat) {
    const [participant] = await tx
      .select({ hasPaid: proposalParticipants.hasPaid })
      .from(proposalParticipants)
      .where(
        and(
          eq(proposalParticipants.proposalId, proposal.id),
          eq(proposalParticipants.playerId, actor.playerId),
        ),
      )
      .limit(1);

    if (!participant) throw new AppError("NOT_PARTICIPANT");

    /*
     * Trois absences très différentes, et il faut les distinguer : le terrain
     * n'existe pas encore, il existe et vous attend, ou il existe sans vous.
     * La première s'attend, la deuxième se répare d'un geste, la troisième en
     * réglant sa place — et les confondre enverrait payer quelqu'un qui n'a
     * qu'à choisir.
     */
    const rows = await tx
      .select({ id: teams.id, teamIndex: teams.teamIndex })
      .from(teams)
      .where(eq(teams.proposalId, proposal.id));

    if (rows.length === 0) {
      throw new AppError(
        "RULE_VIOLATION",
        "Les équipes ne sont pas encore formées.",
      );
    }

    const mode = getGameMode(proposal.modeId);
    const effectifs = mode?.playersChooseTeam
      ? await teamHeadcount(tx, rows)
      : new Map<number, number>();
    const place = rows.some(
      (team) => (effectifs.get(team.id) ?? 0) < teamSizeOf(proposal),
    );

    throw new AppError(
      "RULE_VIOLATION",
      mode?.playersChooseTeam && place
        ? "Choisissez d'abord votre équipe : une place appartient à une équipe."
        : "Vous êtes sur le banc : réglez votre place pour entrer sur le terrain.",
    );
  }

  if (slot !== null) {
    const teamSize = teamSizeOf(proposal);

    if (!isPitchSlot(teamSize, slot, seat.formation)) {
      throw new AppError(
        "VALIDATION_ERROR",
        gabarit("Cette place n'existe pas dans une formation à {taille}.", {
          taille: teamSize,
        }),
        { slot: "Place inconnue pour cet effectif" },
      );
    }

    /*
     * La place doit être libre **dans cette équipe**. L'index unique tient la
     * règle pour de bon ; le dire ici donne un message qui nomme la place
     * plutôt qu'une violation de contrainte.
     */
    const [occupant] = await tx
      .select({ playerId: teamMembers.playerId })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, seat.teamId),
          eq(teamMembers.pitchSlot, slot),
        ),
      )
      .limit(1);

    if (occupant && occupant.playerId !== actor.playerId) {
      throw new AppError(
        "CONFLICT",
        "Cette place est déjà prise : choisissez-en une autre.",
      );
    }
  }

  try {
    await tx
      .update(teamMembers)
      .set({ pitchSlot: slot })
      .where(eq(teamMembers.id, seat.id));
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AppError(
        "CONFLICT",
        "Cette place vient d'être prise : choisissez-en une autre.",
      );
    }
    throw error;
  }

  const [participant] = await tx
    .select({ hasPaid: proposalParticipants.hasPaid })
    .from(proposalParticipants)
    .where(
      and(
        eq(proposalParticipants.proposalId, proposal.id),
        eq(proposalParticipants.playerId, actor.playerId),
      ),
    )
    .limit(1);

  return toSummary(proposal, {
    isParticipant: true,
    hasPaid: participant?.hasPaid ?? false,
  });
}

/**
 * Se placer sur le terrain d'une séance de Football (MODE-003).
 *
 * **Ce que cela ajoute au camp.** Choisir son équipe disait avec qui l'on
 * joue, pas ce qu'on y fait. Dix personnes qui arrivent sans savoir qui garde
 * les buts perdent un quart d'heure à se le demander, et le plus souvent
 * quelqu'un s'y colle à contrecœur. La question se tranche maintenant avant
 * le coup d'envoi, par ceux que ça concerne.
 *
 * **Le placement n'engage rien.** Il ne compte dans aucun classement, ne
 * touche à aucune carte et ne change pas une inscription : c'est une
 * intention d'organisation, qui se change jusqu'au coup d'envoi.
 *
 * `slot` à `null` libère sa place sans quitter la séance. On peut jouer sans
 * s'être placé — un retardataire prend ce qui reste —, et se déplacer suppose
 * de pouvoir d'abord se retirer.
 *
 * La formation dépend de l'effectif choisi à la création : sept contre sept
 * n'offre pas les mêmes places qu'onze contre onze. C'est le paquet partagé
 * qui la porte, pour que l'écran propose exactement ce que le serveur
 * accepte.
 */
/**
 * Changer la forme du terrain de son équipe (PITCH-001).
 *
 * **Le joueur ne dit pas quelle équipe : le serveur la trouve.** Il ne peut
 * changer que la sienne, et c'est exactement ce que l'absence de paramètre
 * garantit — il n'y a pas d'identifiant d'équipe à falsifier. Là où le camp
 * se choisit, c'est son camp ; là où les équipes sont tirées, c'est celle qui
 * le porte.
 *
 * **Changer de forme déloge ceux qui n'ont plus de place.** Un 1-2-2 n'a pas
 * de `MIL1` : le joueur qui l'occupait repart sans place plutôt que d'en
 * garder une que le terrain ne dessine plus. Cela se fait dans la même
 * transaction que le changement, sans quoi un instant existerait où la base
 * porte une place qui n'existe pas.
 *
 * C'est une décision qui engage toute l'équipe, prise par n'importe lequel de
 * ses joueurs. Le pari est que cinq personnes qui viennent jouer ensemble
 * s'arrangent mieux entre elles qu'avec un rôle de plus à distribuer — et
 * rien n'est perdu : la forme se rechange jusqu'au coup d'envoi.
 */
export async function setFormation(
  actor: { playerId: number },
  input: { proposalId: number; formation: string },
): Promise<ProposalSummary> {
  return db.transaction(async (tx) => {
    const proposal = await lockProposal(tx, input.proposalId);

    if (proposal.status === "cancelled" || proposal.status === "completed") {
      throw new AppError(
        "RULE_VIOLATION",
        "Cette séance est terminée : le terrain n'y change plus.",
      );
    }

    const teamSize = teamSizeOf(proposal);
    if (!isFormation(teamSize, input.formation)) {
      throw new AppError(
        "VALIDATION_ERROR",
        gabarit("Cette formation n'existe pas à {taille} joueurs.", {
          taille: teamSize,
        }),
        { formation: "Formation inconnue pour cet effectif" },
      );
    }

    const mode = getGameMode(proposal.modeId);

    if (mode?.playersChooseSide) {
      const [participant] = await tx
        .select({
          id: proposalParticipants.id,
          side: proposalParticipants.side,
        })
        .from(proposalParticipants)
        .where(
          and(
            eq(proposalParticipants.proposalId, proposal.id),
            eq(proposalParticipants.playerId, actor.playerId),
          ),
        )
        .limit(1);

      if (!participant) throw new AppError("NOT_PARTICIPANT");
      if (!participant.side) {
        throw new AppError(
          "RULE_VIOLATION",
          "Choisissez d'abord votre équipe : une formation appartient à un camp.",
        );
      }

      const camp = participant.side;
      await tx
        .update(proposals)
        .set(
          camp === "A"
            ? { formationA: input.formation }
            : { formationB: input.formation },
        )
        .where(eq(proposals.id, proposal.id));

      const places = await tx
        .select({
          id: proposalParticipants.id,
          pitchSlot: proposalParticipants.pitchSlot,
        })
        .from(proposalParticipants)
        .where(
          and(
            eq(proposalParticipants.proposalId, proposal.id),
            eq(proposalParticipants.side, camp),
          ),
        );

      const deloges = slotsToClear(places, teamSize, input.formation);
      if (deloges.length > 0) {
        await tx
          .update(proposalParticipants)
          .set({ pitchSlot: null })
          .where(inArray(proposalParticipants.id, deloges));
      }
    } else {
      const [seat] = await tx
        .select({ teamId: teamMembers.teamId })
        .from(teamMembers)
        .innerJoin(teams, eq(teams.id, teamMembers.teamId))
        .where(
          and(
            eq(teams.proposalId, proposal.id),
            eq(teamMembers.playerId, actor.playerId),
          ),
        )
        .limit(1);

      if (!seat) {
        throw new AppError(
          "RULE_VIOLATION",
          mode?.playersChooseTeam
            ? "Choisissez d'abord votre équipe : une formation appartient à une équipe."
            : "Vous n'êtes dans aucune équipe de cette séance.",
        );
      }

      await tx
        .update(teams)
        .set({ formation: input.formation })
        .where(eq(teams.id, seat.teamId));

      const places = await tx
        .select({ id: teamMembers.id, pitchSlot: teamMembers.pitchSlot })
        .from(teamMembers)
        .where(eq(teamMembers.teamId, seat.teamId));

      const deloges = slotsToClear(places, teamSize, input.formation);
      if (deloges.length > 0) {
        await tx
          .update(teamMembers)
          .set({ pitchSlot: null })
          .where(inArray(teamMembers.id, deloges));
      }
    }

    const [row] = await tx
      .select()
      .from(proposals)
      .where(eq(proposals.id, proposal.id))
      .limit(1);

    return toSummary(row!);
  });
}

export async function choosePitchSlot(
  actor: { playerId: number },
  input: { proposalId: number; slot: string | null; teamIndex?: number },
): Promise<ProposalSummary> {
  return db.transaction(async (tx) => {
    const proposal = await lockProposal(tx, input.proposalId);

    const mode = getGameMode(proposal.modeId);

    if (proposal.status === "cancelled" || proposal.status === "completed") {
      throw new AppError(
        "RULE_VIOLATION",
        "Cette séance est terminée : le terrain n'y change plus.",
      );
    }

    /*
     * Deux terrains, une seule question posée au joueur (MODE-004).
     *
     * Là où **le camp se choisit**, la place appartient au camp : elle vit
     * sur l'inscription, à côté de lui. Là où les **équipes sont tirées** —
     * la UNO League —, elle appartient à l'équipe, et vit donc sur
     * l'appartenance. Le joueur, lui, fait le même geste dans les deux cas :
     * il touche une place.
     */
    if (!mode?.playersChooseSide) {
      return chooseSlotInTeam(tx, actor, proposal, input.slot, input.teamIndex);
    }

    const [participant] = await tx
      .select({
        id: proposalParticipants.id,
        side: proposalParticipants.side,
        hasPaid: proposalParticipants.hasPaid,
      })
      .from(proposalParticipants)
      .where(
        and(
          eq(proposalParticipants.proposalId, input.proposalId),
          eq(proposalParticipants.playerId, actor.playerId),
        ),
      )
      .limit(1);

    if (!participant) throw new AppError("NOT_PARTICIPANT");

    if (input.slot !== null) {
      if (!participant.side) {
        throw new AppError(
          "RULE_VIOLATION",
          "Choisissez d'abord votre équipe : une place appartient à un camp.",
        );
      }

      const perSide = teamSizeOf(proposal);
      const forme =
        participant.side === "A" ? proposal.formationA : proposal.formationB;
      if (!isPitchSlot(perSide, input.slot, forme)) {
        throw new AppError(
          "VALIDATION_ERROR",
          gabarit("Cette place n'existe pas dans une formation à {taille}.", {
            taille: perSide,
          }),
          { slot: "Place inconnue pour cet effectif" },
        );
      }

      /*
       * La place doit être libre **dans ce camp**. L'index unique tient la
       * règle pour de bon — deux joueurs qui se placent en même temps ne
       * peuvent pas passer tous les deux —, mais le dire ici donne un message
       * qui nomme la place plutôt qu'une violation de contrainte.
       */
      const [occupant] = await tx
        .select({ playerId: proposalParticipants.playerId })
        .from(proposalParticipants)
        .where(
          and(
            eq(proposalParticipants.proposalId, input.proposalId),
            eq(proposalParticipants.side, participant.side),
            eq(proposalParticipants.pitchSlot, input.slot),
          ),
        )
        .limit(1);

      if (occupant && occupant.playerId !== actor.playerId) {
        throw new AppError(
          "CONFLICT",
          "Cette place est déjà prise : choisissez-en une autre.",
        );
      }
    }

    try {
      await tx
        .update(proposalParticipants)
        .set({ pitchSlot: input.slot })
        .where(eq(proposalParticipants.id, participant.id));
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AppError(
          "CONFLICT",
          "Cette place vient d'être prise : choisissez-en une autre.",
        );
      }
      throw error;
    }

    return toSummary(proposal, {
      isParticipant: true,
      hasPaid: participant.hasPaid,
    });
  });
}

export async function joinProposal(
  actor: { playerId: number; userId: number },
  proposalId: number,
  side?: Side,
  teamIndex?: number,
  inviteToken?: string,
): Promise<ProposalSummary> {
  return db.transaction(async (tx) => {
    const proposal = await lockProposal(tx, proposalId);

    const [existing] = await tx
      .select({
        id: proposalParticipants.id,
        hasPaid: proposalParticipants.hasPaid,
      })
      .from(proposalParticipants)
      .where(
        and(
          eq(proposalParticipants.proposalId, proposalId),
          eq(proposalParticipants.playerId, actor.playerId),
        ),
      )
      .limit(1);

    if (existing) {
      // CAL-006 : opération idempotente, aucun doublon de participant.
      return toSummary(proposal, {
        isParticipant: true,
        hasPaid: existing.hasPaid,
      });
    }

    if (proposal.status !== "proposal") {
      throw new AppError("PROPOSAL_CLOSED");
    }
    if (proposal.participantCount >= proposal.minParticipants) {
      throw new AppError("PROPOSAL_FULL");
    }

    const [player] = await tx
      .select({ division: players.division, accountType: players.accountType })
      .from(players)
      .where(eq(players.id, actor.playerId))
      .limit(1);
    if (!player) throw new AppError("NOT_FOUND", "Joueur introuvable.");

    // ROLE-003 : le rôle d'arbitre est exclusif. Sans ce contrôle serveur, un
    // arbitre pourrait prendre une place de joueur en appelant l'API
    // directement — le bouton masqué dans l'interface ne protège rien.
    if (player.accountType === "referee") {
      throw new AppError(
        "RULE_VIOLATION",
        "Un compte arbitre ne participe pas comme joueur. Proposez-vous comme arbitre.",
      );
    }

    // CAL-002 : UNO League est réservé aux joueurs de la division concernée.
    if (proposal.division !== null && player.division !== proposal.division) {
      throw new AppError(
        "RULE_VIOLATION",
        gabarit("Cette session est réservée à la division {division}.", {
          division: proposal.division ?? "",
        }),
      );
    }

    // PRIV-002 : une séance privée ne s'ouvre qu'à ses invités — nommés par
    // l'organisateur, ou porteurs du lien qu'il a partagé.
    if (visibilityOf(proposal) === "private") {
      await admitToPrivate(tx, proposal, actor.playerId, inviteToken);
    }

    const mode = getGameMode(proposal.modeId);
    const chosenSide = mode?.playersChooseSide
      ? await assignSide(tx, proposal, side)
      : null;

    await tx.insert(proposalParticipants).values({
      proposalId,
      playerId: actor.playerId,
      ...(chosenSide ? { side: chosenSide } : {}),
    });

    /*
     * On ne rejoint pas une séance de UNO League, on rejoint une équipe
     * (MODE-005) — quand on en désigne une.
     *
     * Avant le comptage qui suit, et c'est essentiel : le quinzième inscrit
     * ferme la proposition et déclenche le tirage dans la même transaction.
     * S'asseoir après aurait laissé le tirage le traiter en indécis, et donc
     * lui refuser l'équipe qu'il vient de choisir.
     */
    if (teamIndex !== undefined) {
      await seatInTeam(tx, actor, proposal, teamIndex);
    }

    const participantCount = proposal.participantCount + 1;
    // CAL-007 : le quota atteint ferme les inscriptions et fait basculer en
    // réservation, sans intervention extérieure.
    const reachedQuota = participantCount >= proposal.minParticipants;

    /*
     * Un mode gratuit n'a pas de réservation à former (MODE-003).
     *
     * La réservation n'existe que pour ouvrir les vingt-quatre heures de
     * paiement : c'est un état d'attente d'argent. Là où il n'y a rien à
     * régler, elle serait une case à cocher sans contenu — la séance est
     * confirmée dès que le plateau est complet, et le joueur n'a plus qu'à
     * venir.
     *
     * C'est le prix **de la proposition** qui tranche, fixé à sa création, et
     * non le tarif actuel du mode : une séance ouverte gratuite le reste
     * jusqu'au bout, même si son mode devient payant entre-temps.
     */
    const gratuit = proposal.priceUno === 0;
    const nextStatus = reachedQuota
      ? gratuit
        ? ("session" as const)
        : ("reservation" as const)
      : ("proposal" as const);

    // CAL-008 : l'horloge des 24 heures démarre au moment exact où la
    // réservation se forme. La calculer à l'affichage aurait donné une
    // échéance qui glisse à chaque rafraîchissement.
    const paymentDeadline =
      reachedQuota && !gratuit
        ? new Date(Date.now() + PAYMENT_DEADLINE_HOURS * 3_600_000)
        : proposal.paymentDeadline;

    await tx
      .update(proposals)
      .set({
        participantCount,
        status: nextStatus,
        paymentDeadline,
        updatedAt: new Date(),
      })
      .where(eq(proposals.id, proposalId));

    if (reachedQuota) {
      /*
       * Les équipes se forment ici, au moment exact où le plateau est complet
       * (MODE-004).
       *
       * C'est ce qui ouvre le choix des postes : chacun a les vingt-quatre
       * heures du paiement pour dire ce qu'il vient jouer. Attendre le
       * dernier règlement aurait réduit cette fenêtre à ce qu'il en reste —
       * parfois rien.
       *
       * Le tirage ne se refait jamais ensuite : on s'organise autour de ses
       * coéquipiers, et les voir changer du jour au lendemain aurait vidé
       * l'annonce de son sens. Un remplaçant qui paie prend la place d'un
       * impayé (`seatOnPitch`), sans toucher aux autres.
       */
      await composeTeams(
        tx,
        { userId: actor.userId },
        {
          id: proposalId,
          modeId: proposal.modeId,
          status: nextStatus,
          minParticipants: proposal.minParticipants,
        },
      );

      await writeAudit(tx, {
        actorUserId: actor.userId,
        action: "proposal.status.update",
        entityType: "proposal",
        entityId: proposalId,
        before: { status: "proposal" },
        after: { status: nextStatus, participantCount },
      });

      await recordAdminEvent(
        {
          type: gratuit ? "proposal.session" : "proposal.reservation",
          body: gratuit
            ? `${proposal.venueName}, ${proposal.localDate} ${proposal.localTimeLabel} : ` +
              `${participantCount} inscrits, séance confirmée — rien à régler.`
            : `${proposal.venueName}, ${proposal.localDate} ${proposal.localTimeLabel} : ` +
              `${participantCount} inscrits, paiements attendus avant le ` +
              `${paymentDeadline?.toLocaleString("fr-BE", { timeZone: proposal.timezone }) ?? "—"}.`,
          entityType: "proposal",
          entityId: proposalId,
          key: `proposal:${proposalId}:${gratuit ? "session" : "reservation"}`,
        },
        tx,
      );

      /*
       * Chaque inscrit est prévenu que la séance est confirmée et que sa
       * place est à régler (ANN-004, MAIL-001).
       *
       * C'est le message le plus utile de toute l'application : il ouvre les
       * vingt-quatre heures au terme desquelles une place non payée revient
       * aux remplaçants. Jusqu'ici, seul le *retard* était annoncé — on
       * prévenait le joueur qu'il avait manqué une échéance dont il n'avait
       * jamais été informé.
       *
       * La clé porte l'identifiant de la proposition et non celui du joueur :
       * `notifyPlayer` la combine déjà avec le destinataire, et une
       * proposition qui repasserait par cet état ne renotifierait personne
       * deux fois.
       */
      const inscrits = await tx
        .select({ playerId: proposalParticipants.playerId })
        .from(proposalParticipants)
        .where(eq(proposalParticipants.proposalId, proposalId));

      // Le match personnalisé se règle entre joueurs (PRIV-003) : « rien à
      // régler » y serait faux, l'organisateur a peut-être annoncé un prix.
      const horsApp = proposal.modeId === "custom";

      for (const inscrit of inscrits) {
        await notifyPlayer(
          {
            playerId: inscrit.playerId,
            eventKey: `proposal:${proposalId}:confirmed`,
            title: gratuit
              ? gabarit("Séance confirmée")
              : gabarit("Séance confirmée — place à régler"),
            body: [
              gabarit(
                "{salle}, le {jour} à {heure} : le plateau est complet.",
                {
                  salle: proposal.venueName,
                  jour: { jour: proposal.localDate },
                  heure: proposal.localTimeLabel,
                },
              ),
              horsApp
                ? gabarit(
                    "Le paiement et la réservation se règlent entre vous, hors de l'application.",
                  )
                : gratuit
                  ? gabarit("Rien à régler, rendez-vous sur le terrain.")
                  : paymentDeadline
                    ? gabarit(
                        "Réglez votre place avant le {echeance}, faute de quoi elle reviendra à un remplaçant.",
                        {
                          echeance: {
                            instant: paymentDeadline.toISOString(),
                            fuseau: proposal.timezone,
                          },
                        },
                      )
                    : gabarit("Votre place est à régler."),
            ],
            url: `/sessions/${proposalId}`,
          },
          tx,
        );
      }
    }

    return toSummary(
      { ...proposal, participantCount, status: nextStatus },
      { isParticipant: true, hasPaid: false },
    );
  });
}

/**
 * Déplace une séance dans le temps (MODE-003).
 *
 * **Réservé aux modes gratuits, et c'est une limite assumée.** Déplacer une
 * séance payée soulève trois questions auxquelles cette fonction ne répond
 * pas : que devient l'échéance de paiement qui court, que fait-on de ceux qui
 * ont réglé et ne peuvent plus venir, et comment prévient-on assez tôt. Là
 * où rien n'est engagé, aucune de ces questions ne se pose — il reste à
 * recalculer un créneau et à vérifier qu'il est libre.
 *
 * Le jour où il faudra déplacer une session de League, ce sera une autre
 * fonction, avec ses propres règles de remboursement. Étendre celle-ci par
 * commodité serait le meilleur moyen de perdre de l'argent en silence.
 *
 * La clé de créneau porte l'unicité : deux séances ne peuvent pas occuper le
 * même terrain à la même heure, et c'est la base qui le refuse, pas une
 * vérification préalable qui se ferait doubler par une requête concurrente.
 */
export async function rescheduleProposal(
  actor: { userId: number },
  input: { proposalId: number; date: string; slotStartHour: number },
): Promise<ProposalSummary> {
  return db.transaction(async (tx) => {
    const proposal = await lockProposal(tx, input.proposalId);

    const mode = getGameMode(proposal.modeId);
    if (!mode || proposal.priceUno > 0) {
      throw new AppError(
        "RULE_VIOLATION",
        "Seules les séances sans participation se déplacent depuis l'application.",
      );
    }

    if (proposal.status === "cancelled" || proposal.status === "completed") {
      throw new AppError(
        "RULE_VIOLATION",
        "Cette séance est terminée : elle ne se déplace plus.",
      );
    }

    const slot = findSlot(mode, input.slotStartHour);
    if (!slot) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Ce créneau n'est pas disponible.",
        {
          slotStartHour: "Créneau invalide pour ce mode",
        },
      );
    }

    const startsAtUtc = zonedTimeToUtc(
      input.date,
      slot.startHour,
      proposal.timezone,
    );

    const slotKey = buildSlotKey({
      venueId: proposal.venueId,
      localDate: input.date,
      slotStartHour: input.slotStartHour,
      modeId: proposal.modeId,
    });

    const avant = {
      localDate: proposal.localDate,
      localTimeLabel: proposal.localTimeLabel,
    };

    try {
      await tx
        .update(proposals)
        .set({
          localDate: input.date,
          slotStartHour: input.slotStartHour,
          localTimeLabel: slot.label,
          startsAtUtc,
          activeSlotKey: slotKey,
          updatedAt: new Date(),
        })
        .where(eq(proposals.id, input.proposalId));
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AppError(
          "CONFLICT",
          "Une autre séance occupe déjà ce terrain à cette heure.",
        );
      }
      throw error;
    }

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "proposal.reschedule",
      entityType: "proposal",
      entityId: input.proposalId,
      before: avant,
      after: { localDate: input.date, localTimeLabel: slot.label },
    });

    /*
     * Prévenir est le point de l'opération, pas un supplément : quelqu'un a
     * posé sa soirée sur l'ancienne heure. La clé porte la nouvelle date, de
     * sorte que deux déplacements successifs donnent bien deux messages.
     */
    const inscrits = await tx
      .select({ playerId: proposalParticipants.playerId })
      .from(proposalParticipants)
      .where(eq(proposalParticipants.proposalId, input.proposalId));

    for (const inscrit of inscrits) {
      await notifyPlayer(
        {
          playerId: inscrit.playerId,
          eventKey: `proposal:${input.proposalId}:moved:${input.date}:${input.slotStartHour}`,
          title: gabarit("Séance déplacée"),
          body: gabarit(
            "{salle} : la séance du {avant} à {heureAvant} est déplacée au {apres} à {heureApres}.",
            {
              salle: proposal.venueName,
              avant: { jour: avant.localDate },
              heureAvant: avant.localTimeLabel,
              apres: { jour: input.date },
              heureApres: slot.label,
            },
          ),
          url: `/sessions/${input.proposalId}`,
        },
        tx,
      );
    }

    return toSummary(
      {
        ...proposal,
        localDate: input.date,
        slotStartHour: input.slotStartHour,
        localTimeLabel: slot.label,
        startsAtUtc,
        activeSlotKey: slotKey,
      },
      { isParticipant: false, hasPaid: false },
    );
  });
}

/**
 * Désinscription (CAL-008).
 *
 * Autorisée tant que la session est au statut proposition. Une fois le quota
 * atteint, la sortie exige une intervention administrative — remboursement,
 * réattribution de la place.
 *
 * **Sauf dans un mode gratuit** (MODE-003). Rien n'y est engagé : il n'y a ni
 * place à rembourser ni remplaçant à prévenir, et retenir quelqu'un sur un
 * match amical sur gazon n'a aucun sens. La séance repasse alors en
 * proposition, avec la place libérée — ce qu'elle redevient effectivement,
 * puisqu'elle n'est plus complète.
 */
export async function leaveProposal(
  actor: { playerId: number; userId: number },
  proposalId: number,
): Promise<ProposalSummary> {
  return db.transaction(async (tx) => {
    const proposal = await lockProposal(tx, proposalId);

    const [participant] = await tx
      .select({
        id: proposalParticipants.id,
        hasPaid: proposalParticipants.hasPaid,
      })
      .from(proposalParticipants)
      .where(
        and(
          eq(proposalParticipants.proposalId, proposalId),
          eq(proposalParticipants.playerId, actor.playerId),
        ),
      )
      .limit(1);

    if (!participant) {
      throw new AppError("NOT_PARTICIPANT");
    }

    // Le prix de la séance, fixé à sa création (voir `joinProposal`).
    const gratuit = proposal.priceUno === 0;
    const reouvrable = proposal.status === "session" && gratuit;

    if (proposal.status !== "proposal" && !reouvrable) {
      throw new AppError(
        "RULE_VIOLATION",
        "Les inscriptions sont closes : contactez un administrateur pour vous désister.",
      );
    }

    await tx
      .delete(proposalParticipants)
      .where(eq(proposalParticipants.id, participant.id));

    /*
     * Et son équipe avec (MODE-005). Là où elles existent dès la proposition,
     * un partant y laissait son nom : l'équipe aurait compté un joueur de
     * moins que sa liste, et gardé une place bloquée pour quelqu'un qui ne
     * vient plus.
     */
    const siens = await tx
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .where(
        and(
          eq(teams.proposalId, proposalId),
          eq(teamMembers.playerId, actor.playerId),
        ),
      );

    if (siens.length > 0) {
      await tx.delete(teamMembers).where(
        inArray(
          teamMembers.id,
          siens.map((row) => row.id),
        ),
      );
    }

    const participantCount = Math.max(0, proposal.participantCount - 1);

    if (participantCount === 0) {
      // Plus personne : la proposition est annulée et le créneau libéré.
      await tx
        .update(proposals)
        .set({
          participantCount: 0,
          status: "cancelled",
          activeSlotKey: null,
          updatedAt: new Date(),
        })
        .where(eq(proposals.id, proposalId));

      return toSummary(
        { ...proposal, participantCount: 0, status: "cancelled" },
        { isParticipant: false, hasPaid: false },
      );
    }

    /*
     * Si celui qui part avait ouvert la proposition, elle change de main.
     *
     * Retenir le créateur prisonnier de sa propre proposition était le choix
     * précédent, et il se défendait mal : une blessure, un empêchement, et le
     * joueur n'avait plus qu'à demander à l'administration. Annuler la séance
     * pour autant aurait été pire — les autres inscrits n'y sont pour rien, et
     * certains ont pu poser leur soirée.
     *
     * Elle revient donc au plus ancien des inscrits restants. Ce n'est pas
     * arbitraire : c'est celui qui s'est engagé le premier après l'auteur, et
     * l'ordre d'inscription est le seul critère que l'application connaisse
     * déjà — le choisir évite d'inventer une notion de responsable que rien
     * d'autre ne porterait.
     *
     * Le rôle est d'ailleurs léger : `creatorPlayerId` ne donne aucun droit
     * particulier, il dit seulement qui a ouvert. La reprise ne transfère donc
     * aucun pouvoir, elle évite une proposition orpheline.
     */
    const creatorLeaves = proposal.creatorPlayerId === actor.playerId;
    let creatorPlayerId = proposal.creatorPlayerId;

    if (creatorLeaves) {
      const [heir] = await tx
        .select({ playerId: proposalParticipants.playerId })
        .from(proposalParticipants)
        .where(eq(proposalParticipants.proposalId, proposalId))
        .orderBy(proposalParticipants.joinedAt, proposalParticipants.id)
        .limit(1);

      // `participantCount > 0` garantit qu'il en reste un : la garde est là
      // pour que la lecture ne dépende pas de cette déduction.
      if (heir) creatorPlayerId = heir.playerId;
    }

    await tx
      .update(proposals)
      .set({
        participantCount,
        creatorPlayerId,
        ...(reouvrable ? { status: "proposal" as const } : {}),
        updatedAt: new Date(),
      })
      .where(eq(proposals.id, proposalId));

    return toSummary(
      {
        ...proposal,
        participantCount,
        creatorPlayerId,
        ...(reouvrable ? { status: "proposal" as const } : {}),
      },
      { isParticipant: false, hasPaid: false },
    );
  });
}

/**
 * Enregistre le paiement validé d'un participant et fait basculer la
 * réservation en session lorsque tout le monde a payé (CAL-011).
 * Appelée par le service de paiement, jamais directement par un routeur.
 */
/**
 * Installe un payeur sur le terrain, en délogeant un impayé s'il le faut
 * (MODE-004).
 *
 * Trois cas, dans cet ordre :
 *
 *  1. **il a déjà une équipe** — le cas courant, celui du joueur inscrit dès
 *     le début : rien à faire ;
 *  2. **une place est libre** — un joueur a été retiré depuis le tirage :
 *     il la prend, dans l'équipe la moins remplie ;
 *  3. **le terrain est plein** — il prend la place d'un joueur qui n'a pas
 *     réglé. Le dernier inscrit parmi eux : celui qui est arrivé en dernier
 *     est le premier à céder, ce qui se défend et ne dépend d'aucun hasard.
 *
 * Le délogé **reste inscrit** : il passe sur le banc, pas dehors. Le sortir
 * de la séance est une décision d'administration, pas l'effet de bord du
 * paiement de quelqu'un d'autre.
 *
 * Le poste du sortant ne se transmet pas : la place est rendue libre, et le
 * nouveau choisit la sienne. Hériter du poste d'un autre aurait mis un
 * gardien dans les buts sans qu'il l'ait demandé.
 */
async function seatOnPitch(
  tx: Transaction,
  proposalId: number,
  playerId: number,
): Promise<void> {
  const squads = await tx
    .select({ id: teams.id, teamIndex: teams.teamIndex })
    .from(teams)
    .where(eq(teams.proposalId, proposalId))
    .orderBy(asc(teams.teamIndex));

  // Pas d'équipes : la séance n'a pas encore atteint son plateau, ou le mode
  // n'en forme aucune. Il n'y a pas de terrain où s'installer.
  if (squads.length === 0) return;

  const members = await tx
    .select({
      id: teamMembers.id,
      teamId: teamMembers.teamId,
      playerId: teamMembers.playerId,
    })
    .from(teamMembers)
    .where(
      inArray(
        teamMembers.teamId,
        squads.map((squad) => squad.id),
      ),
    );

  if (members.some((member) => member.playerId === playerId)) return;

  const teamSize = Math.max(1, Math.floor(members.length / squads.length) || 1);

  const counts = new Map(
    squads.map((squad) => [
      squad.id,
      members.filter((member) => member.teamId === squad.id).length,
    ]),
  );

  const roomy = squads.find((squad) => (counts.get(squad.id) ?? 0) < teamSize);

  if (roomy) {
    await tx.insert(teamMembers).values({ teamId: roomy.id, playerId });
    return;
  }

  /*
   * Le terrain est plein : on cherche qui n'a pas réglé. Le dernier inscrit
   * d'entre eux cède sa place — et s'ils ont tous payé, il n'y a rien à
   * prendre, ce qui ne devrait pas arriver puisque la réservation aurait
   * alors déjà basculé.
   */
  const unpaid = await tx
    .select({ playerId: proposalParticipants.playerId })
    .from(proposalParticipants)
    .where(
      and(
        eq(proposalParticipants.proposalId, proposalId),
        eq(proposalParticipants.hasPaid, false),
      ),
    )
    .orderBy(
      desc(proposalParticipants.joinedAt),
      desc(proposalParticipants.id),
    );

  const onPitch = new Set(members.map((member) => member.playerId));
  const bumped = unpaid.find(
    (row) => row.playerId !== playerId && onPitch.has(row.playerId),
  );
  if (!bumped) return;

  const seat = members.find((member) => member.playerId === bumped.playerId);
  if (!seat) return;

  await tx
    .update(teamMembers)
    .set({ playerId, pitchSlot: null })
    .where(eq(teamMembers.id, seat.id));
}

export async function markParticipantPaid(
  tx: Transaction,
  params: { proposalId: number; playerId: number; paymentId: number },
): Promise<{ status: ProposalRow["status"]; paymentComplete: boolean }> {
  const proposal = await lockProposal(tx, params.proposalId);

  const result = await tx
    .update(proposalParticipants)
    .set({ hasPaid: true, paymentId: params.paymentId })
    .where(
      and(
        eq(proposalParticipants.proposalId, params.proposalId),
        eq(proposalParticipants.playerId, params.playerId),
        eq(proposalParticipants.hasPaid, false),
      ),
    );

  // Aucune ligne modifiée : le participant était déjà payé. On ne recompte
  // pas, sinon un webhook rejoué ferait dériver `paidCount` (ANN-004).
  if (Number(result[0].affectedRows ?? 0) === 0) {
    return {
      status: proposal.status,
      paymentComplete: proposal.paymentComplete,
    };
  }

  /*
   * Payer, c'est entrer sur le terrain (MODE-004).
   *
   * Un remplaçant admis dans la réservation attend sur le banc : il est
   * inscrit, mais aucune équipe ne le porte. Son règlement lui donne la place
   * d'un joueur qui n'a pas payé — c'est exactement ce que promettent les
   * vingt-quatre heures, et la règle n'avait jusqu'ici aucune traduction
   * visible.
   */
  await seatOnPitch(tx, params.proposalId, params.playerId);

  const paidCount = await countPaid(tx, params.proposalId);

  /*
   * L'effectif se juge au quota, pas au nombre d'inscrits.
   *
   * Une réservation ouverte aux remplaçants compte plus d'inscrits que de
   * places : attendre que *tous* aient payé serait attendre que les retardataires
   * paient, c'est-à-dire ne jamais boucler. Ce qui compte est le nombre de
   * places réglées — les autres n'ont plus lieu d'être.
   */
  const quota = proposal.minParticipants;
  const complete =
    proposal.status === "reservation"
      ? paidCount >= quota
      : paidCount >= proposal.participantCount && proposal.participantCount > 0;

  let participantCount = proposal.participantCount;

  if (complete && proposal.status === "reservation") {
    participantCount = await dropUnpaidParticipants(tx, proposal, paidCount);
  }

  const nextStatus =
    complete && proposal.status === "reservation" ? "session" : proposal.status;

  await tx
    .update(proposals)
    .set({
      paidCount,
      participantCount,
      paymentComplete: complete,
      status: nextStatus,
      updatedAt: new Date(),
    })
    .where(eq(proposals.id, params.proposalId));

  return { status: nextStatus, paymentComplete: complete };
}

/** Nombre de places réglées sur une proposition. */
async function countPaid(tx: Transaction, proposalId: number): Promise<number> {
  const [row] = await tx
    .select({ paid: count() })
    .from(proposalParticipants)
    .where(
      and(
        eq(proposalParticipants.proposalId, proposalId),
        eq(proposalParticipants.hasPaid, true),
      ),
    );

  return Number(row?.paid ?? 0);
}

/**
 * Le quota de paiements est atteint : les places non réglées tombent.
 *
 * C'est l'unique moment où un joueur perd sa place pour n'avoir pas payé, et
 * il la perd parce que quelqu'un d'autre a payé à sa place — pas parce qu'un
 * remplaçant s'est manifesté. Chacun est prévenu : découvrir la veille du
 * match qu'on n'y est plus inscrit vaut bien une notification.
 *
 * Renvoie le nouvel effectif.
 */
async function dropUnpaidParticipants(
  tx: Transaction,
  proposal: ProposalRow,
  paidCount: number,
): Promise<number> {
  const unpaid = await tx
    .select({ playerId: proposalParticipants.playerId })
    .from(proposalParticipants)
    .where(
      and(
        eq(proposalParticipants.proposalId, proposal.id),
        eq(proposalParticipants.hasPaid, false),
      ),
    );

  if (unpaid.length === 0) return paidCount;

  await tx
    .delete(proposalParticipants)
    .where(
      and(
        eq(proposalParticipants.proposalId, proposal.id),
        eq(proposalParticipants.hasPaid, false),
      ),
    );

  /*
   * Et hors du terrain, pas seulement hors de la liste (MODE-004).
   *
   * Depuis que les équipes se forment dès la réservation, une place perdue
   * laisserait sinon son joueur aligné sur une feuille de match à laquelle il
   * ne participe plus. La ligne d'équipe disparaît donc avec l'inscription —
   * et la place qu'elle occupait redevient libre pour qui entre à sa suite.
   */
  const squads = await tx
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.proposalId, proposal.id));

  if (squads.length > 0) {
    await tx.delete(teamMembers).where(
      and(
        inArray(
          teamMembers.teamId,
          squads.map((squad) => squad.id),
        ),
        inArray(
          teamMembers.playerId,
          unpaid.map((seat) => seat.playerId),
        ),
      ),
    );
  }

  for (const seat of unpaid) {
    await notifyPlayer(
      {
        playerId: seat.playerId,
        eventKey: `proposal:${proposal.id}:seat-lost`,
        title: gabarit("Place perdue faute de paiement"),
        body: gabarit(
          "La session du {jour} à {salle} est complète : toutes les places ont été réglées. La vôtre ne l'étant pas, elle a été attribuée à un remplaçant.",
          { jour: { jour: proposal.localDate }, salle: proposal.venueName },
        ),
      },
      tx,
    );
  }

  await recordAdminEvent(
    {
      type: "payment.unpaid.dropped",
      body:
        `${unpaid.length} place(s) non réglée(s) retirée(s) de la session du ` +
        `${proposal.localDate} à ${proposal.venueName} : le quota de paiements ` +
        `est atteint.`,
      entityType: "proposal",
      entityId: proposal.id,
      key: `proposal:${proposal.id}:unpaid-dropped`,
    },
    tx,
  );

  return paidCount;
}

// ---------------------------------------------------------------------------
// Lectures
// ---------------------------------------------------------------------------

async function viewerFlagsFor(
  executor: Executor,
  proposalIds: number[],
  playerId: number,
): Promise<Map<number, { isParticipant: boolean; hasPaid: boolean }>> {
  if (proposalIds.length === 0) return new Map();

  const rows = await executor
    .select({
      proposalId: proposalParticipants.proposalId,
      hasPaid: proposalParticipants.hasPaid,
    })
    .from(proposalParticipants)
    .where(
      and(
        inArray(proposalParticipants.proposalId, proposalIds),
        eq(proposalParticipants.playerId, playerId),
      ),
    );

  return new Map(
    rows.map((row) => [
      row.proposalId,
      { isParticipant: true, hasPaid: row.hasPaid },
    ]),
  );
}

/**
 * Une session terminée n'appartient qu'à ceux qui l'ont vécue (CAL-002).
 *
 * Tant qu'une séance est devant soi, l'afficher est une invitation : on peut
 * s'y inscrire. Une fois jouée, elle n'invite plus à rien — elle raconte un
 * après-midi auquel on n'était pas, avec ses buts, ses notes et ses photos.
 * Le calendrier d'un joueur devenait un journal de la ligue entière, où
 * retrouver ses propres sessions demandait de faire le tri.
 *
 * L'arbitre de la rencontre la garde : il y était, et la feuille de match est
 * la sienne. L'administration et la supervision gardent la vue complète, sans
 * quoi elles ne pourraient plus ni corriger ni saisir.
 */
function completedVisibility(viewer: {
  playerId: number;
  maySupervise: boolean;
}) {
  if (viewer.maySupervise) return undefined;

  return or(
    ne(proposals.status, "completed"),
    eq(proposals.refereePlayerId, viewer.playerId),
    exists(
      db
        .select({ one: sql`1` })
        .from(proposalParticipants)
        .where(
          and(
            eq(proposalParticipants.proposalId, proposals.id),
            eq(proposalParticipants.playerId, viewer.playerId),
          ),
        ),
    ),
  )!;
}

/**
 * Condition SQL : la séance est publique, ou le joueur la connaît (PRIV-001).
 */
function privateVisibility(playerId: number) {
  return or(
    eq(proposals.visibility, "public"),
    eq(proposals.creatorPlayerId, playerId),
    exists(
      db
        .select({ one: sql`1` })
        .from(proposalParticipants)
        .where(
          and(
            eq(proposalParticipants.proposalId, proposals.id),
            eq(proposalParticipants.playerId, playerId),
          ),
        ),
    ),
    exists(
      db
        .select({ one: sql`1` })
        .from(proposalInvitations)
        .where(
          and(
            eq(proposalInvitations.proposalId, proposals.id),
            eq(proposalInvitations.inviteePlayerId, playerId),
          ),
        ),
    ),
  )!;
}

/**
 * Liste filtrée (CAL-002).
 * Le filtre de division n'est pas un paramètre client : pour UNO League, le
 * serveur impose la division du joueur.
 */
export async function listProposals(
  viewer: { playerId: number; division: Division; maySupervise: boolean },
  input: ListProposalsInput,
): Promise<ProposalSummary[]> {
  const conditions = [ne(proposals.status, "cancelled")];

  if (input.from) conditions.push(gte(proposals.localDate, input.from));
  if (input.to) conditions.push(lte(proposals.localDate, input.to));
  if (input.venueId) conditions.push(eq(proposals.venueId, input.venueId));
  if (input.modeId) conditions.push(eq(proposals.modeId, input.modeId));
  if (input.status) conditions.push(eq(proposals.status, input.status));

  // CAL-002 : un joueur D2 ne voit que les propositions League D2, mais voit
  // les matchs amicaux de toutes les divisions.
  conditions.push(
    or(isNull(proposals.division), eq(proposals.division, viewer.division))!,
  );

  const visibility = completedVisibility(viewer);
  if (visibility) conditions.push(visibility);

  // PRIV-001 : une séance privée n'apparaît qu'au calendrier de ceux qui la
  // connaissent — l'organisateur, ses invités, ses inscrits.
  if (!viewer.maySupervise) conditions.push(privateVisibility(viewer.playerId));

  let rows = await db
    .select()
    .from(proposals)
    .where(and(...conditions))
    .orderBy(asc(proposals.startsAtUtc))
    .limit(300);

  if (input.mineOnly) {
    const mine = await viewerFlagsFor(
      db,
      rows.map((row) => row.id),
      viewer.playerId,
    );
    rows = rows.filter((row) => mine.has(row.id));
  }

  const flags = await viewerFlagsFor(
    db,
    rows.map((row) => row.id),
    viewer.playerId,
  );

  return rows.map((row) =>
    toSummary(
      row,
      flags.get(row.id) ?? { isParticipant: false, hasPaid: false },
    ),
  );
}

/**
 * Peut-on voir cette séance ? (PRIV-001)
 *
 * Une séance publique, oui. Une séance privée : son organisateur, ses invités
 * — même ceux qui ont décliné, pour qu'ils puissent changer d'avis —, ses
 * inscrits, son arbitre, qui porte le lien partagé, et la supervision, qui
 * saisit les feuilles de toutes les séances jouées en salle.
 *
 * Refuser répond « introuvable » et non « interdit » : dire qu'une séance
 * privée existe à cette adresse serait déjà en dire trop.
 */
export async function assertMayViewProposal(
  executor: Executor,
  viewer: { playerId: number; maySupervise?: boolean },
  proposalOrId: ProposalRow | number,
  inviteToken?: string,
): Promise<ProposalRow> {
  let row: ProposalRow | undefined;
  if (typeof proposalOrId === "number") {
    [row] = await executor
      .select()
      .from(proposals)
      .where(eq(proposals.id, proposalOrId))
      .limit(1);
  } else {
    row = proposalOrId;
  }

  if (!row) throw new AppError("NOT_FOUND", "Cette session est introuvable.");
  if (visibilityOf(row) === "public" || viewer.maySupervise) return row;
  if (row.creatorPlayerId === viewer.playerId) return row;
  if (row.refereePlayerId === viewer.playerId) return row;
  if (sameToken(inviteToken, row.inviteToken)) return row;
  if (await invitationOf(executor, row.id, viewer.playerId)) return row;

  const [seat] = await executor
    .select({ id: proposalParticipants.id })
    .from(proposalParticipants)
    .where(
      and(
        eq(proposalParticipants.proposalId, row.id),
        eq(proposalParticipants.playerId, viewer.playerId),
      ),
    )
    .limit(1);
  if (seat) return row;

  throw new AppError("NOT_FOUND", "Cette session est introuvable.");
}

/** Les invités d'une séance privée et leur réponse (PRIV-002). */
async function listInvitees(
  executor: Executor,
  proposalId: number,
): Promise<ProposalInviteeView[]> {
  const rows = await executor
    .select({ status: proposalInvitations.status, ...publicPlayerColumns })
    .from(proposalInvitations)
    .innerJoin(players, eq(players.id, proposalInvitations.inviteePlayerId))
    .where(eq(proposalInvitations.proposalId, proposalId))
    .orderBy(asc(proposalInvitations.createdAt), asc(proposalInvitations.id));

  return rows.map(({ status, ...player }) => ({
    player: toPublicPlayer(player),
    status: status === "accepted" || status === "declined" ? status : "pending",
  }));
}

/** Détail complet avec participants et récompenses (CAL-012). */
export async function getProposal(
  viewer: { playerId: number; maySupervise?: boolean },
  proposalId: number,
  inviteToken?: string,
): Promise<ProposalDetail> {
  const row = await assertMayViewProposal(db, viewer, proposalId, inviteToken);

  const participants = await db
    .select({
      hasPaid: proposalParticipants.hasPaid,
      joinedAt: proposalParticipants.joinedAt,
      side: proposalParticipants.side,
      pitchSlot: proposalParticipants.pitchSlot,
      sessionRank: proposalParticipants.sessionRank,
      sessionPoints: proposalParticipants.sessionPoints,
      movement: proposalParticipants.movement,
      ratingBefore: proposalParticipants.ratingBefore,
      ratingAfter: proposalParticipants.ratingAfter,
      ...publicPlayerColumns,
    })
    .from(proposalParticipants)
    .innerJoin(players, eq(players.id, proposalParticipants.playerId))
    .where(eq(proposalParticipants.proposalId, proposalId))
    // Une session clôturée s'affiche dans l'ordre de son classement ; une
    // session à venir dans l'ordre des inscriptions.
    .orderBy(
      asc(proposalParticipants.sessionRank),
      asc(proposalParticipants.joinedAt),
    );

  const substitutes = await listSubstitutes(db, proposalId);
  const referee = await refereeOf(db, proposalId);

  const own = participants.find((p) => p.id === viewer.playerId);

  const privee = visibilityOf(row) === "private";
  const isOrganizer = row.creatorPlayerId === viewer.playerId;
  const invitation = privee
    ? await invitationOf(db, proposalId, viewer.playerId)
    : null;

  return {
    ...toSummary(row, {
      isParticipant: Boolean(own),
      hasPaid: own?.hasPaid ?? false,
    }),
    participants: participants.map(
      ({
        hasPaid,
        joinedAt,
        side,
        pitchSlot,
        sessionRank,
        sessionPoints,
        movement,
        ratingBefore,
        ratingAfter,
        ...player
      }) => ({
        player: toPublicPlayer(player),
        hasPaid,
        joinedAt: joinedAt.toISOString(),
        side,
        pitchSlot,
        sessionRank,
        sessionPoints: sessionPoints === null ? null : Number(sessionPoints),
        movement,
        ratingBefore,
        ratingAfter,
      }),
    ),
    rewards: rewardsFor(row.division, row.modeId),
    substitutes,
    referee,
    // Le serveur décide seul de ce qui est reprenable : comparer des dates
    // côté client reviendrait à faire dépendre une règle métier du fuseau et
    // de l'horloge du téléphone.
    claimableSeats: overdueSeats(row, participants),
    formations: { A: row.formationA, B: row.formationB },
    access: {
      isOrganizer,
      invitation:
        invitation?.status === "accepted" || invitation?.status === "declined"
          ? invitation.status
          : invitation
            ? "pending"
            : null,
    },
    // La liste des invités et le lien sont ceux de l'organisateur : les
    // autres voient les inscrits, comme dans toute séance.
    invitees: privee && isOrganizer ? await listInvitees(db, proposalId) : [],
    inviteToken: privee && isOrganizer ? row.inviteToken : null,
  };
}

// ---------------------------------------------------------------------------
// Remplaçants (CAL-008)
// ---------------------------------------------------------------------------

/**
 * Places non réglées dont l'échéance est passée.
 *
 * Calculé côté serveur, jamais côté client : faire dépendre une règle métier
 * de l'horloge et du fuseau d'un téléphone rendrait la même réservation
 * « reprenable » ici et pas là.
 */
function overdueSeats(
  proposal: ProposalRow,
  participants: { hasPaid: boolean; joinedAt: Date; id: number }[],
): ProposalDetail["claimableSeats"] {
  if (proposal.status !== "reservation" || !proposal.paymentDeadline) return [];
  if (proposal.paymentDeadline.getTime() > Date.now()) return [];

  const overdueSince = proposal.paymentDeadline.toISOString();

  return participants
    .filter((participant) => !participant.hasPaid)
    .map((participant) => ({
      // Le participant est déjà chargé avec les colonnes de la carte : on
      // reconstruit la vue publique sans requête supplémentaire.
      player: toPublicPlayer(
        participant as unknown as Parameters<typeof toPublicPlayer>[0],
      ),
      overdueSince,
    }));
}

/**
 * Arbitre attaché à une session, s'il y en a un (ROLE-003).
 *
 * La lecture vit ici, avec les autres lectures de propositions, tandis que
 * l'affectation vit dans `referees.service`. Les mettre toutes deux du côté
 * arbitre aurait créé un cycle d'import entre les deux services : le détail
 * d'une proposition a besoin de son arbitre, et l'affectation a besoin du
 * verrou de la proposition.
 */
export async function refereeOf(
  executor: Executor,
  proposalId: number,
): Promise<PublicPlayer | null> {
  const [row] = await executor
    .select(publicPlayerColumns)
    .from(proposals)
    .innerJoin(players, eq(players.id, proposals.refereePlayerId))
    .where(eq(proposals.id, proposalId))
    .limit(1);

  return row ? toPublicPlayer(row) : null;
}

export async function listSubstitutes(
  executor: Executor,
  proposalId: number,
): Promise<SubstituteView[]> {
  const rows = await executor
    .select({
      status: proposalSubstitutes.status,
      createdAt: proposalSubstitutes.createdAt,
      ...publicPlayerColumns,
    })
    .from(proposalSubstitutes)
    .innerJoin(players, eq(players.id, proposalSubstitutes.playerId))
    .where(
      and(
        eq(proposalSubstitutes.proposalId, proposalId),
        ne(proposalSubstitutes.status, "withdrawn"),
      ),
    )
    .orderBy(asc(proposalSubstitutes.createdAt));

  return rows.map(({ status, createdAt, ...player }) => ({
    player: toPublicPlayer(player),
    status,
    createdAt: createdAt.toISOString(),
  }));
}

/**
 * Se déclarer remplaçant sur une réservation (CAL-008).
 *
 * Ouvert à tout joueur non inscrit, dès que la réservation est formée : il
 * faut pouvoir se positionner **avant** l'échéance, sinon la file serait
 * toujours vide au moment où elle devient utile.
 */
export async function registerSubstitute(
  actor: { playerId: number; userId: number },
  proposalId: number,
): Promise<SubstituteView[]> {
  return db.transaction(async (tx) => {
    const proposal = await lockProposal(tx, proposalId);

    if (proposal.status !== "reservation") {
      throw new AppError(
        "RULE_VIOLATION",
        proposal.status === "proposal"
          ? "Cette session est encore ouverte : inscrivez-vous directement."
          : "Cette session n'attend plus de remplaçant.",
      );
    }

    const [participant] = await tx
      .select({ id: proposalParticipants.id })
      .from(proposalParticipants)
      .where(
        and(
          eq(proposalParticipants.proposalId, proposalId),
          eq(proposalParticipants.playerId, actor.playerId),
        ),
      )
      .limit(1);

    if (participant) {
      throw new AppError(
        "RULE_VIOLATION",
        "Vous êtes déjà inscrit à cette session.",
      );
    }

    // PRIV-002 : les remplaçants d'une séance privée viennent de ses invités.
    if (
      visibilityOf(proposal) === "private" &&
      !(await invitationOf(tx, proposalId, actor.playerId))
    ) {
      throw new AppError(
        "FORBIDDEN",
        "Cette séance est privée : on n'y entre que sur invitation de son organisateur.",
      );
    }

    const [player] = await tx
      .select({ division: players.division, accountType: players.accountType })
      .from(players)
      .where(eq(players.id, actor.playerId))
      .limit(1);
    if (!player) throw new AppError("NOT_FOUND", "Joueur introuvable.");

    if (player.accountType === "referee") {
      throw new AppError(
        "RULE_VIOLATION",
        "Un compte arbitre ne participe pas comme joueur. Proposez-vous comme arbitre.",
      );
    }

    // CAL-002 : une session de division reste réservée à cette division,
    // remplaçants compris — sinon la règle se contournerait par la file.
    if (proposal.division !== null && player.division !== proposal.division) {
      throw new AppError(
        "RULE_VIOLATION",
        gabarit("Cette session est réservée à la division {division}.", {
          division: proposal.division ?? "",
        }),
      );
    }

    try {
      await tx
        .insert(proposalSubstitutes)
        .values({ proposalId, playerId: actor.playerId, status: "waiting" });
    } catch (error) {
      // Déjà dans la file : l'opération est idempotente.
      if (!isDuplicateKeyError(error)) throw error;
      await tx
        .update(proposalSubstitutes)
        .set({ status: "waiting" })
        .where(
          and(
            eq(proposalSubstitutes.proposalId, proposalId),
            eq(proposalSubstitutes.playerId, actor.playerId),
          ),
        );
    }

    await recordAdminEvent(
      {
        type: "substitute.registered",
        body:
          `Un remplaçant s'est déclaré pour la session du ${proposal.localDate} ` +
          `à ${proposal.venueName}.`,
        entityType: "proposal",
        entityId: proposalId,
        playerId: actor.playerId,
        key: `proposal:${proposalId}:substitute:${actor.playerId}`,
      },
      tx,
    );

    return listSubstitutes(tx, proposalId);
  });
}

/** Retrait de la file d'attente. */
export async function withdrawSubstitute(
  actor: { playerId: number },
  proposalId: number,
): Promise<SubstituteView[]> {
  return db.transaction(async (tx) => {
    await tx
      .update(proposalSubstitutes)
      .set({ status: "withdrawn" })
      .where(
        and(
          eq(proposalSubstitutes.proposalId, proposalId),
          eq(proposalSubstitutes.playerId, actor.playerId),
          eq(proposalSubstitutes.status, "waiting"),
        ),
      );

    return listSubstitutes(tx, proposalId);
  });
}

export interface ClaimedSeat {
  proposalId: number;
  priceUno: number;
}

/**
 * Admet un remplaçant dans une réservation dont l'échéance est passée
 * (CAL-008).
 *
 * Le remplaçant **s'ajoute**, il ne prend la place de personne. La version
 * précédente désignait aussitôt un joueur en retard et lui retirait sa place
 * : elle éjectait donc quelqu'un sur la foi d'un paiement qui n'était pas
 * encore encaissé, et elle le faisait sur le seul critère de l'ordre
 * d'inscription — le premier arrivé était le premier sorti, alors qu'il
 * réglait peut-être dans la minute. Désormais la réservation compte
 * temporairement plus d'inscrits que de places : c'est le quinzième paiement
 * qui tranche, et il tranche en faveur de ceux qui ont payé.
 *
 * Appelée sous le verrou de la proposition, **avant** le débit : deux
 * remplaçants simultanés ne peuvent pas être admis tous les deux sur la
 * dernière place à gagner.
 */
export async function admitSubstitute(
  tx: Transaction,
  params: { proposalId: number; playerId: number },
): Promise<ClaimedSeat> {
  const proposal = await lockProposal(tx, params.proposalId);

  if (proposal.status !== "reservation") {
    throw new AppError(
      "PROPOSAL_CLOSED",
      "Cette session n'attend plus de paiement.",
    );
  }
  if (
    !proposal.paymentDeadline ||
    proposal.paymentDeadline.getTime() > Date.now()
  ) {
    throw new AppError(
      "RULE_VIOLATION",
      "Le délai de paiement de 24 heures n'est pas encore écoulé.",
    );
  }

  const [already] = await tx
    .select({ id: proposalParticipants.id })
    .from(proposalParticipants)
    .where(
      and(
        eq(proposalParticipants.proposalId, params.proposalId),
        eq(proposalParticipants.playerId, params.playerId),
      ),
    )
    .limit(1);

  if (already) {
    throw new AppError(
      "RULE_VIOLATION",
      "Vous êtes déjà inscrit à cette session.",
    );
  }

  // Passer par la file n'est pas une formalité : c'est là que la division et
  // le type de compte ont été vérifiés. Sans ce contrôle, un appel direct à
  // l'API entrerait dans une session de division sans jamais y être éligible.
  const [waiting] = await tx
    .select({ id: proposalSubstitutes.id })
    .from(proposalSubstitutes)
    .where(
      and(
        eq(proposalSubstitutes.proposalId, params.proposalId),
        eq(proposalSubstitutes.playerId, params.playerId),
        eq(proposalSubstitutes.status, "waiting"),
      ),
    )
    .limit(1);

  if (!waiting) {
    throw new AppError(
      "RULE_VIOLATION",
      "Déclarez-vous d'abord remplaçant sur cette session.",
    );
  }

  // Tant qu'une place reste à gagner, un remplaçant peut la disputer. Quand
  // le quota de paiements est atteint, il n'y a plus rien à reprendre — et la
  // session a déjà basculé.
  const paidCount = await countPaid(tx, params.proposalId);
  if (paidCount >= proposal.minParticipants) {
    throw new AppError(
      "CONFLICT",
      "Toutes les places de cette session sont réglées.",
    );
  }

  await tx
    .insert(proposalParticipants)
    .values({ proposalId: params.proposalId, playerId: params.playerId });

  await tx
    .update(proposals)
    .set({
      participantCount: proposal.participantCount + 1,
      updatedAt: new Date(),
    })
    .where(eq(proposals.id, params.proposalId));

  // « Promu » dit ici qu'il est entré dans la réservation, non qu'il a évincé
  // quelqu'un : la colonne `replaced_player_id` reste vide, parce qu'à cet
  // instant personne n'est encore désigné.
  await tx
    .update(proposalSubstitutes)
    .set({ status: "promoted", promotedAt: new Date() })
    .where(
      and(
        eq(proposalSubstitutes.proposalId, params.proposalId),
        eq(proposalSubstitutes.playerId, params.playerId),
      ),
    );

  return { proposalId: params.proposalId, priceUno: proposal.priceUno };
}

/**
 * Places non réglées dont l'échéance est passée, pour la tâche d'entretien
 * et pour le tableau de bord.
 */
export async function overdueReservations(): Promise<
  {
    proposalId: number;
    playerId: number;
    venueName: string;
    localDate: string;
  }[]
> {
  const rows = await db
    .select({
      proposalId: proposals.id,
      playerId: proposalParticipants.playerId,
      venueName: proposals.venueName,
      localDate: proposals.localDate,
    })
    .from(proposals)
    .innerJoin(
      proposalParticipants,
      eq(proposalParticipants.proposalId, proposals.id),
    )
    .where(
      and(
        eq(proposals.status, "reservation"),
        eq(proposalParticipants.hasPaid, false),
        lte(proposals.paymentDeadline, new Date()),
      ),
    );

  return rows;
}

/** Prochaines sessions du joueur, triées par date (HOME-001). */
export async function listUpcomingForPlayer(
  playerId: number,
  limit: number,
): Promise<ProposalSummary[]> {
  const rows = await db
    .select({ proposal: proposals, hasPaid: proposalParticipants.hasPaid })
    .from(proposalParticipants)
    .innerJoin(proposals, eq(proposals.id, proposalParticipants.proposalId))
    .where(
      and(
        eq(proposalParticipants.playerId, playerId),
        gte(proposals.startsAtUtc, new Date()),
        inArray(proposals.status, ["proposal", "reservation", "session"]),
      ),
    )
    .orderBy(asc(proposals.startsAtUtc))
    .limit(limit);

  return rows.map((row) =>
    toSummary(row.proposal, { isParticipant: true, hasPaid: row.hasPaid }),
  );
}

/**
 * Les séances qu'un joueur pourrait rejoindre (HOME-002).
 *
 * L'accueil d'un inscrit qui n'a encore rien réservé affichait « Aucune
 * session à venir » — vrai de son point de vue, et trompeur du point de vue de
 * la ligue, qui en comptait dix-neuf. On lui montre donc ce qui lui est
 * ouvert : à venir, pas complet, dans sa division ou sans division, et où il
 * n'est pas déjà inscrit.
 *
 * Le statut `session` est exclu : une séance confirmée ne prend plus personne.
 */
export async function listJoinableForPlayer(
  viewer: { playerId: number; division: Division },
  limit: number,
): Promise<ProposalSummary[]> {
  const rows = await db
    .select()
    .from(proposals)
    .where(
      and(
        gte(proposals.startsAtUtc, new Date()),
        inArray(proposals.status, ["proposal", "reservation"]),
        or(
          isNull(proposals.division),
          eq(proposals.division, viewer.division),
        )!,
        // Une séance privée s'annonce par son invitation, pas ici (PRIV-001).
        eq(proposals.visibility, "public"),
      ),
    )
    .orderBy(asc(proposals.startsAtUtc))
    .limit(100);

  const flags = await viewerFlagsFor(
    db,
    rows.map((row) => row.id),
    viewer.playerId,
  );

  return rows
    .filter((row) => !flags.get(row.id)?.isParticipant)
    .filter((row) => row.participantCount < row.minParticipants)
    .slice(0, limit)
    .map((row) => toSummary(row, { isParticipant: false, hasPaid: false }));
}

/**
 * Historique des sessions jouées (MATCH-006).
 *
 * Une session clôturée y figure quel que soit son horaire : c'est le statut
 * qui fait foi, pas la date. Une session encore confirmée n'y apparaît que
 * si son heure est passée — sinon elle relève des sessions à venir.
 */
export async function listHistoryForPlayer(
  playerId: number,
  limit: number,
): Promise<ProposalSummary[]> {
  const rows = await db
    .select({ proposal: proposals, hasPaid: proposalParticipants.hasPaid })
    .from(proposalParticipants)
    .innerJoin(proposals, eq(proposals.id, proposalParticipants.proposalId))
    .where(
      and(
        eq(proposalParticipants.playerId, playerId),
        or(
          eq(proposals.status, "completed"),
          and(
            eq(proposals.status, "session"),
            lte(proposals.startsAtUtc, new Date()),
          ),
        ),
      ),
    )
    .orderBy(desc(proposals.startsAtUtc))
    .limit(limit);

  return rows.map((row) =>
    toSummary(row.proposal, { isParticipant: true, hasPaid: row.hasPaid }),
  );
}

/**
 * Tâche d'entretien (cas limite « proposition expirée dont la date est
 * passée », CDC §21.1).
 *
 *  - une proposition dont l'heure est passée sans avoir atteint son quota est
 *    annulée et son créneau libéré ;
 *  - les places non réglées au-delà du délai sont signalées, au joueur comme
 *    à l'administration ;
 *  - les sessions jouées mais non saisies sont comptées, sans être clôturées :
 *    seule une saisie de résultats peut les terminer (MATCH-003).
 */
export async function expireStaleProposals(): Promise<{
  cancelled: number;
  awaitingEntry: number;
  overdue: number;
}> {
  const now = new Date();

  // Les retards de paiement sont relevés AVANT l'annulation des propositions
  // dépassées : sinon une réservation annulée le même jour n'aurait jamais
  // averti personne.
  const overdue = await notifyOverduePayments();

  const cancelled = await db
    .update(proposals)
    .set({ status: "cancelled", activeSlotKey: null, updatedAt: now })
    .where(
      and(
        inArray(proposals.status, ["proposal", "reservation"]),
        lte(proposals.startsAtUtc, now),
      ),
    );

  // Une session jouée n'est **plus** clôturée automatiquement.
  //
  // La clôture décide désormais des distinctions, verse les récompenses et
  // fait monter ou descendre les joueurs de division (RANK-005) : la
  // prononcer sans que personne n'ait saisi la feuille de match
  // distribuerait des récompenses pour une session dont on ignore tout, et
  // rendrait le classement de session vide définitif. Une session dont
  // l'heure est passée reste donc au statut « confirmée » et rejoint la file
  // de saisie de l'administration (MATCH-003).
  const awaiting = await db
    .select({ total: count() })
    .from(proposals)
    .where(
      and(eq(proposals.status, "session"), lte(proposals.startsAtUtc, now)),
    );

  return {
    cancelled: Number(cancelled[0].affectedRows ?? 0),
    awaitingEntry: Number(awaiting[0]?.total ?? 0),
    overdue,
  };
}

/**
 * Sessions confirmées dont l'heure est passée et dont les résultats restent à
 * saisir (MATCH-003).
 *
 * C'est la file de travail de la supervision : ni les propositions encore
 * ouvertes, ni les sessions déjà clôturées n'y figurent.
 *
 * `excludeForPlayerId` retire de la file les sessions que ce joueur a jouées
 * ou arbitrées (SUP-001). Un superviseur ne doit pas seulement se voir refuser
 * la saisie de ses propres sessions : il ne doit pas les voir dans sa file,
 * sans quoi la règle ne se découvre qu'au moment du refus.
 */
/**
 * Vrai si ce joueur a pris part à cette session — inscrit ou arbitre.
 *
 * Sert au contrôle du conflit d'intérêt : un superviseur ne saisit pas une
 * séance qu'il a jouée ou dirigée (SUP-001).
 */
export async function isSessionOfPlayer(
  executor: Executor,
  proposalId: number,
  playerId: number,
): Promise<boolean> {
  const [seat] = await executor
    .select({ playerId: proposalParticipants.playerId })
    .from(proposalParticipants)
    .where(
      and(
        eq(proposalParticipants.proposalId, proposalId),
        eq(proposalParticipants.playerId, playerId),
      ),
    )
    .limit(1);

  if (seat) return true;

  const [refereed] = await executor
    .select({ id: proposals.id })
    .from(proposals)
    .where(
      and(
        eq(proposals.id, proposalId),
        eq(proposals.refereePlayerId, playerId),
      ),
    )
    .limit(1);

  return Boolean(refereed);
}

/**
 * Sessions qu'une feuille de saisie en visionnage peut reprendre (TRACK-001).
 *
 * Deux différences avec la file d'attente de la console, et chacune vient d'un
 * essai :
 *
 *  - **les sessions à venir y figurent**. Un match SQUAD naît d'un défi
 *    accepté, avant son coup d'envoi : le restreindre au passé le rendait
 *    introuvable, et sa feuille inaccessible (SQUAD-005) ;
 *  - **celles du joueur qui regarde en sont retirées**. Un superviseur ne
 *    publie pas une feuille où il figure ; la lui proposer quand même ne
 *    ferait que reporter le refus après la saisie (SUP-001).
 *
 * Les séances déjà jouées viennent en tête : c'est le cas courant.
 */
export async function attachableSessions(
  limit = 40,
  excludeForPlayerId?: number,
): Promise<ProposalSummary[]> {
  // Un match personnalisé ne se saisit que par son organisateur (PRIV-003).
  const conditions = [
    eq(proposals.status, "session"),
    ne(proposals.modeId, "custom"),
  ];

  if (excludeForPlayerId !== undefined) {
    conditions.push(
      sql`${proposals.id} NOT IN (
        SELECT ${proposalParticipants.proposalId}
        FROM ${proposalParticipants}
        WHERE ${proposalParticipants.playerId} = ${excludeForPlayerId}
      )`,
    );
    conditions.push(
      or(
        isNull(proposals.refereePlayerId),
        ne(proposals.refereePlayerId, excludeForPlayerId),
      )!,
    );
  }

  const rows = await db
    .select()
    .from(proposals)
    .where(and(...conditions))
    .orderBy(desc(proposals.startsAtUtc))
    .limit(limit);

  const now = Date.now();
  const played = rows.filter((row) => row.startsAtUtc.getTime() <= now);
  // À venir : la plus proche d'abord, car c'est celle qu'on saisira ensuite.
  const upcoming = rows
    .filter((row) => row.startsAtUtc.getTime() > now)
    .reverse();

  return [...played, ...upcoming].map((row) => toSummary(row));
}

export async function pendingSessions(
  limit = 30,
  excludeForPlayerId?: number,
): Promise<ProposalSummary[]> {
  const conditions = [
    eq(proposals.status, "session"),
    lte(proposals.startsAtUtc, new Date()),
    // Un match personnalisé ne se saisit que par son organisateur (PRIV-003).
    ne(proposals.modeId, "custom"),
  ];

  if (excludeForPlayerId !== undefined) {
    conditions.push(
      sql`${proposals.id} NOT IN (
        SELECT ${proposalParticipants.proposalId}
        FROM ${proposalParticipants}
        WHERE ${proposalParticipants.playerId} = ${excludeForPlayerId}
      )`,
    );
    conditions.push(
      or(
        isNull(proposals.refereePlayerId),
        ne(proposals.refereePlayerId, excludeForPlayerId),
      )!,
    );
  }

  const rows = await db
    .select()
    .from(proposals)
    .where(and(...conditions))
    .orderBy(asc(proposals.startsAtUtc))
    .limit(limit);

  return rows.map((row) => toSummary(row));
}

/**
 * Signale les places non réglées dont l'échéance est passée (CAL-008).
 *
 * Une notification par joueur et par session : la clé d'évènement porte les
 * deux identifiants, donc repasser la tâche toutes les heures ne réémet rien.
 * Le joueur est prévenu, l'administration aussi, et la place devient
 * accessible aux remplaçants.
 */
export async function notifyOverduePayments(): Promise<number> {
  const late = await overdueReservations();

  for (const seat of late) {
    await notifyPlayer(
      {
        playerId: seat.playerId,
        eventKey: `proposal:${seat.proposalId}:overdue`,
        title: gabarit("Paiement en retard"),
        body: gabarit(
          "Votre place du {jour} à {salle} n'est pas réglée. Elle peut désormais être reprise par un remplaçant.",
          { jour: { jour: seat.localDate }, salle: seat.venueName },
        ),
      },
      // Tâche d'entretien : aucune transaction en cours.
      db,
    );

    await recordAdminEvent(
      {
        type: "payment.overdue",
        body:
          `Place non réglée après ${PAYMENT_DEADLINE_HOURS} h — session du ` +
          `${seat.localDate} à ${seat.venueName}.`,
        entityType: "proposal",
        entityId: seat.proposalId,
        playerId: seat.playerId,
        key: `proposal:${seat.proposalId}:overdue:${seat.playerId}`,
      },
      db,
    );
  }

  return late.length;
}

// ---------------------------------------------------------------------------
// Séances privées : ce que seul l'organisateur décide (PRIV-001, PRIV-003)
// ---------------------------------------------------------------------------

function assertOrganizer(proposal: ProposalRow, playerId: number): void {
  if (proposal.creatorPlayerId !== playerId) {
    throw new AppError(
      "FORBIDDEN",
      "Seul l'organisateur de la séance peut faire ce choix.",
    );
  }
}

/**
 * Ouvre au public une séance privée qui ne se complète pas (PRIV-001).
 *
 * Elle entre alors au calendrier de tous, exactement comme si elle avait été
 * créée publique : elle prend sa clé de créneau, si bien qu'elle ne peut pas
 * doubler une proposition publique identique — dans ce cas, le refus le dit,
 * et l'organisateur peut rejoindre l'autre ou garder la sienne privée.
 *
 * Les invités gardent leur invitation : elle reste valable, et la séance
 * reste la même. Un match personnalisé ne s'ouvre pas : son lieu n'est pas
 * un lieu de la ligue.
 */
export async function openToPublic(
  actor: { playerId: number; userId: number },
  proposalId: number,
): Promise<ProposalSummary> {
  try {
    return await db.transaction(async (tx) => {
      const proposal = await lockProposal(tx, proposalId);
      assertOrganizer(proposal, actor.playerId);

      if (visibilityOf(proposal) === "public") {
        return toSummary(proposal);
      }
      if (!modeAllowsVisibility(proposal.modeId, "public")) {
        throw new AppError(
          "RULE_VIOLATION",
          "Un match personnalisé reste privé : son lieu n'est pas un lieu de la ligue.",
        );
      }
      if (proposal.status !== "proposal") {
        throw new AppError("PROPOSAL_CLOSED");
      }

      const activeSlotKey = buildSlotKey({
        venueId: proposal.venueId,
        localDate: proposal.localDate,
        slotStartHour: proposal.slotStartHour,
        modeId: proposal.modeId,
      });

      await tx
        .update(proposals)
        .set({ visibility: "public", activeSlotKey, updatedAt: new Date() })
        .where(eq(proposals.id, proposalId));

      await writeAudit(tx, {
        actorUserId: actor.userId,
        action: "proposal.status.update",
        entityType: "proposal",
        entityId: proposalId,
        before: { visibility: "private" },
        after: { visibility: "public" },
      });

      return toSummary({ ...proposal, visibility: "public", activeSlotKey });
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    throw new AppError(
      "CONFLICT",
      "Une séance publique existe déjà sur ce créneau : rejoignez-la, ou gardez la vôtre privée.",
    );
  }
}

/**
 * Confirme un match personnalisé sans attendre que le plateau soit complet
 * (PRIV-003).
 *
 * Rien ne se paie dans l'application, donc rien n'oblige à attendre le
 * dernier joueur : à huit sur dix, un match entre collègues se joue quand
 * même, et l'organisateur est seul à le savoir. Sans cette porte, la
 * proposition s'annulerait d'elle-même au coup d'envoi.
 *
 * Il faut au moins deux inscrits : en dessous, ce n'est pas un match.
 */
export async function confirmCustomMatch(
  actor: { playerId: number; userId: number },
  proposalId: number,
): Promise<ProposalSummary> {
  return db.transaction(async (tx) => {
    const proposal = await lockProposal(tx, proposalId);
    assertOrganizer(proposal, actor.playerId);

    if (proposal.modeId !== "custom") {
      throw new AppError(
        "RULE_VIOLATION",
        "Seul un match personnalisé se confirme avant d'être complet.",
      );
    }
    if (proposal.status !== "proposal") {
      throw new AppError("PROPOSAL_CLOSED");
    }
    if (proposal.participantCount < 2) {
      throw new AppError(
        "RULE_VIOLATION",
        "Il faut au moins deux joueurs inscrits pour confirmer la séance.",
      );
    }

    await tx
      .update(proposals)
      .set({ status: "session", updatedAt: new Date() })
      .where(eq(proposals.id, proposalId));

    const confirmed = { ...proposal, status: "session" as const };
    await composeTeams(tx, { userId: actor.userId }, confirmed);

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "proposal.status.update",
      entityType: "proposal",
      entityId: proposalId,
      before: { status: "proposal" },
      after: { status: "session", participantCount: proposal.participantCount },
    });

    const inscrits = await tx
      .select({ playerId: proposalParticipants.playerId })
      .from(proposalParticipants)
      .where(eq(proposalParticipants.proposalId, proposalId));

    for (const inscrit of inscrits) {
      if (inscrit.playerId === actor.playerId) continue;
      await notifyPlayer(
        {
          playerId: inscrit.playerId,
          eventKey: `proposal:${proposalId}:confirmed`,
          title: gabarit("Séance confirmée"),
          body: [
            gabarit(
              "{salle}, le {jour} à {heure} : l'organisateur a confirmé la séance.",
              {
                salle: proposal.venueName,
                jour: { jour: proposal.localDate },
                heure: proposal.localTimeLabel,
              },
            ),
            gabarit(
              "Le paiement et la réservation se règlent entre vous, hors de l'application.",
            ),
          ],
          url: `/sessions/${proposalId}`,
        },
        tx,
      );
    }

    return toSummary(confirmed, { isParticipant: true, hasPaid: false });
  });
}

export { toSummary as toProposalSummary, lockProposal, rewardsFor };
