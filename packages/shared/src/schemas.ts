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
  SHOP_SUGGESTION_STATUSES,
  SIZE_KINDS,
} from "./constants.js";
import { TRACKER_EVENT_TYPES } from "./tracker.js";
import { checkPassword, normalizeEmail } from "./password.js";
import { isIsoDate } from "./time.js";
import { PROPOSAL_STATUSES } from "./states.js";
import { TOURNAMENT_STATUSES } from "./tournaments.js";
import { LINEUP_SLOTS } from "./lineup.js";

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

export const PASSWORD_RULE_MESSAGE =
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
/**
 * Référence d'une image : une adresse extérieure, ou un chemin servi par la
 * ligue (IMG-001).
 *
 * Les fichiers envoyés à l'application sont désormais enregistrés sous la
 * forme `/uploads/avatars/x.webp`, sans hôte : l'adresse du serveur dépend de
 * qui regarde — `localhost` depuis le PC, l'adresse du Wi-Fi depuis le
 * téléphone, le domaine public en ligne — et n'a donc rien à faire dans une
 * colonne. Les adresses complètes restent acceptées : elles désignent des
 * images extérieures, et les lignes écrites avant ce changement.
 *
 * Le chemin est contraint : il commence par `/uploads/`, ne remonte pas de
 * répertoire et n'accepte que des caractères de nom de fichier.
 */
export const imageRefSchema = z
  .string()
  .max(LIMITS.imageUrlMax)
  .refine(
    (value) =>
      /^\/uploads\/(?!.*\.\.)[A-Za-z0-9._\-/]+$/.test(value) ||
      isHttpUrl(value),
    { message: "Adresse d'image invalide" },
  );

/**
 * Une adresse d'image extérieure : `http` ou `https`, et rien d'autre.
 *
 * `z.string().url()` valide la *forme* d'une URL, pas son schéma : il accepte
 * `javascript:alert(1)` et `data:text/html,…` aussi volontiers que
 * `https://…`. Ces valeurs finissent dans un attribut `src`, et un avatar de
 * club est écrit par son fondateur — c'est-à-dire par un utilisateur
 * ordinaire, pas par l'administration. Le schéma se refuse donc ce que le
 * rendu se refuse déjà (`publicImageSrc`), au lieu de compter dessus : deux
 * barrières valent mieux qu'une, et celle-ci arrête la valeur avant qu'elle
 * n'entre en base.
 */
function isHttpUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}

export const shopCategorySchema = z.enum(SHOP_CATEGORIES);
export const shopCategoryFilterSchema = z.enum(SHOP_CATEGORY_FILTERS);
export const shopSuggestionStatusSchema = z.enum(SHOP_SUGGESTION_STATUSES);
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
  (value) =>
    ageOn(value, new Date().toISOString().slice(0, 10)) >= MIN_SIGNUP_AGE,
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
  nationality: z
    .string()
    .trim()
    .length(2, "Nationalité invalide")
    .toUpperCase(),
  password: passwordSchema,
  profilePhotoUrl: imageRefSchema.nullish(),
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
  profilePhotoUrl: imageRefSchema.nullish(),
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
  profilePhotoUrl: imageRefSchema.nullish(),
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

/**
 * Demande de réinitialisation (AUTH-009).
 *
 * Une adresse, rien d'autre. Surtout pas de date de naissance ni de « question
 * secrète » en complément : chaque champ ajouté ici est un champ que le
 * serveur devrait comparer, donc un champ qui renseigne sur ce qu'il contient.
 * La preuve de propriété, c'est l'accès à la boîte.
 */
export const requestPasswordResetSchema = z.object({ email: emailSchema });
export type RequestPasswordResetInput = z.infer<
  typeof requestPasswordResetSchema
>;

/**
 * Pose du nouveau mot de passe, jeton en main.
 *
 * Le jeton fait 32 octets en base64url, soit 43 caractères ; les bornes sont
 * larges pour ne pas rejeter un lien qu'un client de messagerie aurait
 * découpé, et c'est le serveur qui tranche.
 */
export const resetPasswordSchema = z.object({
  token: z.string().trim().min(20).max(200),
  newPassword: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const resetPasswordFormSchema = resetPasswordSchema
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
  /**
   * Nombre de joueurs par équipe, pour les modes dont le format se choisit
   * (MODE-003).
   *
   * Les bornes exactes dépendent du mode et sont vérifiées par le serveur :
   * les répéter ici les figerait en deux endroits. Le schéma ne garde que ce
   * qui vaut pour tous — un entier plausible pour un terrain.
   */
  playersPerTeam: z.number().int().positive().max(50).optional(),
});
export type CreateProposalInput = z.infer<typeof createProposalSchema>;

/**
 * Déplacer une séance gratuite (MODE-003).
 *
 * Ni le lieu ni le mode : seuls la date et l'heure bougent. Changer de
 * terrain reviendrait à créer une autre séance, et le dire ainsi évite une
 * route qui ferait deux choses.
 */
export const rescheduleProposalSchema = z.object({
  proposalId: positiveIntSchema,
  date: isoDateSchema,
  slotStartHour: z.number().int().min(0).max(23),
});
export type RescheduleProposalInput = z.infer<typeof rescheduleProposalSchema>;

/** Le camp d'un joueur, dans les modes où il se choisit (MODE-003). */
export const sideSchema = z.enum(["A", "B"]);
export type Side = z.infer<typeof sideSchema>;

/**
 * Le rang d'une équipe dans sa séance (MODE-005).
 *
 * Un rang et non un identifiant de ligne : l'équipe B d'une séance est la
 * deuxième, et l'écran la nomme ainsi. Le serveur retrouve la ligne à partir
 * de la séance et du rang, ce qui interdit de désigner l'équipe d'une autre
 * séance en changeant un nombre.
 */
export const teamIndexSchema = z.number().int().min(0).max(3);

export const joinProposalSchema = z.object({
  proposalId: positiveIntSchema,
  /** Absent dans les modes qui composent les équipes à la clôture. */
  side: sideSchema.optional(),
  /** L'équipe rejointe, là où elle se choisit (MODE-005). */
  teamIndex: teamIndexSchema.optional(),
});
export type JoinProposalInput = z.infer<typeof joinProposalSchema>;

export const chooseSideSchema = z.object({
  proposalId: positiveIntSchema,
  side: sideSchema,
});
export type ChooseSideInput = z.infer<typeof chooseSideSchema>;

/** Choisir son équipe, là où elles se remplissent au fur et à mesure. */
export const chooseTeamSchema = z.object({
  proposalId: positiveIntSchema,
  teamIndex: teamIndexSchema,
});
export type ChooseTeamInput = z.infer<typeof chooseTeamSchema>;

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
        /**
         * Association bénéficiaire, pour un article de la catégorie « Don »
         * (SHOP-008). Le serveur vérifie qu'elle est fournie pour un don,
         * absente pour tout le reste, et qu'elle est encore active.
         */
        charityId: positiveIntSchema.nullish(),
      }),
    )
    .min(1, "Panier vide")
    .max(20),
  idempotencyKey: z.string().trim().min(8).max(64),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

// ---------------------------------------------------------------------------
// Associations caritatives et propositions de produits (SHOP-008, SHOP-009)
// ---------------------------------------------------------------------------

export const charityInputSchema = z.object({
  name: z.string().trim().min(1).max(LIMITS.charityNameMax),
  description: z.string().trim().max(LIMITS.charityDescriptionMax).default(""),
  imageUrl: imageRefSchema.nullish(),
  /**
   * Le site officiel est obligatoire : un don se fait à une association qu'on
   * peut aller vérifier, pas à un nom dans une liste.
   */
  websiteUrl: z.string().url().max(LIMITS.imageUrlMax),
  active: z.boolean().default(true),
});
export type CharityInput = z.infer<typeof charityInputSchema>;

export const shopSuggestionSchema = z.object({
  title: z.string().trim().min(3).max(LIMITS.suggestionTitleMax),
  description: z.string().trim().min(10).max(LIMITS.suggestionDescriptionMax),
  url: z.string().url().max(LIMITS.imageUrlMax),
});
export type ShopSuggestionInput = z.infer<typeof shopSuggestionSchema>;

export const decideShopSuggestionSchema = z.object({
  suggestionId: positiveIntSchema,
  decision: z.enum(["approved", "rejected"]),
  /** Mot joint à la décision, repris tel quel dans la notification. */
  note: z.string().trim().max(LIMITS.suggestionNoteMax).nullish(),
});
export type DecideShopSuggestionInput = z.infer<
  typeof decideShopSuggestionSchema
>;

// ---------------------------------------------------------------------------
// Avis produits (SHOP-002)
// ---------------------------------------------------------------------------

export const productReviewSchema = z.object({
  shopItemId: positiveIntSchema,
  rating: z.number().int().min(REVIEW_RATING_MIN).max(REVIEW_RATING_MAX),
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
  images: z.array(imageRefSchema).max(LIMITS.imagesPerVenue).default([]),
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

/**
 * Un remplaçant ne vise plus une place en particulier : il entre dans la
 * réservation, et c'est le quota de paiements qui décide ensuite qui reste.
 * Désigner sa victime n'avait donc plus de sens.
 */
export const claimSeatSchema = z.object({
  proposalId: positiveIntSchema,
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
  images: z.array(imageRefSchema).max(LIMITS.imagesPerProduct).default([]),
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
export type TrackerCreateSessionInput = z.infer<
  typeof trackerCreateSessionSchema
>;

export const trackerUpdateSessionSchema = z.object({
  sessionId: positiveIntSchema,
  label: z.string().trim().min(1).max(80).optional(),
  localDate: isoDateSchema.optional(),
  slotStartHour: z.number().int().min(0).max(23).optional(),
  venueId: venueSchema.nullish(),
  division: divisionSchema.nullish(),
});
export type TrackerUpdateSessionInput = z.infer<
  typeof trackerUpdateSessionSchema
>;

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
  label: z
    .string()
    .trim()
    .min(1, "Donnez un repère à cet enregistrement")
    .max(80),
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
      (value.playerId != null) !==
      (value.guestName != null && value.guestName !== ""),
    { message: "Choisissez un joueur inscrit, ou saisissez un nom d'invité." },
  );
export type TrackerAddParticipantInput = z.infer<
  typeof trackerAddParticipantSchema
>;

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
  avatarUrl: imageRefSchema.nullish(),
});
export type CreateSquadInput = z.infer<typeof createSquadSchema>;

export const updateSquadSchema = z.object({
  squadId: positiveIntSchema,
  name: squadNameSchema.optional(),
  description: z.string().trim().max(SQUAD_LIMITS.descriptionMax).nullish(),
  avatarUrl: imageRefSchema.nullish(),
  coverUrl: imageRefSchema.nullish(),
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
export type SquadChallengeCreateInput = z.infer<
  typeof squadChallengeCreateSchema
>;

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
  body: z
    .string()
    .trim()
    .min(1, "Le message est vide")
    .max(SQUAD_LIMITS.messageMax),
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
export type SquadTransferCounterInput = z.infer<
  typeof squadTransferCounterSchema
>;

export const squadTransferRespondSchema = z.object({
  transferId: positiveIntSchema,
  accept: z.boolean(),
});
export type SquadTransferRespondInput = z.infer<
  typeof squadTransferRespondSchema
>;

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

/**
 * La composition du terrain d'un club (CLUB-002).
 *
 * Le tableau peut être vide — c'est ainsi qu'on efface une composition — et
 * ne dépasse jamais cinq entrées, puisqu'il n'y a que cinq emplacements. Le
 * service vérifie le reste : pas deux fois le même emplacement, pas deux fois
 * le même joueur, et chacun membre actif du club.
 */
export const squadLineupSchema = z.object({
  squadId: positiveIntSchema,
  assignments: z
    .array(
      z.object({
        slot: z.enum(LINEUP_SLOTS),
        playerId: positiveIntSchema,
      }),
    )
    .max(LINEUP_SLOTS.length),
});
export type SquadLineupInput = z.infer<typeof squadLineupSchema>;

/**
 * Le cinq d'un club pour un tournoi (TOUR-007).
 *
 * Mêmes emplacements que le terrain d'un club : un tournoi se joue à cinq
 * comme le reste de la ligue. Le tableau peut être vide — c'est ainsi qu'on
 * efface une feuille — et ne dépasse jamais cinq entrées. Le service vérifie
 * le reste : pas deux fois le même emplacement, pas deux fois le même joueur,
 * et chacun membre actif du club engagé.
 */
export const tournamentLineupSchema = z.object({
  entryId: positiveIntSchema,
  assignments: z
    .array(
      z.object({
        slot: z.enum(LINEUP_SLOTS),
        playerId: positiveIntSchema,
      }),
    )
    .max(LINEUP_SLOTS.length),
});
export type TournamentLineupInput = z.infer<typeof tournamentLineupSchema>;

/** Un engagement de club dans un tournoi, désigné par son identifiant. */
export const tournamentEntrySchema = z.object({ entryId: positiveIntSchema });

/**
 * Se placer sur le terrain d'une séance de Grand Foot (MODE-003).
 *
 * `slot` à `null` quitte sa place sans quitter la séance : on peut jouer sans
 * s'être assigné un poste, et se déplacer suppose de pouvoir d'abord se
 * retirer de là où l'on était.
 *
 * L'identifiant de place n'est pas énuméré ici : les places dépendent de
 * l'effectif choisi à la création, que seul le serveur connaît pour cette
 * proposition. Le schéma ne garde que ce qui vaut pour toutes — une chaîne
 * courte et sans surprise.
 */
export const choosePitchSlotSchema = z.object({
  proposalId: positiveIntSchema,
  slot: z
    .string()
    .trim()
    .regex(/^[A-Z]{2,3}[0-9]?$/, "Place invalide")
    .nullable(),
  /**
   * L'équipe où se poser, là où elle se choisit (MODE-005).
   *
   * Toucher une place dans une autre équipe, c'est la rejoindre : le geste
   * est unique à l'écran, il doit l'être côté serveur aussi, sans quoi un
   * refus laisserait le joueur changé d'équipe et sans place.
   */
  teamIndex: teamIndexSchema.optional(),
});
export type ChoosePitchSlotInput = z.infer<typeof choosePitchSlotSchema>;

/**
 * Changer la forme du terrain de son équipe (PITCH-001).
 *
 * La notation, gardien compris : « 1-3-1 », « 1-4-4-2 ». Le schéma ne vérifie
 * que la grammaire — des nombres séparés par des tirets —, parce que les
 * formes valables dépendent de l'effectif, que seul le serveur connaît pour
 * cette proposition. Il la vérifie par `isFormation`, contre le catalogue.
 *
 * Aucune équipe n'est nommée : un joueur ne change que la sienne, et c'est
 * l'absence de paramètre qui le garantit — il n'y a pas d'identifiant à
 * falsifier.
 */
export const setFormationSchema = z.object({
  proposalId: positiveIntSchema,
  formation: z
    .string()
    .trim()
    .regex(/^[1-9][0-9]?(-[1-9][0-9]?){1,4}$/, "Formation invalide"),
});
export type SetFormationInput = z.infer<typeof setFormationSchema>;

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
 * Reversement d'une part de la caisse à un membre (CLUB-002).
 *
 * Le bénéficiaire est désigné explicitement, le fondateur compris : il peut
 * se reverser une avance qu'il a faite, et le lui interdire aurait obligé à
 * passer par un tiers pour un geste parfaitement légitime.
 */
export const squadDistributeSchema = z.object({
  squadId: positiveIntSchema,
  playerId: positiveIntSchema,
  amount: positiveIntSchema.max(1_000_000),
});
export type SquadDistributeInput = z.infer<typeof squadDistributeSchema>;

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

// ---------------------------------------------------------------------------
// Tournois entre SQUADs (TOUR-001)
// ---------------------------------------------------------------------------

/**
 * Création d'un tournoi.
 *
 * Mêmes paramètres qu'une séance du calendrier — une salle, une date, un
 * créneau — plus ce qui fait un tournoi : un plateau, un droit d'engagement et
 * une dotation. La date et le créneau sont validés côté serveur contre les
 * salles réellement ouvertes, comme pour une proposition.
 */
export const createTournamentSchema = z.object({
  name: z.string().trim().min(3).max(120),
  date: isoDateSchema,
  slotStartHour: z.number().int().min(0).max(23),
  venueId: venueSchema,
  /** 4, 8, 16 ou 32 clubs : les seules formes sans exempt. */
  size: z.union([z.literal(4), z.literal(8), z.literal(16), z.literal(32)]),
  entryFeeUno: z.number().int().min(0).max(1_000_000),
  prizeUno: z.number().int().min(0).max(1_000_000),
});
export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;

/**
 * Un format ouvert par la ligue (TOUR-005).
 *
 * La durée n'y figure pas : tous les tournois durent deux heures, et en faire
 * un champ inviterait à la changer par inadvertance.
 */
export const tournamentFormatSchema = z.object({
  name: z.string().trim().min(3).max(120),
  size: z.union([z.literal(4), z.literal(8), z.literal(16), z.literal(32)]),
  entryFeeUno: z.number().int().min(0).max(1_000_000),
  prizeUno: z.number().int().min(0).max(1_000_000),
  active: z.boolean().default(true),
  /** L'affiche du format, en tête du calendrier. `null` la retire. */
  coverImageUrl: imageRefSchema.nullish(),
});
export type TournamentFormatInput = z.infer<typeof tournamentFormatSchema>;

export const tournamentFormatIdSchema = z.object({
  formatId: positiveIntSchema,
});

/**
 * Un club pose une date sur un format (TOUR-005).
 *
 * Il ne choisit ni le plateau ni les prix — ils viennent du format — mais la
 * salle, le jour et l'heure. C'est l'inverse du calendrier des joueurs, où le
 * mode fixe le prix et le joueur choisit le créneau : même principe, autre
 * échelle.
 */
export const proposeTournamentSchema = z.object({
  formatId: positiveIntSchema,
  date: isoDateSchema,
  slotStartHour: z.number().int().min(0).max(23),
  venueId: venueSchema,
});
export type ProposeTournamentInput = z.infer<typeof proposeTournamentSchema>;

export const tournamentIdSchema = z.object({ tournamentId: positiveIntSchema });

/**
 * Ce qu'un écran demande au calendrier des tournois (TOUR-006).
 *
 * Les trois filtres sont envoyés au serveur plutôt qu'appliqués sur une liste
 * déjà tronquée : la requête est bornée à cent lignes, et filtrer après coup
 * aurait fait disparaître des tournois d'un mois simplement parce qu'un autre
 * mois en comptait beaucoup.
 */
export const listTournamentsSchema = z.object({
  status: z.enum(TOURNAMENT_STATUSES).optional(),
  /** Restreint aux tournois où le club du joueur est engagé. */
  mineOnly: z.boolean().default(false),
  /** Premier jour affiché, inclus — la date locale du tournoi. */
  from: isoDateSchema.optional(),
  /** Dernier jour affiché, inclus. */
  to: isoDateSchema.optional(),
  /** Restreint à un format : demi-finales, quarts ou huitièmes. */
  formatId: positiveIntSchema.optional(),
});
export type ListTournamentsInput = z.infer<typeof listTournamentsSchema>;

/**
 * Résultat d'une affiche.
 *
 * Le vainqueur est demandé explicitement, en plus du score : une élimination
 * directe ne connaît pas le nul, et un 2-2 se tranche aux tirs au but — que le
 * score du temps réglementaire ne dit pas. Le serveur refuse un vainqueur qui
 * contredirait un score non nul.
 */
export const recordTournamentMatchSchema = z.object({
  matchId: positiveIntSchema,
  scoreHome: z.number().int().min(0).max(99),
  scoreAway: z.number().int().min(0).max(99),
  winnerEntryId: positiveIntSchema,
});
export type RecordTournamentMatchInput = z.infer<
  typeof recordTournamentMatchSchema
>;
