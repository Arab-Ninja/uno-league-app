import { and, eq, like, ne, or } from "drizzle-orm";
import {
  AppError,
  cardTier,
  levelFromXp,
  type AccountType,
  type Division,
  type PlayerProfile,
  type PublicPlayer,
  type UpdateProfileInput,
} from "@uno/shared";
import { db, type Executor } from "../db/client.js";
import { players, users } from "../db/schema.js";
import { writeAudit } from "./audit.service.js";

/**
 * Profil joueur (CDC §6, ROLE-002).
 *
 * Deux vues distinctes :
 *  - `PlayerProfile`, complet, réservé au propriétaire du compte et aux
 *    administrateurs ;
 *  - `PublicPlayer`, réduit, pour les classements, les listes de participants
 *    et la recherche de destinataire du wallet.
 *
 * Le joueur ne peut modifier ni sa division, ni son solde, ni ses statistiques
 * (AUTH-007) : ces champs ne figurent tout simplement pas dans l'entrée
 * acceptée par `updateProfile`.
 */

function toProfile(
  player: typeof players.$inferSelect,
  email: string,
): PlayerProfile {
  return {
    id: player.id,
    userId: player.userId,
    firstName: player.firstName,
    lastName: player.lastName,
    displayName: player.displayName,
    email,
    address: player.address,
    nationality: player.nationality,
    dateOfBirth: player.dateOfBirth,
    profilePhotoUrl: player.profilePhotoUrl,
    photoOffsetY: player.photoOffsetY,
    accountType: player.accountType,
    sessionsRefereed: player.sessionsRefereed,
    isSupervisor: player.isSupervisor,
    division: publishedDivision(player),
    position: player.position,
    unoPoints: player.unoPoints,
    xp: player.xp,
    // Le niveau est toujours dérivé de l'XP : les deux ne peuvent pas diverger.
    level: levelFromXp(player.xp),
    goals: player.goals,
    assists: player.assists,
    defenses: player.defenses,
    saves: player.saves,
    motm: player.motm,
    matchesPlayed: player.matchesPlayed,
    // La note est stockée (CARD-002) : elle doit pouvoir descendre, ce qu'un
    // total de carrière ne permet pas. L'aspect, lui, reste dérivé de la
    // division.
    rating: player.rating,
    tier: cardTier(player.division, player.accountType),
    createdAt: player.createdAt.toISOString(),
  };
}

/**
 * Colonnes nécessaires pour dessiner la carte d'un joueur.
 * Regroupées ici pour que chaque requête affichant des cartes sélectionne
 * exactement le même ensemble, sans jamais exposer de donnée personnelle
 * (ROLE-002).
 */
/**
 * Division telle qu'on la publie.
 *
 * Un arbitre n'en a pas (ROLE-003) : la colonne en porte une parce que
 * l'énumération n'est pas nullable, mais elle ne veut rien dire pour lui. La
 * retirer **ici**, à la source, vaut mieux que de la cacher écran par écran :
 * un écran oublié afficherait « D3 » sous une carte d'arbitre.
 */
function publishedDivision(player: {
  division: Division;
  accountType: AccountType;
}): Division | null {
  return player.accountType === "referee" ? null : player.division;
}

export const publicPlayerColumns = {
  id: players.id,
  displayName: players.displayName,
  nationality: players.nationality,
  profilePhotoUrl: players.profilePhotoUrl,
  photoOffsetY: players.photoOffsetY,
  accountType: players.accountType,
  sessionsRefereed: players.sessionsRefereed,
  isSupervisor: players.isSupervisor,
  division: players.division,
  position: players.position,
  level: players.level,
  goals: players.goals,
  assists: players.assists,
  defenses: players.defenses,
  saves: players.saves,
  motm: players.motm,
  matchesPlayed: players.matchesPlayed,
  rating: players.rating,
} as const;

export type PublicPlayerRow = Pick<
  typeof players.$inferSelect,
  keyof typeof publicPlayerColumns
>;

export function toPublicPlayer(player: PublicPlayerRow): PublicPlayer {
  return {
    id: player.id,
    displayName: player.displayName,
    nationality: player.nationality,
    profilePhotoUrl: player.profilePhotoUrl,
    photoOffsetY: player.photoOffsetY,
    accountType: player.accountType,
    sessionsRefereed: player.sessionsRefereed,
    isSupervisor: player.isSupervisor,
    division: publishedDivision(player),
    position: player.position,
    level: player.level,
    goals: player.goals,
    assists: player.assists,
    defenses: player.defenses,
    saves: player.saves,
    motm: player.motm,
    matchesPlayed: player.matchesPlayed,
    rating: player.rating,
    tier: cardTier(player.division, player.accountType),
  };
}

export async function getOwnProfile(
  executor: Executor,
  playerId: number,
): Promise<PlayerProfile> {
  const [row] = await executor
    .select({ player: players, email: users.email })
    .from(players)
    .innerJoin(users, eq(users.id, players.userId))
    .where(eq(players.id, playerId))
    .limit(1);

  if (!row) throw new AppError("NOT_FOUND", "Profil introuvable.");
  return toProfile(row.player, row.email);
}

/** Vue publique d'un autre joueur : aucune donnée personnelle (ROLE-002). */
export async function getPublicPlayer(
  executor: Executor,
  playerId: number,
): Promise<PublicPlayer> {
  const [row] = await executor
    .select(publicPlayerColumns)
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  if (!row) throw new AppError("NOT_FOUND", "Ce joueur est introuvable.");
  return toPublicPlayer(row);
}

export async function updateProfile(
  actor: { playerId: number; userId: number },
  input: UpdateProfileInput,
): Promise<PlayerProfile> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(players)
      .where(eq(players.id, actor.playerId))
      .limit(1);

    if (!current) throw new AppError("NOT_FOUND", "Profil introuvable.");

    const firstName = input.firstName ?? current.firstName;
    const lastName = input.lastName ?? current.lastName;

    const patch = {
      firstName,
      lastName,
      displayName: `${firstName} ${lastName}`.trim().slice(0, 101),
      dateOfBirth: input.dateOfBirth ?? current.dateOfBirth,
      nationality: input.nationality ?? current.nationality,
      position: input.position ?? current.position,
      address: input.address === undefined ? current.address : input.address,
      profilePhotoUrl:
        input.profilePhotoUrl === undefined
          ? current.profilePhotoUrl
          : input.profilePhotoUrl,
      photoOffsetY: input.photoOffsetY ?? current.photoOffsetY,
      updatedAt: new Date(),
    };

    await tx.update(players).set(patch).where(eq(players.id, actor.playerId));

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "player.profile.update",
      entityType: "player",
      entityId: actor.playerId,
      before: {
        firstName: current.firstName,
        lastName: current.lastName,
        nationality: current.nationality,
      },
      after: {
        firstName: patch.firstName,
        lastName: patch.lastName,
        nationality: patch.nationality,
      },
    });

    return getOwnProfile(tx, actor.playerId);
  });
}

/**
 * Recherche de destinataire pour un transfert (WAL-002).
 * Interroge la base des joueurs réels : le prototype s'appuyait sur des
 * données factices, ce qui permettait des envois vers des joueurs fantômes
 * (§24).
 */
export async function searchPlayers(
  executor: Executor,
  params: { query: string; limit: number; excludePlayerId: number },
): Promise<PublicPlayer[]> {
  const needle = `%${params.query.replace(/[%_]/g, "\\$&")}%`;

  const rows = await executor
    .select(publicPlayerColumns)
    .from(players)
    .innerJoin(users, eq(users.id, players.userId))
    .where(
      and(
        ne(players.id, params.excludePlayerId),
        eq(users.status, "active"),
        or(
          like(players.displayName, needle),
          like(players.firstName, needle),
          like(players.lastName, needle),
        ),
      ),
    )
    .limit(params.limit);

  return rows.map(toPublicPlayer);
}
