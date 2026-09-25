import { and, asc, count, eq, gte, inArray } from "drizzle-orm";
import {
  AppError,
  gabarit,
  type ProposalSummary,
  type PublicPlayer,
} from "@uno/shared";
import { db } from "../db/client.js";
import {
  players,
  proposalInvitations,
  proposalParticipants,
  proposals,
  users,
} from "../db/schema.js";
import { notifyPlayer } from "./notifications.service.js";
import { searchPlayers } from "./players.service.js";
import { toSummary } from "./proposals.service.js";

/**
 * Inviter un joueur de l'application à une proposition (CAL-012).
 *
 * Partager un lien suffit pour qui n'a pas l'application. Pour un joueur déjà
 * inscrit, on le prévient directement — notification, et une place sur son
 * accueil tant que la séance cherche des joueurs.
 *
 * Trois garde-fous, tous tenus ici plutôt qu'à l'écran :
 * - **seulement ce qui peut aboutir** : une proposition encore ouverte, un
 *   joueur qui pourra la rejoindre (pas un arbitre, pas une autre division
 *   en UNO League), qui n'y est pas déjà ;
 * - **une fois par séance** : l'unicité (proposition, invité) évite qu'un
 *   joueur soit relancé par chacun des inscrits ;
 * - **une limite quotidienne** par invitant : la notification sonne sur le
 *   téléphone d'un autre, et ce n'est pas un canal de publicité.
 */

/** Invitations envoyées par un même joueur sur vingt-quatre heures glissantes. */
export const INVITATIONS_PER_DAY = 30;
/** Invités d'un seul geste. */
export const INVITATIONS_PER_CALL = 10;

export type InviteState =
  "invitable" | "invited" | "participant" | "otherDivision" | "referee";

export interface InviteCandidate {
  player: PublicPlayer;
  state: InviteState;
}

export interface PendingInvitation {
  proposal: ProposalSummary;
  inviterName: string;
}

type ProposalRow = typeof proposals.$inferSelect;

async function readProposal(proposalId: number): Promise<ProposalRow> {
  const [row] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);
  if (!row) throw new AppError("NOT_FOUND", "Cette session est introuvable.");
  return row;
}

/** Une proposition qui cherche encore des joueurs, et rien d'autre. */
function assertInvitable(proposal: ProposalRow): void {
  if (proposal.status !== "proposal") throw new AppError("PROPOSAL_CLOSED");
  if (proposal.participantCount >= proposal.minParticipants) {
    throw new AppError("PROPOSAL_FULL");
  }
}

function stateOf(
  proposal: ProposalRow,
  player: { id: number; accountType: string; division: string | null },
  participants: Set<number>,
  invited: Set<number>,
): InviteState {
  if (participants.has(player.id)) return "participant";
  if (invited.has(player.id)) return "invited";
  // ROLE-003 : un arbitre ne prend pas de place de joueur.
  if (player.accountType === "referee") return "referee";
  // CAL-002 : UNO League est réservé aux joueurs de la division.
  if (proposal.division !== null && player.division !== proposal.division) {
    return "otherDivision";
  }
  return "invitable";
}

async function knownFor(
  proposalId: number,
  playerIds: number[],
): Promise<{ participants: Set<number>; invited: Set<number> }> {
  if (playerIds.length === 0) {
    return { participants: new Set(), invited: new Set() };
  }
  const [inscrits, invites] = await Promise.all([
    db
      .select({ id: proposalParticipants.playerId })
      .from(proposalParticipants)
      .where(
        and(
          eq(proposalParticipants.proposalId, proposalId),
          inArray(proposalParticipants.playerId, playerIds),
        ),
      ),
    db
      .select({ id: proposalInvitations.inviteePlayerId })
      .from(proposalInvitations)
      .where(
        and(
          eq(proposalInvitations.proposalId, proposalId),
          inArray(proposalInvitations.inviteePlayerId, playerIds),
        ),
      ),
  ]);
  return {
    participants: new Set(inscrits.map((row) => row.id)),
    invited: new Set(invites.map((row) => row.id)),
  };
}

/**
 * Les joueurs qu'on peut inviter, trouvés par leur nom.
 *
 * Chacun vient avec son état plutôt que d'être filtré : un ami qu'on cherche
 * et qu'on ne trouve pas, on se demande s'il existe ; le voir marqué « déjà
 * inscrit » ou « autre division » répond à la question.
 */
export async function inviteCandidates(
  actor: { playerId: number },
  proposalId: number,
  query: string,
): Promise<InviteCandidate[]> {
  const proposal = await readProposal(proposalId);
  assertInvitable(proposal);

  const found = await searchPlayers(db, {
    query,
    limit: 20,
    excludePlayerId: actor.playerId,
  });
  const { participants, invited } = await knownFor(
    proposalId,
    found.map((player) => player.id),
  );

  const order: Record<InviteState, number> = {
    invitable: 0,
    invited: 1,
    participant: 2,
    otherDivision: 3,
    referee: 4,
  };
  return found
    .map((player) => ({
      player,
      state: stateOf(proposal, player, participants, invited),
    }))
    .sort((a, b) => order[a.state] - order[b.state]);
}

/**
 * Invite des joueurs à une proposition.
 *
 * Ceux qui ne peuvent pas l'être — déjà inscrits, déjà invités, autre
 * division — sont passés sans erreur : le geste porte sur plusieurs joueurs,
 * et un seul cas particulier ne doit pas faire échouer les autres. Le compte
 * rendu dit combien sont partis.
 */
export async function invitePlayers(
  actor: { playerId: number },
  proposalId: number,
  playerIds: number[],
): Promise<{ invited: number; skipped: number }> {
  const requested = [...new Set(playerIds)].filter(
    (id) => id !== actor.playerId,
  );

  const outcome = await db.transaction(async (tx) => {
    const [proposal] = await tx
      .select()
      .from(proposals)
      .where(eq(proposals.id, proposalId))
      .limit(1);
    if (!proposal) {
      throw new AppError("NOT_FOUND", "Cette session est introuvable.");
    }
    assertInvitable(proposal);

    const candidates =
      requested.length === 0
        ? []
        : await tx
            .select({
              id: players.id,
              accountType: players.accountType,
              division: players.division,
            })
            .from(players)
            .innerJoin(users, eq(users.id, players.userId))
            .where(
              and(inArray(players.id, requested), eq(users.status, "active")),
            );

    const { participants, invited } = await knownFor(
      proposalId,
      candidates.map((row) => row.id),
    );
    const eligible = candidates.filter(
      (row) => stateOf(proposal, row, participants, invited) === "invitable",
    );

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [sent] = await tx
      .select({ total: count() })
      .from(proposalInvitations)
      .where(
        and(
          eq(proposalInvitations.inviterPlayerId, actor.playerId),
          gte(proposalInvitations.createdAt, since),
        ),
      );
    if ((sent?.total ?? 0) + eligible.length > INVITATIONS_PER_DAY) {
      throw new AppError(
        "RULE_VIOLATION",
        gabarit("Limite atteinte : {max} invitations par jour.", {
          max: INVITATIONS_PER_DAY,
        }),
      );
    }

    /*
     * Un autre joueur peut inviter la même personne au même instant :
     * l'unicité tranche, et la ligne déjà écrite l'emporte. Seules les
     * lignes réellement créées donnent lieu à une notification.
     */
    const created: number[] = [];
    for (const row of eligible) {
      const [header] = await tx
        .insert(proposalInvitations)
        .values({
          proposalId,
          inviterPlayerId: actor.playerId,
          inviteePlayerId: row.id,
        })
        .onDuplicateKeyUpdate({ set: { proposalId } });
      if (Number(header.affectedRows ?? 0) === 1) created.push(row.id);
    }

    const [inviter] = await tx
      .select({ displayName: players.displayName })
      .from(players)
      .where(eq(players.id, actor.playerId))
      .limit(1);

    return { proposal, created, inviterName: inviter?.displayName ?? "" };
  });

  // Hors de la transaction : le réseau n'a rien à faire sous un verrou.
  const { proposal } = outcome;
  const heure = proposal.localTimeLabel.split(/\s*[-–]\s*/)[0] ?? "";
  for (const playerId of outcome.created) {
    await notifyPlayer(
      {
        playerId,
        eventKey: `proposal:${proposal.id}:invited`,
        title: gabarit("Invitation à une séance"),
        body: gabarit(
          "{nom} vous invite à jouer le {jour} à {heure}, à {salle}.",
          {
            nom: outcome.inviterName,
            jour: { jour: proposal.localDate },
            heure,
            salle: proposal.venueName,
          },
        ),
        url: `/sessions/${proposal.id}`,
      },
      db,
    );
  }

  return {
    invited: outcome.created.length,
    skipped: requested.length - outcome.created.length,
  };
}

/**
 * Les invitations qui attendent encore le joueur, pour son accueil.
 *
 * Seulement celles qui peuvent encore aboutir : une proposition ouverte, à
 * venir, qui a de la place, et qu'il n'a pas déjà rejointe. Les autres
 * s'effacent d'elles-mêmes, sans qu'il ait à les écarter.
 */
export async function listInvitationsForPlayer(
  playerId: number,
  limit: number,
): Promise<PendingInvitation[]> {
  const rows = await db
    .select({ proposal: proposals, inviterName: players.displayName })
    .from(proposalInvitations)
    .innerJoin(proposals, eq(proposals.id, proposalInvitations.proposalId))
    .innerJoin(players, eq(players.id, proposalInvitations.inviterPlayerId))
    .where(
      and(
        eq(proposalInvitations.inviteePlayerId, playerId),
        eq(proposals.status, "proposal"),
        gte(proposals.startsAtUtc, new Date()),
      ),
    )
    .orderBy(asc(proposals.startsAtUtc))
    .limit(20);

  if (rows.length === 0) return [];

  const inscrit = await db
    .select({ id: proposalParticipants.proposalId })
    .from(proposalParticipants)
    .where(
      and(
        eq(proposalParticipants.playerId, playerId),
        inArray(
          proposalParticipants.proposalId,
          rows.map((row) => row.proposal.id),
        ),
      ),
    );
  const joined = new Set(inscrit.map((row) => row.id));

  return rows
    .filter((row) => !joined.has(row.proposal.id))
    .filter(
      (row) => row.proposal.participantCount < row.proposal.minParticipants,
    )
    .slice(0, limit)
    .map((row) => ({
      proposal: toSummary(row.proposal, {
        isParticipant: false,
        hasPaid: false,
      }),
      inviterName: row.inviterName,
    }));
}
