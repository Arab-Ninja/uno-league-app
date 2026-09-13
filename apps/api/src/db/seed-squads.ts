import { eq, sql } from "drizzle-orm";
import { SQUAD_ROSTER_SIZE, SQUAD_SEAT_PRICE_UNO, challengeExpiry, transferExpiry } from "@uno/shared";
import { db } from "./client.js";
import {
  squadChallengeSeats,
  squadChallenges,
  squadMembers,
  squadMessages,
  squadTransfers,
  squadTreasuryTransactions,
  squads,
} from "./schema.js";

/**
 * Jeu d'essai du mode SQUAD (SQUAD-007).
 *
 * Il existe pour une raison simple : **tout essayer à la main demanderait dix
 * comptes**, quatre clubs, des contributions, une négociation et un transfert,
 * soit une demi-heure de clics avant de pouvoir juger quoi que ce soit.
 *
 * Il pose donc deux choses de nature différente :
 *
 *  - un **passé** — cotes, bilans, séries — écrit directement, parce qu'il n'a
 *    pas besoin d'être rejoué pour être crédible ;
 *  - un **présent** cohérent — un défi à répondre, un autre prêt à jouer, une
 *    offre de transfert à trancher — dans lequel chaque écran a quelque chose
 *    à montrer et chaque bouton quelque chose à faire.
 *
 * Le compte administrateur est **fondateur** du premier club : c'est de là
 * qu'on peut tout exercer — composer, engager la caisse, répondre à un défi,
 * céder un joueur.
 */

interface SeedSquadPlayer {
  playerId: number;
}

export interface SquadSeedResult {
  squadsCreated: number;
  challengesCreated: number;
  transfersCreated: number;
}

/** Un club du jeu d'essai, avec son passé sportif. */
interface DemoSquad {
  name: string;
  slug: string;
  description: string;
  rating: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  totalUnoWon: number;
  treasury: number;
}

const DEMO_SQUADS: DemoSquad[] = [
  {
    name: "Les Corsaires",
    slug: "les-corsaires",
    description: "Fondé sur un pari perdu. Toujours pas remboursé.",
    rating: 1085,
    matchesPlayed: 8,
    wins: 5,
    losses: 2,
    draws: 1,
    streak: 2,
    totalUnoWon: 1400,
    treasury: 3000,
  },
  {
    name: "Les Faucons",
    slug: "les-faucons",
    description: "On presse haut, on parle peu.",
    rating: 1240,
    matchesPlayed: 12,
    wins: 9,
    losses: 3,
    draws: 0,
    streak: 4,
    totalUnoWon: 3100,
    treasury: 5200,
  },
  {
    name: "Les Sentinelles",
    slug: "les-sentinelles",
    description: "Défense d'abord. Le reste suivra.",
    rating: 965,
    matchesPlayed: 6,
    wins: 2,
    losses: 4,
    draws: 0,
    streak: -2,
    totalUnoWon: 300,
    treasury: 1500,
  },
  {
    name: "Les Loups Gris",
    slug: "les-loups-gris",
    description: "Une reconstruction. Longue.",
    rating: 880,
    matchesPlayed: 9,
    wins: 2,
    losses: 6,
    draws: 1,
    streak: -3,
    totalUnoWon: 200,
    treasury: 600,
  },
];

/**
 * Crée les clubs, leurs effectifs, et de quoi cliquer partout.
 *
 * `adminPlayerId` devient fondateur du premier club. Les autres membres sont
 * pris dans le vivier de démonstration ; chacun n'appartient qu'à un club, ce
 * que la base impose de toute façon.
 */
export async function seedSquads(
  adminPlayerId: number,
  pool: SeedSquadPlayer[],
): Promise<SquadSeedResult> {
  const needed = DEMO_SQUADS.length * SQUAD_ROSTER_SIZE;
  if (pool.length < needed) {
    // Mieux vaut ne rien poser qu'un club à trois joueurs : la composition
    // d'un défi en exige cinq, et l'essai buterait dessus sans explication.
    return { squadsCreated: 0, challengesCreated: 0, transfersCreated: 0 };
  }

  const now = new Date();
  const squadIds: number[] = [];
  const rosters: number[][] = [];
  let cursor = 0;

  for (const [index, demo] of DEMO_SQUADS.entries()) {
    // Le fondateur : l'administrateur pour le premier club, un joueur du
    // vivier pour les autres.
    const founderId = index === 0 ? adminPlayerId : pool[cursor++]!.playerId;

    const inserted = await db.insert(squads).values({
      name: demo.name,
      slug: demo.slug,
      description: demo.description,
      founderPlayerId: founderId,
      rating: demo.rating,
      matchesPlayed: demo.matchesPlayed,
      wins: demo.wins,
      losses: demo.losses,
      draws: demo.draws,
      streak: demo.streak,
      totalUnoWon: demo.totalUnoWon,
      treasuryAvailable: demo.treasury,
      activeName: demo.name,
      activeSlug: demo.slug,
    });
    const squadId = Number(inserted[0].insertId);
    squadIds.push(squadId);

    const members = [founderId];
    await db.insert(squadMembers).values({
      squadId,
      playerId: founderId,
      role: "founder",
    });

    // Quatre coéquipiers, dont un capitaine : de quoi remplir une feuille de
    // cinq et montrer la hiérarchie des rôles.
    for (let slot = 1; slot < SQUAD_ROSTER_SIZE; slot++) {
      const playerId = pool[cursor++]!.playerId;
      members.push(playerId);
      await db.insert(squadMembers).values({
        squadId,
        playerId,
        role: slot === 1 ? "captain" : "member",
      });
    }
    rosters.push(members);

    await db.insert(squadTreasuryTransactions).values({
      squadId,
      playerId: founderId,
      type: "contribution",
      amount: demo.treasury,
      availableAfter: demo.treasury,
      lockedAfter: 0,
      description: "Dotation initiale du club",
      referenceType: "player",
      referenceId: founderId,
    });

    await db.insert(squadMessages).values({
      scope: "squad",
      scopeId: squadId,
      squadId,
      playerId: founderId,
      body:
        index === 0
          ? "Bienvenue. On joue au ballon, pas aux statistiques."
          : "Premier rassemblement vendredi. Soyez à l'heure.",
    });
  }

  const [corsaires, faucons, sentinelles] = squadIds as [number, number, number, number];
  const [rosterCorsaires, rosterFaucons, rosterSentinelles] = rosters as [
    number[],
    number[],
    number[],
    number[],
  ];

  const challengesCreated = await seedChallenges(
    { corsaires, faucons, sentinelles },
    { corsaires: rosterCorsaires, sentinelles: rosterSentinelles },
    now,
  );

  const transfersCreated = await seedTransfers(
    { corsaires, faucons },
    { corsaires: rosterCorsaires, faucons: rosterFaucons },
    now,
  );

  return {
    squadsCreated: DEMO_SQUADS.length,
    challengesCreated,
    transfersCreated,
  };
}

/**
 * Deux défis, dans les deux états qui se jouent différemment.
 *
 * Le premier attend une réponse du club de l'administrateur — il y a un bouton
 * à presser dès l'ouverture de l'écran. Le second est accepté, ses deux
 * feuilles sont remplies et réglées : il ne manque que « Créer le match ».
 */
async function seedChallenges(
  ids: { corsaires: number; faucons: number; sentinelles: number },
  rosters: { corsaires: number[]; sentinelles: number[] },
  now: Date,
): Promise<number> {
  const inDays = (days: number) =>
    new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  // --- 1. Un défi qui attend la réponse des Corsaires ----------------------
  const stake = 400;
  await db.insert(squadChallenges).values({
    challengerSquadId: ids.faucons,
    challengedSquadId: ids.corsaires,
    createdByPlayerId: rosters.corsaires[0]!,
    venueId: "arena",
    venueName: "Arena",
    scheduledAtUtc: inDays(6),
    durationMinutes: 60,
    initialStakeUno: stake,
    currentStakeUno: stake,
    negotiationRound: 1,
    awaitingSquadId: ids.corsaires,
    status: "pending",
    expiresAt: challengeExpiry(now),
  });

  // --- 2. Un défi accepté, prêt à être joué --------------------------------
  const readyStake = 300;
  const accepted = await db.insert(squadChallenges).values({
    challengerSquadId: ids.corsaires,
    challengedSquadId: ids.sentinelles,
    createdByPlayerId: rosters.corsaires[0]!,
    venueId: "yc-five",
    venueName: "YC Five",
    scheduledAtUtc: inDays(3),
    durationMinutes: 60,
    initialStakeUno: readyStake,
    currentStakeUno: readyStake,
    negotiationRound: 1,
    awaitingSquadId: null,
    status: "accepted",
    expiresAt: challengeExpiry(now),
  });
  const challengeId = Number(accepted[0].insertId);

  /**
   * Les mises sont séquestrées, comme le ferait l'acceptation.
   *
   * Une caisse dont l'engagé ne correspondrait pas au défi accepté afficherait
   * un total faux, et le règlement rendrait des UNO qui n'ont jamais été pris.
   */
  for (const squadId of [ids.corsaires, ids.sentinelles]) {
    await db
      .update(squads)
      .set({
        treasuryAvailable: sql`${squads.treasuryAvailable} - ${readyStake}`,
        treasuryLocked: sql`${squads.treasuryLocked} + ${readyStake}`,
      })
      .where(eq(squads.id, squadId));

    const [row] = await db
      .select({
        available: squads.treasuryAvailable,
        locked: squads.treasuryLocked,
      })
      .from(squads)
      .where(eq(squads.id, squadId))
      .limit(1);

    await db.insert(squadTreasuryTransactions).values({
      squadId,
      type: "challenge_lock",
      // Le total possédé ne bouge pas : la mise passe du disponible à l'engagé.
      amount: 0,
      availableAfter: row?.available ?? 0,
      lockedAfter: row?.locked ?? 0,
      referenceType: "challenge",
      referenceId: challengeId,
      description: `Mise engagée — défi #${challengeId}`,
      idempotencyKey: `squad:${squadId}:challenge:${challengeId}:lock`,
    });
  }

  // Les dix places, tenues et réglées par les deux caisses.
  const price = SQUAD_SEAT_PRICE_UNO[60];
  for (const [squadId, roster] of [
    [ids.corsaires, rosters.corsaires],
    [ids.sentinelles, rosters.sentinelles],
  ] as const) {
    for (const playerId of roster) {
      await db.insert(squadChallengeSeats).values({
        challengeId,
        squadId,
        playerId,
        priceUno: price,
        status: "paid",
        paidBy: "treasury",
        paidAt: now,
      });
    }

    const total = price * roster.length;
    await db
      .update(squads)
      .set({ treasuryAvailable: sql`${squads.treasuryAvailable} - ${total}` })
      .where(eq(squads.id, squadId));
  }

  await db.insert(squadMessages).values({
    scope: "challenge",
    scopeId: challengeId,
    squadId: ids.corsaires,
    playerId: rosters.corsaires[0]!,
    body: "Feuilles complètes de notre côté. À vendredi.",
  });

  return 2;
}

/**
 * Un dossier de transfert à trancher, et deux joueurs sur le marché.
 *
 * Le dossier attend la décision du club de l'administrateur : il voit donc
 * « Céder / Contre-offrir / Refuser » dès qu'il ouvre l'écran. Les deux
 * joueurs affichés ailleurs lui donnent de quoi faire une offre à son tour.
 */
async function seedTransfers(
  ids: { corsaires: number; faucons: number },
  rosters: { corsaires: number[]; faucons: number[] },
  now: Date,
): Promise<number> {
  // Un membre ordinaire des Corsaires — jamais le fondateur, qui n'est pas
  // transférable.
  const convoite = rosters.corsaires[SQUAD_ROSTER_SIZE - 1]!;

  await db.insert(squadTransfers).values({
    playerId: convoite,
    fromSquadId: ids.corsaires,
    toSquadId: ids.faucons,
    createdByPlayerId: rosters.faucons[0]!,
    feeUno: 700,
    signingBonusUno: 150,
    negotiationRound: 1,
    status: "pending",
    expiresAt: transferExpiry(now),
  });

  // Deux joueurs des Faucons affichés comme cessibles : de quoi essayer le
  // rôle d'acheteur sans avoir à demander un service à un autre club.
  for (const playerId of rosters.faucons.slice(2, 4)) {
    await db
      .update(squadMembers)
      .set({ listedAt: now })
      .where(eq(squadMembers.playerId, playerId));
  }

  return 1;
}
