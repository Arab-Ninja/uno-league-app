import * as z from "zod";
import {
  ANNOUNCEMENT_TYPES,
  DIVISIONS,
  PLAYER_POSITIONS,
  RANKING_SORTS,
  LIMITS,
  PAYMENT_METHODS,
  RANKING_STATS,
  SCHEDULABLE_MODE_IDS,
  SHOP_CATEGORIES,
  SHOP_CATEGORY_FILTERS,
  VENUES,
} from "./constants.js";
import { checkPassword, normalizeEmail } from "./password.js";
import { isIsoDate } from "./time.js";
import { PROPOSAL_STATUSES } from "./states.js";

/**
 * Schémas de validation partagés (SEC-003).
 *
 * Le serveur valide TOUJOURS avec ces schémas ; le client les réutilise pour
 * le retour immédiat de formulaire, sans jamais être la source de vérité.
 *
 * Les messages par défaut de Zod sont basculés en français : une erreur de
 * validation non personnalisée reste ainsi lisible par l'utilisateur, sans
 * message technique en anglais (UX §16, NFR-007).
 */
z.config(z.locales.fr());

const VENUE_IDS = VENUES.map((v) => v.id) as [string, ...string[]];

export const isoDateSchema = z
  .string()
  .refine(isIsoDate, { message: "Date invalide (format attendu AAAA-MM-JJ)" });

export const emailSchema = z
  .string()
  .trim()
  .max(LIMITS.emailMax, "Email trop long")
  .pipe(z.email("Adresse email invalide"))
  .transform(normalizeEmail);

const PASSWORD_RULE_MESSAGE =
  "Le mot de passe doit contenir au moins 8 caractères, une majuscule et un chiffre";

export const passwordSchema = z
  .string()
  .min(LIMITS.passwordMin, PASSWORD_RULE_MESSAGE)
  .max(LIMITS.passwordMax, `Au maximum ${LIMITS.passwordMax} caractères`)
  .refine((value) => checkPassword(value).valid, {
    message: PASSWORD_RULE_MESSAGE,
  });

export const personNameSchema = z
  .string()
  .trim()
  .min(LIMITS.nameMin, "Ce champ est obligatoire")
  .max(LIMITS.nameMax, `Au maximum ${LIMITS.nameMax} caractères`);

export const divisionSchema = z.enum(DIVISIONS);
export const positionSchema = z.enum(PLAYER_POSITIONS);
export const rankingStatSchema = z.enum(RANKING_STATS);
export const rankingSortSchema = z.enum(RANKING_SORTS);
export const schedulableModeSchema = z.enum(SCHEDULABLE_MODE_IDS);
export const venueSchema = z.enum(VENUE_IDS);
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export const shopCategorySchema = z.enum(SHOP_CATEGORIES);
export const shopCategoryFilterSchema = z.enum(SHOP_CATEGORY_FILTERS);
export const announcementTypeSchema = z.enum(ANNOUNCEMENT_TYPES);
export const proposalStatusSchema = z.enum(PROPOSAL_STATUSES);

/** Une date de naissance ne peut pas être dans le futur (CDC §6.2). */
export const dateOfBirthSchema = isoDateSchema.refine(
  (value) => {
    const today = new Date().toISOString().slice(0, 10);
    return value <= today;
  },
  { message: "La date de naissance ne peut pas être dans le futur" },
);

export const positiveIntSchema = z.number().int().positive();
export const nonNegativeIntSchema = z.number().int().min(0);

export const paginationSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(LIMITS.pageSizeMax)
    .default(LIMITS.pageSizeDefault),
  cursor: z.number().int().positive().nullish(),
});
export type PaginationInput = z.infer<typeof paginationSchema>;

// ---------------------------------------------------------------------------
// Authentification et profil
// ---------------------------------------------------------------------------

export const signupSchema = z.object({
  firstName: personNameSchema,
  lastName: personNameSchema,
  dateOfBirth: dateOfBirthSchema,
  email: emailSchema,
  nationality: z.string().trim().length(2, "Nationalité invalide").toUpperCase(),
  password: passwordSchema,
  profilePhotoUrl: z.string().url().max(LIMITS.imageUrlMax).nullish(),
});
export type SignupInput = z.infer<typeof signupSchema>;

/** Formulaire côté client : ajoute la confirmation du mot de passe. */
export const signupFormSchema = signupSchema
  .extend({ confirmPassword: z.string() })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Mot de passe requis").max(LIMITS.passwordMax),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const updateProfileSchema = z.object({
  firstName: personNameSchema.optional(),
  position: positionSchema.optional(),
  lastName: personNameSchema.optional(),
  dateOfBirth: dateOfBirthSchema.optional(),
  nationality: z.string().trim().length(2).toUpperCase().optional(),
  address: z.string().trim().max(LIMITS.addressMax).nullish(),
  profilePhotoUrl: z.string().url().max(LIMITS.imageUrlMax).nullish(),
  photoOffsetY: z.number().int().min(0).max(100).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Mot de passe actuel requis"),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const changePasswordFormSchema = changePasswordSchema
  .extend({ confirmPassword: z.string() })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmPassword"],
  });

// ---------------------------------------------------------------------------
// Calendrier
// ---------------------------------------------------------------------------

export const createProposalSchema = z.object({
  date: isoDateSchema,
  slotStartHour: z.number().int().min(0).max(23),
  venueId: venueSchema,
  modeId: schedulableModeSchema,
});
export type CreateProposalInput = z.infer<typeof createProposalSchema>;

export const listProposalsSchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  venueId: venueSchema.optional(),
  modeId: schedulableModeSchema.optional(),
  status: proposalStatusSchema.optional(),
  /** Restreint aux propositions auxquelles le joueur courant participe. */
  mineOnly: z.boolean().default(false),
});
export type ListProposalsInput = z.infer<typeof listProposalsSchema>;

export const proposalIdSchema = z.object({ proposalId: positiveIntSchema });

export const payProposalSchema = z.object({
  proposalId: positiveIntSchema,
  method: paymentMethodSchema,
  /** Clé d'idempotence fournie par le client (STATE-002). */
  idempotencyKey: z.string().trim().min(8).max(64),
});
export type PayProposalInput = z.infer<typeof payProposalSchema>;

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

export const transferUnoSchema = z.object({
  toPlayerId: positiveIntSchema,
  amount: positiveIntSchema.max(LIMITS.transferMaxUno),
  note: z.string().trim().max(140).optional(),
  idempotencyKey: z.string().trim().min(8).max(64),
});
export type TransferUnoInput = z.infer<typeof transferUnoSchema>;

export const searchPlayersSchema = z.object({
  query: z.string().trim().min(2, "Au moins 2 caractères").max(50),
  limit: z.number().int().min(1).max(20).default(10),
});

// ---------------------------------------------------------------------------
// Boutique
// ---------------------------------------------------------------------------

export const listShopItemsSchema = z.object({
  category: shopCategoryFilterSchema.default("all"),
});

export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        shopItemId: positiveIntSchema,
        quantity: z.number().int().min(1).max(10).default(1),
      }),
    )
    .min(1, "Panier vide")
    .max(20),
  idempotencyKey: z.string().trim().min(8).max(64),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

// ---------------------------------------------------------------------------
// Classement et annonces
// ---------------------------------------------------------------------------

export const rankingSchema = z.object({
  division: divisionSchema,
  /** Par défaut, le classement général pondéré. */
  sort: rankingSortSchema.default("points"),
  limit: z.number().int().min(1).max(LIMITS.pageSizeMax).default(50),
});
export type RankingInput = z.infer<typeof rankingSchema>;

export const announcementIdSchema = z.object({
  announcementId: positiveIntSchema,
});

// ---------------------------------------------------------------------------
// Matchs
// ---------------------------------------------------------------------------

export const matchStatLineSchema = z.object({
  playerId: positiveIntSchema,
  goals: nonNegativeIntSchema.max(50).default(0),
  assists: nonNegativeIntSchema.max(50).default(0),
  defenses: nonNegativeIntSchema.max(99).default(0),
  saves: nonNegativeIntSchema.max(99).default(0),
  motm: z.boolean().default(false),
});

export const reportMatchSchema = z.object({
  matchId: positiveIntSchema,
  scoreA: nonNegativeIntSchema.max(99),
  scoreB: nonNegativeIntSchema.max(99),
  stats: z.array(matchStatLineSchema).max(30).default([]),
});
export type ReportMatchInput = z.infer<typeof reportMatchSchema>;

// ---------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------

export const adminAdjustUnoSchema = z.object({
  playerId: positiveIntSchema,
  /** Montant toujours positif ; le sens est porté par `direction` (ADMIN-002). */
  amount: positiveIntSchema.max(LIMITS.transferMaxUno),
  direction: z.enum(["credit", "debit"]),
  reason: z.string().trim().min(3).max(200),
});
export type AdminAdjustUnoInput = z.infer<typeof adminAdjustUnoSchema>;

export const adminSetDivisionSchema = z.object({
  playerId: positiveIntSchema,
  division: divisionSchema,
  reason: z.string().trim().max(200).optional(),
});

export const adminListPlayersSchema = paginationSchema.extend({
  query: z.string().trim().max(50).optional(),
  division: divisionSchema.optional(),
});

export const shopItemInputSchema = z.object({
  name: z.string().trim().min(1).max(LIMITS.productNameMax),
  description: z.string().trim().max(LIMITS.descriptionMax).default(""),
  category: shopCategorySchema,
  priceUno: positiveIntSchema.max(1_000_000),
  priceEuros: z.number().min(0).max(100_000).nullish(),
  productUrl: z.string().url().max(LIMITS.imageUrlMax).nullish(),
  images: z
    .array(z.string().url().max(LIMITS.imageUrlMax))
    .max(LIMITS.imagesPerProduct)
    .default([]),
  available: z.boolean().default(true),
  stock: nonNegativeIntSchema.max(100_000).nullish(),
});
export type ShopItemInput = z.infer<typeof shopItemInputSchema>;

export const announcementInputSchema = z.object({
  type: announcementTypeSchema,
  title: z.string().trim().min(1).max(LIMITS.titleMax),
  content: z.string().trim().min(1).max(LIMITS.descriptionMax),
  targetDivision: divisionSchema.nullish(),
  publishNow: z.boolean().default(true),
  expiresAt: z.string().datetime().nullish(),
});
export type AnnouncementInput = z.infer<typeof announcementInputSchema>;

export const deviceTokenSchema = z.object({
  platform: z.enum(["ios", "android", "web"]),
  pushToken: z.string().trim().min(8).max(512),
  enabled: z.boolean().default(true),
});
