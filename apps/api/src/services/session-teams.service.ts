import { asc, eq, inArray } from "drizzle-orm";
import {
  AppError,
  completeTeams,
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
 * Le nom d'une équipe d'après son rang.
 *
 * Exporté parce que les refus le citent : « l'équipe C est complète » n'a de
 * sens que si l'écran affiche « Équipe C » au même endroit. Deux listes de
 * noms auraient fini par diverger d'une lettre.
 */
export function teamName(index: number): string {
  return TEAM_NAMES[index] ?? `Équipe ${index + 1}`;
}

/** Une équipe de la séance, telle qu'on s'y assied. */
export interface TeamSeatRow {
  id: number;
  teamIndex: number;
  formation: string | null;
}

/**
 * Constitue les équipes d'une session (MATCH-001, MODE-004, MODE-005).
 *
 * **Idempotente, mais pas de la même façon partout.** Là où les équipes se
 * tirent, les retrouver formées suffit à ne rien refaire. Là où elles se
 * remplissent au fur et à mesure — la UNO League —, elles existent bien avant
 * d'être pleines : l'appel de clôture les complète, et un second appel ne
 * trouve plus personne à placer.
 *
 * **Trois façons de les former**, selon ce que le mode promet ; le détail est
 * dans `assignSquads`. Le camp choisi fait l'équipe en amical et en Grand
 * Foot ; l'équipe choisie tient en UNO League, où le tirage ne répartit que
 * les indécis ; partout ailleurs le tirage par chapeaux équilibre tout le
 * plateau.
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
  const proposalId = proposal.id;
  const mode = getGameMode(proposal.modeId);

  if (proposal.status === "proposal" || proposal.status === "cancelled") {
    throw new AppError(
      "RULE_VIOLATION",
      "Les équipes ne se forment qu'une fois le plateau complet.",
    );
  }

  /*
   * Des équipes déjà formées ne se refont pas — sauf là où elles se
   * remplissent au fur et à mesure (MODE-005).
   *
   * En UNO League elles existent dès la proposition, et y trouver du monde
   * ne veut plus dire « le tirage a déjà eu lieu » : il reste à placer ceux
   * qui n'ont rien choisi. Ailleurs, la présence d'équipes signifie
   * exactement ce qu'elle signifiait — un match de club apporte les siennes,
   * et les redessiner effacerait deux effectifs qui ne se tirent pas.
   */
  const existing = await readTeams(tx, proposalId);
  if (existing.length > 0 && !mode?.playersChooseTeam) return existing;

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

  const rows = await ensureTeams(tx, proposalId, teamCount);

  const drawn = await assignSquads(tx, {
    rows,
    participants,
    mode,
    teamCount,
    teamSize,
    seed: proposalId,
  });

  for (const [index, squad] of drawn.entries()) {
    const team = rows[index];
    if (!team) continue;
    const nouveaux = squad.filter((player) => !player.alreadySeated);
    if (nouveaux.length === 0) continue;
    await tx
      .insert(teamMembers)
      .values(
        nouveaux.map((player) => ({ teamId: team.id, playerId: player.id })),
      );
  }

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
  //
  // Le garde-fou n'est plus « les équipes viennent d'être créées » mais
  // « aucun match n'existe » : là où elles existaient avant la clôture
  // (MODE-005), la première formulation n'aurait jamais amorcé la session.
  const [first, second] = rows;
  if (first && second) {
    const [dejaJoue] = await tx
      .select({ id: matches.id })
      .from(matches)
      .where(eq(matches.proposalId, proposalId))
      .limit(1);

    if (!dejaJoue) {
      await tx.insert(matches).values({
        proposalId,
        teamAId: first.id,
        teamBId: second.id,
        matchOrder: 1,
        status: "scheduled",
      });
    }
  }

  await writeAudit(tx, {
    actorUserId: actor.userId,
    action: "proposal.status.update",
    entityType: "proposal",
    entityId: proposalId,
    after: { teams: rows.length },
  });

  return readTeams(tx, proposalId);
}

/**
 * Les équipes de la séance, créées si elles n'existent pas encore.
 *
 * Idempotente, et c'est tout son emploi : elle est appelée à la création
 * d'une proposition de UNO League (MODE-005), où les équipes accueillent les
 * joueurs avant d'être remplies, comme à la clôture d'une séance créée
 * autrement — depuis la console d'administration ou un jeu d'essai — où elles
 * n'existent pas encore.
 */
export async function ensureTeams(
  tx: Transaction,
  proposalId: number,
  teamCount: number,
): Promise<TeamSeatRow[]> {
  const lire = () =>
    tx
      .select({
        id: teams.id,
        teamIndex: teams.teamIndex,
        formation: teams.formation,
      })
      .from(teams)
      .where(eq(teams.proposalId, proposalId))
      .orderBy(asc(teams.teamIndex));

  const existantes = await lire();
  if (existantes.length >= teamCount) return existantes;

  const deja = new Set(existantes.map((team) => team.teamIndex));
  const manquantes = Array.from({ length: teamCount }, (_, index) => index)
    .filter((index) => !deja.has(index))
    .map((index) => ({
      proposalId,
      name: teamName(index),
      teamIndex: index,
    }));

  if (manquantes.length > 0) await tx.insert(teams).values(manquantes);

  return lire();
}

/** Un joueur affecté à une équipe, et s'il y était déjà assis. */
type Seated = { id: number; rating: number; alreadySeated: boolean };

/**
 * Qui joue dans quelle équipe, selon ce que le mode promet (MODE-004,
 * MODE-005).
 *
 *  - là où **le camp se choisit** — amical, Grand Foot —, les équipes sont
 *    celles que les joueurs ont formées. Les tirer au sort par-dessus aurait
 *    redistribué des gens venus précisément jouer ensemble, et fait dire deux
 *    choses différentes à deux écrans de la même séance ;
 *  - là où **l'équipe se choisit** — la UNO League —, ceux qui ont choisi y
 *    restent, et le tirage ne répartit que les indécis, en visant l'équilibre
 *    des trois équipes ;
 *  - **ailleurs**, le tirage par chapeaux équilibre tout le plateau.
 */
async function assignSquads(
  tx: Transaction,
  input: {
    rows: TeamSeatRow[];
    participants: readonly {
      id: number;
      side: "A" | "B" | null;
      displayName: string;
      goals: number;
      assists: number;
      defenses: number;
      saves: number;
      motm: number;
    }[];
    mode: ReturnType<typeof getGameMode>;
    teamCount: number;
    teamSize: number;
    seed: number;
  },
): Promise<Seated[][]> {
  const { rows, participants, mode, teamCount, teamSize, seed } = input;

  const noter = (player: (typeof participants)[number]): Seated => ({
    id: player.id,
    rating: rankingScore(player),
    alreadySeated: false,
  });

  if (mode?.playersChooseSide) {
    return teamsFromSides(
      participants.map((player) => ({ ...noter(player), side: player.side })),
      teamCount,
    );
  }

  if (!mode?.playersChooseTeam) {
    return draftTeams(participants.map(noter), teamCount, seed, teamSize).teams;
  }

  const assis = await tx
    .select({ teamId: teamMembers.teamId, playerId: teamMembers.playerId })
    .from(teamMembers)
    .where(
      inArray(
        teamMembers.teamId,
        rows.map((team) => team.id),
      ),
    );

  const parJoueur = new Map(participants.map((player) => [player.id, player]));
  const places = new Set(assis.map((row) => row.playerId));

  const squads = rows.map((team) =>
    assis
      .filter((row) => row.teamId === team.id)
      .flatMap((row) => {
        const player = parJoueur.get(row.playerId);
        // Une appartenance sans inscription n'existe pas en théorie ; la
        // suivre en aurait fait un joueur fantôme dans le tirage.
        return player ? [{ ...noter(player), alreadySeated: true }] : [];
      }),
  );

  const indecis = participants
    .filter((player) => !places.has(player.id))
    .map(noter);

  return completeTeams(squads, indecis, teamSize, seed).teams;
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
      formation: team.formation,
    };
  });
}
