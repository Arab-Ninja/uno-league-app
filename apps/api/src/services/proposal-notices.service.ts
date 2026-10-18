import {
  and,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  ne,
  notInArray,
  sql,
} from "drizzle-orm";
import {
  ALMOST_FULL_RATIO,
  IMMOVABLE_MODE_IDS,
  REMINDER_HOURS_CHOICES,
  gabarit,
  resolveNotificationSettings,
} from "@uno/shared";
import { db, type Executor } from "../db/client.js";
import {
  notificationDeliveries,
  players,
  proposalParticipants,
  proposals,
  users,
  type ProposalRow,
} from "../db/schema.js";
import { logger } from "../lib/logger.js";
import { notifyPlayer } from "./notifications.service.js";

/**
 * Ce que la ligue annonce autour des séances (NOTIF-005, NOTIF-006).
 *
 *  - **une nouvelle séance**, à tous ceux qui peuvent la rejoindre — sa
 *    division pour la UNO League, tout le monde ailleurs. Actif par défaut :
 *    c'est ce qui remplit les séances ;
 *  - **une séance presque complète**, à ses inscrits, pour appeler les
 *    derniers joueurs ;
 *  - **le rappel avant la séance**, à l'heure que chacun a choisie.
 */

/** Une annonce plus vieille que cela n'est plus une nouvelle : on la tait. */
const ANNOUNCE_WINDOW_MS = 60 * 60_000;

/**
 * Annonce les nouvelles séances publiques (NOTIF-005).
 *
 * Par l'entretien périodique plutôt qu'à la création : envoyer à toute une
 * division retarderait la réponse de celui qui crée, et cinq minutes de
 * délai ne changent rien à une séance qui se joue dans deux jours. La
 * séance est marquée annoncée **avant** l'envoi, sous condition : deux passes
 * concurrentes ne l'annoncent pas deux fois.
 */
export async function announceNewProposals(now = new Date()): Promise<number> {
  const candidates = await db
    .select()
    .from(proposals)
    .where(
      and(
        isNull(proposals.announcedAt),
        eq(proposals.status, "proposal"),
        eq(proposals.visibility, "public"),
        notInArray(proposals.modeId, [...IMMOVABLE_MODE_IDS]),
        gt(proposals.startsAtUtc, now),
      ),
    );

  let announced = 0;
  for (const proposal of candidates) {
    const claimed = await db
      .update(proposals)
      .set({ announcedAt: now })
      .where(and(eq(proposals.id, proposal.id), isNull(proposals.announcedAt)));
    if (Number(claimed[0].affectedRows ?? 0) === 0) continue;
    if (now.getTime() - proposal.createdAt.getTime() > ANNOUNCE_WINDOW_MS) {
      continue;
    }

    try {
      await announce(proposal);
      announced++;
    } catch (error) {
      logger.error(
        { err: error, proposalId: proposal.id },
        "nouvelle séance non annoncée",
      );
    }
  }
  return announced;
}

async function announce(proposal: ProposalRow): Promise<void> {
  const conditions = [
    eq(players.accountType, "player"),
    eq(users.status, "active"),
    ne(players.id, proposal.creatorPlayerId),
    sql`${players.id} NOT IN (
      SELECT ${proposalParticipants.playerId}
      FROM ${proposalParticipants}
      WHERE ${proposalParticipants.proposalId} = ${proposal.id}
    )`,
  ];
  if (proposal.division !== null) {
    conditions.push(eq(players.division, proposal.division));
  }

  const recipients = await db
    .select({ id: players.id })
    .from(players)
    .innerJoin(users, eq(users.id, players.userId))
    .where(and(...conditions));

  for (const recipient of recipients) {
    await notifyPlayer(
      {
        playerId: recipient.id,
        // Pas sous `proposal:` : ce préfixe désigne ce qui arrive aux
        // inscrits d'une séance.
        eventKey: `new-proposal:${proposal.id}`,
        category: "newProposals",
        title: gabarit("Nouvelle séance : {mode}", {
          mode: { libelle: "gameMode", cle: proposal.modeId },
        }),
        body: gabarit(
          "{salle}, le {jour} à {heure} — {inscrits}/{minimum} inscrits. Rejoignez-la !",
          {
            salle: proposal.venueName,
            jour: { jour: proposal.localDate },
            heure: proposal.localTimeLabel,
            inscrits: proposal.participantCount,
            minimum: proposal.minParticipants,
          },
        ),
        url: `/sessions/${proposal.id}`,
        emailFallback: false,
      },
      db,
    );
  }
}

/**
 * Prévient les inscrits quand la séance devient presque complète
 * (NOTIF-005) : une fois, au moment exact où le seuil est atteint. Appelée
 * dans la transaction de l'inscription ; celui qui vient de s'inscrire le
 * voit à l'écran.
 */
export async function notifyAlmostFull(
  executor: Executor,
  proposal: ProposalRow,
  participantCount: number,
  joinerPlayerId: number,
): Promise<void> {
  if (proposal.modeId === "custom") return;
  const seuil = Math.ceil(proposal.minParticipants * ALMOST_FULL_RATIO);
  if (participantCount !== seuil || seuil >= proposal.minParticipants) return;

  const reste = proposal.minParticipants - participantCount;
  const seance = {
    salle: proposal.venueName,
    jour: { jour: proposal.localDate },
    heure: proposal.localTimeLabel,
  };
  const inscrits = await executor
    .select({ playerId: proposalParticipants.playerId })
    .from(proposalParticipants)
    .where(eq(proposalParticipants.proposalId, proposal.id));

  for (const inscrit of inscrits) {
    if (inscrit.playerId === joinerPlayerId) continue;
    await notifyPlayer(
      {
        playerId: inscrit.playerId,
        eventKey: `proposal:${proposal.id}:almost-full`,
        category: "sessions",
        title: gabarit("Séance presque complète"),
        body:
          reste === 1
            ? gabarit(
                "{salle}, le {jour} à {heure} : plus qu'une place ! Invitez un ami pour compléter la séance.",
                seance,
              )
            : gabarit(
                "{salle}, le {jour} à {heure} : plus que {reste} places. Invitez vos amis pour compléter la séance.",
                { ...seance, reste },
              ),
        url: `/sessions/${proposal.id}`,
      },
      executor,
    );
  }
}

/**
 * Le rappel avant la séance (NOTIF-006), à l'heure que chaque inscrit a
 * choisie — quatre heures avant par défaut.
 *
 * Seulement pour une séance qui aura lieu : complète (réservation) ou
 * confirmée. Ceux qui l'ont déjà reçu sont écartés dès la requête : sans
 * cela, chaque passe de cinq minutes retenterait l'envoi jusqu'au coup
 * d'envoi.
 */
export async function sendSessionReminders(now = new Date()): Promise<number> {
  const plusLong = Math.max(...REMINDER_HOURS_CHOICES);
  const horizon = new Date(now.getTime() + plusLong * 3_600_000);

  const rows = await db
    .select({
      proposal: proposals,
      playerId: proposalParticipants.playerId,
      hasPaid: proposalParticipants.hasPaid,
      settings: players.notificationSettings,
    })
    .from(proposalParticipants)
    .innerJoin(proposals, eq(proposals.id, proposalParticipants.proposalId))
    .innerJoin(players, eq(players.id, proposalParticipants.playerId))
    .where(
      and(
        inArray(proposals.status, ["reservation", "session"]),
        gt(proposals.startsAtUtc, now),
        lte(proposals.startsAtUtc, horizon),
        sql`NOT EXISTS (
          SELECT 1 FROM ${notificationDeliveries}
          WHERE ${notificationDeliveries.playerId} = ${proposalParticipants.playerId}
            AND ${notificationDeliveries.eventKey} =
              CONCAT('proposal:', ${proposals.id}, ':reminder')
        )`,
      ),
    );

  let sent = 0;
  for (const row of rows) {
    const reglages = resolveNotificationSettings(row.settings);
    if (!reglages.push.reminders && !reglages.email.reminders) continue;
    const due =
      row.proposal.startsAtUtc.getTime() - reglages.reminderHours * 3_600_000;
    if (now.getTime() < due) continue;

    const { proposal } = row;
    await notifyPlayer(
      {
        playerId: row.playerId,
        eventKey: `proposal:${proposal.id}:reminder`,
        category: "reminders",
        title: gabarit("Rappel de séance"),
        body: [
          gabarit("{salle}, le {jour} à {heure} : votre séance approche.", {
            salle: proposal.venueName,
            jour: { jour: proposal.localDate },
            heure: proposal.localTimeLabel,
          }),
          ...(!row.hasPaid && proposal.priceUno > 0
            ? [gabarit("Votre place n'est pas encore réglée.")]
            : []),
        ],
        url: `/sessions/${proposal.id}`,
      },
      db,
      now,
    );
    sent++;
  }
  return sent;
}
