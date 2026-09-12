import * as z from "zod";
import {
  ACCOUNT_TYPES,
  ADMIN_EVENT_CATEGORIES,
  ANNOUNCEMENT_TYPES,
  DIVISIONS,
  PLAYER_POSITIONS,
  RANKING_SORTS,
  LIMITS,
  PAYMENT_METHODS,
  RANKING_STATS,
  SQUAD_LIMITS,
  SQUAD_ROSTER_SIZE,
  REVIEW_RATING_MAX,
  REVIEW_RATING_MIN,
  SCHEDULABLE_MODE_IDS,
  SHOP_CATEGORIES,
  SHOP_CATEGORY_FILTERS,
  SIZE_KINDS,
} from "./constants.js";
import { TRACKER_EVENT_TYPES } from "./tracker.js";
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
/**
 * Identifiant de salle.
 *
 * Ce fut une énumération figée dans le code ; les salles sont désormais
 * administrables, si bien que la liste des valeurs acceptables n'est plus
 * connue à la compilation. La forme est validée ici, l'existence par le
 * serveur au moment de créer la session (`requireBookableVenue`) : la base
 * reste seule autorité sur les salles qui existent.
 */
export const venueSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9-]+$/, "Identifiant de salle invalide");
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export const shopCategorySchema = z.enum(SHOP_CATEGORIES);
export const shopCategoryFilterSchema = z.enum(SHOP_CATEGORY_FILTERS);
export const announcementTypeSchema = z.enum(ANNOUNCEMENT_TYPES);
export const proposalStatusSchema = z.enum(PROPOSAL_STATUSES);

/**
 * Âge d'un joueur à une date donnée, en années révolues.
 *
 * Le calcul se fait sur les chaînes `AAAA-MM-JJ` plutôt que sur des `Date` :
 * une date de naissance est un jour civil, pas un instant, et la convertir en
 * `Date` la ferait basculer d'un jour selon le fuseau de l'appareil — un
 * joueur né un 1er janvier deviendrait majeur un jour trop tôt à Bruxelles.
 */
export function ageOn(dateOfBirth: string, on: string): number {
  const [birthYear = 0, birthMonth = 0, birthDay = 0] = dateOfBirth
    .split("-")
    .map(Number);
  const [year = 0, month = 0, day = 0] = on.split("-").map(Number);

  let age = year - birthYear;
  // L'anniversaire n'est pas encore passé cette année-là.
  if (month < birthMonth || (month === birthMonth && day < birthDay)) age--;
  return age;
}

/** Âge minimum pour ouvrir un compte (CDC §6.2). */
export const MIN_SIGNUP_AGE = 18;

/** Une date de naissance ne peut pas être dans le futur (CDC §6.2). */
export const dateOfBirthSchema = isoDateSchema.refine(
  (value) => {
    const today = new Date().toISOString().slice(0, 10);
    return value <= today;
  },
  { message: "La date de naissance ne peut pas être dans le futur" },
);

/**
 * Date de naissance d'un joueur qui s'inscrit : la majorité est exigée.
 *
 * La ligue engage des paiements, une adresse de livraison et une
 * responsabilité en salle ; un mineur n'y souscrit pas seul. La règle est
 * vérifiée **par le serveur** — le sélecteur de date de l'écran ne fait que
 * l'annoncer plus tôt.
 */
export const adultDateOfBirthSchema = dateOfBirthSchema.refine(
  (value) => ageOn(value, new Date().toISOString().slice(0, 10)) >= MIN_SIGNUP_AGE,
  {
    message: `L'inscription est réservée aux personnes de ${MIN_SIGNUP_AGE} ans ou plus`,
  },
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
  dateOfBirth: adultDateOfBirthSchema,
  email: emailSchema,
  nationality: z.string().trim().length(2, "Nationalité invalide").toUpperCase(),
  password: passwordSchema,
  profilePhotoUrl: z.string().url().max(LIMITS.imageUrlMax).nullish(),
  /**
   * Joueur ou arbitre (ROLE-003). Choisi une fois à l'inscription ; seule
   * l'administration peut le corriger ensuite.
   */
  accountType: z.enum(ACCOUNT_TYPES).default("player"),
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

/**
 * Ce qu'un joueur modifie lui-même.
 *
 * **Ni la date de naissance, ni l'e-mail.** Tous deux identifient le compte :
 * l'un porte la majorité vérifiée à l'inscription, l'autre sert à s'y
 * reconnecter. Les laisser libres reviendrait à laisser réécrire après coup
 * ce qui a été contrôlé avant. L'administration peut les corriger — une faute
 * de frappe arrive — par `admin.updatePlayer` (ADMIN-008).
 */
export const updateProfileSchema = z.object({
  firstName: personNameSchema.optional(),
  position: positionSchema.optional(),
  lastName: personNameSchema.optional(),
  nationality: z.string().trim().length(2).toUpperCase().optional(),
  address: z.string().trim().max(LIMITS.addressMax).nullish(),
  profilePhotoUrl: z.string().url().max(LIMITS.imageUrlMax).nullish(),
  photoOffsetY: z.number().int().min(0).max(100).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/**
 * Correction d'un joueur par l'administration (ADMIN-008).
 *
 * Le pendant des champs que le joueur ne peut plus toucher lui-même : nom,
 * date de naissance, adresse e-mail. Une faute de frappe à l'inscription
 * arrive, et il faut bien que quelqu'un puisse la réparer — sans quoi la
 * seule issue serait un second compte, c'est-à-dire exactement ce que le
 * verrouillage cherche à éviter.
 *
 * Tous les champs sont facultatifs : l'administration corrige ce qu'elle
 * veut, et ce qu'elle laisse de côté ne bouge pas. La date de naissance reste
 * soumise à la majorité — corriger une faute de frappe ne doit pas ouvrir la
 * porte à un compte mineur.
 *
 * Division, type de compte et droit de supervision gardent leurs routes
 * propres : chacun déclenche des effets de bord (retrait de places, remise à
 * zéro d'un droit) qu'un patch générique masquerait.
 */
export const adminUpdatePlayerSchema = z.object({
  playerId: positiveIntSchema,
  firstName: personNameSchema.optional(),
  lastName: personNameSchema.optional(),
  email: emailSchema.optional(),
  dateOfBirth: adultDateOfBirthSchema.optional(),
  nationality: z.string().trim().length(2).toUpperCase().optional(),
  position: positionSchema.optional(),
  address: z.string().trim().max(LIMITS.addressMax).nullish(),
  profilePhotoUrl: z.string().url().max(LIMITS.imageUrlMax).nullish(),
  photoOffsetY: z.number().int().min(0).max(100).optional(),
  /** Motif consigné au journal d'audit, comme pour un changement de division. */
  reason: z.string().trim().max(200).optional(),
});
export type AdminUpdatePlayerInput = z.infer<typeof adminUpdatePlayerSchema>;

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
  /**
   * Recherche plein texte simple sur le nom et la description. Le filtrage
   * reste côté serveur : le client ne reçoit jamais le catalogue entier pour
   * le trier lui-même (P-004).
   */
  query: z.string().trim().max(LIMITS.searchQueryMax).optional(),
});

export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        shopItemId: positiveIntSchema,
        quantity: z.number().int().min(1).max(10).default(1),
        /**
         * Taille ou pointure choisie. Le serveur vérifie qu'elle est requise,
         * et qu'elle fait bien partie de celles proposées par l'article : une
         * valeur inventée par le client est rejetée.
         */
        size: z.string().trim().max(10).nullish(),
      }),
    )
    .min(1, "Panier vide")
    .max(20),
  idempotencyKey: z.string().trim().min(8).max(64),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

// ---------------------------------------------------------------------------
// Avis produits (SHOP-002)
// ---------------------------------------------------------------------------

export const productReviewSchema = z.object({
  shopItemId: positiveIntSchema,
  rating: z
    .number()
    .int()
    .min(REVIEW_RATING_MIN)
    .max(REVIEW_RATING_MAX),
  comment: z.string().trim().max(LIMITS.reviewCommentMax).nullish(),
});
export type ProductReviewInput = z.infer<typeof productReviewSchema>;

// ---------------------------------------------------------------------------
// Lieux (ADMIN-007)
// ---------------------------------------------------------------------------

export const venueInputSchema = z.object({
  name: z.string().trim().min(1).max(LIMITS.venueNameMax),
  headline: z.string().trim().max(LIMITS.titleMax).nullish(),
  description: z.string().trim().max(LIMITS.descriptionMax).default(""),
  address: z.string().trim().max(LIMITS.addressMax).nullish(),
  timezone: z.string().trim().max(64).optional(),
  images: z
    .array(z.string().url().max(LIMITS.imageUrlMax))
    .max(LIMITS.imagesPerVenue)
    .default([]),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(999).optional(),
});
export type VenueInput = z.infer<typeof venueInputSchema>;

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

/**
 * Ligne de statistiques d'un joueur sur un match.
 *
 * `motm` n'y figure plus : l'homme du match est désormais **calculé** à la
 * clôture de la session, comme le joueur au plus grand total de points. Le
 * laisser saisissable aurait permis deux vérités contradictoires.
 */
export const matchStatLineSchema = z.object({
  playerId: positiveIntSchema,
  goals: nonNegativeIntSchema.max(50).default(0),
  assists: nonNegativeIntSchema.max(50).default(0),
  defenses: nonNegativeIntSchema.max(99).default(0),
  saves: nonNegativeIntSchema.max(99).default(0),
});

export const reportMatchSchema = z.object({
  matchId: positiveIntSchema,
  scoreA: nonNegativeIntSchema.max(99),
  scoreB: nonNegativeIntSchema.max(99),
  stats: z.array(matchStatLineSchema).max(30).default([]),
});
export type ReportMatchInput = z.infer<typeof reportMatchSchema>;

/**
 * Saisie complète d'une session par l'administration (MATCH-003).
 *
 * Toute la feuille arrive d'un coup — chaque match avec son score et ses
 * statistiques — plutôt que match par match : une session à moitié saisie
 * fausserait le classement de session, donc les distinctions et les
 * mouvements de division qui en découlent.
 */
/**
 * Ajout d'un match à une session UNO League (MATCH-001).
 *
 * Une session de deux heures enchaîne des matchs de dix minutes dont le
 * nombre n'est pas connu à l'avance : ils sont donc créés un par un, en
 * désignant les deux équipes qui entrent sur le terrain.
 */
export const addMatchSchema = z.object({
  proposalId: positiveIntSchema,
  teamAId: positiveIntSchema,
  teamBId: positiveIntSchema,
});
export type AddMatchInput = z.infer<typeof addMatchSchema>;

export const removeMatchSchema = z.object({ matchId: positiveIntSchema });

/**
 * Réaffectation d'un joueur à une autre équipe de la session (MATCH-001).
 * Le tirage automatique est un point de départ, pas une contrainte : sur le
 * terrain, les équipes se réajustent.
 */
export const assignTeamSchema = z.object({
  proposalId: positiveIntSchema,
  playerId: positiveIntSchema,
  teamId: positiveIntSchema,
});
export type AssignTeamInput = z.infer<typeof assignTeamSchema>;

export const recordSessionSchema = z.object({
  proposalId: positiveIntSchema,
  matches: z
    .array(
      z.object({
        matchId: positiveIntSchema,
        scoreA: nonNegativeIntSchema.max(99),
        scoreB: nonNegativeIntSchema.max(99),
        stats: z.array(matchStatLineSchema).max(30).default([]),
      }),
    )
    .min(1, "Aucun match à enregistrer")
    .max(10),
  /** Clôture la session dans la foulée : distinctions, récompenses, divisions. */
  complete: z.boolean().default(true),
});
export type RecordSessionInput = z.infer<typeof recordSessionSchema>;

// ---------------------------------------------------------------------------
// Supervision et vidéos (SUP-001, SUP-002)
// ---------------------------------------------------------------------------

export const setSupervisorSchema = z.object({
  playerId: positiveIntSchema,
  isSupervisor: z.boolean(),
  reason: z.string().trim().max(LIMITS.descriptionMax).optional(),
});
export type SetSupervisorInput = z.infer<typeof setSupervisorSchema>;

/**
 * Ajout d'une vidéo de session.
 *
 * L'adresse n'est validée ici que sur sa forme ; le serveur la réanalyse pour
 * en tirer l'hébergeur et l'adresse jouable — ce que le client envoie ne
 * décide jamais de ce qui sera intégré dans la page (SUP-002).
 */
export const addSessionVideoSchema = z.object({
  proposalId: positiveIntSchema,
  url: z
    .string()
    .trim()
    .min(1, "Collez l'adresse de la vidéo")
    .max(LIMITS.videoUrlMax)
    .refine(
      (value) => /^https?:\/\//i.test(value),
      "L'adresse doit commencer par http:// ou https://",
    ),
  label: z.string().trim().max(LIMITS.videoLabelMax).optional(),
});
export type AddSessionVideoInput = z.infer<typeof addSessionVideoSchema>;

export const removeSessionVideoSchema = z.object({
  proposalId: positiveIntSchema,
  videoId: positiveIntSchema,
});
export type RemoveSessionVideoInput = z.infer<typeof removeSessionVideoSchema>;

// ---------------------------------------------------------------------------
// Remplaçants (CAL-008)
// ---------------------------------------------------------------------------

export const substituteSchema = z.object({ proposalId: positiveIntSchema });

// ---------------------------------------------------------------------------
// Arbitrage (ROLE-003)
// ---------------------------------------------------------------------------

export const refereeSchema = z.object({ proposalId: positiveIntSchema });

export const adminSetAccountTypeSchema = z.object({
  playerId: positiveIntSchema,
  accountType: z.enum(ACCOUNT_TYPES),
  reason: z.string().trim().max(200).optional(),
});

export const claimSeatSchema = z.object({
  proposalId: positiveIntSchema,
  /** Place visée ; à défaut, la plus ancienne place impayée est reprise. */
  replacePlayerId: positiveIntSchema.optional(),
  idempotencyKey: z.string().trim().min(8).max(64),
});
export type ClaimSeatInput = z.infer<typeof claimSeatSchema>;

// ---------------------------------------------------------------------------
// Flux d'évènements de l'administration (ADMIN-006)
// ---------------------------------------------------------------------------

export const adminEventsSchema = z.object({
  category: z.enum(ADMIN_EVENT_CATEGORIES).optional(),
  unreadOnly: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(30),
});
export type AdminEventsInput = z.infer<typeof adminEventsSchema>;

export const markAdminEventsReadSchema = z.object({
  throughId: positiveIntSchema,
});

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
  /** « Vêtement », « chaussures » ou taille unique : choisi par l'administration. */
  sizeKind: z.enum(SIZE_KINDS).default("none"),
  /** Tailles réellement proposées ; vide = toutes celles du type. */
  sizes: z.array(z.string().trim().min(1).max(10)).max(30).default([]),
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

// ---------------------------------------------------------------------------
// Saisie en visionnage (TRACK-001)
// ---------------------------------------------------------------------------

export const trackerSessionIdSchema = z.object({
  sessionId: positiveIntSchema,
});

/**
 * Identifiant d'action produit par l'appareil de saisie.
 *
 * Il n'est pas décoratif : c'est la clé d'unicité en base, donc ce qui rend
 * une synchronisation rejouable sans doublon. On accepte un UUID ou toute
 * chaîne suffisamment longue et sans espace, pour ne pas imposer une
 * implémentation particulière au client.
 */
export const trackerClientIdSchema = z
  .string()
  .trim()
  .min(8, "Identifiant d'action trop court")
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Identifiant d'action invalide");

export const trackerCreateSessionSchema = z.object({
  label: z.string().trim().min(1, "Donnez un nom à la session").max(80),
  localDate: isoDateSchema,
  slotStartHour: z.number().int().min(0).max(23).default(20),
  venueId: venueSchema.nullish(),
  division: divisionSchema.nullish(),
  modeId: schedulableModeSchema.default("league"),
  /** Rattachement à une session réservée existante, facultatif. */
  proposalId: positiveIntSchema.nullish(),
});
export type TrackerCreateSessionInput = z.infer<typeof trackerCreateSessionSchema>;

export const trackerUpdateSessionSchema = z.object({
  sessionId: positiveIntSchema,
  label: z.string().trim().min(1).max(80).optional(),
  localDate: isoDateSchema.optional(),
  slotStartHour: z.number().int().min(0).max(23).optional(),
  venueId: venueSchema.nullish(),
  division: divisionSchema.nullish(),
});
export type TrackerUpdateSessionInput = z.infer<typeof trackerUpdateSessionSchema>;

/**
 * Ajout d'un enregistrement à une feuille de saisie (TRACK-001).
 *
 * L'adresse est facultative : un fichier ouvert depuis le disque ne passe
 * jamais par le serveur. L'entrée n'est alors qu'un repère nommé, que l'on
 * ré-associe à son fichier à chaque visite — mais qui suffit à un match pour
 * dire dans quel enregistrement se trouve son coup d'envoi.
 */
export const trackerAddVideoSchema = z.object({
  sessionId: positiveIntSchema,
  label: z.string().trim().min(1, "Donnez un repère à cet enregistrement").max(80),
  url: z
    .string()
    .trim()
    .max(LIMITS.videoUrlMax)
    .refine(
      (value) => value === "" || /^https?:\/\//i.test(value),
      "L'adresse doit commencer par http:// ou https://",
    )
    .nullish(),
});
export type TrackerAddVideoInput = z.infer<typeof trackerAddVideoSchema>;

export const trackerRemoveVideoSchema = z.object({
  sessionId: positiveIntSchema,
  videoId: positiveIntSchema,
});
export type TrackerRemoveVideoInput = z.infer<typeof trackerRemoveVideoSchema>;

/**
 * Ajout d'un joueur à la feuille.
 *
 * Un compte OU un nom d'invité, jamais les deux ni aucun : un invité est par
 * définition quelqu'un qu'on n'a pas pris le temps d'identifier.
 */
export const trackerAddParticipantSchema = z
  .object({
    sessionId: positiveIntSchema,
    teamId: positiveIntSchema,
    playerId: positiveIntSchema.nullish(),
    guestName: z.string().trim().min(1).max(40).nullish(),
    shirtNumber: z.number().int().min(0).max(99).nullish(),
  })
  .refine(
    (value) =>
      (value.playerId != null) !== (value.guestName != null && value.guestName !== ""),
    { message: "Choisissez un joueur inscrit, ou saisissez un nom d'invité." },
  );
export type TrackerAddParticipantInput = z.infer<typeof trackerAddParticipantSchema>;

export const trackerMoveParticipantSchema = z.object({
  participantId: positiveIntSchema,
  teamId: positiveIntSchema,
});

export const trackerParticipantIdSchema = z.object({
  participantId: positiveIntSchema,
});

export const trackerLinkParticipantSchema = z.object({
  participantId: positiveIntSchema,
  playerId: positiveIntSchema,
});

/**
 * Composition automatique équilibrée à partir d'une liste de joueurs.
 *
 * Le tirage réutilise celui des sessions réservées : chapeaux par niveau puis
 * serpentin. Les équipes de la feuille sont remplacées, ce qui n'est
 * acceptable que tant qu'aucune action n'a été saisie.
 */
export const trackerDraftSchema = z.object({
  sessionId: positiveIntSchema,
  playerIds: z.array(positiveIntSchema).min(2).max(24),
});

export const trackerCopyRosterSchema = z.object({
  sessionId: positiveIntSchema,
  fromSessionId: positiveIntSchema,
});

export const trackerAddMatchSchema = z.object({
  sessionId: positiveIntSchema,
  teamAId: positiveIntSchema,
  teamBId: positiveIntSchema,
});

export const trackerUpdateMatchSchema = z.object({
  matchId: positiveIntSchema,
  status: z.enum(["pending", "playing", "finished"]).optional(),
  videoStartMs: nonNegativeIntSchema.max(86_400_000).nullish(),
  /** Enregistrement d'où le coup d'envoi a été relevé (TRACK-001). */
  videoId: positiveIntSchema.nullish(),
  declaredScoreA: nonNegativeIntSchema.max(99).nullish(),
  declaredScoreB: nonNegativeIntSchema.max(99).nullish(),
});

export const trackerMatchIdSchema = z.object({ matchId: positiveIntSchema });

export const trackerEventSchema = z.object({
  clientId: trackerClientIdSchema,
  matchId: positiveIntSchema,
  type: z.enum(TRACKER_EVENT_TYPES),
  participantId: positiveIntSchema,
  assistParticipantId: positiveIntSchema.nullish(),
  teamId: positiveIntSchema,
  clockMs: nonNegativeIntSchema.max(7_200_000),
  videoMs: nonNegativeIntSchema.max(86_400_000).nullish(),
});
export type TrackerEventInput = z.infer<typeof trackerEventSchema>;

/**
 * Synchronisation des actions saisies.
 *
 * L'écran de saisie travaille en local et pousse par lots : la saisie ne
 * dépend donc jamais du réseau, et une salle sans couverture n'empêche rien.
 * Les créations sont idempotentes par `clientId`, les suppressions aussi —
 * supprimer une action déjà supprimée n'est pas une erreur, sans quoi une
 * file d'attente rejouée après coupure échouerait entièrement.
 */
export const trackerSyncSchema = z.object({
  sessionId: positiveIntSchema,
  upserts: z.array(trackerEventSchema).max(500).default([]),
  deletions: z.array(trackerClientIdSchema).max(500).default([]),
});
export type TrackerSyncInput = z.infer<typeof trackerSyncSchema>;

/**
 * Publication d'une session saisie vers le classement officiel.
 *
 * `awardUno` commande les récompenses en monnaie interne. Par défaut elles ne
 * sont pas versées : une session saisie a pu être encaissée hors de
 * l'application, ou saisie a posteriori pour rattraper un historique, et
 * créditer des UNO dans ces deux cas serait un cadeau involontaire. Les
 * statistiques, l'XP, les distinctions et les mouvements de division, eux,
 * s'appliquent toujours — c'est le but de la publication.
 */
export const trackerPublishSchema = z.object({
  sessionId: positiveIntSchema,
  awardUno: z.boolean().default(false),
});
export type TrackerPublishInput = z.infer<typeof trackerPublishSchema>;

// ---------------------------------------------------------------------------
// Mode SQUAD (SQUAD-001)
// ---------------------------------------------------------------------------

/**
 * Nom d'un SQUAD.
 *
 * Les espaces de début et de fin sont retirés, et les espaces multiples
 * réduits : « Les   Loups » et « Les Loups  » désigneraient sinon deux clubs
 * différents, alors que l'unicité du nom est une règle du mode.
 */
export const squadNameSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(SQUAD_LIMITS.nameMin, "Le nom doit faire au moins 3 caractères")
      .max(SQUAD_LIMITS.nameMax, "Le nom est trop long"),
  );

export const createSquadSchema = z.object({
  name: squadNameSchema,
  description: z.string().trim().max(SQUAD_LIMITS.descriptionMax).nullish(),
  avatarUrl: z.string().url().max(LIMITS.imageUrlMax).nullish(),
});
export type CreateSquadInput = z.infer<typeof createSquadSchema>;

export const updateSquadSchema = z.object({
  squadId: positiveIntSchema,
  name: squadNameSchema.optional(),
  description: z.string().trim().max(SQUAD_LIMITS.descriptionMax).nullish(),
  avatarUrl: z.string().url().max(LIMITS.imageUrlMax).nullish(),
});
export type UpdateSquadInput = z.infer<typeof updateSquadSchema>;

export const squadJoinRequestSchema = z.object({
  squadId: positiveIntSchema,
  message: z.string().trim().max(SQUAD_LIMITS.descriptionMax).nullish(),
});
export type SquadJoinRequestInput = z.infer<typeof squadJoinRequestSchema>;

export const squadDecideRequestSchema = z.object({
  requestId: positiveIntSchema,
  accept: z.boolean(),
});
export type SquadDecideRequestInput = z.infer<typeof squadDecideRequestSchema>;

export const squadSetRoleSchema = z.object({
  squadId: positiveIntSchema,
  playerId: positiveIntSchema,
  /**
   * Seuls « capitaine » et « membre » se donnent ainsi. Le rôle de fondateur
   * se transmet par une route distincte : il emporte la propriété du club, et
   * le confondre avec une promotion ordinaire inviterait à le céder par
   * inadvertance.
   */
  role: z.enum(["captain", "member"]),
});
export type SquadSetRoleInput = z.infer<typeof squadSetRoleSchema>;

export const squadRemoveMemberSchema = z.object({
  squadId: positiveIntSchema,
  playerId: positiveIntSchema,
});
export type SquadRemoveMemberInput = z.infer<typeof squadRemoveMemberSchema>;

export const squadTransferOwnershipSchema = z.object({
  squadId: positiveIntSchema,
  toPlayerId: positiveIntSchema,
});
export type SquadTransferOwnershipInput = z.infer<
  typeof squadTransferOwnershipSchema
>;

export const squadContributeSchema = z.object({
  squadId: positiveIntSchema,
  /**
   * Les UNO sont entiers, et une contribution nulle n'aurait aucun sens : le
   * plancher est à 1, comme partout ailleurs dans le registre.
   */
  amount: positiveIntSchema,
});
export type SquadContributeInput = z.infer<typeof squadContributeSchema>;

// --- Défis et fils de discussion (SQUAD-004, SQUAD-005) --------------------

export const squadChallengeCreateSchema = z.object({
  squadId: positiveIntSchema,
  opponentSquadId: positiveIntSchema,
  venueId: z.string().trim().min(1).max(40),
  date: isoDateSchema,
  startHour: z.number().int().min(0).max(23),
  durationMinutes: z.union([z.literal(60), z.literal(120)]),
  /** Une mise nulle est permise : c'est un défi d'honneur. */
  stakeUno: nonNegativeIntSchema,
  message: z.string().trim().max(SQUAD_LIMITS.messageMax).nullish(),
});
export type SquadChallengeCreateInput = z.infer<typeof squadChallengeCreateSchema>;

export const squadCounterOfferSchema = z.object({
  challengeId: positiveIntSchema,
  stakeUno: positiveIntSchema,
});
export type SquadCounterOfferInput = z.infer<typeof squadCounterOfferSchema>;

/**
 * Désigne un fil : le chat interne d'un club, ou celui d'un défi.
 *
 * L'union discriminée évite un couple (portée, identifiant) que l'appelant
 * pourrait mal assortir — un identifiant de défi avec la portée « squad »
 * aurait ouvert un fil qui n'est pas le sien.
 */
export const squadThreadSchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("squad"), squadId: positiveIntSchema }),
  z.object({ scope: z.literal("challenge"), challengeId: positiveIntSchema }),
]);
export type SquadThreadInput = z.infer<typeof squadThreadSchema>;

export const squadPostMessageSchema = z.object({
  thread: squadThreadSchema,
  body: z.string().trim().min(1, "Le message est vide").max(SQUAD_LIMITS.messageMax),
});
export type SquadPostMessageInput = z.infer<typeof squadPostMessageSchema>;

// --- Marché des transferts (SQUAD-008) ------------------------------------

/** Place un membre sur la liste des transferts, ou l'en retire. */
export const squadListPlayerSchema = z.object({
  playerId: positiveIntSchema,
  listed: z.boolean(),
});
export type SquadListPlayerInput = z.infer<typeof squadListPlayerSchema>;

/**
 * Ouvre un dossier de transfert.
 *
 * Les deux montants sont séparés parce qu'ils ont deux destinataires :
 * l'indemnité va au club vendeur, la prime au joueur. Les additionner ici
 * aurait obligé le service à deviner la répartition.
 */
export const squadTransferOpenSchema = z.object({
  squadId: positiveIntSchema,
  playerId: positiveIntSchema,
  /** Une indemnité nulle est permise : un club peut céder un joueur pour rien. */
  feeUno: nonNegativeIntSchema,
  signingBonusUno: nonNegativeIntSchema,
});
export type SquadTransferOpenInput = z.infer<typeof squadTransferOpenSchema>;

export const squadTransferCounterSchema = z.object({
  transferId: positiveIntSchema,
  feeUno: positiveIntSchema,
});
export type SquadTransferCounterInput = z.infer<typeof squadTransferCounterSchema>;

export const squadTransferRespondSchema = z.object({
  transferId: positiveIntSchema,
  accept: z.boolean(),
});
export type SquadTransferRespondInput = z.infer<typeof squadTransferRespondSchema>;

// --- Places et règlement d'un défi (SQUAD-006) -----------------------------

/**
 * Inscrire ou retirer un joueur de la composition.
 *
 * Le club n'est pas repris dans l'entrée : il se déduit de la place du joueur
 * dans le défi. Le demander ouvrirait la porte à une incohérence — un
 * identifiant de club qui n'est pas celui du joueur désigné — que le service
 * devrait ensuite rejeter.
 */
export const squadSeatSchema = z.object({
  challengeId: positiveIntSchema,
  playerId: positiveIntSchema,
});
export type SquadSeatInput = z.infer<typeof squadSeatSchema>;

/** Régler sa propre place, depuis son portefeuille. */
export const squadSeatPaySchema = z.object({
  challengeId: positiveIntSchema,
});
export type SquadSeatPayInput = z.infer<typeof squadSeatPaySchema>;

/**
 * Prise en charge par la caisse (décision du fondateur).
 *
 * Plusieurs joueurs d'un coup, parce que c'est ainsi que la décision se
 * prend : « je paie pour ces trois-là ». Une place déjà réglée dans la liste
 * ne coûte rien de plus — le service la laisse telle quelle.
 */
export const squadSeatCoverSchema = z.object({
  challengeId: positiveIntSchema,
  playerIds: z
    .array(positiveIntSchema)
    .min(1, "Désignez au moins un joueur")
    .max(SQUAD_ROSTER_SIZE),
});
export type SquadSeatCoverInput = z.infer<typeof squadSeatCoverSchema>;

/**
 * Règlement d'un défi : la mise revient au vainqueur, ou à chacun sur un nul.
 *
 * `winnerSquadId` absent vaut match nul. En phase 5, c'est le résultat du
 * match qui appellera ce règlement ; la route sert d'abord à l'administration.
 */
export const squadSettleSchema = z.object({
  challengeId: positiveIntSchema,
  winnerSquadId: positiveIntSchema.nullish(),
});
export type SquadSettleInput = z.infer<typeof squadSettleSchema>;
