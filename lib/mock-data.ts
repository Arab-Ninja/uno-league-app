// Mock data for UNO League application

export interface Player {
  id: string;
  name: string;
  division: "D1" | "D2" | "D3";
  unoPoints: number;
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
}

export const LOCATIONS = [
  "Fit Five Forest",
  "Fit Five Laeken",
  "YC Five",
  "Arena",
  "Five Bruxelles",
  "Futsal Club",
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
    xp: 3400,
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
    name: "Othman",
    division: "D1",
    unoPoints: 2500,
    xp: 3000,
    level: 1,
    stats: {
      goals: 28,
      assists: 20,
      defenses: 32,
      saves: 40,
      motm: 5,
    },
    avatar: "🔥",
  },
  {
    id: "player-5",
    name: "Alex",
    division: "D2",
    unoPoints: 2200,
    xp: 2700,
    level: 1,
    stats: {
      goals: 25,
      assists: 18,
      defenses: 30,
      saves: 38,
      motm: 4,
    },
    avatar: "⭐",
  },
  {
    id: "player-6",
    name: "Jordan",
    division: "D2",
    unoPoints: 1900,
    xp: 2400,
    level: 1,
    stats: {
      goals: 22,
      assists: 16,
      defenses: 28,
      saves: 35,
      motm: 3,
    },
    avatar: "💪",
  },
  {
    id: "player-7",
    name: "Lucas",
    division: "D3",
    unoPoints: 1600,
    xp: 2000,
    level: 1,
    stats: {
      goals: 18,
      assists: 12,
      defenses: 24,
      saves: 30,
      motm: 2,
    },
    avatar: "🚀",
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
  },
  {
    id: "match-4",
    date: "2026-03-06",
    time: "14:00",
    division: "D1",
    status: "available",
    participants: 5,
    maxParticipants: 15,
    location: "Fit-Five Brussels",
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
  },
  {
    id: "match-6",
    date: "2026-03-07",
    time: "20:00",
    division: "D1",
    status: "available",
    participants: 7,
    maxParticipants: 15,
    location: "Fit-Five Brussels",
  },
];

// Sample products for webshop
export const products: Product[] = [
  {
    id: "prod-1",
    name: "Wireless Headphones",
    category: "headphones",
    price: 500,
    image: "🎧",
    description: "Premium wireless headphones with noise cancellation",
  },
  {
    id: "prod-2",
    name: "Smart Watch",
    category: "watches",
    price: 800,
    image: "⌚",
    description: "Advanced fitness tracking smartwatch",
  },
  {
    id: "prod-3",
    name: "Football Boots",
    category: "shoes",
    price: 600,
    image: "👟",
    description: "Professional football boots for indoor soccer",
  },
  {
    id: "prod-4",
    name: "UNO League Jersey",
    category: "clothes",
    price: 300,
    image: "👕",
    description: "Official UNO League team jersey",
  },
  {
    id: "prod-5",
    name: "Training Bag",
    category: "accessories",
    price: 250,
    image: "🎒",
    description: "Durable sports training bag",
  },
  {
    id: "prod-6",
    name: "Sports Socks Pack",
    category: "accessories",
    price: 100,
    image: "🧦",
    description: "Pack of 5 premium sports socks",
  },
  {
    id: "prod-7",
    name: "Fitness Tracker",
    category: "watches",
    price: 400,
    image: "📱",
    description: "Wearable fitness tracker with heart rate monitor",
  },
  {
    id: "prod-8",
    name: "Compression Shorts",
    category: "clothes",
    price: 150,
    image: "🩳",
    description: "Compression shorts for better performance",
  },
];

// Sample transactions
export const transactions: Transaction[] = [
  {
    id: "trans-1",
    type: "reward",
    amount: 250,
    description: "Best Scorer - Match vs Team A",
    date: "2026-02-28",
  },
  {
    id: "trans-2",
    type: "purchase",
    amount: -500,
    description: "Wireless Headphones",
    date: "2026-02-27",
  },
  {
    id: "trans-3",
    type: "receive",
    amount: 100,
    from: "Mohammed-Reda",
    description: "Transfer from friend",
    date: "2026-02-26",
  },
  {
    id: "trans-4",
    type: "reward",
    amount: 150,
    description: "Best Passer - Match vs Team B",
    date: "2026-02-25",
  },
  {
    id: "trans-5",
    type: "send",
    amount: -50,
    to: "Hicham",
    description: "Transfer to friend",
    date: "2026-02-24",
  },
  {
    id: "trans-6",
    type: "reward",
    amount: 20,
    description: "Team Bonus - Victory",
    date: "2026-02-23",
  },
  {
    id: "trans-7",
    type: "reward",
    amount: 10,
    description: "Participation Bonus",
    date: "2026-02-23",
  },
  {
    id: "trans-8",
    type: "purchase",
    amount: -300,
    description: "UNO League Jersey",
    date: "2026-02-20",
  },
];

// Sample announcements
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
    title: "Division Promotion Available",
    content: "You are eligible for promotion to Division 1! Keep up the great performances to secure your spot.",
    type: "info",
    date: "2026-02-28",
    read: false,
  },
  {
    id: "ann-3",
    title: "Maintenance Notice",
    content: "The app will undergo maintenance on March 5th from 2:00 AM to 4:00 AM UTC. Services may be temporarily unavailable.",
    type: "maintenance",
    date: "2026-02-27",
    read: true,
  },
  {
    id: "ann-4",
    title: "New Products in Webshop",
    content: "Check out our new collection of UNO League merchandise now available in the webshop!",
    type: "info",
    date: "2026-02-26",
    read: true,
  },
  {
    id: "ann-5",
    title: "Weekend Tournament",
    content: "Special weekend tournament with double points! Register now to participate.",
    type: "reward",
    date: "2026-02-25",
    read: true,
  },
];

// Favorite contacts
export const favoriteContacts: Player[] = [
  allPlayers[1], // Mohammed-Reda
  allPlayers[2], // Hicham
  allPlayers[3], // Othman
];
