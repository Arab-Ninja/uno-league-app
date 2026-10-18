import {
  and,
  count,
  countDistinct,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  lte,
  ne,
  sql,
  sum,
} from "drizzle-orm";
import {
  DEFAULT_TIMEZONE,
  todayIso,
  zonedTimeToUtc,
  type AdminKpis,
} from "@uno/shared";
import { db } from "../db/client.js";
import {
  deviceTokens,
  payments,
  players,
  proposalParticipants,
  proposals,
  users,
} from "../db/schema.js";

/**
 * Le tableau de bord de l'administration (ADMIN-015).
 *
 * Ce qui s'y lisait — le nombre de lignes de chaque table — ne disait rien de
 * la ligue. Ce qui compte au quotidien : combien de séances cherchent leurs
 * joueurs, attendent leurs paiements, sont confirmées ou restent à saisir ;
 * combien de joueurs viennent, et combien on peut joindre.
 *
 * Les comptes supprimés ou anonymisés ne comptent pas (ADMIN-012).
 */
export async function adminKpis(now = new Date()): Promise<AdminKpis> {
  const mois = todayIso(DEFAULT_TIMEZONE, now).slice(0, 7);
  const debutDuMois = zonedTimeToUtc(`${mois}-01`, 0, DEFAULT_TIMEZONE);
  const il7jours = new Date(now.getTime() - 7 * 86_400_000);
  const il30jours = new Date(now.getTime() - 30 * 86_400_000);
  const compteVivant = and(
    ne(users.status, "anonymized"),
    ne(users.status, "deleted"),
  );

  const statut = async (
    status: "proposal" | "reservation" | "session",
    avenir: boolean,
  ) => {
    const [row] = await db
      .select({ total: count() })
      .from(proposals)
      .where(
        and(
          eq(proposals.status, status),
          avenir
            ? gt(proposals.startsAtUtc, now)
            : lte(proposals.startsAtUtc, now),
          // Un match personnalisé se saisit par son organisateur (PRIV-003).
          ...(status === "session" && !avenir
            ? [ne(proposals.modeId, "custom")]
            : []),
        ),
      );
    return Number(row?.total ?? 0);
  };

  const [open, reservations, confirmed, toEnter] = await Promise.all([
    statut("proposal", true),
    statut("reservation", true),
    statut("session", true),
    statut("session", false),
  ]);

  const [played] = await db
    .select({
      total: count(),
      month: sql<number>`SUM(CASE WHEN ${proposals.startsAtUtc} >= ${debutDuMois} THEN 1 ELSE 0 END)`,
    })
    .from(proposals)
    .where(eq(proposals.status, "completed"));

  const [cancelled] = await db
    .select({ total: count() })
    .from(proposals)
    .where(
      and(
        eq(proposals.status, "cancelled"),
        gte(proposals.updatedAt, il30jours),
      ),
    );

  const ouvertes = await db
    .select({
      participantCount: proposals.participantCount,
      minParticipants: proposals.minParticipants,
      status: proposals.status,
    })
    .from(proposals)
    .where(
      and(
        inArray(proposals.status, ["proposal", "reservation", "session"]),
        gt(proposals.startsAtUtc, now),
      ),
    );
  const enCours = ouvertes.filter((row) => row.status === "proposal");
  const fillRate =
    enCours.length === 0
      ? null
      : enCours.reduce(
          (total, row) =>
            total + row.participantCount / Math.max(1, row.minParticipants),
          0,
        ) / enCours.length;

  const [joueurs] = await db
    .select({
      total: count(),
      new7d: sql<number>`SUM(CASE WHEN ${users.createdAt} >= ${il7jours} AND ${players.accountType} = 'player' THEN 1 ELSE 0 END)`,
      referees: sql<number>`SUM(CASE WHEN ${players.accountType} = 'referee' THEN 1 ELSE 0 END)`,
      optOut: sql<number>`SUM(CASE WHEN ${players.emailOptOutAt} IS NOT NULL THEN 1 ELSE 0 END)`,
    })
    .from(players)
    .innerJoin(users, eq(users.id, players.userId))
    .where(compteVivant);

  const [actifs] = await db
    .select({ total: countDistinct(proposalParticipants.playerId) })
    .from(proposalParticipants)
    .innerJoin(proposals, eq(proposals.id, proposalParticipants.proposalId))
    .where(
      and(
        eq(proposals.status, "completed"),
        gte(proposals.startsAtUtc, il30jours),
      ),
    );

  const [push] = await db
    .select({ total: countDistinct(deviceTokens.playerId) })
    .from(deviceTokens)
    .innerJoin(players, eq(players.id, deviceTokens.playerId))
    .innerJoin(users, eq(users.id, players.userId))
    .where(and(eq(deviceTokens.enabled, true), compteVivant));

  const [paye] = await db
    .select({
      total: count(),
      eur: sum(
        sql`CASE WHEN ${payments.method} LIKE 'stripe%' THEN ${payments.amountEurCents} ELSE 0 END`,
      ),
    })
    .from(payments)
    .where(
      and(
        eq(payments.status, "paid"),
        isNotNull(payments.paidAt),
        gte(payments.paidAt, debutDuMois),
      ),
    );

  const [retard] = await db
    .select({ total: count() })
    .from(proposalParticipants)
    .innerJoin(proposals, eq(proposals.id, proposalParticipants.proposalId))
    .where(
      and(
        eq(proposals.status, "reservation"),
        eq(proposalParticipants.hasPaid, false),
        isNotNull(proposals.paymentDeadline),
        lte(proposals.paymentDeadline, now),
      ),
    );

  const joueursTotal = Number(joueurs?.total ?? 0);
  const arbitres = Number(joueurs?.referees ?? 0);

  return {
    sessions: {
      open,
      reservations,
      confirmed,
      toEnter,
      playedThisMonth: Number(played?.month ?? 0),
      playedTotal: Number(played?.total ?? 0),
      cancelled30d: Number(cancelled?.total ?? 0),
      upcomingSignups: ouvertes.reduce(
        (total, row) => total + row.participantCount,
        0,
      ),
      fillRate,
    },
    players: {
      total: joueursTotal - arbitres,
      new7d: Number(joueurs?.new7d ?? 0),
      active30d: Number(actifs?.total ?? 0),
      referees: arbitres,
    },
    reach: {
      pushEnabled: Number(push?.total ?? 0),
      emailOptOut: Number(joueurs?.optOut ?? 0),
    },
    payments: {
      paidThisMonth: Number(paye?.total ?? 0),
      eurThisMonthCents: Number(paye?.eur ?? 0),
      overdue: Number(retard?.total ?? 0),
    },
  };
}
