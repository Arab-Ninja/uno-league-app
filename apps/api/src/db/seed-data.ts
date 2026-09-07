import { count, eq } from "drizzle-orm";
import {
  DEFAULT_TIMEZONE,
  TEAM_SIZE,
  VENUES,
  requiresSize,
  sizesFor,
  addDaysIso,
  eurToUno,
  findSlot,
  getGameMode,
  todayIso,
  zonedTimeToUtc,
  type Division,
  type PlayerPosition,
  type ShopCategory,
  type SizeKind,
} from "@uno/shared";
import { db } from "./client.js";
import {
  announcements,
  players,
  productReviews,
  proposalParticipants,
  proposalSubstitutes,
  proposals,
  shopItems,
  users,
  venues,
} from "./schema.js";
import { hashPassword } from "../lib/password.js";
import { storeImage } from "../storage/index.js";
import { productImagePng } from "./seed-images.js";
import { credit } from "../services/ledger.service.js";
import { payProposal } from "../services/payments.service.js";
import {
  completeSession,
  generateTeams,
  listMatches,
  reportMatch,
  validateMatch,
} from "../services/matches.service.js";
import { createOrder, updateOrderStatus } from "../services/orders.service.js";

/**
 * Jeu de données de démonstration.
 *
 * Réservé aux environnements de développement et de recette (CDC §15). Il est
 * idempotent : relancé, il ne duplique rien.
 *
 * Deux principes gouvernent ce fichier.
 *
 *  1. **Tout passe par le domaine.** Les paiements, les tirages d'équipes, les
 *     rapports de match, les validations, les clôtures et les commandes sont
 *     produits par les mêmes fonctions que l'application. Le jeu de démo ne
 *     peut donc pas contenir d'état impossible : les soldes découlent du
 *     registre, les statistiques des rapports validés, les récompenses du
 *     barème. Seule la création des propositions est écrite directement en
 *     base, parce qu'une session passée ne peut pas être proposée par
 *     `createProposal` (délai minimum de deux jours, CAL-004).
 *
 *  2. **Tout est reproductible.** Les scores et les statistiques viennent d'un
 *     générateur pseudo-aléatoire à graine fixe : deux bases fraîchement
 *     semées sont identiques, ce qui rend les captures d'écran et les tests
 *     manuels comparables d'une machine à l'autre.
 *
 * Tous les comptes créés partagent le mot de passe `Demo2026!`, qui respecte
 * la politique AUTH-002. Ces comptes n'ont aucune valeur en production.
 */

const DEMO_PASSWORD = "Demo2026!";

/**
 * Générateur déterministe (mulberry32). Volontairement simple : il ne sert
 * qu'à peupler une base de démonstration, jamais à produire un secret.
 */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

// ---------------------------------------------------------------------------
// Effectif
// ---------------------------------------------------------------------------

interface RosterEntry {
  firstName: string;
  lastName: string;
  division: Division;
  position: PlayerPosition;
  nationality: string;
}

/**
 * 48 joueurs, seize par division : une session de ligue en réunit quinze
 * (GAME_MODES.league.minParticipants), il en faut donc au moins autant dans
 * chaque division pour que le calendrier de démonstration soit crédible.
 */
const ROSTER: RosterEntry[] = [
  // Division 1
  { firstName: "Yassine", lastName: "Bakhtaoui", division: "D1", position: "MIL", nationality: "BE" },
  { firstName: "Mehdi", lastName: "Ouali", division: "D1", position: "ATT", nationality: "MA" },
  { firstName: "Lucas", lastName: "Dubois", division: "D1", position: "ATT", nationality: "FR" },
  { firstName: "Samir", lastName: "Haddad", division: "D1", position: "MIL", nationality: "DZ" },
  { firstName: "Thomas", lastName: "Peeters", division: "D1", position: "GB", nationality: "BE" },
  { firstName: "Rayan", lastName: "Belkacem", division: "D1", position: "ATT", nationality: "DZ" },
  { firstName: "Nathan", lastName: "Willems", division: "D1", position: "DEF", nationality: "BE" },
  { firstName: "Youssef", lastName: "Amrani", division: "D1", position: "MIL", nationality: "MA" },
  { firstName: "Antoine", lastName: "Leroy", division: "D1", position: "DEF", nationality: "FR" },
  { firstName: "Bilal", lastName: "Saidi", division: "D1", position: "MIL", nationality: "MA" },
  { firstName: "Maxime", lastName: "Janssens", division: "D1", position: "GB", nationality: "BE" },
  { firstName: "Ismaël", lastName: "Traoré", division: "D1", position: "DEF", nationality: "ML" },
  { firstName: "Gauthier", lastName: "Dupont", division: "D1", position: "DEF", nationality: "BE" },
  { firstName: "Anas", lastName: "Cherkaoui", division: "D1", position: "ATT", nationality: "MA" },
  { firstName: "Robin", lastName: "De Smet", division: "D1", position: "MIL", nationality: "NL" },
  { firstName: "Sofiane", lastName: "Meziane", division: "D1", position: "ATT", nationality: "DZ" },

  // Division 2
  { firstName: "Karim", lastName: "Benali", division: "D2", position: "ATT", nationality: "MA" },
  { firstName: "Noah", lastName: "Vermeulen", division: "D2", position: "MIL", nationality: "BE" },
  { firstName: "Enzo", lastName: "Moreau", division: "D2", position: "DEF", nationality: "FR" },
  { firstName: "Ilyas", lastName: "Cherif", division: "D2", position: "MIL", nationality: "DZ" },
  { firstName: "Diego", lastName: "Santos", division: "D2", position: "GB", nationality: "PT" },
  { firstName: "Julien", lastName: "Mertens", division: "D2", position: "DEF", nationality: "BE" },
  { firstName: "Walid", lastName: "Benjelloun", division: "D2", position: "ATT", nationality: "MA" },
  { firstName: "Simon", lastName: "Claeys", division: "D2", position: "GB", nationality: "BE" },
  { firstName: "Amine", lastName: "Zerrouki", division: "D2", position: "MIL", nationality: "DZ" },
  { firstName: "Tristan", lastName: "Lemaire", division: "D2", position: "ATT", nationality: "FR" },
  { firstName: "Bastien", lastName: "Goossens", division: "D2", position: "DEF", nationality: "BE" },
  { firstName: "Hamza", lastName: "Idrissi", division: "D2", position: "MIL", nationality: "MA" },
  { firstName: "Léo", lastName: "Bernard", division: "D2", position: "ATT", nationality: "FR" },
  { firstName: "Kevin", lastName: "Van Damme", division: "D2", position: "DEF", nationality: "BE" },
  { firstName: "Nabil", lastName: "Ferhat", division: "D2", position: "MIL", nationality: "DZ" },
  { firstName: "Quentin", lastName: "Renard", division: "D2", position: "ATT", nationality: "BE" },

  // Division 3
  { firstName: "Adam", lastName: "Lefebvre", division: "D3", position: "ATT", nationality: "FR" },
  { firstName: "Zakaria", lastName: "Amrani", division: "D3", position: "MIL", nationality: "MA" },
  { firstName: "Jonas", lastName: "Claes", division: "D3", position: "GB", nationality: "BE" },
  { firstName: "Marco", lastName: "Rossi", division: "D3", position: "DEF", nationality: "IT" },
  { firstName: "Elias", lastName: "Nkemba", division: "D3", position: "DEF", nationality: "CD" },
  { firstName: "Timéo", lastName: "Girard", division: "D3", position: "MIL", nationality: "FR" },
  { firstName: "Farid", lastName: "Boulahia", division: "D3", position: "ATT", nationality: "DZ" },
  { firstName: "Victor", lastName: "Maes", division: "D3", position: "GB", nationality: "BE" },
  { firstName: "Malik", lastName: "Sow", division: "D3", position: "DEF", nationality: "SN" },
  { firstName: "Jules", lastName: "Pauwels", division: "D3", position: "MIL", nationality: "BE" },
  { firstName: "Ayoub", lastName: "Mansouri", division: "D3", position: "ATT", nationality: "MA" },
  { firstName: "Nicolas", lastName: "Petit", division: "D3", position: "DEF", nationality: "FR" },
  { firstName: "Owen", lastName: "Declercq", division: "D3", position: "MIL", nationality: "BE" },
  { firstName: "Idriss", lastName: "Fofana", division: "D3", position: "ATT", nationality: "CI" },
  { firstName: "Sacha", lastName: "Lambert", division: "D3", position: "DEF", nationality: "FR" },
  { firstName: "Milan", lastName: "Verhoeven", division: "D3", position: "MIL", nationality: "NL" },
];

/** Coefficient de rendement par poste : un gardien n'a pas le profil d'un ailier. */
const POSITION_PROFILE: Record<
  PlayerPosition,
  { goals: [number, number]; assists: [number, number]; defenses: [number, number]; saves: [number, number] }
> = {
  GB: { goals: [0, 3], assists: [1, 5], defenses: [12, 24], saves: [22, 46] },
  DEF: { goals: [2, 9], assists: [4, 12], defenses: [16, 30], saves: [0, 3] },
  MIL: { goals: [7, 18], assists: [12, 26], defenses: [8, 18], saves: [0, 2] },
  ATT: { goals: [16, 34], assists: [6, 17], defenses: [3, 10], saves: [0, 1] },
};

/** Une division supérieure suppose un passé sportif plus fourni. */
const DIVISION_FACTOR: Record<Division, number> = { D1: 1, D2: 0.72, D3: 0.45 };

/**
 * Statistiques de saisons antérieures. Les sessions semées plus bas viennent
 * s'y ajouter par le chemin normal (rapport puis validation).
 */
function careerStats(entry: RosterEntry, index: number) {
  const random = makeRandom(0x1102 + index * 7919);
  const profile = POSITION_PROFILE[entry.position];
  const factor = DIVISION_FACTOR[entry.division];

  const scale = (range: [number, number]) =>
    Math.max(0, Math.round(pick(random, range[0], range[1]) * factor));

  const goals = scale(profile.goals);
  const assists = scale(profile.assists);
  const defenses = scale(profile.defenses);
  const saves = scale(profile.saves);
  const motm = Math.round((goals + assists) / 12);
  const matchesPlayed = 8 + pick(random, 0, 14);

  return {
    goals,
    assists,
    defenses,
    saves,
    motm,
    matchesPlayed,
    xp: 120 * matchesPlayed + 25 * goals + 15 * assists + 8 * defenses,
  };
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

/**
 * Dépose les visuels d'un produit par la couche de stockage habituelle et
 * renvoie leurs URL publiques, dans l'ordre du carrousel (SHOP-006).
 */
async function demoImages(hue: number, howMany: number): Promise<string[]> {
  const urls: string[] = [];
  for (let variant = 0; variant < howMany; variant++) {
    const stored = await storeImage(
      productImagePng({ hue, variant }),
      "image/png",
      "products",
    );
    urls.push(stored.url);
  }
  return urls;
}

/**
 * Catalogue de démonstration.
 *
 * `sizeKind` illustre la règle demandée : les vêtements se choisissent en
 * tailles, les chaussures en pointures, le reste est en taille unique. La
 * catégorie ne suffit pas à le décider — c'est bien l'administration qui
 * tranche, article par article.
 */
const DEMO_SHOP_ITEMS: {
  hue: number;
  images: number;
  sizeKind?: SizeKind;
  name: string;
  category: ShopCategory;
  priceUno: number;
  stock: number;
  description: string;
}[] = [
  { hue: 212, images: 4, name: "Casque audio sans fil", category: "headphones" as const, priceUno: 1800, stock: 12, description: "Casque circum-auriculaire à réduction de bruit active, 30 h d'autonomie." },
  { hue: 188, images: 3, name: "Écouteurs sport", category: "headphones" as const, priceUno: 850, stock: 30, description: "Écouteurs intra-auriculaires résistants à la transpiration, maintien sécurisé." },
  { hue: 268, images: 4, name: "Montre connectée", category: "watches" as const, priceUno: 2400, stock: 8, description: "Suivi cardiaque, GPS intégré et mesure des performances sportives." },
  { hue: 42, images: 3, name: "Chronographe classique", category: "watches" as const, priceUno: 3200, stock: 4, description: "Boîtier acier 42 mm, bracelet cuir, étanche 50 m." },
  { hue: 20, images: 5, sizeKind: "shoes" as const, name: "Chaussures de futsal", category: "shoes" as const, priceUno: 1500, stock: 18, description: "Semelle gomme adhérente pour surface indoor, tige microfibre." },
  { hue: 340, images: 3, sizeKind: "shoes" as const, name: "Baskets urbaines", category: "shoes" as const, priceUno: 1250, stock: 22, description: "Modèle polyvalent, amorti souple, coloris sobre." },
  { hue: 148, images: 4, sizeKind: "clothing" as const, name: "Maillot UNO League", category: "clothes" as const, priceUno: 600, stock: 60, description: "Maillot officiel en tissu respirant, floquage UNO League." },
  { hue: 240, images: 3, sizeKind: "clothing" as const, name: "Survêtement d'entraînement", category: "clothes" as const, priceUno: 1100, stock: 25, description: "Ensemble veste et pantalon, coupe ajustée." },
  { hue: 96, images: 2, name: "Sac de sport", category: "accessories" as const, priceUno: 700, stock: 35, description: "Compartiment chaussures séparé, 45 litres." },
  { hue: 300, images: 2, name: "Gourde isotherme", category: "accessories" as const, priceUno: 300, stock: 80, description: "Acier inoxydable 750 ml, garde au frais 12 h." },
];


// ---------------------------------------------------------------------------
// Salles
// ---------------------------------------------------------------------------

/**
 * Présentation des salles de démonstration.
 *
 * Les salles étaient une constante du code ; elles sont désormais
 * administrables. Le seed les crée avec leur description et leurs photos,
 * puis l'administration en fait ce qu'elle veut.
 */
const DEMO_VENUES = [
  {
    hue: 200,
    images: 3,
    headline: "La salle historique de la ligue",
    description:
      "Quatre terrains indoor en gazon synthétique dernière génération, " +
      "vestiaires chauffés et bar sur place. C'est ici que se jouent la " +
      "plupart des sessions de Division 1.",
    address: "Avenue du Globe 36, 1190 Forest",
  },
  {
    hue: 130,
    images: 2,
    headline: "Deux terrains couverts, parking gratuit",
    description:
      "Complexe récent au sud de Bruxelles. Éclairage LED, filets " +
      "neufs et un parking qui ne se remplit jamais — un détail qui compte " +
      "le vendredi soir.",
    address: "Chaussée de Waterloo 1151, 1180 Uccle",
  },
  {
    hue: 30,
    images: 2,
    headline: "Au cœur de la ville",
    description:
      "Accessible en métro, idéal pour les sessions de fin de journée. " +
      "Terrains un peu plus courts, ce qui donne des matchs rapides.",
    address: "Rue des Palais 44, 1030 Schaerbeek",
  },
  {
    hue: 280,
    images: 3,
    headline: "Le grand terrain, pour les tournois",
    description:
      "La plus grande salle du réseau, avec des gradins. Réservée aux " +
      "sessions à fort effectif et aux formats à élimination.",
    address: "Boulevard Industriel 9, 1070 Anderlecht",
  },
];

/**
 * Crée les salles avec leurs photos.
 *
 * Les identifiants (`slug`) reprennent ceux de l'ancienne constante : les
 * propositions déjà enregistrées continuent de pointer vers la bonne salle.
 */
async function seedVenues(): Promise<number> {
  const [existing] = await db.select({ total: count() }).from(venues);
  if (Number(existing?.total ?? 0) > 0) return 0;

  const rows = [];
  for (const [index, base] of VENUES.entries()) {
    const extra = DEMO_VENUES[index];
    rows.push({
      slug: base.id,
      name: base.name,
      headline: extra?.headline ?? null,
      description: extra?.description ?? "",
      address: extra?.address ?? null,
      timezone: base.timezone,
      images: await demoImages(extra?.hue ?? 210, extra?.images ?? 2),
      active: true,
      sortOrder: index,
    });
  }

  await db.insert(venues).values(rows);
  return rows.length;
}

// ---------------------------------------------------------------------------
// Avis produits
// ---------------------------------------------------------------------------

const DEMO_REVIEWS: {
  itemIndex: number;
  buyerIndex: number;
  rating: number;
  comment: string;
}[] = [
  { itemIndex: 0, buyerIndex: 1, rating: 5, comment: "Isolation impeccable, je ne les quitte plus dans le métro." },
  { itemIndex: 0, buyerIndex: 7, rating: 4, comment: "Très bon son, un peu serrés au début mais ça se détend." },
  { itemIndex: 4, buyerIndex: 2, rating: 5, comment: "Accroche parfaite en salle, aucune glissade en trois sessions." },
  { itemIndex: 4, buyerIndex: 16, rating: 3, comment: "Taillent petit : prenez une pointure au-dessus." },
  { itemIndex: 6, buyerIndex: 0, rating: 5, comment: "Le maillot officiel, tissu léger, floquage propre." },
  { itemIndex: 6, buyerIndex: 18, rating: 4, comment: "Belle qualité. Le col se détend un peu au lavage." },
  { itemIndex: 9, buyerIndex: 4, rating: 4, comment: "Garde vraiment au frais toute la session." },
  { itemIndex: 2, buyerIndex: 33, rating: 5, comment: "Le suivi cardio est précis, l'autonomie tient la semaine." },
  { itemIndex: 8, buyerIndex: 36, rating: 3, comment: "Pratique, mais le compartiment chaussures est un peu juste." },
];

async function seedReviews(
  roster: DemoPlayer[],
  catalogue: number[],
  purchasedBy: Map<number, Set<number>>,
): Promise<number> {
  const rows = [];

  for (const review of DEMO_REVIEWS) {
    const shopItemId = catalogue[review.itemIndex];
    const buyer = roster[review.buyerIndex];
    if (shopItemId === undefined || !buyer) continue;

    rows.push({
      shopItemId,
      playerId: buyer.playerId,
      rating: review.rating,
      comment: review.comment,
      // « Achat vérifié » n'est pas déclaratif : il reflète les commandes
      // réellement passées par le jeu de démonstration.
      verifiedPurchase: purchasedBy.get(buyer.playerId)?.has(shopItemId) ?? false,
    });
  }

  if (rows.length > 0) await db.insert(productReviews).values(rows);
  return rows.length;
}

// ---------------------------------------------------------------------------
// Calendrier de démonstration
// ---------------------------------------------------------------------------

type RosterFilter = Division | "mixed";

interface SessionPlan {
  /** Sert de graine : deux exécutions produisent les mêmes scores. */
  key: string;
  modeId: "league" | "friendly";
  rosterFilter: RosterFilter;
  venueIndex: number;
  slotHour: number;
  /** Négatif pour une session passée. */
  dayOffset: number;
  /** Décalage dans l'effectif, pour ne pas convoquer toujours les mêmes. */
  rosterOffset: number;
  /**
   * État visé :
   *  - `proposal`    : ouverte, il manque des joueurs ;
   *  - `reservation` : au complet, des paiements manquent encore ;
   *  - `session`     : tout le monde a payé, équipes tirées ;
   *  - `completed`   : jouée, rapports validés, récompenses versées.
   */
  outcome: "proposal" | "reservation" | "session" | "completed";
  /** Nombre d'inscrits, pour une proposition encore ouverte. */
  joiners?: number;
  /** Nombre de payeurs, pour une réservation partiellement réglée. */
  paid?: number;
  /**
   * Rang du premier payeur dans l'effectif convoqué. Décaler permet de
   * laisser volontairement les premiers inscrits impayés — c'est ainsi que le
   * compte administrateur se retrouve avec une place à régler, donc avec le
   * parcours de paiement à tester.
   */
  paidFrom?: number;
  /** Joueurs déclarés remplaçants, à partir de ce rang hors effectif. */
  substitutes?: number;
}

const SESSION_PLANS: SessionPlan[] = [
  // --- Sessions passées, jouées et clôturées ------------------------------
  { key: "past-d1-a", modeId: "league", rosterFilter: "D1", venueIndex: 0, slotHour: 20, dayOffset: -24, rosterOffset: 0, outcome: "completed" },
  { key: "past-d2-a", modeId: "league", rosterFilter: "D2", venueIndex: 1, slotHour: 18, dayOffset: -21, rosterOffset: 0, outcome: "completed" },
  { key: "past-d3-a", modeId: "league", rosterFilter: "D3", venueIndex: 2, slotHour: 20, dayOffset: -18, rosterOffset: 0, outcome: "completed" },
  { key: "past-friendly-a", modeId: "friendly", rosterFilter: "mixed", venueIndex: 3, slotHour: 19, dayOffset: -14, rosterOffset: 0, outcome: "completed" },
  { key: "past-d1-b", modeId: "league", rosterFilter: "D1", venueIndex: 1, slotHour: 18, dayOffset: -10, rosterOffset: 2, outcome: "completed" },
  { key: "past-d2-b", modeId: "league", rosterFilter: "D2", venueIndex: 0, slotHour: 20, dayOffset: -7, rosterOffset: 1, outcome: "completed" },
  { key: "past-friendly-b", modeId: "friendly", rosterFilter: "mixed", venueIndex: 2, slotHour: 21, dayOffset: -4, rosterOffset: 12, outcome: "completed" },

  // --- Sessions jouées, en attente de saisie ------------------------------
  // Elles alimentent la file de travail de l'administration : c'est là que se
  // testent la saisie des statistiques, les distinctions et les mouvements de
  // division. Une session passée n'est plus clôturée automatiquement.
  { key: "todo-d2", modeId: "league", rosterFilter: "D2", venueIndex: 2, slotHour: 20, dayOffset: -2, rosterOffset: 5, outcome: "session" },
  { key: "todo-friendly", modeId: "friendly", rosterFilter: "mixed", venueIndex: 0, slotHour: 19, dayOffset: -1, rosterOffset: 27, outcome: "session" },

  // --- Sessions confirmées, à venir ---------------------------------------
  { key: "next-d1", modeId: "league", rosterFilter: "D1", venueIndex: 0, slotHour: 20, dayOffset: 2, rosterOffset: 0, outcome: "session" },
  { key: "next-friendly", modeId: "friendly", rosterFilter: "mixed", venueIndex: 3, slotHour: 19, dayOffset: 3, rosterOffset: 6, outcome: "session" },

  // --- Réservations en attente de paiement --------------------------------
  { key: "res-d2", modeId: "league", rosterFilter: "D2", venueIndex: 1, slotHour: 18, dayOffset: 4, rosterOffset: 0, outcome: "reservation", paid: 11 },
  { key: "res-friendly", modeId: "friendly", rosterFilter: "mixed", venueIndex: 2, slotHour: 20, dayOffset: 5, rosterOffset: 18, outcome: "reservation", paid: 6, substitutes: 3 },
  // Réservation D3 où l'administrateur — premier de l'effectif — n'a pas
  // encore réglé : le parcours de paiement est ainsi testable depuis ce compte.
  { key: "res-d3-admin", modeId: "league", rosterFilter: "D3", venueIndex: 3, slotHour: 18, dayOffset: 3, rosterOffset: 0, outcome: "reservation", paid: 12, paidFrom: 1, substitutes: 2 },

  // --- Propositions ouvertes, en attente de joueurs -----------------------
  { key: "open-d1", modeId: "league", rosterFilter: "D1", venueIndex: 2, slotHour: 18, dayOffset: 6, rosterOffset: 0, outcome: "proposal", joiners: 9 },
  { key: "open-d3", modeId: "league", rosterFilter: "D3", venueIndex: 0, slotHour: 20, dayOffset: 8, rosterOffset: 0, outcome: "proposal", joiners: 12 },
  { key: "open-friendly", modeId: "friendly", rosterFilter: "mixed", venueIndex: 1, slotHour: 21, dayOffset: 7, rosterOffset: 24, outcome: "proposal", joiners: 6 },
];

// ---------------------------------------------------------------------------
// Création des comptes
// ---------------------------------------------------------------------------

interface DemoPlayer {
  playerId: number;
  userId: number;
  division: Division;
  position: PlayerPosition;
}

function emailFor(entry: RosterEntry): string {
  const local = `${entry.firstName}.${entry.lastName}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z.]/g, "");
  return `${local}@demo.unoleague.app`;
}

async function createDemoPlayer(
  passwordHash: string,
  entry: RosterEntry,
  index: number,
): Promise<DemoPlayer> {
  const stats = careerStats(entry, index);

  return db.transaction(async (tx) => {
    const insertedUser = await tx.insert(users).values({
      email: emailFor(entry),
      passwordHash,
      role: "user",
      status: "active",
    });
    const userId = Number(insertedUser[0].insertId);

    const insertedPlayer = await tx.insert(players).values({
      userId,
      firstName: entry.firstName,
      lastName: entry.lastName,
      displayName: `${entry.firstName} ${entry.lastName}`,
      nationality: entry.nationality,
      dateOfBirth: `19${85 + (index % 15)}-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 27) + 1).padStart(2, "0")}`,
      division: entry.division,
      position: entry.position,
      matchesPlayed: stats.matchesPlayed,
      unoPoints: 0,
      xp: stats.xp,
      level: Math.floor(stats.xp / 500) + 1,
      goals: stats.goals,
      assists: stats.assists,
      defenses: stats.defenses,
      saves: stats.saves,
      motm: stats.motm,
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

    // Assez large pour couvrir les sessions et les achats semés plus bas :
    // un débit refusé faute de solde interromprait le jeu de démonstration.
    await credit(tx, {
      playerId,
      amount: 2500 + index * 30,
      type: "reward",
      description: "Récompenses des saisons précédentes",
      referenceType: "seed",
      referenceId: playerId,
      idempotencyKey: `seed:reward:${playerId}`,
    });

    return { playerId, userId, division: entry.division, position: entry.position };
  });
}

// ---------------------------------------------------------------------------
// Création des sessions
// ---------------------------------------------------------------------------

function squadFor(plan: SessionPlan, roster: DemoPlayer[], size: number): DemoPlayer[] {
  const eligible =
    plan.rosterFilter === "mixed"
      ? interleaveDivisions(roster)
      : roster.filter((player) => player.division === plan.rosterFilter);

  // La rotation évite que ce soient toujours les mêmes joueurs qui soient
  // convoqués : chaque plan démarre à un autre endroit de l'effectif.
  const start = eligible.length === 0 ? 0 : plan.rosterOffset % eligible.length;
  const rotated = [...eligible.slice(start), ...eligible.slice(0, start)];
  return rotated.slice(0, size);
}

/**
 * Entrelace les divisions pour un match amical.
 *
 * L'effectif est rangé par division ; prendre les dix premiers donnerait dix
 * joueurs de D1, alors qu'un amical est justement ouvert à toutes les
 * divisions (§8). L'alternance D1 / D2 / D3 produit une convocation mixte,
 * comme dans la réalité.
 */
function interleaveDivisions(roster: DemoPlayer[]): DemoPlayer[] {
  const byDivision: Record<Division, DemoPlayer[]> = {
    D1: roster.filter((player) => player.division === "D1"),
    D2: roster.filter((player) => player.division === "D2"),
    D3: roster.filter((player) => player.division === "D3"),
  };

  const mixed: DemoPlayer[] = [];
  const longest = Math.max(...Object.values(byDivision).map((list) => list.length));

  for (let rank = 0; rank < longest; rank++) {
    for (const division of ["D1", "D2", "D3"] as const) {
      const player = byDivision[division][rank];
      if (player) mixed.push(player);
    }
  }

  return mixed;
}

/** Insère la proposition et ses inscrits, sans encore aucun paiement. */
async function insertProposal(
  plan: SessionPlan,
  squad: DemoPlayer[],
  today: string,
): Promise<number | null> {
  const mode = getGameMode(plan.modeId);
  const venue = VENUES[plan.venueIndex];
  if (!mode || !venue || squad.length === 0) return null;

  const slot = findSlot(mode, plan.slotHour);
  if (!slot) return null;

  const creator = squad[0];
  if (!creator) return null;

  const date = addDaysIso(today, plan.dayOffset);
  const division = mode.divisionLocked ? creator.division : null;
  // Une proposition ouverte n'a pas encore atteint son quota ; les autres
  // partent au complet, comme après le dernier `joinProposal`.
  const status = plan.outcome === "proposal" ? "proposal" : "reservation";

  return db.transaction(async (tx) => {
    const inserted = await tx.insert(proposals).values({
      startsAtUtc: zonedTimeToUtc(date, slot.startHour, venue.timezone),
      localDate: date,
      slotStartHour: slot.startHour,
      localTimeLabel: slot.label,
      timezone: venue.timezone,
      venueId: venue.id,
      venueName: venue.name,
      modeId: mode.id,
      division,
      minParticipants: mode.minParticipants,
      priceEur: mode.priceEur,
      priceUno: eurToUno(mode.priceEur),
      status,
      participantCount: squad.length,
      creatorPlayerId: creator.playerId,
      activeSlotKey: `${venue.id}|${date}|${slot.startHour}|${mode.id}`,
    });

    const proposalId = Number(inserted[0].insertId);
    await tx.insert(proposalParticipants).values(
      squad.map((player) => ({ proposalId, playerId: player.playerId })),
    );

    return proposalId;
  });
}

/**
 * Feuille de match plausible : les buts inscrits par une équipe font le score
 * de cette équipe, les passes ne dépassent pas les buts, et seul un gardien
 * enregistre des arrêts.
 */
function buildReport(
  random: () => number,
  teamA: { id: number; position: PlayerPosition }[],
  teamB: { id: number; position: PlayerPosition }[],
) {
  function distribute(squad: { id: number; position: PlayerPosition }[], goals: number) {
    const scorers = squad.filter((player) => player.position !== "GB");
    const tally = new Map(squad.map((player) => [player.id, 0]));
    for (let scored = 0; scored < goals; scored++) {
      const player = scorers[pick(random, 0, Math.max(0, scorers.length - 1))];
      if (player) tally.set(player.id, (tally.get(player.id) ?? 0) + 1);
    }
    return tally;
  }

  const scoreA = pick(random, 1, 8);
  const scoreB = pick(random, 1, 8);
  const goalsA = distribute(teamA, scoreA);
  const goalsB = distribute(teamB, scoreB);

  // L'homme du match appartient à l'équipe victorieuse, ou à l'équipe A en cas
  // de nul : une seule distinction par match.
  const winners = scoreA >= scoreB ? teamA : teamB;
  const motmId = winners[pick(random, 0, winners.length - 1)]?.id ?? null;

  const stats = [...teamA, ...teamB].map((player) => {
    const goals = goalsA.get(player.id) ?? goalsB.get(player.id) ?? 0;
    return {
      playerId: player.id,
      goals,
      // Les passes récompensent surtout les milieux et les défenseurs.
      assists: player.position === "GB" ? pick(random, 0, 1) : pick(random, 0, 3),
      defenses: player.position === "ATT" ? pick(random, 0, 2) : pick(random, 1, 6),
      saves: player.position === "GB" ? pick(random, 2, 9) : 0,
      motm: player.id === motmId,
    };
  });

  return { scoreA, scoreB, stats };
}

/**
 * Amène une proposition jusqu'à l'état visé en empruntant les mêmes chemins
 * que l'application : paiements, tirage, rapports, validations, clôture.
 */
async function advance(
  plan: SessionPlan,
  proposalId: number,
  squad: DemoPlayer[],
  adminUserId: number,
): Promise<void> {
  if (plan.outcome === "proposal") return;

  const from = plan.paidFrom ?? 0;
  const payers =
    plan.outcome === "reservation"
      ? squad.slice(from, from + (plan.paid ?? 0))
      : squad;

  for (const payer of payers) {
    // Le paiement en UNO débite le registre puis, au dernier réglé, fait
    // basculer la réservation en session confirmée (CAL-011).
    await payProposal(
      { playerId: payer.playerId, userId: payer.userId },
      {
        proposalId,
        method: "uno",
        idempotencyKey: `seed:${plan.key}:pay:${payer.playerId}`,
      },
    );
  }

  if (plan.outcome === "reservation") {
    await seedSubstitutes(plan, proposalId, squad);
    return;
  }

  const actor = { userId: adminUserId };
  await generateTeams(actor, proposalId);

  if (plan.outcome === "session") return;

  const positions = new Map(squad.map((player) => [player.playerId, player.position]));
  const random = makeRandom(hashKey(plan.key));

  for (const match of await listMatches(db, proposalId)) {
    const teamA = (match.teamA?.players ?? []).map((player) => ({
      id: player.id,
      position: positions.get(player.id) ?? player.position,
    }));
    const teamB = (match.teamB?.players ?? []).map((player) => ({
      id: player.id,
      position: positions.get(player.id) ?? player.position,
    }));
    if (teamA.length === 0 || teamB.length === 0) continue;

    const report = buildReport(random, teamA, teamB);
    await reportMatch(actor, { matchId: match.id, ...report });
    await validateMatch(actor, match.id);
  }

  await completeSession(actor, proposalId);
}

/**
 * Inscrit quelques remplaçants sur une réservation (CAL-008).
 *
 * Les candidats sont pris hors de l'effectif convoqué et, pour une session de
 * division, dans la même division : le serveur refuserait les autres, et le
 * jeu de démonstration doit refléter les règles réelles.
 */
async function seedSubstitutes(
  plan: SessionPlan,
  proposalId: number,
  squad: DemoPlayer[],
): Promise<void> {
  const wanted = plan.substitutes ?? 0;
  if (wanted === 0) return;

  const enrolled = new Set(squad.map((player) => player.playerId));
  const eligible = (await db
    .select({ id: players.id, division: players.division })
    .from(players)
    .orderBy(players.id)) as { id: number; division: Division }[];

  const candidates = eligible
    .filter((player) => !enrolled.has(player.id))
    .filter(
      (player) =>
        plan.rosterFilter === "mixed" || player.division === plan.rosterFilter,
    )
    .slice(0, wanted);

  if (candidates.length === 0) return;

  await db.insert(proposalSubstitutes).values(
    candidates.map((player) => ({
      proposalId,
      playerId: player.id,
      status: "waiting" as const,
    })),
  );
}

/** Graine stable dérivée d'une chaîne : même clé, même feuille de match. */
function hashKey(key: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index++) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

async function seedSessions(
  roster: DemoPlayer[],
  adminUserId: number,
): Promise<number> {
  const today = todayIso(DEFAULT_TIMEZONE);
  let created = 0;

  for (const plan of SESSION_PLANS) {
    const mode = getGameMode(plan.modeId);
    if (!mode) continue;

    // Une session complète compte exactement une équipe entière par équipe
    // prévue : le tirage n'a alors ni banc ni équipe incomplète.
    const fullSize = mode.teamCount * TEAM_SIZE;
    const size = plan.outcome === "proposal" ? (plan.joiners ?? fullSize) : fullSize;

    const squad = squadFor(plan, roster, size);
    if (squad.length < size) continue;

    const proposalId = await insertProposal(plan, squad, today);
    if (proposalId === null) continue;

    await advance(plan, proposalId, squad, adminUserId);
    created++;
  }

  return created;
}

// ---------------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------------

/**
 * Commandes réparties sur les états réellement atteignables : `createOrder`
 * débite les UNO et laisse la commande payée, l'administration l'expédie ou la
 * rembourse (ADMIN-004, ORDER_TRANSITIONS).
 */
const ORDER_PLANS: {
  buyerIndex: number;
  itemIndexes: number[];
  quantity: number;
  finalStatus: "paid" | "fulfilled" | "refunded";
}[] = [
  { buyerIndex: 0, itemIndexes: [6], quantity: 1, finalStatus: "fulfilled" },
  { buyerIndex: 1, itemIndexes: [9, 8], quantity: 1, finalStatus: "paid" },
  { buyerIndex: 2, itemIndexes: [4], quantity: 1, finalStatus: "paid" },
  { buyerIndex: 4, itemIndexes: [1], quantity: 1, finalStatus: "fulfilled" },
  { buyerIndex: 7, itemIndexes: [9], quantity: 2, finalStatus: "refunded" },
  { buyerIndex: 16, itemIndexes: [6, 9], quantity: 1, finalStatus: "fulfilled" },
  { buyerIndex: 18, itemIndexes: [8], quantity: 1, finalStatus: "paid" },
  { buyerIndex: 33, itemIndexes: [9], quantity: 1, finalStatus: "fulfilled" },
  { buyerIndex: 36, itemIndexes: [6], quantity: 1, finalStatus: "paid" },
];

async function seedOrders(
  roster: DemoPlayer[],
  catalogue: number[],
  adminUserId: number,
): Promise<{ created: number; purchasedBy: Map<number, Set<number>> }> {
  // Les articles réellement commandés servent ensuite à décerner la mention
  // « achat vérifié » aux avis, plutôt que de la poser au hasard.
  const purchasedBy = new Map<number, Set<number>>();
  const sized = await db
    .select({
      id: shopItems.id,
      sizeKind: shopItems.sizeKind,
      sizes: shopItems.sizes,
    })
    .from(shopItems);
  const sizeOf = new Map(sized.map((row) => [row.id, row]));

  let created = 0;

  for (const [index, plan] of ORDER_PLANS.entries()) {
    const buyer = roster[plan.buyerIndex];
    const items = plan.itemIndexes
      .map((itemIndex) => catalogue[itemIndex])
      .filter((shopItemId): shopItemId is number => shopItemId !== undefined)
      .map((shopItemId) => {
        const product = sizeOf.get(shopItemId);
        const kind = product?.sizeKind ?? "none";
        // Une taille est choisie quand l'article l'exige : le serveur
        // refuserait la commande autrement, et c'est bien le comportement
        // que le jeu de démonstration doit illustrer.
        const options =
          product && Array.isArray(product.sizes) && product.sizes.length > 0
            ? product.sizes
            : [...sizesFor(kind)];
        const size = requiresSize(kind)
          ? (options[(index + shopItemId) % options.length] ?? null)
          : null;

        return { shopItemId, quantity: plan.quantity, size };
      });

    if (!buyer || items.length === 0) continue;

    const { order } = await createOrder(
      { playerId: buyer.playerId, userId: buyer.userId },
      { items, idempotencyKey: `seed:order:${index}` },
    );

    const bought = purchasedBy.get(buyer.playerId) ?? new Set<number>();
    for (const item of items) bought.add(item.shopItemId);
    purchasedBy.set(buyer.playerId, bought);

    if (plan.finalStatus !== "paid") {
      await updateOrderStatus(
        { userId: adminUserId },
        { orderId: order.id, status: plan.finalStatus },
      );
    }

    created++;
  }

  return { created, purchasedBy };
}

// ---------------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------------

export interface SeedResult {
  playersCreated: number;
  shopItemsCreated: number;
  announcementsCreated: number;
  proposalsCreated: number;
  ordersCreated: number;
  reviewsCreated: number;
  venuesCreated: number;
  skipped: boolean;
}

/**
 * Charge le compte administrateur comme joueur du jeu de démonstration.
 *
 * L'administrateur a besoin d'un vrai parcours joueur pour tester : une place
 * à régler, un historique de sessions, un classement. Il est donc placé en
 * tête de l'effectif de sa division, ce qui l'inscrit naturellement aux
 * sessions dont le plan démarre au rang zéro.
 */
async function loadAdminPlayer(): Promise<DemoPlayer | null> {
  const [row] = await db
    .select({
      playerId: players.id,
      userId: players.userId,
      division: players.division,
      position: players.position,
    })
    .from(players)
    .innerJoin(users, eq(users.id, players.userId))
    .where(eq(users.role, "admin"))
    .limit(1);

  if (!row) return null;

  // Sans solde, l'administrateur ne pourrait ni payer une session ni acheter :
  // le crédit passe par le registre, comme pour tout le monde.
  await db.transaction(async (tx) => {
    await credit(tx, {
      playerId: row.playerId,
      amount: 4000,
      type: "reward",
      description: "Dotation de test",
      referenceType: "seed",
      referenceId: row.playerId,
      idempotencyKey: `seed:admin:${row.playerId}`,
    });
  });

  return row;
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
      ordersCreated: 0,
      reviewsCreated: 0,
      venuesCreated: 0,
      skipped: true,
    };
  }

  // Les salles d'abord : une proposition référence une salle existante.
  const venuesCreated = await seedVenues();

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const roster: DemoPlayer[] = [];
  for (const [index, entry] of ROSTER.entries()) {
    roster.push(await createDemoPlayer(passwordHash, entry, index));
  }

  // Les actions d'administration du jeu de démonstration sont imputées au
  // compte administrateur, faute de quoi le journal d'audit pointerait vers
  // un utilisateur inexistant.
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .limit(1);
  const adminUserId = admin?.id ?? roster[0]?.userId;
  if (adminUserId === undefined) {
    throw new Error("Aucun utilisateur disponible pour signer le jeu de démonstration.");
  }

  const catalogueRows = [];
  for (const item of DEMO_SHOP_ITEMS) {
    catalogueRows.push({
      name: item.name,
      description: item.description,
      category: item.category,
      priceUno: item.priceUno,
      priceEuros: String(item.priceUno / 10),
      images: await demoImages(item.hue, item.images),
      sizeKind: item.sizeKind ?? "none",
      // Aucune restriction : toutes les tailles du barème sont proposées.
      sizes: [],
      available: true,
      stock: item.stock,
    });
  }
  await db.insert(shopItems).values(catalogueRows);

  const catalogue = (
    await db.select({ id: shopItems.id }).from(shopItems).orderBy(shopItems.id)
  ).map((row) => row.id);

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

  // L'administrateur ouvre l'effectif de sa division : les plans qui démarrent
  // au rang zéro l'embarquent, ce qui lui donne un historique de sessions et
  // une place à régler — de quoi tester le produit depuis son propre compte.
  const adminPlayer = await loadAdminPlayer();
  const fullRoster = adminPlayer ? [adminPlayer, ...roster] : roster;

  const proposalsCreated = await seedSessions(fullRoster, adminUserId);
  const { created: ordersCreated, purchasedBy } = await seedOrders(
    roster,
    catalogue,
    adminUserId,
  );
  const reviewsCreated = await seedReviews(roster, catalogue, purchasedBy);

  return {
    playersCreated: roster.length,
    shopItemsCreated: DEMO_SHOP_ITEMS.length,
    announcementsCreated: 3,
    proposalsCreated,
    ordersCreated,
    reviewsCreated,
    venuesCreated,
    skipped: false,
  };
}

export const DEMO_ACCOUNT_PASSWORD = DEMO_PASSWORD;
