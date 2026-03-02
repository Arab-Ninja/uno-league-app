// Mock data for UNO League application

export interface Player {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  division: "D1" | "D2" | "D3";
  unoPoints: number;
  unoBalance?: number;
  xp: number;
  level: number;
  stats: {
    goals: number;
    assists: number;
    defenses: number;
    saves: number;
    motm: number; // Man of the Match
  };
  avatar?: string;
  email?: string;
  dateOfBirth?: string;
  nationality?: string;
  profilePhoto?: string;
}

export interface Match {
  id: string;
  date: string;
  time: string;
  division: "D1" | "D2" | "D3";
  status: "available" | "booked" | "full" | "completed";
  participants: number;
  maxParticipants: number;
  location: string;
  createdBy?: string;
  mode: "amical" | "league";
  price?: number;
  rewards?: string;
}

export const LOCATIONS = [
  "Fit Five Forest",
  "Fit Five Laeken",
  "YC Five",
  "Arena",
  "Five Bruxelles",
  "Futsal Club",
];

export const TIME_SLOTS = [
  "14:00-16:00",
  "16:00-18:00",
  "18:00-20:00",
  "20:00-22:00",
  "22:00-00:00",
];

export interface Product {
  id: string;
  name: string;
  category: "headphones" | "watches" | "shoes" | "clothes" | "accessories";
  price: number; // in UNO points
  image: string;
  description: string;
}

export interface Transaction {
  id: string;
  type: "send" | "receive" | "purchase" | "reward";
  amount: number;
  from?: string;
  to?: string;
  description: string;
  date: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  type: "info" | "alert" | "reward" | "maintenance";
  date: string;
  read: boolean;
}

// Current logged-in player
export const currentPlayer: Player = {
  id: "player-1",
  name: "Yassine",
  division: "D1",
  unoPoints: 3500,
  xp: 4200,
  level: 2,
  stats: {
    goals: 39,
    assists: 28,
    defenses: 41,
    saves: 52,
    motm: 8,
  },
  avatar: "🏆",
  email: "yassine@example.com",
};

// Sample players for rankings
export const allPlayers: Player[] = [
  currentPlayer,
  {
    id: "player-2",
    name: "Mohammed-Reda",
    division: "D1",
    unoPoints: 3200,
    xp: 3900,
    level: 2,
    stats: {
      goals: 35,
      assists: 26,
      defenses: 38,
      saves: 48,
      motm: 7,
    },
    avatar: "⚽",
  },
  {
    id: "player-3",
    name: "Hicham",
    division: "D1",
    unoPoints: 2800,
    xp: 3200,
    level: 2,
    stats: {
      goals: 32,
      assists: 24,
      defenses: 35,
      saves: 45,
      motm: 6,
    },
    avatar: "🎯",
  },
  {
    id: "player-4",
    name: "Karim",
    division: "D2",
    unoPoints: 2500,
    xp: 2800,
    level: 1,
    stats: {
      goals: 28,
      assists: 20,
      defenses: 30,
      saves: 40,
      motm: 5,
    },
    avatar: "⭐",
  },
  {
    id: "player-5",
    name: "Ahmed",
    division: "D2",
    unoPoints: 2200,
    xp: 2500,
    level: 1,
    stats: {
      goals: 25,
      assists: 18,
      defenses: 28,
      saves: 38,
      motm: 4,
    },
    avatar: "🔥",
  },
  {
    id: "player-6",
    name: "Hassan",
    division: "D3",
    unoPoints: 1800,
    xp: 2000,
    level: 1,
    stats: {
      goals: 20,
      assists: 15,
      defenses: 22,
      saves: 30,
      motm: 3,
    },
    avatar: "💪",
  },
  {
    id: "player-7",
    name: "Ibrahim",
    division: "D3",
    unoPoints: 1500,
    xp: 1700,
    level: 1,
    stats: {
      goals: 18,
      assists: 13,
      defenses: 20,
      saves: 28,
      motm: 2,
    },
    avatar: "🎪",
  },
  {
    id: "player-8",
    name: "Fatima",
    division: "D1",
    unoPoints: 3100,
    xp: 3700,
    level: 2,
    stats: {
      goals: 34,
      assists: 25,
      defenses: 37,
      saves: 47,
      motm: 7,
    },
    avatar: "👑",
  },
];

// Sample matches
export const matches: Match[] = [
  {
    id: "match-1",
    date: "2026-03-05",
    time: "14:00",
    division: "D1",
    status: "available",
    participants: 8,
    maxParticipants: 15,
    location: "Fit-Five Brussels",
    mode: "league",
    price: 10,
    rewards: "250 UNO pour le meilleur buteur",
  },
  {
    id: "match-2",
    date: "2026-03-05",
    time: "16:00",
    division: "D1",
    status: "booked",
    participants: 15,
    maxParticipants: 15,
    location: "Fit-Five Brussels",
    mode: "league",
    price: 10,
    rewards: "250 UNO pour le meilleur buteur",
  },
  {
    id: "match-3",
    date: "2026-03-05",
    time: "18:00",
    division: "D2",
    status: "available",
    participants: 10,
    maxParticipants: 15,
    location: "Fit-Five Brussels",
    mode: "league",
    price: 8,
    rewards: "200 UNO pour le meilleur buteur",
  },
  {
    id: "match-4",
    date: "2026-03-06",
    time: "14:00",
    division: "D1",
    status: "available",
    participants: 5,
    maxParticipants: 10,
    location: "Fit-Five Brussels",
    mode: "amical",
    price: 5,
    rewards: "50 UNO par participant",
  },
  {
    id: "match-5",
    date: "2026-03-06",
    time: "16:00",
    division: "D3",
    status: "available",
    participants: 12,
    maxParticipants: 15,
    location: "Fit-Five Brussels",
    mode: "league",
    price: 6,
    rewards: "150 UNO pour le meilleur buteur",
  },
  {
    id: "match-6",
    date: "2026-03-07",
    time: "20:00",
    division: "D1",
    status: "available",
    participants: 7,
    maxParticipants: 10,
    location: "Fit-Five Brussels",
    mode: "amical",
    price: 5,
    rewards: "50 UNO par participant",
  },
];

// Sample products for webshop
export const products: Product[] = [
  {
    id: "prod-1",
    name: "UNO League Jersey",
    category: "clothes",
    price: 500,
    image: "👕",
    description: "Official UNO League jersey with your name on the back",
  },
  {
    id: "prod-2",
    name: "Premium Headphones",
    category: "headphones",
    price: 800,
    image: "🎧",
    description: "High-quality wireless headphones for training",
  },
  {
    id: "prod-3",
    name: "Smartwatch",
    category: "watches",
    price: 1200,
    image: "⌚",
    description: "Track your performance metrics",
  },
  {
    id: "prod-4",
    name: "Professional Shoes",
    category: "shoes",
    price: 600,
    image: "👟",
    description: "Lightweight futsal shoes",
  },
  {
    id: "prod-5",
    name: "Wristband",
    category: "accessories",
    price: 100,
    image: "🎽",
    description: "UNO League official wristband",
  },
  {
    id: "prod-6",
    name: "Training Bag",
    category: "accessories",
    price: 400,
    image: "🎒",
    description: "Durable training equipment bag",
  },
  {
    id: "prod-7",
    name: "Water Bottle",
    category: "accessories",
    price: 80,
    image: "💧",
    description: "Insulated water bottle",
  },
  {
    id: "prod-8",
    name: "Shin Guards",
    category: "clothes",
    price: 200,
    image: "🛡️",
    description: "Professional protection gear",
  },
];

// Sample transactions
export const transactions: Transaction[] = [
  {
    id: "trans-1",
    type: "reward",
    amount: 250,
    description: "Meilleur buteur - Match D1",
    date: "2026-03-04",
  },
  {
    id: "trans-2",
    type: "reward",
    amount: 150,
    description: "Meilleur passeur - Match D1",
    date: "2026-03-03",
  },
  {
    id: "trans-3",
    type: "send",
    amount: 100,
    to: "Mohammed-Reda",
    description: "Transfert UNO",
    date: "2026-03-02",
  },
  {
    id: "trans-4",
    type: "purchase",
    amount: -500,
    description: "Achat - UNO League Jersey",
    date: "2026-03-01",
  },
];

// Sample favorite contacts
export const favoriteContacts = [
  { id: "1", name: "Mohammed-Reda", unoPoints: 3200 },
  { id: "2", name: "Hicham", unoPoints: 2800 },
  { id: "3", name: "Karim", unoPoints: 2500 },
];

export const playerOfTheMonth: Player = {
  id: "player-motm",
  name: "Yassine",
  division: "D1",
  unoPoints: 3500,
  xp: 4200,
  level: 2,
  stats: {
    goals: 39,
    assists: 28,
    defenses: 41,
    saves: 52,
    motm: 8,
  },
  avatar: "🏆",
};

export const announcements: Announcement[] = [
  {
    id: "ann-1",
    title: "Player of the Month - March 2026",
    content: "Congratulations to Yassine for winning the Player of the Month award! With 8 Man of the Match awards this month, you have shown exceptional performance.",
    type: "reward",
    date: "2026-03-01",
    read: false,
  },
  {
    id: "ann-2",
    title: "New Season Starts",
    content: "The new UNO League season has officially started! Join matches and climb the rankings.",
    type: "info",
    date: "2026-02-28",
    read: true,
  },
  {
    id: "ann-3",
    title: "System Maintenance",
    content: "Scheduled maintenance on March 5th from 23:00 to 01:00. The app will be temporarily unavailable.",
    type: "maintenance",
    date: "2026-02-27",
    read: true,
  },
  {
    id: "ann-4",
    title: "Limited Time Offer",
    content: "Get 20% bonus UNO on your first purchase in the webshop this week!",
    type: "reward",
    date: "2026-02-26",
    read: false,
  },
];
