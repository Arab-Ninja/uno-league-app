import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";
import {
  AppError,
  isChallengeSettled,
  type SquadMessageView,
} from "@uno/shared";
import { db, type Executor } from "../db/client.js";
import {
  players,
  squadChallenges,
  squadMessages,
  squads,
} from "../db/schema.js";
import { activeMembership } from "./squads.service.js";

/**
 * Fils de discussion du mode SQUAD (SQUAD-005).
 *
 * Deux fils, une seule mécanique. Le chat **interne** d'un club est permanent
 * et réservé à ses membres actifs. Le chat d'un **défi** réunit les membres
 * des deux clubs, le temps de s'accorder sur une rencontre.
 *
 * **Pas de temps réel.** Les messages se récupèrent par interrogation
 * périodique, avec un curseur sur le dernier identifiant lu. Une connexion
 * persistante imposerait des contraintes d'hébergement — sessions collantes,
 * montée en charge des connexions ouvertes — sans rapport avec ce qu'une
 * ligue de cinquante joueurs échange en une soirée. La notification push
 * prévient déjà quand on n'a pas l'écran sous les yeux.
 *
 * **Qui a le droit de lire décide de tout le reste.** Un membre qui quitte un
 * club perd l'accès à la suite de la conversation ; il garde ce qu'il a vu,
 * mais ne voit plus ce qui s'y dit après son départ.
 */

type Thread =
  | { scope: "squad"; squadId: number }
  | { scope: "challenge"; challengeId: number };

interface ThreadAccess {
  scope: "squad" | "challenge";
  scopeId: number;
  /** Le club au nom duquel le joueur s'exprime dans ce fil. */
  squadId: number;
  /** Faux quand le fil est clos : on peut relire, plus écrire. */
  writable: boolean;
}

/**
 * Vérifie l'accès à un fil, et rend le contexte d'écriture.
 *
 * Un seul endroit décide, pour la lecture comme pour l'écriture : deux
 * contrôles séparés auraient fini par diverger, et c'est toujours celui de
 * la lecture qu'on oublie de resserrer.
 */
async function assertThreadAccess(
  executor: Executor,
  playerId: number,
  thread: Thread,
): Promise<ThreadAccess> {
  const membership = await activeMembership(executor, playerId);

  if (thread.scope === "squad") {
    if (!membership || membership.squadId !== thread.squadId) {
      throw new AppError(
        "RULE_VIOLATION",
        "Le chat d'un SQUAD est réservé à ses membres.",
      );
    }
    return {
      scope: "squad",
      scopeId: thread.squadId,
      squadId: thread.squadId,
      writable: true,
    };
  }

  const [challenge] = await executor
    .select({
      id: squadChallenges.id,
      challengerSquadId: squadChallenges.challengerSquadId,
      challengedSquadId: squadChallenges.challengedSquadId,
      status: squadChallenges.status,
    })
    .from(squadChallenges)
    .where(eq(squadChallenges.id, thread.challengeId))
    .limit(1);

  if (!challenge) throw new AppError("NOT_FOUND", "Ce défi est introuvable.");

  const sides = [challenge.challengerSquadId, challenge.challengedSquadId];
  if (!membership || !sides.includes(membership.squadId)) {
    throw new AppError(
      "RULE_VIOLATION",
      "Ce fil est réservé aux membres des deux SQUADs concernés.",
    );
  }

  return {
    scope: "challenge",
    scopeId: challenge.id,
    squadId: membership.squadId,
    // Un défi tranché — accepté, refusé, expiré, joué — fige son fil. La
    // conversation reste lisible : elle raconte comment on s'est accordé.
    writable: !isChallengeSettled(challenge.status),
  };
}

/**
 * Messages d'un fil, du plus ancien au plus récent.
 *
 * `afterId` permet à l'écran de ne demander que la suite : une interrogation
 * périodique qui rapatrierait tout le fil à chaque tour coûterait cher pour
 * rien.
 */
export async function listMessages(
  executor: Executor,
  params: {
    playerId: number;
    thread: Thread;
    limit: number;
    afterId?: number | undefined;
  },
): Promise<{ messages: SquadMessageView[]; writable: boolean }> {
  const access = await assertThreadAccess(executor, params.playerId, params.thread);

  const conditions = [
    eq(squadMessages.scope, access.scope),
    eq(squadMessages.scopeId, access.scopeId),
  ];
  if (params.afterId) conditions.push(gt(squadMessages.id, params.afterId));

  const rows = await executor
    .select({
      id: squadMessages.id,
      body: squadMessages.body,
      playerId: squadMessages.playerId,
      playerName: players.displayName,
      squadId: squadMessages.squadId,
      createdAt: squadMessages.createdAt,
    })
    .from(squadMessages)
    .innerJoin(players, eq(players.id, squadMessages.playerId))
    .where(and(...conditions))
    // Les plus récents d'abord côté base, puis remis dans l'ordre : sans
    // cela, une limite tronquerait le début du fil au lieu de sa fin.
    .orderBy(params.afterId ? asc(squadMessages.id) : desc(squadMessages.id))
    .limit(params.limit);

  const ordered = params.afterId ? rows : [...rows].reverse();

  const squadIds = [
    ...new Set(ordered.map((row) => row.squadId).filter((id): id is number => id !== null)),
  ];
  const names = new Map<number, string>();
  if (squadIds.length > 0) {
    const squadRows = await executor
      .select({ id: squads.id, name: squads.name })
      .from(squads)
      .where(inArray(squads.id, squadIds));
    for (const squad of squadRows) names.set(squad.id, squad.name);
  }

  return {
    writable: access.writable,
    messages: ordered.map((row) => ({
      id: row.id,
      body: row.body,
      playerId: row.playerId,
      playerName: row.playerName,
      squadId: row.squadId,
      squadName: row.squadId === null ? null : (names.get(row.squadId) ?? null),
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

/** Écrit un message dans un fil. */
export async function postMessage(
  actor: { playerId: number },
  params: { thread: Thread; body: string },
): Promise<SquadMessageView> {
  return db.transaction(async (tx) => {
    const access = await assertThreadAccess(tx, actor.playerId, params.thread);

    if (!access.writable) {
      throw new AppError(
        "RULE_VIOLATION",
        "Ce défi est tranché : son fil reste lisible, mais ne reçoit plus de message.",
      );
    }

    const body = params.body.trim();
    if (body.length === 0) {
      throw new AppError("VALIDATION_ERROR", "Le message est vide.");
    }

    const inserted = await tx.insert(squadMessages).values({
      scope: access.scope,
      scopeId: access.scopeId,
      playerId: actor.playerId,
      squadId: access.squadId,
      body,
    });

    const id = Number(inserted[0].insertId);

    const [row] = await tx
      .select({
        id: squadMessages.id,
        body: squadMessages.body,
        playerId: squadMessages.playerId,
        playerName: players.displayName,
        squadId: squadMessages.squadId,
        squadName: squads.name,
        createdAt: squadMessages.createdAt,
      })
      .from(squadMessages)
      .innerJoin(players, eq(players.id, squadMessages.playerId))
      .leftJoin(squads, eq(squads.id, squadMessages.squadId))
      .where(eq(squadMessages.id, id))
      .limit(1);

    return {
      id: row!.id,
      body: row!.body,
      playerId: row!.playerId,
      playerName: row!.playerName,
      squadId: row!.squadId,
      squadName: row!.squadName,
      createdAt: row!.createdAt.toISOString(),
    };
  });
}
