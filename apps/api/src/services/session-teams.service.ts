import { asc, eq, inArray } from "drizzle-orm";
import {
  AppError,
  draftTeams,
  getGameMode,
  rankingScore,
  type TeamView,
} from "@uno/shared";
import type { Executor, Transaction } from "../db/client.js";
import {
  matches,
  players,
  proposalParticipants,
  teamMembers,
  teams,
} from "../db/schema.js";
import { writeAudit } from "./audit.service.js";
import { publicPlayerColumns, toPublicPlayer } from "./players.service.js";

/**
 * Former les équipes d'une session (MATCH-001, MODE-004).
 *
 * **Un module à part, et pas par goût du rangement.** Le tirage doit être
 * déclenché par le calendrier — dès que le plateau est complet — comme par
 * l'administration. Le laisser dans le service des matchs aurait obligé celui
 * des propositions à l'importer, alors que l'inverse est déjà vrai : deux
 * modules qui s'appellent l'un l'autre finissent par se charger dans le
 * mauvais ordre, un jour, sur un chemin qu'on n'avait pas prévu.
 *
 * Rien ici ne verrouille ni n'ouvre de transaction : l'appelant l'a déjà
 * fait, et c'est ce qui permet à ce module de n'importer aucun autre service
 * du domaine.
 */

const TEAM_NAMES = ["Équipe A", "Équipe B", "Équipe C", "Équipe D"];

/**
 * Constitue les équipes d'une session (MATCH-001, MODE-004).
 * Idempotent : si les équipes existent déjà, elles sont simplement renvoyées.
 *
 * **Deux façons de les former**, selon ce que le mode promet :
 *
 *  - là où **le camp se choisit** — amical, Grand Foot —, les équipes sont
 *    celles que les joueurs ont formées. Les tirer au sort par-dessus aurait
 *    redistribué des gens venus précisément jouer ensemble, et fait dire deux
 *    choses différentes à deux écrans de la même séance ;
 *  - **ailleurs**, le tirage par chapeaux équilibre les forces. C'est ce qui
 *    donne sa valeur au classement de la UNO League : on ne choisit pas ses
 *    coéquipiers, donc on ne choisit pas sa victoire.
 *
 * **Dès la réservation**, et non plus une fois tous les paiements reçus.
 * C'est le moment où l'on sait qui joue, et il ouvre les vingt-quatre heures
 * pendant lesquelles chacun choisit sa place — attendre le dernier paiement
 * aurait réduit cette fenêtre à ce qu'il en reste.
 *
 * L'appelant verrouille la proposition et ouvre la transaction : ce module
 * n'importe donc personne, et ne peut pas former de cycle avec le service des
 * propositions qui l'appelle.
 */
export async function composeTeams(
  tx: Transaction,
  actor: { userId: number },
  proposal: {
    id: number;
    modeId: string;
    status: string;
    minParticipants: number;
  },
): Promise<TeamView[]> {
  {
    const proposalId = proposal.id;

    if (proposal.status === "proposal" || proposal.status === "cancelled") {
      throw new AppError(
        "RULE_VIOLATION",
        "Les équipes ne se forment qu'une fois le plateau complet.",
      );
    }

    const existing = await readTeams(tx, proposalId);
    if (existing.length > 0) return existing;

    const participants = await tx
      .select({
        id: players.id,
        side: proposalParticipants.side,
        displayName: players.displayName,
        goals: players.goals,
        assists: players.assists,
        defenses: players.defenses,
        saves: players.saves,
        motm: players.motm,
      })
      .from(proposalParticipants)
      .innerJoin(players, eq(players.id, proposalParticipants.playerId))
      .where(eq(proposalParticipants.proposalId, proposalId))
      .orderBy(asc(proposalParticipants.joinedAt));

    const mode = getGameMode(proposal.modeId);
    const teamCount = mode?.teamCount ?? 2;
    /*
     * La taille d'équipe se déduit du plateau, et n'est plus la constante du
     * futsal : le Grand Foot aligne de sept à onze joueurs par camp, et un
     * tirage plafonné à cinq y aurait laissé la moitié du monde dehors.
     */
    const teamSize = Math.max(
      1,
      Math.floor(proposal.minParticipants / Math.max(1, teamCount)),
    );

    const drawn = mode?.playersChooseSide
      ? teamsFromSides(participants, teamCount)
      : draftTeams(
          participants.map((player) => ({
            id: player.id,
            rating: rankingScore(player),
          })),
          teamCount,
          // La graine est l'identifiant de session : le tirage est
          // reproductible et vérifiable a posteriori.
          proposalId,
          teamSize,
        ).teams;

    for (const [index, squad] of drawn.entries()) {
      const inserted = await tx.insert(teams).values({
        proposalId,
        name: TEAM_NAMES[index] ?? `Équipe ${index + 1}`,
        teamIndex: index,
      });
      const teamId = Number(inserted[0].insertId);

      if (squad.length > 0) {
        await tx
          .insert(teamMembers)
          .values(squad.map((player) => ({ teamId, playerId: player.id })));
      }
    }

    const created = await tx
      .select()
      .from(teams)
      .where(eq(teams.proposalId, proposalId))
      .orderBy(asc(teams.teamIndex));

    // Deux formats, deux façons de créer les matchs.
    //
    // **Amical** : deux équipes, une rencontre. Elle est créée d'emblée, il
    // n'y a rien à décider.
    //
    // **UNO League** : une session de deux heures enchaîne des matchs de dix
    // minutes, le vainqueur restant sur le terrain. Leur nombre n'est donc pas
    // connu à l'avance, et le pré-générer donnerait une feuille de match
    // fausse. Le premier match est créé pour amorcer la session ; les suivants
    // sont ajoutés au fur et à mesure par l'administration (`addMatch`).
    const [first, second] = created;
    if (first && second) {
      await tx.insert(matches).values({
        proposalId,
        teamAId: first.id,
        teamBId: second.id,
        matchOrder: 1,
        status: "scheduled",
      });
    }

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "proposal.status.update",
      entityType: "proposal",
      entityId: proposalId,
      after: { teams: created.length },
    });

    return readTeams(tx, proposalId);
  }
}

/**
 * Les équipes telles que les joueurs les ont formées (MODE-004).
 *
 * Le camp A devient la première équipe, le camp B la seconde. Ceux qui n'ont
 * choisi ni l'un ni l'autre — rien ne l'impose à l'inscription — rejoignent
 * la moins remplie : c'est la seule répartition qui ne défasse pas ce que les
 * autres ont décidé.
 */
function teamsFromSides<T extends { id: number; side: "A" | "B" | null }>(
  participants: readonly T[],
  teamCount: number,
): T[][] {
  const squads: T[][] = Array.from({ length: teamCount }, () => []);

  for (const participant of participants) {
    if (participant.side === "A") squads[0]?.push(participant);
    else if (participant.side === "B") squads[1]?.push(participant);
  }

  for (const participant of participants) {
    if (participant.side !== null) continue;
    const smallest = squads.reduce(
      (best, squad) => (squad.length < best.length ? squad : best),
      squads[0] as T[],
    );
    smallest.push(participant);
  }

  return squads;
}

export async function readTeams(
  executor: Executor,
  proposalId: number,
): Promise<TeamView[]> {
  const rows = await executor
    .select()
    .from(teams)
    .where(eq(teams.proposalId, proposalId))
    .orderBy(asc(teams.teamIndex));

  if (rows.length === 0) return [];

  const members = await executor
    .select({
      teamId: teamMembers.teamId,
      pitchSlot: teamMembers.pitchSlot,
      ...publicPlayerColumns,
    })
    .from(teamMembers)
    .innerJoin(players, eq(players.id, teamMembers.playerId))
    .where(
      inArray(
        teamMembers.teamId,
        rows.map((team) => team.id),
      ),
    );

  return rows.map((team) => {
    const squad = members.filter((member) => member.teamId === team.id);
    return {
      id: team.id,
      name: team.name,
      teamIndex: team.teamIndex,
      players: squad.map(({ teamId: _teamId, pitchSlot: _slot, ...player }) =>
        toPublicPlayer(player),
      ),
      slots: squad.flatMap((member) =>
        member.pitchSlot === null
          ? []
          : [{ playerId: member.id, pitchSlot: member.pitchSlot }],
      ),
    };
  });
}
