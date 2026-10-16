import { and, asc, count, eq, inArray, lte } from "drizzle-orm";
import {
  PROPOSAL_CUTOFF_HOUR,
  gabarit,
  gameModeName,
  zonedTimeToUtc,
  type ErrorTemplate,
} from "@uno/shared";
import { db } from "../db/client.js";
import {
  proposalParticipants,
  proposalPolls,
  proposals,
  type ProposalRow,
} from "../db/schema.js";
import { logger } from "../lib/logger.js";
import { recordAdminEvent } from "./admin-events.service.js";
import { refundSeat } from "./eligibility.service.js";
import { notifyPlayer } from "./notifications.service.js";
import { lockProposal, notifyOverduePayments } from "./proposals.service.js";

/**
 * Annulation des séances qui n'auront pas lieu (CAL-013, cas limite §21.1).
 *
 * Deux échéances, passées en revue par l'entretien toutes les cinq minutes :
 *
 *  - **midi, le jour de la séance** (`PROPOSAL_CUTOFF_HOUR`, heure du lieu).
 *    Une proposition encore incomplète s'annule : les inscrits le savent tôt
 *    assez pour s'organiser autrement, et le terrain se libère à temps chez
 *    l'exploitant. Une proposition ouverte le jour même après midi n'a pas eu
 *    sa chance : elle garde jusqu'au coup d'envoi. Le match personnalisé
 *    (PRIV-003) non plus — son organisateur le confirme quand il veut, même
 *    incomplet ;
 *  - **le coup d'envoi**. Ce qui n'est toujours pas confirmé s'annule :
 *    une proposition qui a échappé à midi, ou une réservation complète dont
 *    toutes les places ne sont pas réglées. Les places déjà payées sont
 *    remboursées en UNO.
 *
 * Seuls les inscrits sont prévenus, avec l'arbitre désigné s'il y en a un —
 * il se serait déplacé pour rien — et l'administration. Les remplaçants en
 * attente ne le sont pas : ils n'avaient pas de place.
 */

type Echeance = "midi" | "coup-envoi";

interface Annulation {
  proposal: ProposalRow;
  echeance: Echeance;
  /** UNO rendus, par joueur. */
  inscrits: { playerId: number; refundedUno: number }[];
  paidCount: number;
}

/** L'instant où cette proposition, encore incomplète, s'annule. */
export function cancellationCutoff(
  proposal: Pick<
    ProposalRow,
    "localDate" | "timezone" | "startsAtUtc" | "createdAt" | "modeId"
  >,
): { at: Date; echeance: Echeance } {
  const kickoff = { at: proposal.startsAtUtc, echeance: "coup-envoi" as const };
  if (proposal.modeId === "custom") return kickoff;

  const midi = zonedTimeToUtc(
    proposal.localDate,
    PROPOSAL_CUTOFF_HOUR,
    proposal.timezone,
  );
  // Ouverte après midi, ou jouée le matin : seul le coup d'envoi compte.
  if (proposal.createdAt >= midi || midi >= proposal.startsAtUtc) {
    return kickoff;
  }
  return { at: midi, echeance: "midi" };
}

export async function expireStaleProposals(now = new Date()): Promise<{
  cancelled: number;
  awaitingEntry: number;
  overdue: number;
}> {
  // Les retards de paiement sont relevés AVANT l'annulation des propositions
  // dépassées : sinon une réservation annulée le même jour n'aurait jamais
  // averti personne.
  const overdue = await notifyOverduePayments();

  /*
   * Midi tombe au plus douze heures avant un créneau de minuit : un jour
   * d'avance suffit à couvrir tous les candidats, quel que soit le fuseau.
   * L'échéance exacte se calcule ensuite, proposition par proposition, dans
   * le fuseau de son lieu.
   */
  const horizon = new Date(now.getTime() + 36 * 3_600_000);
  const candidates = await db
    .select({
      id: proposals.id,
      status: proposals.status,
      localDate: proposals.localDate,
      timezone: proposals.timezone,
      startsAtUtc: proposals.startsAtUtc,
      createdAt: proposals.createdAt,
      modeId: proposals.modeId,
    })
    .from(proposals)
    .where(
      and(
        inArray(proposals.status, ["proposal", "reservation"]),
        lte(proposals.startsAtUtc, horizon),
      ),
    )
    .orderBy(asc(proposals.startsAtUtc), asc(proposals.id));

  let cancelled = 0;
  for (const candidate of candidates) {
    // Une réservation est complète : seul le coup d'envoi l'annule.
    const due =
      candidate.status === "reservation"
        ? { at: candidate.startsAtUtc, echeance: "coup-envoi" as const }
        : cancellationCutoff(candidate);
    if (due.at > now) continue;

    try {
      const annulation = await cancel(candidate.id, due.echeance, now);
      if (!annulation) continue;
      cancelled++;
      await announce(annulation);
    } catch (error) {
      // Une séance en échec ne doit pas bloquer les suivantes : la prochaine
      // passe la reprendra.
      logger.error(
        { err: error, proposalId: candidate.id },
        "annulation automatique non appliquée",
      );
    }
  }

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
    cancelled,
    awaitingEntry: Number(awaiting[0]?.total ?? 0),
    overdue,
  };
}

/**
 * Annule une séance sous verrou, places payées remboursées.
 *
 * L'état est relu verrouillé : entre la sélection et ici, le dernier joueur a
 * pu s'inscrire, ou la dernière place se régler. Rend `null` quand il n'y a
 * plus rien à annuler.
 */
async function cancel(
  proposalId: number,
  echeance: Echeance,
  now: Date,
): Promise<Annulation | null> {
  return db.transaction(async (tx) => {
    const proposal = await lockProposal(tx, proposalId);
    const encoreOuverte =
      echeance === "midi"
        ? proposal.status === "proposal"
        : proposal.status === "proposal" || proposal.status === "reservation";
    if (!encoreOuverte) return null;

    await tx
      .update(proposals)
      .set({ status: "cancelled", activeSlotKey: null, updatedAt: now })
      .where(eq(proposals.id, proposalId));

    // Un vote d'alternative en cours n'a plus d'objet (ALT-001).
    await tx
      .update(proposalPolls)
      .set({ status: "closed", activeProposalId: null, updatedAt: now })
      .where(eq(proposalPolls.activeProposalId, proposalId));

    const seats = await tx
      .select({
        playerId: proposalParticipants.playerId,
        hasPaid: proposalParticipants.hasPaid,
        paymentId: proposalParticipants.paymentId,
      })
      .from(proposalParticipants)
      .where(eq(proposalParticipants.proposalId, proposalId))
      // Ordre stable : les portefeuilles se verrouillent toujours dans le
      // même ordre, et deux traitements ne s'interbloquent pas.
      .orderBy(asc(proposalParticipants.playerId));

    const inscrits: Annulation["inscrits"] = [];
    let paidCount = 0;
    for (const seat of seats) {
      let refundedUno = 0;
      if (seat.hasPaid) {
        paidCount++;
        refundedUno = await refundSeat(tx, proposal, seat);
      }
      inscrits.push({ playerId: seat.playerId, refundedUno });
    }

    return { proposal, echeance, inscrits, paidCount };
  });
}

/**
 * Prévient les inscrits, l'arbitre et l'administration — après le commit, sur
 * `db` : une annulation revenue en arrière n'a rien à annoncer.
 */
async function announce(annulation: Annulation): Promise<void> {
  const { proposal, echeance, inscrits, paidCount } = annulation;
  const seance = {
    salle: proposal.venueName,
    jour: { jour: proposal.localDate },
    heure: proposal.localTimeLabel,
  };

  const raison: ErrorTemplate =
    echeance === "midi"
      ? gabarit(
          "{salle}, le {jour} à {heure} : la séance n'était pas complète à midi ({inscrits}/{minimum} joueurs), elle est annulée.",
          {
            ...seance,
            inscrits: proposal.participantCount,
            minimum: proposal.minParticipants,
          },
        )
      : proposal.status === "reservation"
        ? gabarit(
            "{salle}, le {jour} à {heure} : toutes les places n'ont pas été réglées à temps, la séance est annulée.",
            seance,
          )
        : gabarit(
            "{salle}, le {jour} à {heure} : la séance n'était pas complète au coup d'envoi, elle est annulée.",
            seance,
          );

  const destinataires = new Map(
    inscrits.map((inscrit) => [inscrit.playerId, inscrit.refundedUno]),
  );
  if (
    proposal.refereePlayerId !== null &&
    !destinataires.has(proposal.refereePlayerId)
  ) {
    destinataires.set(proposal.refereePlayerId, 0);
  }

  for (const [playerId, refundedUno] of destinataires) {
    await notifyPlayer(
      {
        playerId,
        eventKey: `proposal:${proposal.id}:cancelled`,
        title: gabarit("Séance annulée"),
        body:
          refundedUno > 0
            ? [
                raison,
                gabarit("{montant} UNO vous ont été remboursés.", {
                  montant: refundedUno,
                }),
              ]
            : raison,
        url: `/sessions/${proposal.id}`,
      },
      db,
    );
  }

  const refunded = inscrits.reduce((total, row) => total + row.refundedUno, 0);
  const detail =
    echeance === "midi"
      ? `annulée à midi : ${proposal.participantCount}/${proposal.minParticipants} inscrits.`
      : proposal.status === "reservation"
        ? `annulée au coup d'envoi : ${paidCount}/${proposal.participantCount} places réglées` +
          (refunded > 0 ? `, ${refunded} UNO remboursés.` : ".")
        : `annulée au coup d'envoi : ${proposal.participantCount}/${proposal.minParticipants} inscrits.`;

  await recordAdminEvent(
    {
      type: "proposal.cancelled",
      body:
        `${gameModeName(proposal.modeId)} du ${proposal.localDate} à ` +
        `${proposal.localTimeLabel}, ${proposal.venueName} — ${detail}`,
      entityType: "proposal",
      entityId: proposal.id,
      key: `proposal:${proposal.id}:cancelled`,
    },
    db,
  );
}
