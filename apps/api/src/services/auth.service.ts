import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import {
  AppError,
  SIGNUP_BONUS_UNO,
  SIGNUP_DIVISION,
  SIGNUP_LEVEL,
  levelFromXp,
  type LoginInput,
  type SignupInput,
} from "@uno/shared";
import { db, type Executor } from "../db/client.js";
import { players, sessions, users } from "../db/schema.js";
import { env } from "../env.js";
import { isDuplicateKeyError } from "../lib/errors.js";
import { hashPassword, needsRehash, verifyPassword } from "../lib/password.js";
import { credit } from "./ledger.service.js";
import { writeAudit } from "./audit.service.js";

/**
 * Authentification serveur (CDC §6, §17).
 *
 * Le jeton de session est une valeur aléatoire de 32 octets. Seul son HMAC
 * est stocké : une fuite de la table `sessions` ne permet ni de rejouer une
 * session ni de la forger, puisque le secret serveur n'est pas en base.
 *
 * Le client n'a jamais accès au mot de passe ni au hash (SEC-001) ; il ne
 * conserve qu'un jeton opaque, dans un cookie httpOnly côté web et dans le
 * trousseau sécurisé côté application native.
 */

const SESSION_TOKEN_BYTES = 32;

export interface AuthenticatedIdentity {
  userId: number;
  playerId: number;
  email: string;
  role: "user" | "admin";
  /**
   * Colonne `players.is_supervisor`, telle quelle (SUP-001).
   *
   * Relue en base à chaque requête, comme le rôle : un droit retiré s'applique
   * dès l'appel suivant, sans attendre que la session expire.
   *
   * Ce n'est **pas** la réponse à « cette personne peut-elle saisir ? » :
   * l'administration le peut sans porter le drapeau. Cette question a une
   * seule réponse, `maySupervise`, pour qu'elle ne se réinvente pas d'un
   * appelant à l'autre — c'est en la dérivant ici qu'elle avait fini par
   * manquer partout où l'identité n'est pas construite par `resolveSession`.
   */
  isSupervisor: boolean;
}

/**
 * Qui a le droit de saisir une feuille de match (SUP-001).
 *
 * L'administration supervise par nature ; un superviseur désigné aussi. Toute
 * autorisation de saisie passe par ici.
 */
export function maySupervise(identity: {
  role: "user" | "admin";
  isSupervisor: boolean;
}): boolean {
  return identity.role === "admin" || identity.isSupervisor;
}

export function hashSessionToken(token: string): string {
  return createHmac("sha256", env.SESSION_SECRET).update(token).digest("hex");
}

function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
}

function sessionExpiry(): Date {
  return new Date(Date.now() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function buildDisplayName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.trim().slice(0, 101);
}

export interface AuthResult {
  token: string;
  expiresAt: Date;
  identity: AuthenticatedIdentity;
}

async function createSession(
  executor: Executor,
  userId: number,
  userAgent?: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = sessionExpiry();

  await executor.insert(sessions).values({
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt,
    userAgent: userAgent?.slice(0, 255) ?? null,
  });

  return { token, expiresAt };
}

/**
 * Inscription (AUTH-001, AUTH-003).
 *
 * Le compte est créé en D3, niveau 1, XP 0. Les 1000 UNO offerts passent par
 * le registre : le solde initial a donc sa ligne de transaction, et l'audit
 * de cohérence reste vrai dès la première seconde de vie du compte.
 */
export async function signup(
  input: SignupInput,
  options: { userAgent?: string } = {},
): Promise<AuthResult> {
  const passwordHash = await hashPassword(input.password);

  try {
    const identity = await db.transaction(async (tx) => {
      const insertedUser = await tx.insert(users).values({
        email: input.email,
        passwordHash,
        role: "user",
        status: "active",
        lastSignedIn: new Date(),
      });
      const userId = Number(insertedUser[0].insertId);

      const insertedPlayer = await tx.insert(players).values({
        userId,
        firstName: input.firstName,
        lastName: input.lastName,
        displayName: buildDisplayName(input.firstName, input.lastName),
        nationality: input.nationality,
        dateOfBirth: input.dateOfBirth,
        profilePhotoUrl: input.profilePhotoUrl ?? null,
        accountType: input.accountType,
        division: SIGNUP_DIVISION,
        unoPoints: 0,
        xp: 0,
        level: SIGNUP_LEVEL,
      });
      const playerId = Number(insertedPlayer[0].insertId);

      await credit(tx, {
        playerId,
        amount: SIGNUP_BONUS_UNO,
        type: "signup_bonus",
        description: "Bonus de bienvenue",
        referenceType: "signup",
        referenceId: playerId,
        idempotencyKey: `signup:${playerId}`,
      });

      return {
        userId,
        playerId,
        email: input.email,
        role: "user" as const,
        isSupervisor: false,
      };
    });

    const session = await createSession(db, identity.userId, options.userAgent);
    return { ...session, identity };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      // AUTH-003 : l'unicité est garantie par l'index, pas par une lecture
      // préalable — deux inscriptions simultanées ne peuvent pas passer.
      throw new AppError("EMAIL_ALREADY_USED", undefined, {
        email: "Cet email est déjà utilisé.",
      });
    }
    throw error;
  }
}

/**
 * Connexion (AUTH-004).
 * La réponse est identique que l'email soit inconnu ou le mot de passe faux,
 * afin de ne pas révéler l'existence d'un compte.
 */
export async function login(
  input: LoginInput,
  options: { userAgent?: string } = {},
): Promise<AuthResult> {
  const [row] = await db
    .select({
      userId: users.id,
      email: users.email,
      role: users.role,
      status: users.status,
      passwordHash: users.passwordHash,
      playerId: players.id,
      isSupervisor: players.isSupervisor,
    })
    .from(users)
    .leftJoin(players, eq(players.userId, users.id))
    .where(eq(users.email, input.email))
    .limit(1);

  // Un hash factice est vérifié lorsque l'email est inconnu : le temps de
  // réponse ne permet donc pas d'énumérer les comptes existants.
  const hashToCheck =
    row?.passwordHash ??
    "scrypt$32768$8$3$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
  const passwordOk = await verifyPassword(input.password, hashToCheck);

  if (!row || !passwordOk || row.playerId === null) {
    throw new AppError("INVALID_CREDENTIALS");
  }
  if (row.status !== "active") {
    throw new AppError(
      "FORBIDDEN",
      "Ce compte est suspendu. Contactez un administrateur.",
    );
  }

  // Remontée transparente des paramètres de hachage si la politique a durci.
  if (needsRehash(row.passwordHash)) {
    const upgraded = await hashPassword(input.password);
    await db
      .update(users)
      .set({ passwordHash: upgraded })
      .where(eq(users.id, row.userId));
  }

  await db
    .update(users)
    .set({ lastSignedIn: new Date() })
    .where(eq(users.id, row.userId));

  const session = await createSession(db, row.userId, options.userAgent);
  return {
    ...session,
    identity: {
      userId: row.userId,
      playerId: row.playerId,
      email: row.email,
      role: row.role,
      isSupervisor: row.isSupervisor ?? false,
    },
  };
}

/** Déconnexion (AUTH-005) : la session est détruite côté serveur. */
export async function logout(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
}

/** Révoque toutes les sessions d'un utilisateur (changement de mot de passe). */
export async function revokeAllSessions(
  executor: Executor,
  userId: number,
): Promise<void> {
  await executor.delete(sessions).where(eq(sessions.userId, userId));
}

/**
 * Résolution d'une session (AUTH-006).
 * Renvoie null si le jeton est inconnu, expiré, ou si le compte n'est plus
 * actif — l'application redirige alors vers l'écran de connexion.
 */
export async function resolveSession(
  token: string,
): Promise<AuthenticatedIdentity | null> {
  if (!token || token.length < 20 || token.length > 200) return null;

  const tokenHash = hashSessionToken(token);

  const [row] = await db
    .select({
      sessionId: sessions.id,
      userId: users.id,
      email: users.email,
      role: users.role,
      status: users.status,
      playerId: players.id,
      isSupervisor: players.isSupervisor,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(players, eq(players.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!row || row.status !== "active" || row.playerId === null) return null;

  // Trace de dernière activité, utile pour l'expiration par inactivité.
  await db
    .update(sessions)
    .set({ lastUsedAt: new Date() })
    .where(eq(sessions.id, row.sessionId));

  return {
    userId: row.userId,
    playerId: row.playerId,
    email: row.email,
    role: row.role,
    isSupervisor: row.isSupervisor ?? false,
  };
}

/**
 * Changement de mot de passe (AUTH-008).
 * Toutes les autres sessions sont invalidées : un mot de passe compromis ne
 * laisse pas de session ouverte derrière lui.
 */
export async function changePassword(params: {
  userId: number;
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);

  if (!user) throw new AppError("NOT_FOUND", "Compte introuvable.");

  const ok = await verifyPassword(params.currentPassword, user.passwordHash);
  if (!ok) {
    throw new AppError("INVALID_CREDENTIALS", "Mot de passe actuel incorrect.", {
      currentPassword: "Mot de passe actuel incorrect.",
    });
  }

  const passwordHash = await hashPassword(params.newPassword);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, params.userId));
    await revokeAllSessions(tx, params.userId);
    await writeAudit(tx, {
      actorUserId: params.userId,
      action: "user.password.change",
      entityType: "user",
      entityId: params.userId,
    });
  });
}

/** Purge les sessions expirées ; appelée périodiquement par le serveur. */
export async function purgeExpiredSessions(): Promise<number> {
  const result = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()));
  return Number(result[0].affectedRows ?? 0);
}

/**
 * Crée le compte administrateur initial s'il n'existe pas (ADMIN-001).
 * Les identifiants proviennent de l'environnement, jamais du bundle client.
 */
export async function ensureAdminAccount(): Promise<void> {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) return;

  const email = env.ADMIN_EMAIL.trim().toLowerCase();
  const [existing] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    if (existing.role !== "admin") {
      await db
        .update(users)
        .set({ role: "admin" })
        .where(eq(users.id, existing.id));
    }
    return;
  }

  const passwordHash = await hashPassword(env.ADMIN_PASSWORD);

  await db.transaction(async (tx) => {
    const insertedUser = await tx.insert(users).values({
      email,
      passwordHash,
      role: "admin",
      status: "active",
    });
    const userId = Number(insertedUser[0].insertId);

    const insertedPlayer = await tx.insert(players).values({
      userId,
      firstName: "Administrateur",
      lastName: "UNO League",
      displayName: "Administrateur UNO League",
      nationality: "BE",
      dateOfBirth: "1990-01-01",
      division: SIGNUP_DIVISION,
      unoPoints: 0,
      xp: 0,
      level: levelFromXp(0),
    });

    await credit(tx, {
      playerId: Number(insertedPlayer[0].insertId),
      amount: SIGNUP_BONUS_UNO,
      type: "signup_bonus",
      description: "Bonus de bienvenue",
      referenceType: "signup",
      referenceId: Number(insertedPlayer[0].insertId),
      idempotencyKey: `signup:${Number(insertedPlayer[0].insertId)}`,
    });
  });
}

/** Comparaison à temps constant, pour les secrets courts (webhooks). */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
