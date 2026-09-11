import { and, asc, desc, eq, inArray, isNotNull, lt, ne, sql } from "drizzle-orm";
import {
  AppError,
  DEFAULT_REWARD_POLICY,
  REFEREE_SESSION_FEE_UNO,
  TEAM_SIZE,
  XP_AWARDS,
  defensiveScore,
  divisionAbove,
  divisionBelow,
  draftTeams,
  movementCountFor,
  nextPairing,
  getGameMode,
  clampToBand,
  nextRating,
  rankingScore,
  type Division,
  type DivisionMovement,
  type MatchView,
  type PodiumAward,
  type PodiumEntry,
  type AddMatchInput,
  type AssignTeamInput,
  type PublicPlayer,
  type RecordSessionInput,
  type ReportMatchInput,
  type TeamView,
} from "@uno/shared";
import { db, type Executor, type Transaction } from "../db/client.js";
import {
  matchStats,
  matches,
  players,
  proposalParticipants,
  proposals,
  teamMembers,
  teams,
} from "../db/schema.js";
import { writeAudit } from "./audit.service.js";
import { recordAdminEvent } from "./admin-events.service.js";
import { payReferee } from "./referees.service.js";
import { publicPlayerColumns, toPublicPlayer } from "./players.service.js";
import { credit } from "./ledger.service.js";
import { awardXp } from "./progression.service.js";
import { enforceDivisionEligibility } from "./eligibility.service.js";
import { lockProposal } from "./proposals.service.js";

/**
 * Équipes, matchs, statistiques et récompenses (CDC §9).
 *
 * MATCH-005 est la contrainte structurante : une validation ne doit jamais
 * compter deux fois les mêmes statistiques ni distribuer deux fois la même
 * récompense. Deux garde-fous indépendants l'assurent :
 *   1. `matches.validated_at` : une seconde validation est refusée ;
 *   2. chaque récompense porte une clé d'idempotence en base, si bien qu'un
 *      double appel concurrent est rejeté par l'index unique du registre.
 */

const TEAM_NAMES = ["Équipe A", "Équipe B", "Équipe C", "Équipe D"];

/**
 * Constitue les équipes d'une session (MATCH-001).
 * Idempotent : si les équipes existent déjà, elles sont simplement renvoyées.
 */
export async function generateTeams(
  actor: { userId: number },
  proposalId: number,
): Promise<TeamView[]> {
  return db.transaction(async (tx) => {
    const proposal = await lockProposal(tx, proposalId);

    if (proposal.status !== "session" && proposal.status !== "completed") {
      throw new AppError(
        "RULE_VIOLATION",
        "Les équipes ne peuvent être tirées qu'une fois tous les paiements reçus.",
      );
    }

    const existing = await readTeams(tx, proposalId);
    if (existing.length > 0) return existing;

    const participants = await tx
      .select({
        id: players.id,
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

    const { teams: drawn } = draftTeams(
      participants.map((player) => ({ id: player.id, rating: rankingScore(player) })),
      teamCount,
      // La graine est l'identifiant de session : le tirage est reproductible
      // et vérifiable a posteriori.
      proposalId,
      TEAM_SIZE,
    );

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
  });
}

async function readTeams(
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
    .select({ teamId: teamMembers.teamId, ...publicPlayerColumns })
    .from(teamMembers)
    .innerJoin(players, eq(players.id, teamMembers.playerId))
    .where(
      inArray(
        teamMembers.teamId,
        rows.map((team) => team.id),
      ),
    );

  return rows.map((team) => ({
    id: team.id,
    name: team.name,
    teamIndex: team.teamIndex,
    players: members
      .filter((member) => member.teamId === team.id)
      .map(({ teamId: _teamId, ...player }) => toPublicPlayer(player)),
  }));
}

export async function listMatches(
  executor: Executor,
  proposalId: number,
): Promise<MatchView[]> {
  const rows = await executor
    .select()
    .from(matches)
    .where(eq(matches.proposalId, proposalId))
    // L'ordre de la séance, pas celui des identifiants : un match ajouté
    // après coup doit se lire à sa place.
    .orderBy(asc(matches.matchOrder), asc(matches.id));

  const squads = await readTeams(executor, proposalId);
  const byId = new Map(squads.map((team) => [team.id, team]));

  return rows.map((row) => ({
    id: row.id,
    proposalId: row.proposalId,
    status: row.status,
    scoreA: row.scoreA,
    scoreB: row.scoreB,
    matchOrder: row.matchOrder,
    playedAt: row.playedAt ? row.playedAt.toISOString() : null,
    teamA: byId.get(row.teamAId) ?? null,
    teamB: byId.get(row.teamBId) ?? null,
  }));
}

/**
 * Options de saisie.
 *
 * `awardUno` commande les seules récompenses en monnaie interne. Il existe
 * parce qu'une feuille saisie en visionnage peut relever une session encaissée
 * hors de l'application, ou rattraper un historique : ses statistiques et ses
 * mouvements de division sont légitimes, ses récompenses ne le seraient pas.
 * Tout ce qui est sportif — compteurs de carrière, XP, distinctions, montées
 * et descentes — reste commandé par le seul mode de jeu.
 *
 * Par défaut les récompenses sont versées : le chemin normal, celui d'une
 * session réservée et payée dans l'application, ne change pas d'un pouce.
 */
export interface RecordOptions {
  awardUno?: boolean;
}

/**
 * Saisie du rapport d'un match (MATCH-003).
 *
 * Le rapport est enregistré mais reste sans effet sur les statistiques
 * cumulées : il faut le valider (MATCH-005). L'homme du match ne se saisit
 * pas — il est calculé à la clôture de la session, comme le joueur au plus
 * grand total de points.
 */
async function applyMatchReport(
  tx: Transaction,
  input: ReportMatchInput,
): Promise<void> {
  const match = await lockMatch(tx, input.matchId);

  if (match.validatedAt) {
    throw new AppError(
      "CONFLICT",
      "Ce match est déjà validé. Utilisez la correction administrative.",
    );
  }

  const roster = await tx
    .select({ playerId: teamMembers.playerId })
    .from(teamMembers)
    .where(inArray(teamMembers.teamId, [match.teamAId, match.teamBId]));

  const allowed = new Set(roster.map((row) => row.playerId));
  const seen = new Set<number>();

  for (const line of input.stats) {
    if (!allowed.has(line.playerId)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Une statistique concerne un joueur qui n'a pas disputé ce match.",
      );
    }
    // Deux lignes pour un même joueur passeraient l'index unique en étant
    // insérées ensemble ; le refus explicite évite un total silencieusement
    // faux.
    if (seen.has(line.playerId)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Un joueur ne peut avoir qu'une ligne de statistiques par match.",
      );
    }
    seen.add(line.playerId);
  }

  await tx.delete(matchStats).where(eq(matchStats.matchId, input.matchId));
  if (input.stats.length > 0) {
    await tx.insert(matchStats).values(
      input.stats.map((line) => ({
        matchId: input.matchId,
        playerId: line.playerId,
        goals: line.goals,
        assists: line.assists,
        defenses: line.defenses,
        saves: line.saves,
      })),
    );
  }

  await tx
    .update(matches)
    .set({
      scoreA: input.scoreA,
      scoreB: input.scoreB,
      status: "finished",
      playedAt: match.playedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(matches.id, input.matchId));
}

export async function reportMatch(
  actor: { userId: number },
  input: ReportMatchInput,
): Promise<MatchView> {
  return db.transaction(async (tx) => {
    await applyMatchReport(tx, input);
    void actor;
    const [updated] = await listMatchesById(tx, input.matchId);
    return updated!;
  });
}

async function lockMatch(tx: Transaction, matchId: number) {
  const [row] = await tx
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .for("update");

  if (!row) throw new AppError("NOT_FOUND", "Ce match est introuvable.");
  return row;
}

async function listMatchesById(
  executor: Executor,
  matchId: number,
): Promise<MatchView[]> {
  const [row] = await executor
    .select()
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!row) return [];
  return listMatches(executor, row.proposalId).then((all) =>
    all.filter((match) => match.id === matchId),
  );
}

/**
 * Validation d'un match (MATCH-004, MATCH-005).
 *
 * Reporte les statistiques sur les compteurs cumulés, attribue l'XP, puis
 * marque le match comme validé. Une seconde validation est refusée.
 *
 * La récompense « meilleure équipe » n'est versée qu'en mode classé : un
 * match amical ne rapporte aucun UNO (§8).
 */
async function applyMatchValidation(
  tx: Transaction,
  actor: { userId: number },
  matchId: number,
  options: RecordOptions = {},
): Promise<{ playersUpdated: number; rewardedPlayers: number }> {
  const match = await lockMatch(tx, matchId);

  if (match.validatedAt) {
    // MATCH-005 : deux validations successives ne dupliquent rien.
    throw new AppError("CONFLICT", "Ce match a déjà été validé.");
  }
  if (match.status !== "finished") {
    throw new AppError(
      "RULE_VIOLATION",
      "Le rapport de match doit être saisi avant validation.",
    );
  }

  const [proposal] = await tx
    .select({ division: proposals.division, modeId: proposals.modeId })
    .from(proposals)
    .where(eq(proposals.id, match.proposalId))
    .limit(1);

  const division: Division = proposal?.division ?? "D3";
  const ranked = getGameMode(proposal?.modeId ?? "")?.ranked ?? false;

  const lines = await tx
    .select()
    .from(matchStats)
    .where(eq(matchStats.matchId, matchId));

  let playersUpdated = 0;

  for (const line of lines) {
    const xpGain =
      XP_AWARDS.sessionPlayed +
      line.goals * XP_AWARDS.goal +
      line.assists * XP_AWARDS.assist +
      line.defenses * XP_AWARDS.defense +
      line.saves * XP_AWARDS.save;

    // Les statistiques ne comptent au classement que pour un mode classé
    // (§8 : le match amical n'a aucun impact sur le classement ni sur les
    // divisions). L'XP, elle, est acquise dans tous les modes : elle mesure
    // le temps de jeu, pas la performance en compétition.
    const statIncrements = ranked
      ? {
          goals: sql`${players.goals} + ${line.goals}`,
          assists: sql`${players.assists} + ${line.assists}`,
          defenses: sql`${players.defenses} + ${line.defenses}`,
          saves: sql`${players.saves} + ${line.saves}`,
        }
      : {};

    await tx
      .update(players)
      .set({ ...statIncrements, updatedAt: new Date() })
      .where(eq(players.id, line.playerId));

    // L'XP passe par `awardXp` : c'est lui qui déduit le niveau et verse les
    // UNO du palier franchi (XP-003). Un second chemin finirait par oublier
    // la récompense.
    await awardXp(tx, line.playerId, xpGain);
    playersUpdated++;
  }

  // Récompense « meilleure équipe » aux vainqueurs du match (§8.2), en mode
  // classé uniquement.
  let rewardedPlayers = 0;
  const awardUno = ranked && (options.awardUno ?? true);
  if (awardUno && match.scoreA !== match.scoreB) {
    const winningTeamId = match.scoreA > match.scoreB ? match.teamAId : match.teamBId;
    const winners = await tx
      .select({ playerId: teamMembers.playerId })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, winningTeamId));

    const amount = DEFAULT_REWARD_POLICY.bestTeam[division];
    for (const winner of winners) {
      await credit(tx, {
        playerId: winner.playerId,
        amount,
        type: "reward",
        description: "Récompense meilleure équipe",
        referenceType: "match",
        referenceId: matchId,
        // Clé unique en base : un double appel ne peut pas créditer deux fois.
        idempotencyKey: `reward:match:${matchId}:bestTeam:${winner.playerId}`,
      });
      rewardedPlayers++;
    }
  }

  await tx
    .update(matches)
    .set({
      status: "validated",
      validatedAt: new Date(),
      validatedByUserId: actor.userId,
      updatedAt: new Date(),
    })
    .where(eq(matches.id, matchId));

  await writeAudit(tx, {
    actorUserId: actor.userId,
    action: "match.validate",
    entityType: "match",
    entityId: matchId,
    after: { scoreA: match.scoreA, scoreB: match.scoreB, playersUpdated },
  });

  return { playersUpdated, rewardedPlayers };
}

export async function validateMatch(
  actor: { userId: number },
  matchId: number,
): Promise<{ playersUpdated: number; rewardedPlayers: number }> {
  return db.transaction((tx) => applyMatchValidation(tx, actor, matchId));
}

// ---------------------------------------------------------------------------
// Clôture d'une session
// ---------------------------------------------------------------------------

interface SessionOutcome {
  playerId: number;
  rank: number;
  points: number;
  /**
   * `null` en mode non classé : les divisions ne s'appliquent pas à un match
   * amical, et afficher « se maintient » laisserait croire qu'un mouvement
   * était en jeu.
   */
  movement: DivisionMovement | null;
  fromDivision: Division;
  toDivision: Division;
}

/**
 * Classement de session et mouvements de division qui en découlent.
 *
 * Le classement est celui du barème général : mêmes points, même ordre de
 * départage. Un joueur ne peut donc pas être premier ici et dernier là.
 *
 * Une extrémité ne bouge pas : personne ne monte au-dessus de la D1 ni ne
 * descend sous la D3. Le mouvement est alors enregistré comme « se
 * maintient », ce qui est la vérité affichée au joueur.
 */
/**
 * Points marqués par chaque joueur à sa **dernière session classée
 * antérieure** à celle-ci (CARD-002).
 *
 * C'est la référence contre laquelle la note de la carte se déplace. Trois
 * précautions :
 *
 *  - « antérieure » se lit sur la date de jeu, pas sur la date de clôture :
 *    une session saisie en retard ne doit pas passer devant une session jouée
 *    après elle ;
 *  - seules les sessions **classées et clôturées** comptent, celles-là mêmes
 *    qui ont produit un total de points ;
 *  - la session en cours est exclue, y compris lorsqu'on rejoue sa clôture
 *    après correction — sans quoi elle se comparerait à elle-même.
 *
 * Un joueur absent de la table n'a pas de session précédente : sa note ne
 * bouge pas, et celle-ci devient la référence de la suivante.
 */
async function previousSessionPoints(
  tx: Transaction,
  proposalId: number,
  playerIds: number[],
): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  if (playerIds.length === 0) return result;

  const [current] = await tx
    .select({ startsAt: proposals.startsAtUtc })
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);

  if (!current) return result;

  const rows = await tx
    .select({
      playerId: proposalParticipants.playerId,
      points: proposalParticipants.sessionPoints,
      startsAt: proposals.startsAtUtc,
    })
    .from(proposalParticipants)
    .innerJoin(proposals, eq(proposals.id, proposalParticipants.proposalId))
    .where(
      and(
        inArray(proposalParticipants.playerId, playerIds),
        ne(proposalParticipants.proposalId, proposalId),
        eq(proposals.status, "completed"),
        isNotNull(proposalParticipants.sessionPoints),
        lt(proposals.startsAtUtc, current.startsAt),
      ),
    )
    .orderBy(desc(proposals.startsAtUtc), desc(proposals.id));

  // La requête est triée du plus récent au plus ancien : la première ligne
  // rencontrée pour un joueur est sa session précédente.
  for (const row of rows) {
    if (result.has(row.playerId)) continue;
    if (row.points === null) continue;
    result.set(row.playerId, Number(row.points));
  }

  return result;
}

function computeOutcomes(
  scoreboard: SessionScoreboardRow[],
  divisions: Map<number, Division>,
  ranked: boolean,
): SessionOutcome[] {
  const movements = ranked ? movementCountFor(scoreboard.length) : 0;
  const lastPromoted = movements;
  const firstRelegated = scoreboard.length - movements;

  return scoreboard.flatMap((row, index) => {
    // Sans division, aucun mouvement n'a de sens : c'est le cas d'un arbitre
    // (ROLE-003), qui n'a pas sa place sur une feuille de match mais dont
    // rien n'interdit qu'une saisie erronée l'y mette. On le laisse hors du
    // calcul plutôt que de lui inventer une division.
    const from = divisions.get(row.player.id) ?? row.player.division;
    if (from === null) return [];

    let movement: DivisionMovement | null = ranked ? "stayed" : null;
    let to: Division = from;

    if (index < lastPromoted) {
      const above = divisionAbove(from);
      if (above) {
        movement = "promoted";
        to = above;
      }
    } else if (index >= firstRelegated) {
      const below = divisionBelow(from);
      if (below) {
        movement = "relegated";
        to = below;
      }
    }

    return [
      {
        playerId: row.player.id,
        rank: index + 1,
        points: row.points,
        movement,
        fromDivision: from,
        toDivision: to,
      },
    ];
  });
}

/**
 * Clôture d'une session (§8.2).
 *
 * Tout ce qui découle des résultats est décidé ici, une fois pour toutes :
 *
 *  1. le classement de la session, au barème général ;
 *  2. l'homme du match — le joueur au plus grand total de points ;
 *  3. les distinctions (meilleur buteur, passeur, défenseur) et leurs
 *     récompenses ;
 *  4. la récompense de participation ;
 *  5. les montées et descentes de division ;
 *  6. le passage de la proposition à l'état terminé.
 *
 * En mode non classé, seuls les points 1 et 2 s'appliquent : un match amical
 * ne rapporte aucun UNO et ne change aucune division. Le classement de
 * session y reste calculé, parce qu'il est intéressant à lire.
 *
 * Chaque récompense porte une clé d'idempotence : une clôture rejouée ne
 * peut pas créditer deux fois.
 */
async function applySessionCompletion(
  tx: Transaction,
  actor: { userId: number },
  proposalId: number,
  options: RecordOptions = {},
): Promise<SessionCompletionResult> {
  const proposal = await lockProposal(tx, proposalId);

  if (proposal.status !== "session") {
    throw new AppError(
      "RULE_VIOLATION",
      "Seule une session confirmée peut être clôturée.",
    );
  }

  const ranked = getGameMode(proposal.modeId)?.ranked ?? false;
  const awardUno = ranked && (options.awardUno ?? true);
  const division: Division = proposal.division ?? "D3";

  const participants = await tx
    .select({ playerId: proposalParticipants.playerId })
    .from(proposalParticipants)
    .where(
      and(
        eq(proposalParticipants.proposalId, proposalId),
        eq(proposalParticipants.hasPaid, true),
      ),
    );

  const scoreboard = await sessionScoreboard(tx, proposalId);

  const divisions = new Map<number, Division>();
  if (participants.length > 0) {
    const rows = await tx
      .select({ id: players.id, division: players.division })
      .from(players)
      .where(
        inArray(
          players.id,
          participants.map((participant) => participant.playerId),
        ),
      );
    for (const row of rows) divisions.set(row.id, row.division);
  }

  // --- 2. Homme du match : le meilleur total de points de la session -------
  const motmPlayerId = scoreboard[0]?.player.id ?? null;

  if (motmPlayerId !== null && ranked) {
    // Compteur de carrière : réservé aux modes classés, comme les autres
    // statistiques.
    await tx
      .update(players)
      .set({ motm: sql`${players.motm} + 1`, updatedAt: new Date() })
      .where(eq(players.id, motmPlayerId));

    await awardXp(tx, motmPlayerId, XP_AWARDS.motm);
  }

  // --- 3. Distinctions et récompenses -------------------------------------
  const podium = buildPodium(scoreboard, motmPlayerId);
  let rewardedPlayers = 0;

  // Une distinction rapporte de l'XP, indépendamment des UNO (XP-002).
  //
  // Elle dit quelque chose que la somme des actions ne dit pas : avoir été le
  // meilleur de sa séance. Et elle ne suit pas `awardUno` — celui-ci décide
  // d'un versement en monnaie, l'XP mesure le parcours, pas la caisse.
  if (ranked) {
    for (const entry of podium) {
      // L'homme du match a déjà reçu la sienne ci-dessus.
      if (entry.award === "motm") continue;
      await awardXp(tx, entry.player.id, XP_AWARDS[entry.award]);
    }
  }

  if (awardUno) {
    for (const entry of podium) {
      // L'homme du match est une distinction honorifique : le barème ne lui
      // associe aucun montant (§8.2).
      if (entry.award === "motm") continue;

      await credit(tx, {
        playerId: entry.player.id,
        amount: DEFAULT_REWARD_POLICY[entry.award][division],
        type: "reward",
        description: entry.label,
        referenceType: "proposal",
        referenceId: proposalId,
        idempotencyKey: `reward:session:${proposalId}:${entry.award}:${entry.player.id}`,
      });
      rewardedPlayers++;
    }
  }

  // --- 3 bis. Arbitrage ----------------------------------------------------
  // L'arbitre ne joue pas, ne marque pas et n'entre dans aucun classement,
  // mais son travail est rémunéré comme celui d'un participant (ROLE-003).
  if (awardUno) {
    await payReferee(tx, {
      proposalId,
      refereePlayerId: proposal.refereePlayerId,
      amount: REFEREE_SESSION_FEE_UNO,
    });
  }

  // --- 4. Participation ----------------------------------------------------
  if (awardUno) {
    const amount = DEFAULT_REWARD_POLICY.participation[division];
    for (const participant of participants) {
      await credit(tx, {
        playerId: participant.playerId,
        amount,
        type: "reward",
        description: "Récompense de participation",
        referenceType: "proposal",
        referenceId: proposalId,
        idempotencyKey: `reward:session:${proposalId}:participation:${participant.playerId}`,
      });
    }
  }

  // Le compteur de sessions jouées vaut pour tous les modes : un amical est
  // une session jouée, même s'il ne compte pas au classement.
  for (const participant of participants) {
    await tx
      .update(players)
      .set({ matchesPlayed: sql`${players.matchesPlayed} + 1` })
      .where(eq(players.id, participant.playerId));
  }

  // --- 5. Montées, descentes et note de carte ------------------------------
  const outcomes = computeOutcomes(scoreboard, divisions, ranked);

  // La note suit la forme : elle se compare à la session précédente du joueur
  // (CARD-002). Lue avant toute écriture, pour que la session en cours ne
  // devienne pas sa propre référence.
  const previousPoints = ranked
    ? await previousSessionPoints(
        tx,
        proposalId,
        outcomes.map((outcome) => outcome.playerId),
      )
    : new Map<number, number>();

  const currentRatings = new Map<number, number>();
  if (ranked && outcomes.length > 0) {
    const rows = await tx
      .select({ id: players.id, rating: players.rating })
      .from(players)
      .where(
        inArray(
          players.id,
          outcomes.map((outcome) => outcome.playerId),
        ),
      );
    for (const row of rows) currentRatings.set(row.id, row.rating);
  }

  let ratingsRaised = 0;
  let ratingsLowered = 0;

  for (const outcome of outcomes) {
    // Un mode non classé ne touche pas à la note : un amical ne dit rien de
    // la forme en compétition.
    const before = currentRatings.get(outcome.playerId) ?? null;
    // La note se déplace dans la bande de la division **d'arrivée** : une
    // montée replace aussitôt la carte dans sa nouvelle échelle, ce qui est
    // la récompense visible de la promotion (CARD-003).
    const after =
      ranked && before !== null
        ? nextRating(
            before,
            outcome.points,
            previousPoints.get(outcome.playerId) ?? null,
            outcome.toDivision,
          )
        : null;

    await tx
      .update(proposalParticipants)
      .set({
        sessionRank: outcome.rank,
        sessionPoints: String(outcome.points),
        movement: outcome.movement,
        ratingBefore: before,
        ratingAfter: after,
      })
      .where(
        and(
          eq(proposalParticipants.proposalId, proposalId),
          eq(proposalParticipants.playerId, outcome.playerId),
        ),
      );

    if (after !== null && before !== null && after !== before) {
      await tx
        .update(players)
        .set({ rating: after, updatedAt: new Date() })
        .where(eq(players.id, outcome.playerId));
      if (after > before) ratingsRaised++;
      else ratingsLowered++;
    }

    if (outcome.movement !== "stayed") {
      await tx
        .update(players)
        .set({ division: outcome.toDivision, updatedAt: new Date() })
        .where(eq(players.id, outcome.playerId));
    }
  }

  // Un joueur qui change de division n'a plus sa place dans les sessions de
  // son ancienne division (CAL-002). Le retrait appartient à la transaction
  // de la promotion : sans lui, la clôture laisserait derrière elle des
  // réservations mélangeant trois divisions.
  const moved = outcomes
    .filter((outcome) => outcome.movement !== "stayed")
    .map((outcome) => outcome.playerId);
  const purged = await enforceDivisionEligibility(tx, moved, {
    exceptProposalId: proposalId,
  });

  // --- 6. Clôture ----------------------------------------------------------
  await tx
    .update(proposals)
    .set({
      status: "completed",
      activeSlotKey: null,
      motmPlayerId,
      updatedAt: new Date(),
    })
    .where(eq(proposals.id, proposalId));

  await writeAudit(tx, {
    actorUserId: actor.userId,
    action: "proposal.status.update",
    entityType: "proposal",
    entityId: proposalId,
    before: { status: "session" },
    after: {
      status: "completed",
      rewarded: participants.length,
      promoted: outcomes.filter((o) => o.movement === "promoted").length,
      relegated: outcomes.filter((o) => o.movement === "relegated").length,
      seatsPurged: purged.length,
      ratingsRaised,
      ratingsLowered,
    },
  });

  return {
    rewarded: awardUno ? participants.length : 0,
    rewardedPlayers,
    promoted: outcomes.filter((outcome) => outcome.movement === "promoted").length,
    relegated: outcomes.filter((outcome) => outcome.movement === "relegated").length,
    motmPlayerId,
    seatsPurged: purged.length,
  };
}

export interface SessionCompletionResult {
  rewarded: number;
  rewardedPlayers: number;
  promoted: number;
  relegated: number;
  motmPlayerId: number | null;
  /** Places retirées d'autres sessions parce que leur division a changé. */
  seatsPurged: number;
}

export async function completeSession(
  actor: { userId: number },
  proposalId: number,
  options: RecordOptions = {},
): Promise<SessionCompletionResult> {
  const result = await db.transaction((tx) =>
    applySessionCompletion(tx, actor, proposalId, options),
  );

  await recordAdminEvent({
    type: "proposal.completed",
    body:
      `Session #${proposalId} clôturée : ${result.rewarded} participation(s) récompensée(s), ` +
      `${result.promoted} montée(s), ${result.relegated} descente(s).`,
    entityType: "proposal",
    entityId: proposalId,
    key: `proposal:${proposalId}:completed`,
    // La transaction est déjà validée : plus aucun verrou à contourner.
  }, db);

  return result;
}


// ---------------------------------------------------------------------------
// Correction d'une session clôturée (MATCH-007)
// ---------------------------------------------------------------------------

export interface SessionReopenResult {
  /** Matchs repassés en « terminé », prêts à être ressaisis. */
  matchesReopened: number;
  playersRestored: number;
  divisionsRestored: number;
  ratingsRestored: number;
}

/**
 * Rouvre une session clôturée pour corriger sa saisie (MATCH-007).
 *
 * **Ce que c'est.** Une session clôturée a déjà tout distribué : statistiques
 * de carrière, XP, homme du match, distinctions, montées et descentes, note
 * de carte. Corriger un chiffre ne peut donc pas se faire en écrivant
 * par-dessus — il faut d'abord **défaire** ce que la clôture a fait, puis la
 * rejouer avec les bons chiffres.
 *
 * C'est le choix retenu plutôt qu'un second chemin de saisie : la clôture
 * reste le seul endroit qui décide, et une correction emprunte exactement le
 * même chemin qu'une première saisie. Deux chemins auraient fini par
 * diverger, et le second n'aurait été exercé qu'une fois sur cent.
 *
 * **Ce qui est défait** — dans l'ordre inverse de la clôture : validation des
 * matchs, statistiques de carrière, XP et niveau, compteur d'homme du match,
 * sessions jouées, classement de session, mouvements de division, note de
 * carte, et le statut de la session.
 *
 * **Ce qui ne l'est pas, et pourquoi :**
 *
 *  - **les UNO déjà versés restent acquis.** Reprendre une récompense
 *    dépensée en boutique est impossible sans créer un solde négatif, et une
 *    ligue amateur ne redemande pas un prix remis. À la re-clôture, les clés
 *    d'idempotence font que rien n'est versé deux fois ; seul un nouveau
 *    bénéficiaire, s'il y en a un, est crédité ;
 *  - **les places retirées d'autres sessions ne reviennent pas.** Une montée
 *    de division a pu vider une réservation à venir et la faire reprendre par
 *    un remplaçant, déjà remboursé ou déjà inscrit. Remonter ce fil
 *    déferait le choix d'un tiers.
 *
 * Les deux sont dits à l'écran avant de confirmer : une correction n'est pas
 * une annulation.
 */
async function applySessionReopen(
  tx: Transaction,
  actor: { userId: number },
  proposalId: number,
): Promise<SessionReopenResult> {
  const proposal = await lockProposal(tx, proposalId);

  if (proposal.status !== "completed") {
    throw new AppError(
      "RULE_VIOLATION",
      "Seule une session clôturée peut être rouverte pour correction.",
    );
  }

  const ranked = getGameMode(proposal.modeId)?.ranked ?? false;

  // Classement de la session **avant** toute écriture : `sessionScoreboard`
  // ne compte que les matchs validés, et l'étape suivante les repasse en
  // « terminé ». Le lire après reviendrait à le lire vide, et les XP des
  // distinctions ne seraient jamais reprises.
  const closingBoard = ranked ? await sessionScoreboard(tx, proposalId) : [];

  // --- 1. Validation des matchs, statistiques de carrière, XP -------------
  const validated = await tx
    .select({ id: matches.id })
    .from(matches)
    .where(and(eq(matches.proposalId, proposalId), eq(matches.status, "validated")));

  const xpByPlayer = new Map<number, number>();
  const statsByPlayer = new Map<
    number,
    { goals: number; assists: number; defenses: number; saves: number }
  >();

  for (const { id: matchId } of validated) {
    const lines = await tx
      .select()
      .from(matchStats)
      .where(eq(matchStats.matchId, matchId));

    for (const line of lines) {
      // Exactement le barème appliqué à la validation : ce qui a été ajouté
      // est ce qui est retiré.
      const xpGain =
        XP_AWARDS.sessionPlayed +
        line.goals * XP_AWARDS.goal +
        line.assists * XP_AWARDS.assist +
        line.defenses * XP_AWARDS.defense +
        line.saves * XP_AWARDS.save;

      xpByPlayer.set(line.playerId, (xpByPlayer.get(line.playerId) ?? 0) + xpGain);

      if (ranked) {
        const current = statsByPlayer.get(line.playerId) ?? {
          goals: 0,
          assists: 0,
          defenses: 0,
          saves: 0,
        };
        statsByPlayer.set(line.playerId, {
          goals: current.goals + line.goals,
          assists: current.assists + line.assists,
          defenses: current.defenses + line.defenses,
          saves: current.saves + line.saves,
        });
      }
    }

    await tx
      .update(matches)
      .set({
        status: "finished",
        validatedAt: null,
        validatedByUserId: null,
        updatedAt: new Date(),
      })
      .where(eq(matches.id, matchId));
  }

  // --- 2. Homme du match ---------------------------------------------------
  if (proposal.motmPlayerId !== null && ranked) {
    await tx
      .update(players)
      .set({
        motm: sql`GREATEST(0, ${players.motm} - 1)`,
        updatedAt: new Date(),
      })
      .where(eq(players.id, proposal.motmPlayerId));

    xpByPlayer.set(
      proposal.motmPlayerId,
      (xpByPlayer.get(proposal.motmPlayerId) ?? 0) + XP_AWARDS.motm,
    );
  }

  // L'XP des distinctions se retire aussi : elle a été versée à la clôture
  // d'après un classement que la correction va refaire.
  if (ranked) {
    for (const entry of buildPodium(closingBoard, proposal.motmPlayerId)) {
      if (entry.award === "motm") continue;
      xpByPlayer.set(
        entry.player.id,
        (xpByPlayer.get(entry.player.id) ?? 0) + XP_AWARDS[entry.award],
      );
    }
  }

  // --- 3. Participants : sessions jouées, classement, divisions, note ------
  const participants = await tx
    .select({
      playerId: proposalParticipants.playerId,
      hasPaid: proposalParticipants.hasPaid,
      movement: proposalParticipants.movement,
      ratingBefore: proposalParticipants.ratingBefore,
      ratingAfter: proposalParticipants.ratingAfter,
    })
    .from(proposalParticipants)
    .where(eq(proposalParticipants.proposalId, proposalId));

  let divisionsRestored = 0;
  let ratingsRestored = 0;

  for (const participant of participants) {
    if (participant.hasPaid) {
      await tx
        .update(players)
        .set({ matchesPlayed: sql`GREATEST(0, ${players.matchesPlayed} - 1)` })
        .where(eq(players.id, participant.playerId));
    }

    // La division se **défait par l'écart**, pas en réécrivant celle d'avant :
    // le joueur a pu rejouer depuis, et lui réimposer son ancienne division
    // effacerait les sessions suivantes. Reculer d'un cran compose
    // correctement, quoi qu'il se soit passé entre-temps.
    if (participant.movement === "promoted" || participant.movement === "relegated") {
      const [row] = await tx
        .select({ division: players.division })
        .from(players)
        .where(eq(players.id, participant.playerId))
        .limit(1);

      const back =
        participant.movement === "promoted"
          ? divisionBelow(row?.division ?? "D3")
          : divisionAbove(row?.division ?? "D3");

      if (back) {
        await tx
          .update(players)
          .set({ division: back, updatedAt: new Date() })
          .where(eq(players.id, participant.playerId));
        divisionsRestored++;
      }
    }

    // Même raisonnement pour la note : on retire l'écart que cette session
    // avait ajouté. Le résultat est ramené dans la bande de la division que
    // le joueur retrouve — celle qu'on vient de lui rendre juste au-dessus
    // (CARD-003).
    if (participant.ratingBefore !== null && participant.ratingAfter !== null) {
      const delta = participant.ratingAfter - participant.ratingBefore;
      if (delta !== 0) {
        const [row] = await tx
          .select({ rating: players.rating, division: players.division })
          .from(players)
          .where(eq(players.id, participant.playerId))
          .limit(1);

        if (row) {
          await tx
            .update(players)
            .set({
              rating: clampToBand(row.rating - delta, row.division),
              updatedAt: new Date(),
            })
            .where(eq(players.id, participant.playerId));
          ratingsRestored++;
        }
      }
    }
  }

  await tx
    .update(proposalParticipants)
    .set({
      sessionRank: null,
      sessionPoints: null,
      movement: null,
      ratingBefore: null,
      ratingAfter: null,
    })
    .where(eq(proposalParticipants.proposalId, proposalId));

  // --- 4. Statistiques de carrière et XP ----------------------------------
  for (const [playerId, stats] of statsByPlayer) {
    await tx
      .update(players)
      .set({
        goals: sql`GREATEST(0, ${players.goals} - ${stats.goals})`,
        assists: sql`GREATEST(0, ${players.assists} - ${stats.assists})`,
        defenses: sql`GREATEST(0, ${players.defenses} - ${stats.defenses})`,
        saves: sql`GREATEST(0, ${players.saves} - ${stats.saves})`,
        updatedAt: new Date(),
      })
      .where(eq(players.id, playerId));
  }

  // L'XP se retire par le même chemin qu'elle est venue : `awardXp` redéduit
  // le niveau, qui peut donc redescendre. Les UNO du palier, eux, restent
  // acquis — leur clé d'idempotence porte le niveau, si bien que remonter
  // après correction ne les repaie pas (XP-003).
  for (const [playerId, xp] of xpByPlayer) {
    await awardXp(tx, playerId, -xp);
  }

  // --- 5. La session redevient saisissable --------------------------------
  await tx
    .update(proposals)
    .set({ status: "session", motmPlayerId: null, updatedAt: new Date() })
    .where(eq(proposals.id, proposalId));

  await writeAudit(tx, {
    actorUserId: actor.userId,
    action: "proposal.reopen",
    entityType: "proposal",
    entityId: proposalId,
    before: { status: "completed", motmPlayerId: proposal.motmPlayerId },
    after: {
      status: "session",
      matchesReopened: validated.length,
      playersRestored: xpByPlayer.size,
      divisionsRestored,
      ratingsRestored,
    },
  });

  return {
    matchesReopened: validated.length,
    playersRestored: xpByPlayer.size,
    divisionsRestored,
    ratingsRestored,
  };
}

export async function reopenSession(
  actor: { userId: number },
  proposalId: number,
): Promise<SessionReopenResult> {
  const result = await db.transaction((tx) =>
    applySessionReopen(tx, actor, proposalId),
  );

  await recordAdminEvent(
    {
      type: "proposal.reopened",
      body:
        `Session #${proposalId} rouverte pour correction : ` +
        `${result.matchesReopened} match(s) à ressaisir.`,
      entityType: "proposal",
      entityId: proposalId,
      key: `proposal:${proposalId}:reopened:${Date.now()}`,
    },
    db,
  );

  return result;
}

/**
 * Saisie complète d'une session par l'administration (MATCH-003).
 *
 * Tous les matchs sont enregistrés, validés et la session clôturée dans une
 * seule transaction. Le tout-ou-rien est ici une exigence, pas un confort :
 * une session à moitié saisie produirait un classement de session faux, donc
 * de fausses distinctions et de fausses montées de division.
 */
export interface RecordSessionResult {
  matchesRecorded: number;
  completion: SessionCompletionResult | null;
}

/**
 * Cœur transactionnel de la saisie, exposé pour que la publication d'une
 * feuille saisie en visionnage (TRACK-001) emprunte exactement le même chemin.
 *
 * Elle ne peut pas appeler `recordSession` : celle-ci ouvre sa propre
 * transaction, donc une autre connexion, qui ne verrait pas la session qu'elle
 * vient de créer. Séparer le corps de son enveloppe transactionnelle est ce
 * qui permet aux deux chemins de partager la règle — validation des matchs,
 * XP, distinctions, récompenses, montées et descentes — au lieu de la
 * réimplémenter, avec le risque qu'ils divergent.
 */
export async function applyRecordSession(
  tx: Transaction,
  actor: { userId: number },
  input: RecordSessionInput,
  options: RecordOptions = {},
): Promise<RecordSessionResult> {
  const own = await tx
    .select({ id: matches.id })
    .from(matches)
    .where(eq(matches.proposalId, input.proposalId));

  const belongs = new Set(own.map((row) => row.id));
  for (const entry of input.matches) {
    if (!belongs.has(entry.matchId)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Un match saisi n'appartient pas à cette session.",
      );
    }
  }

  for (const entry of input.matches) {
    await applyMatchReport(tx, entry);
    await applyMatchValidation(tx, actor, entry.matchId, options);
  }

  await writeAudit(tx, {
    actorUserId: actor.userId,
    action: "session.record",
    entityType: "proposal",
    entityId: input.proposalId,
    after: { matches: input.matches.length, completed: input.complete },
  });

  const completion = input.complete
    ? await applySessionCompletion(tx, actor, input.proposalId, options)
    : null;

  return { matchesRecorded: input.matches.length, completion };
}

export async function recordSession(
  actor: { userId: number },
  input: RecordSessionInput,
  options: RecordOptions = {},
): Promise<RecordSessionResult> {
  const result = await db.transaction((tx) =>
    applyRecordSession(tx, actor, input, options),
  );

  if (result.completion) {
    await recordAdminEvent({
      type: "proposal.completed",
      body:
        `Session #${input.proposalId} saisie et clôturée : ` +
        `${result.completion.promoted} montée(s), ${result.completion.relegated} descente(s).`,
      entityType: "proposal",
      entityId: input.proposalId,
      key: `proposal:${input.proposalId}:completed`,
    }, db);
  }

  return result;
}


// ---------------------------------------------------------------------------
// Composition d'une session UNO League (MATCH-001)
// ---------------------------------------------------------------------------

/**
 * Ajoute un match à une session.
 *
 * Réservé aux modes classés : un amical se joue en une rencontre, ajouter des
 * matchs y produirait une feuille incohérente.
 */
export async function addMatch(
  actor: { userId: number },
  input: AddMatchInput,
): Promise<MatchView[]> {
  return db.transaction(async (tx) => {
    const proposal = await lockProposal(tx, input.proposalId);

    if (!(getGameMode(proposal.modeId)?.ranked ?? false)) {
      throw new AppError(
        "RULE_VIOLATION",
        "Seule une session UNO League enchaîne plusieurs matchs.",
      );
    }
    if (input.teamAId === input.teamBId) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Une équipe ne peut pas se rencontrer elle-même.",
      );
    }

    const own = await tx
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.proposalId, input.proposalId));

    const known = new Set(own.map((row) => row.id));
    if (!known.has(input.teamAId) || !known.has(input.teamBId)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Une équipe désignée n'appartient pas à cette session.",
      );
    }

    const existing = await tx
      .select({ matchOrder: matches.matchOrder })
      .from(matches)
      .where(eq(matches.proposalId, input.proposalId));

    const nextOrder =
      existing.reduce((max, row) => Math.max(max, row.matchOrder), 0) + 1;

    await tx.insert(matches).values({
      proposalId: input.proposalId,
      teamAId: input.teamAId,
      teamBId: input.teamBId,
      matchOrder: nextOrder,
      status: "scheduled",
    });

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "session.record",
      entityType: "proposal",
      entityId: input.proposalId,
      after: { matchAdded: nextOrder },
    });

    return listMatches(tx, input.proposalId);
  });
}

/**
 * Retire un match non validé.
 *
 * Un match déjà validé a alimenté les statistiques de carrière et versé des
 * récompenses : le supprimer laisserait ces effets derrière lui. La correction
 * passe alors par l'administration, pas par une suppression silencieuse.
 */
/**
 * Session à laquelle un match appartient.
 *
 * Le client d'une suppression n'envoie que l'identifiant du match ; c'est par
 * là qu'on remonte à sa session pour contrôler les droits (SUP-001).
 */
export async function proposalOfMatch(
  executor: Executor,
  matchId: number,
): Promise<number> {
  const [row] = await executor
    .select({ proposalId: matches.proposalId })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  if (!row) throw new AppError("NOT_FOUND", "Ce match est introuvable.");
  return row.proposalId;
}

export async function removeMatch(
  actor: { userId: number },
  matchId: number,
): Promise<MatchView[]> {
  return db.transaction(async (tx) => {
    const match = await lockMatch(tx, matchId);

    if (match.validatedAt) {
      throw new AppError(
        "RULE_VIOLATION",
        "Ce match est validé : ses statistiques et récompenses sont déjà acquises.",
      );
    }

    await tx.delete(matches).where(eq(matches.id, matchId));

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "session.record",
      entityType: "proposal",
      entityId: match.proposalId,
      before: { matchRemoved: match.matchOrder },
    });

    return listMatches(tx, match.proposalId);
  });
}

/**
 * Déplace un joueur vers une autre équipe de la session (MATCH-001).
 *
 * Le tirage automatique est un point de départ : sur le terrain, les équipes
 * se réajustent — un joueur arrive en retard, un autre repart plus tôt. Refusé
 * dès qu'un match a été validé, car les compositions sont alors figées dans
 * les statistiques déjà reportées.
 */
export async function assignPlayerToTeam(
  actor: { userId: number },
  input: AssignTeamInput,
): Promise<TeamView[]> {
  return db.transaction(async (tx) => {
    const own = await tx
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.proposalId, input.proposalId));

    if (!own.some((team) => team.id === input.teamId)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Cette équipe n'appartient pas à la session.",
      );
    }

    const [validated] = await tx
      .select({ id: matches.id })
      .from(matches)
      .where(
        and(
          eq(matches.proposalId, input.proposalId),
          eq(matches.status, "validated"),
        ),
      )
      .limit(1);

    if (validated) {
      throw new AppError(
        "RULE_VIOLATION",
        "Un match est déjà validé : les équipes ne peuvent plus être modifiées.",
      );
    }

    const teamIds = own.map((team) => team.id);

    await tx
      .delete(teamMembers)
      .where(
        and(
          inArray(teamMembers.teamId, teamIds),
          eq(teamMembers.playerId, input.playerId),
        ),
      );

    await tx
      .insert(teamMembers)
      .values({ teamId: input.teamId, playerId: input.playerId });

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "session.record",
      entityType: "proposal",
      entityId: input.proposalId,
      after: { playerId: input.playerId, teamId: input.teamId },
    });

    return readTeams(tx, input.proposalId);
  });
}

export { readTeams };

// ---------------------------------------------------------------------------
// Lectures : podium et feuille de match
// ---------------------------------------------------------------------------

/**
 * Podium d'une session (§8.2).
 *
 * Construit à partir du classement de session, donc des seuls rapports
 * validés. Une distinction n'apparaît que si elle a été réellement obtenue :
 * pas de « meilleur buteur » avec zéro but.
 *
 * Le meilleur défenseur est celui qui cumule le plus de **défenses et
 * d'arrêts**. Ne compter que les défenses écartait mécaniquement les gardiens
 * d'une distinction qui les concerne au premier chef.
 */
function buildPodium(
  scoreboard: SessionScoreboardRow[],
  motmPlayerId: number | null,
): PodiumEntry[] {
  const awards: {
    award: PodiumAward;
    label: string;
    value: (row: SessionScoreboardRow) => number;
  }[] = [
    { award: "topScorer", label: "Meilleur buteur", value: (row) => row.goals },
    { award: "topAssist", label: "Meilleur passeur", value: (row) => row.assists },
    {
      award: "topDefender",
      label: "Meilleur défenseur",
      value: (row) => defensiveScore(row),
    },
  ];

  const entries: PodiumEntry[] = [];

  for (const { award, label, value } of awards) {
    const ranked = scoreboard
      .filter((row) => value(row) > 0)
      // À égalité, le meilleur total de points de la session tranche, puis
      // l'identifiant : le podium est stable d'un affichage à l'autre.
      .sort(
        (a, b) =>
          value(b) - value(a) ||
          b.points - a.points ||
          a.player.id - b.player.id,
      );

    const best = ranked[0];
    if (best) {
      entries.push({ award, label, value: value(best), player: best.player });
    }
  }

  const motm = scoreboard.find((row) => row.player.id === motmPlayerId);
  if (motm && motm.points > 0) {
    entries.push({
      award: "motm",
      label: "Homme du match",
      value: motm.points,
      player: motm.player,
    });
  }

  return entries;
}

/**
 * Podium d'une session terminée, tel que l'affiche l'application.
 *
 * L'homme du match est relu depuis la proposition lorsqu'il y a été figé à la
 * clôture : le podium d'une session passée ne doit pas changer parce que le
 * barème ou les statistiques ont évolué depuis.
 */
export async function sessionPodium(
  executor: Executor,
  proposalId: number,
): Promise<PodiumEntry[]> {
  const scoreboard = await sessionScoreboard(executor, proposalId);
  if (scoreboard.length === 0) return [];

  const [proposal] = await executor
    .select({ motmPlayerId: proposals.motmPlayerId })
    .from(proposals)
    .where(eq(proposals.id, proposalId))
    .limit(1);

  return buildPodium(
    scoreboard,
    proposal?.motmPlayerId ?? scoreboard[0]?.player.id ?? null,
  );
}

/**
 * Feuille de match d'une session : statistiques par joueur, cumulées sur tous
 * les matchs validés, classées selon le barème officiel.
 *
 * C'est ce que consulte un joueur qui ouvre une session passée depuis son
 * historique. Seuls les rapports validés sont pris en compte : un rapport
 * saisi mais non validé n'a pas encore d'existence sportive.
 */
export interface SessionScoreboardRow {
  player: PublicPlayer;
  goals: number;
  assists: number;
  defenses: number;
  saves: number;
  /** Défenses + arrêts : le critère du meilleur défenseur. */
  defensivePoints: number;
  points: number;
  /**
   * Montée, descente ou maintien décidé à la clôture (RANK-005). `null` tant
   * que la session n'est pas clôturée — le classement existe alors, mais il
   * n'a encore rien décidé.
   */
  movement: DivisionMovement | null;
}

export async function sessionScoreboard(
  executor: Executor,
  proposalId: number,
): Promise<SessionScoreboardRow[]> {
  // Les statistiques de la session sont préfixées : les colonnes de la carte
  // portent les mêmes noms, mais désignent les totaux de carrière.
  const rows = await executor
    .select({
      sessionGoals: matchStats.goals,
      sessionAssists: matchStats.assists,
      sessionDefenses: matchStats.defenses,
      sessionSaves: matchStats.saves,
      ...publicPlayerColumns,
    })
    .from(matchStats)
    .innerJoin(matches, eq(matches.id, matchStats.matchId))
    .innerJoin(players, eq(players.id, matchStats.playerId))
    .where(
      and(eq(matches.proposalId, proposalId), eq(matches.status, "validated")),
    );

  // Le mouvement de division est figé à la clôture : on le relit plutôt que
  // de le recalculer, pour qu'une session passée affiche ce qui s'est
  // réellement produit.
  const movements = new Map<number, DivisionMovement | null>(
    (
      await executor
        .select({
          playerId: proposalParticipants.playerId,
          movement: proposalParticipants.movement,
        })
        .from(proposalParticipants)
        .where(eq(proposalParticipants.proposalId, proposalId))
    ).map((row) => [row.playerId, row.movement]),
  );

  const totals = new Map<number, SessionScoreboardRow>();

  for (const row of rows) {
    const {
      sessionGoals,
      sessionAssists,
      sessionDefenses,
      sessionSaves,
      ...player
    } = row;

    // Un joueur dispute plusieurs matchs dans une même session : on cumule.
    const current = totals.get(player.id) ?? {
      player: toPublicPlayer(player),
      goals: 0,
      assists: 0,
      defenses: 0,
      saves: 0,
      defensivePoints: 0,
      points: 0,
      movement: movements.get(player.id) ?? null,
    };

    current.goals += sessionGoals;
    current.assists += sessionAssists;
    current.defenses += sessionDefenses;
    current.saves += sessionSaves;
    totals.set(player.id, current);
  }

  // Les points sont calculés avec le même barème que le classement général :
  // un joueur ne peut pas voir deux valeurs différentes pour une même
  // performance selon l'écran qu'il consulte.
  for (const row of totals.values()) {
    row.defensivePoints = defensiveScore(row);
    row.points = rankingScore({
      id: row.player.id,
      displayName: row.player.displayName,
      goals: row.goals,
      assists: row.assists,
      defenses: row.defenses,
      saves: row.saves,
      motm: 0,
    });
  }

  return [...totals.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.goals - a.goals ||
      a.player.displayName.localeCompare(b.player.displayName, "fr"),
  );
}
