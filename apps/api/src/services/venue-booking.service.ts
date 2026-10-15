import { and, gt, inArray, isNull, lte } from "drizzle-orm";
import { VENUE_BOOKING_ALERT } from "@uno/shared";
import { db } from "../db/client.js";
import { proposals } from "../db/schema.js";
import { recordAdminEvent } from "./admin-events.service.js";

/**
 * « Pense à réserver le terrain » (VENUE-001).
 *
 * Le terrain se loue chez l'exploitant — SportFinders pour les centres five —
 * et l'application ne peut pas l'y lire. Le risque est donc humain : une
 * session se remplit, la date approche, et le dernier terrain du centre part
 * à quelqu'un d'autre pendant qu'on attendait le dixième inscrit. C'est
 * arrivé pour un amical à huit sur dix, la veille du match.
 *
 * L'entretien périodique de l'API passe ici toutes les cinq minutes. Une
 * session est signalée quand elle est presque complète
 * (`VENUE_BOOKING_ALERT.fillRatio`), qu'elle se joue dans moins de
 * `hoursBefore` heures et que son terrain n'est pas déclaré réservé. Le
 * signal part dans le flux de l'administration, avec son push.
 *
 * **Une seule fois par créneau.** La clé de l'évènement porte l'heure du coup
 * d'envoi : la même session ne sonne pas toutes les cinq minutes, mais une
 * session déplacée sonne de nouveau, puisque son terrain est à reprendre.
 *
 * Le match personnalisé (PRIV-003) n'est pas concerné : son organisateur
 * réserve lui-même, hors de la ligue.
 */
export async function alertUnbookedVenues(now = new Date()): Promise<number> {
  const horizon = new Date(
    now.getTime() + VENUE_BOOKING_ALERT.hoursBefore * 3_600_000,
  );

  const rows = await db
    .select({
      id: proposals.id,
      venueName: proposals.venueName,
      localDate: proposals.localDate,
      localTimeLabel: proposals.localTimeLabel,
      startsAtUtc: proposals.startsAtUtc,
      participantCount: proposals.participantCount,
      minParticipants: proposals.minParticipants,
    })
    .from(proposals)
    .where(
      and(
        inArray(proposals.status, ["proposal", "reservation", "session"]),
        isNull(proposals.venueBookedAt),
        isNull(proposals.customDetails),
        gt(proposals.startsAtUtc, now),
        lte(proposals.startsAtUtc, horizon),
      ),
    );

  let alerted = 0;
  for (const row of rows) {
    const needed = Math.ceil(
      row.minParticipants * VENUE_BOOKING_ALERT.fillRatio,
    );
    if (row.participantCount < needed) continue;

    const written = await recordAdminEvent(
      {
        type: "proposal.venue",
        body:
          `${row.venueName}, ${row.localDate} ${row.localTimeLabel} : ` +
          `${row.participantCount}/${row.minParticipants} inscrits, et le ` +
          "terrain n'est pas encore réservé.",
        entityType: "proposal",
        entityId: row.id,
        key: `proposal:${row.id}:venue:${row.startsAtUtc.getTime()}`,
      },
      db,
    );
    if (written) alerted++;
  }

  return alerted;
}
