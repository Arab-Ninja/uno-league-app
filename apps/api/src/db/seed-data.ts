import { count } from "drizzle-orm";
import {
  DEFAULT_TIMEZONE,
  VENUES,
  addDaysIso,
  eurToUno,
  findSlot,
  getGameMode,
  todayIso,
  zonedTimeToUtc,
  type Division,
  type PlayerPosition,
} from "@uno/shared";
import { db } from "./client.js";
import {
  announcements,
  players,
  proposalParticipants,
  proposals,
  shopItems,
  users,
} from "./schema.js";
import { hashPassword } from "../lib/password.js";
import { credit } from "../services/ledger.service.js";

/**
 * Jeu de données de démonstration.
 *
 * Réservé aux environnements de développement et de recette (CDC §15). Il est
 * idempotent : relancé, il ne duplique rien.
 *
 * Tous les comptes créés partagent le mot de passe `Demo2026!`, qui respecte
 * la politique AUTH-002. Ces comptes n'ont aucune valeur en production.
 */

const DEMO_PASSWORD = "Demo2026!";

const DEMO_PLAYERS: {
  firstName: string;
  lastName: string;
  division: Division;
  position: PlayerPosition;
  nationality: string;
  goals: number;
  assists: number;
  defenses: number;
  saves: number;
  motm: number;
  xp: number;
}[] = [
  { firstName: "Yassine", position: "MIL", lastName: "Bakhtaoui", division: "D1", nationality: "BE", goals: 34, assists: 18, defenses: 12, saves: 3, motm: 6, xp: 2400 },
  { firstName: "Mehdi", position: "ATT", lastName: "Ouali", division: "D1", nationality: "MA", goals: 31, assists: 21, defenses: 9, saves: 1, motm: 5, xp: 2210 },
  { firstName: "Lucas", position: "ATT", lastName: "Dubois", division: "D1", nationality: "FR", goals: 28, assists: 12, defenses: 20, saves: 2, motm: 4, xp: 1980 },
  { firstName: "Samir", position: "MIL", lastName: "Haddad", division: "D1", nationality: "DZ", goals: 22, assists: 25, defenses: 14, saves: 0, motm: 3, xp: 1870 },
  { firstName: "Thomas", position: "GB", lastName: "Peeters", division: "D1", nationality: "BE", goals: 19, assists: 9, defenses: 26, saves: 31, motm: 2, xp: 1650 },
  { firstName: "Karim", position: "ATT", lastName: "Benali", division: "D2", nationality: "MA", goals: 24, assists: 14, defenses: 11, saves: 0, motm: 4, xp: 1420 },
  { firstName: "Noah", position: "MIL", lastName: "Vermeulen", division: "D2", nationality: "BE", goals: 21, assists: 16, defenses: 13, saves: 2, motm: 3, xp: 1310 },
  { firstName: "Enzo", position: "DEF", lastName: "Moreau", division: "D2", nationality: "FR", goals: 18, assists: 11, defenses: 17, saves: 1, motm: 2, xp: 1180 },
  { firstName: "Ilyas", position: "MIL", lastName: "Cherif", division: "D2", nationality: "DZ", goals: 15, assists: 19, defenses: 8, saves: 0, motm: 2, xp: 1050 },
  { firstName: "Diego", position: "GB", lastName: "Santos", division: "D2", nationality: "PT", goals: 13, assists: 7, defenses: 22, saves: 24, motm: 1, xp: 940 },
  { firstName: "Adam", position: "ATT", lastName: "Lefebvre", division: "D3", nationality: "FR", goals: 11, assists: 8, defenses: 6, saves: 0, motm: 1, xp: 620 },
  { firstName: "Rayan", position: "MIL", lastName: "Amrani", division: "D3", nationality: "MA", goals: 9, assists: 12, defenses: 7, saves: 1, motm: 1, xp: 540 },
  { firstName: "Jonas", position: "GB", lastName: "Claes", division: "D3", nationality: "BE", goals: 7, assists: 5, defenses: 14, saves: 18, motm: 0, xp: 480 },
  { firstName: "Marco", position: "DEF", lastName: "Rossi", division: "D3", nationality: "IT", goals: 6, assists: 9, defenses: 5, saves: 0, motm: 0, xp: 410 },
  { firstName: "Elias", position: "DEF", lastName: "Nkemba", division: "D3", nationality: "CD", goals: 4, assists: 6, defenses: 9, saves: 2, motm: 0, xp: 330 },
];

const DEMO_SHOP_ITEMS = [
  { name: "Casque audio sans fil", category: "headphones" as const, priceUno: 1800, description: "Casque circum-auriculaire à réduction de bruit active, 30 h d'autonomie." },
  { name: "Écouteurs sport", category: "headphones" as const, priceUno: 850, description: "Écouteurs intra-auriculaires résistants à la transpiration, maintien sécurisé." },
  { name: "Montre connectée", category: "watches" as const, priceUno: 2400, description: "Suivi cardiaque, GPS intégré et mesure des performances sportives." },
  { name: "Chronographe classique", category: "watches" as const, priceUno: 3200, description: "Boîtier acier 42 mm, bracelet cuir, étanche 50 m." },
  { name: "Chaussures de futsal", category: "shoes" as const, priceUno: 1500, description: "Semelle gomme adhérente pour surface indoor, tige microfibre." },
  { name: "Baskets urbaines", category: "shoes" as const, priceUno: 1250, description: "Modèle polyvalent, amorti souple, coloris sobre." },
  { name: "Maillot UNO League", category: "clothes" as const, priceUno: 600, description: "Maillot officiel en tissu respirant, floquage UNO League." },
  { name: "Survêtement d'entraînement", category: "clothes" as const, priceUno: 1100, description: "Ensemble veste et pantalon, coupe ajustée." },
  { name: "Sac de sport", category: "accessories" as const, priceUno: 700, description: "Compartiment chaussures séparé, 45 litres." },
  { name: "Gourde isotherme", category: "accessories" as const, priceUno: 300, description: "Acier inoxydable 750 ml, garde au frais 12 h." },
];

async function createDemoPlayer(
  passwordHash: string,
  data: (typeof DEMO_PLAYERS)[number],
  index: number,
): Promise<void> {
  const email = `${data.firstName}.${data.lastName}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z.]/g, "");

  await db.transaction(async (tx) => {
    const insertedUser = await tx.insert(users).values({
      email: `${email}@demo.unoleague.app`,
      passwordHash,
      role: "user",
      status: "active",
    });
    const userId = Number(insertedUser[0].insertId);

    const insertedPlayer = await tx.insert(players).values({
      userId,
      firstName: data.firstName,
      lastName: data.lastName,
      displayName: `${data.firstName} ${data.lastName}`,
      nationality: data.nationality,
      dateOfBirth: `19${85 + (index % 15)}-0${(index % 9) + 1}-1${index % 9}`,
      division: data.division,
      position: data.position,
      matchesPlayed: Math.max(1, Math.floor((data.goals + data.assists) / 3)),
      unoPoints: 0,
      xp: data.xp,
      level: Math.floor(data.xp / 500) + 1,
      goals: data.goals,
      assists: data.assists,
      defenses: data.defenses,
      saves: data.saves,
      motm: data.motm,
    });
    const playerId = Number(insertedPlayer[0].insertId);

    // Le solde passe par le registre : l'audit de cohérence reste vrai.
    await credit(tx, {
      playerId,
      amount: 1000,
      type: "signup_bonus",
      description: "Bonus de bienvenue",
      referenceType: "signup",
      referenceId: playerId,
      idempotencyKey: `signup:${playerId}`,
    });

    await credit(tx, {
      playerId,
      amount: 250 + index * 40,
      type: "reward",
      description: "Récompenses de saison",
      referenceType: "seed",
      referenceId: playerId,
      idempotencyKey: `seed:reward:${playerId}`,
    });
  });
}

export interface SeedResult {
  playersCreated: number;
  shopItemsCreated: number;
  announcementsCreated: number;
  proposalsCreated: number;
  skipped: boolean;
}

export async function seedDemoData(): Promise<SeedResult> {
  const [existing] = await db.select({ total: count() }).from(players);
  // Idempotence : au-delà du seul compte administrateur, on ne rejoue rien.
  if (Number(existing?.total ?? 0) > 1) {
    return {
      playersCreated: 0,
      shopItemsCreated: 0,
      announcementsCreated: 0,
      proposalsCreated: 0,
      skipped: true,
    };
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  for (const [index, data] of DEMO_PLAYERS.entries()) {
    await createDemoPlayer(passwordHash, data, index);
  }

  await db.insert(shopItems).values(
    DEMO_SHOP_ITEMS.map((item) => ({
      name: item.name,
      description: item.description,
      category: item.category,
      priceUno: item.priceUno,
      priceEuros: String(item.priceUno / 10),
      images: [],
      available: true,
      stock: 25,
    })),
  );

  await db.insert(announcements).values([
    {
      type: "info" as const,
      title: "Ouverture de la saison 2026",
      content:
        "La nouvelle saison démarre. Les propositions de sessions sont ouvertes pour les trois divisions. Pensez à créer vos créneaux au moins deux jours à l'avance.",
      status: "published" as const,
      publishedAt: new Date(),
    },
    {
      type: "reward" as const,
      title: "Barème de récompenses mis à jour",
      content:
        "Meilleur buteur : 250 UNO en D1, 200 en D2, 150 en D3. Meilleur passeur et meilleur défenseur : 150 / 100 / 75 UNO. Meilleure équipe : 20 UNO. Participation : 10 UNO.",
      status: "published" as const,
      publishedAt: new Date(Date.now() - 86_400_000),
    },
    {
      type: "maintenance" as const,
      title: "Maintenance planifiée",
      content:
        "Une maintenance technique est prévue dimanche entre 2 h et 4 h du matin. L'application restera consultable, les paiements seront momentanément indisponibles.",
      status: "published" as const,
      publishedAt: new Date(Date.now() - 3 * 86_400_000),
    },
  ]);

  const proposalsCreated = await seedProposals();

  return {
    playersCreated: DEMO_PLAYERS.length,
    shopItemsCreated: DEMO_SHOP_ITEMS.length,
    announcementsCreated: 3,
    proposalsCreated,
    skipped: false,
  };
}

/** Crée quelques propositions à venir, avec des participants déjà inscrits. */
async function seedProposals(): Promise<number> {
  const roster = await db
    .select({ id: players.id, division: players.division })
    .from(players)
    .orderBy(players.id);

  if (roster.length === 0) return 0;

  const today = todayIso(DEFAULT_TIMEZONE);
  let created = 0;

  const plans: { modeId: string; venueIndex: number; slotHour: number; dayOffset: number; joiners: number }[] = [
    { modeId: "league", venueIndex: 0, slotHour: 18, dayOffset: 3, joiners: 8 },
    { modeId: "league", venueIndex: 1, slotHour: 20, dayOffset: 5, joiners: 4 },
    { modeId: "friendly", venueIndex: 2, slotHour: 19, dayOffset: 4, joiners: 6 },
    { modeId: "friendly", venueIndex: 3, slotHour: 21, dayOffset: 6, joiners: 3 },
  ];

  for (const plan of plans) {
    const mode = getGameMode(plan.modeId);
    const venue = VENUES[plan.venueIndex];
    if (!mode || !venue) continue;

    const slot = findSlot(mode, plan.slotHour);
    if (!slot) continue;

    const date = addDaysIso(today, plan.dayOffset);
    // La division de la proposition est celle de son créateur pour League.
    const eligible = mode.divisionLocked
      ? roster.filter((player) => player.division === "D1")
      : roster;
    const creator = eligible[0];
    if (!creator) continue;

    const participants = eligible.slice(0, Math.min(plan.joiners, eligible.length));

    await db.transaction(async (tx) => {
      const inserted = await tx.insert(proposals).values({
        startsAtUtc: zonedTimeToUtc(date, slot.startHour, venue.timezone),
        localDate: date,
        slotStartHour: slot.startHour,
        localTimeLabel: slot.label,
        timezone: venue.timezone,
        venueId: venue.id,
        venueName: venue.name,
        modeId: mode.id,
        division: mode.divisionLocked ? "D1" : null,
        minParticipants: mode.minParticipants,
        priceEur: mode.priceEur,
        priceUno: eurToUno(mode.priceEur),
        status: "proposal",
        participantCount: participants.length,
        creatorPlayerId: creator.id,
        activeSlotKey: `${venue.id}|${date}|${slot.startHour}|${mode.id}`,
      });

      const proposalId = Number(inserted[0].insertId);
      await tx.insert(proposalParticipants).values(
        participants.map((player) => ({ proposalId, playerId: player.id })),
      );
    });

    created++;
  }

  return created;
}

export const DEMO_ACCOUNT_PASSWORD = DEMO_PASSWORD;
