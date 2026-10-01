import { z } from "zod";

/**
 * Modération des contenus publiés par les joueurs (MOD-001).
 *
 * Trois choses vont ensemble, et c'est ce que les stores exigent d'une
 * application où l'on écrit pour les autres (App Store Review Guidelines
 * 1.2) : **filtrer** ce qui part, permettre de **signaler** ce qui est
 * arrivé, et de **bloquer** son auteur. Les deux premières protègent la
 * ligue, la troisième protège chaque joueur sans attendre personne.
 */

/** Ce qu'on peut signaler : un message de club, un avis, un joueur. */
export const REPORT_KINDS = ["message", "review", "player"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const REPORT_REASONS = [
  "insult",
  "harassment",
  "hate",
  "spam",
  "inappropriate",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const MODERATION_LIMITS = {
  /** Précisions libres jointes à un signalement. */
  detailsMax: 500,
  /** Extrait du contenu signalé conservé pour l'administration. */
  excerptMax: 300,
} as const;

export const reportContentSchema = z.object({
  kind: z.enum(REPORT_KINDS),
  targetId: z.number().int().positive(),
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(MODERATION_LIMITS.detailsMax).nullish(),
});
export type ReportContentInput = z.infer<typeof reportContentSchema>;

export const blockPlayerSchema = z.object({
  playerId: z.number().int().positive(),
});

export const REPORT_STATUSES = ["open", "removed", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export interface ContentReportView {
  id: number;
  kind: ReportKind;
  targetId: number;
  reason: ReportReason;
  details: string | null;
  excerpt: string | null;
  status: ReportStatus;
  reporter: { playerId: number; displayName: string } | null;
  reported: { playerId: number; displayName: string } | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface BlockedPlayerView {
  playerId: number;
  displayName: string;
  profilePhotoUrl: string | null;
  blockedAt: string;
}

/*
 * Le filtre.
 *
 * Une liste courte de mots sans autre usage qu'insulter, en français, en
 * anglais et en néerlandais — les trois langues de l'application. Elle ne
 * prétend pas tout arrêter : elle retire l'évident, et le signalement prend
 * le relais pour le reste. Une liste plus longue attraperait surtout des
 * innocents (« con » dans « con carne » en est déjà la limite).
 *
 * La comparaison se fait sans accents ni majuscules, mot entier : « ENCULÉ »
 * est pris, « Scunthorpe » ne l'est pas.
 */
const MOTS_MASQUES = new Set([
  // français
  "batard",
  "bougnoul",
  "bougnoule",
  "con",
  "conasse",
  "connard",
  "connards",
  "connasse",
  "conne",
  "encule",
  "encules",
  "enculer",
  "fdp",
  "negre",
  "negro",
  "niquer",
  "nique",
  "ntm",
  "pd",
  "pede",
  "pedes",
  "pute",
  "putes",
  "salaud",
  "salope",
  "salopes",
  "tapette",
  "youpin",
  // anglais
  "asshole",
  "bitch",
  "cunt",
  "fag",
  "faggot",
  "fuck",
  "fucked",
  "fucker",
  "fucking",
  "motherfucker",
  "nigga",
  "nigger",
  "retard",
  "slut",
  "whore",
  // néerlandais
  "flikker",
  "hoer",
  "kanker",
  "kankerlijer",
  "klootzak",
  "kut",
  "mongool",
  "tering",
  "tyfus",
]);

function sansAccents(mot: string): string {
  return mot.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

/**
 * Masque les mots de la liste : la première lettre reste, le reste devient
 * des astérisques. Le sens du message survit, l'insulte non.
 */
export function masquerGrossieretes(texte: string): string {
  return texte.replace(/[\p{L}\p{N}]+/gu, (mot) =>
    MOTS_MASQUES.has(sansAccents(mot))
      ? mot.slice(0, 1) + "*".repeat(Math.max(mot.length - 1, 1))
      : mot,
  );
}

/** Vrai si le texte contient au moins un mot de la liste. */
export function contientGrossierete(texte: string): boolean {
  return masquerGrossieretes(texte) !== texte;
}
