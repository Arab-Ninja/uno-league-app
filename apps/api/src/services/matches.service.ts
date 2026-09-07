import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  AppError,
  DEFAULT_REWARD_POLICY,
  SESSION_MOVEMENT_COUNT,
  TEAM_SIZE,
  XP_AWARDS,
  defensiveScore,
  divisionAbove,
  divisionBelow,
  draftTeams,
  getGameMode,
  levelFromXp,
  rankingScore,
  type Division,
  type DivisionMovement,
  type MatchView,
  type PodiumAward,
  type PodiumEntry,
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
import { publicPlayerColumns, toPublicPlayer } from "./players.service.js";
import { credit } from "./ledger.service.js";
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

    // Chaque équipe rencontre chaque autre équipe une fois.
    const created = await tx
      .select()
      .from(teams)
      .where(eq(teams.proposalId, proposalId))
      .orderBy(asc(teams.teamIndex));

    for (let a = 0; a < created.length; a++) {
      for (let b = a + 1; b < created.length; b++) {
        await tx.insert(matches).values({
          proposalId,
          teamAId: created[a]!.id,
          teamBId: created[b]!.id,
          status: "scheduled",
        });
      }
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
    .orderBy(asc(matches.id));

  const squads = await readTeams(executor, proposalId);
  const byId = new Map(squads.map((team) => [team.id, team]));

  return rows.map((row) => ({
    id: row.id,
    proposalId: row.proposalId,
    status: row.status,
    scoreA: row.scoreA,
    scoreB: row.scoreB,
    playedAt: row.playedAt ? row.playedAt.toISOString() : null,
    teamA: byId.get(row.teamAId) ?? null,
    teamB: byId.get(row.teamBId) ?? null,
  }));
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
      .set({
        ...statIncrements,
        xp: sql`${players.xp} + ${xpGain}`,
        updatedAt: new Date(),
      })
      .where(eq(players.id, line.playerId));

    const [refreshed] = await tx
      .select({ xp: players.xp })
      .from(players)
      .where(eq(players.id, line.playerId))
      .limit(1);

    if (refreshed) {
      await tx
        .update(players)
        .set({ level: levelFromXp(refreshed.xp) })
        .where(eq(players.id, line.playerId));
    }
    playersUpdated++;
  }

  // Récompense « meilleure équipe » aux vainqueurs du match (§8.2), en mode
  // classé uniquement.
  let rewardedPlayers = 0;
  if (ranked && match.scoreA !== match.scoreB) {
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

/**
 * Nombre de joueurs qui montent — et autant qui descendent — à l'issue d'une
 * session classée.
 *
 * Le barème vise une session complète : trois équipes de cinq, cinq montées,
 * cinq descentes, cinq maintiens. Pour une session incomplète, le tiers est
 * conservé plutôt que le chiffre absolu : appliquer « cinq et cinq » à huit
 * joueurs ferait monter ou descendre tout le monde, ce qui ne veut plus rien
 * dire.
 */
export function movementCountFor(participants: number): number {
  return Math.max(0, Math.min(SESSION_MOVEMENT_COUNT, Math.floor(participants / 3)));
}

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
function computeOutcomes(
  scoreboard: SessionScoreboardRow[],
  divisions: Map<number, Division>,
  ranked: boolean,
): SessionOutcome[] {
  const movements = ranked ? movementCountFor(scoreboard.length) : 0;
  const lastPromoted = movements;
  const firstRelegated = scoreboard.length - movements;

  return scoreboard.map((row, index) => {
    const from = divisions.get(row.player.id) ?? row.player.division;

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

    return {
      playerId: row.player.id,
      rank: index + 1,
      points: row.points,
      movement,
      fromDivision: from,
      toDivision: to,
    };
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
): Promise<SessionCompletionResult> {
  const proposal = await lockProposal(tx, proposalId);

  if (proposal.status !== "session") {
    throw new AppError(
      "RULE_VIOLATION",
      "Seule une session confirmée peut être clôturée.",
    );
  }

  const ranked = getGameMode(proposal.modeId)?.ranked ?? false;
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
      .set({
        motm: sql`${players.motm} + 1`,
        xp: sql`${players.xp} + ${XP_AWARDS.motm}`,
        updatedAt: new Date(),
      })
      .where(eq(players.id, motmPlayerId));
  }

  // --- 3. Distinctions et récompenses -------------------------------------
  const podium = buildPodium(scoreboard, motmPlayerId);
  let rewardedPlayers = 0;

  if (ranked) {
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

  // --- 4. Participation ----------------------------------------------------
  if (ranked) {
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

  // --- 5. Montées et descentes --------------------------------------------
  const outcomes = computeOutcomes(scoreboard, divisions, ranked);

  for (const outcome of outcomes) {
    await tx
      .update(proposalParticipants)
      .set({
        sessionRank: outcome.rank,
        sessionPoints: String(outcome.points),
        movement: outcome.movement,
      })
      .where(
        and(
          eq(proposalParticipants.proposalId, proposalId),
          eq(proposalParticipants.playerId, outcome.playerId),
        ),
      );

    if (outcome.movement !== "stayed") {
      await tx
        .update(players)
        .set({ division: outcome.toDivision, updatedAt: new Date() })
        .where(eq(players.id, outcome.playerId));
    }
  }

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
    },
  });

  return {
    rewarded: ranked ? participants.length : 0,
    rewardedPlayers,
    promoted: outcomes.filter((outcome) => outcome.movement === "promoted").length,
    relegated: outcomes.filter((outcome) => outcome.movement === "relegated").length,
    motmPlayerId,
  };
}

export interface SessionCompletionResult {
  rewarded: number;
  rewardedPlayers: number;
  promoted: number;
  relegated: number;
  motmPlayerId: number | null;
}

export async function completeSession(
  actor: { userId: number },
  proposalId: number,
): Promise<SessionCompletionResult> {
  const result = await db.transaction((tx) =>
    applySessionCompletion(tx, actor, proposalId),
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

/**
 * Saisie complète d'une session par l'administration (MATCH-003).
 *
 * Tous les matchs sont enregistrés, validés et la session clôturée dans une
 * seule transaction. Le tout-ou-rien est ici une exigence, pas un confort :
 * une session à moitié saisie produirait un classement de session faux, donc
 * de fausses distinctions et de fausses montées de division.
 */
export async function recordSession(
  actor: { userId: number },
  input: RecordSessionInput,
): Promise<{ matchesRecorded: number; completion: SessionCompletionResult | null }> {
  const result = await db.transaction(async (tx) => {
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
      await applyMatchValidation(tx, actor, entry.matchId);
    }

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "session.record",
      entityType: "proposal",
      entityId: input.proposalId,
      after: { matches: input.matches.length, completed: input.complete },
    });

    const completion = input.complete
      ? await applySessionCompletion(tx, actor, input.proposalId)
      : null;

    return { matchesRecorded: input.matches.length, completion };
  });

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
