import { and, eq, inArray } from "drizzle-orm";
import {
  AppError,
  LINEUP_SLOTS,
  type LineupAssignment,
  type LineupSlot,
  type PublicPlayer,
} from "@uno/shared";
import { db, type Executor } from "../db/client.js";
import {
  players,
  squadMembers,
  squads,
  tournamentEntries,
  tournamentLineups,
  tournaments,
} from "../db/schema.js";
import { publicPlayerColumns, toPublicPlayer } from "./players.service.js";
import { assertSquadRole } from "./squads.service.js";
import { getLineup } from "./squad-lineup.service.js";
import { writeAudit } from "./audit.service.js";

/**
 * Le cinq d'un club pour un tournoi (TOUR-007).
 *
 * Un tournoi ne demandait à personne qui jouait. Le club s'engageait entier,
 * le tableau se tirait, les résultats se saisissaient au score — et le jour
 * venu, personne ne savait qui devait se présenter.
 *
 * **Aucune statistique n'en découle**, et c'est voulu : un tournoi ne nourrit
 * ni le classement individuel ni les cartes. La feuille sert à savoir qui
 * joue, ce qui suffit à la rendre nécessaire.
 *
 * **Un club, un tournoi, un cinq.** Pas une feuille par affiche : un club
 * dispute un à trois matchs dans la même journée avec les mêmes joueurs, et
 * trois saisies identiques auraient surtout créé trois occasions de se
 * contredire.
 */

/** Le cinq d'un club, tel qu'il s'affiche. */
export interface TournamentLineupView {
  entryId: number;
  squad: { id: number; name: string };
  players: { slot: LineupSlot; player: PublicPlayer }[];
}

/**
 * Le cinq déclaré par un club, **filtré des partants**.
 *
 * Un joueur quitte son club sans que la feuille en sache rien : la ligne
 * survit, et le tournoi afficherait quelqu'un qui n'est plus là. Une lecture
 * n'écrit pas, donc la ligne périmée reste — elle disparaîtra au prochain
 * enregistrement, et le joueur peut revenir d'ici là.
 */
export async function lineupOfEntry(
  entryId: number,
  executor: Executor = db,
): Promise<LineupAssignment[]> {
  const rows = await executor
    .select({
      slot: tournamentLineups.slot,
      playerId: tournamentLineups.playerId,
    })
    .from(tournamentLineups)
    .innerJoin(tournamentEntries, eq(tournamentEntries.id, tournamentLineups.entryId))
    .innerJoin(
      squadMembers,
      and(
        eq(squadMembers.playerId, tournamentLineups.playerId),
        eq(squadMembers.squadId, tournamentEntries.squadId),
        eq(squadMembers.status, "active"),
      ),
    )
    .where(eq(tournamentLineups.entryId, entryId));

  // L'ordre du terrain, du but à la pointe : l'écran n'a pas à le reconstruire.
  return LINEUP_SLOTS.flatMap((slot) => {
    const row = rows.find((candidate) => candidate.slot === slot);
    return row ? [{ slot, playerId: row.playerId }] : [];
  });
}

/**
 * Les cinq de tous les clubs engagés, pour l'écran du tournoi.
 *
 * Ouvert à tous ceux qui voient le tournoi : savoir qui l'on affronte fait
 * partie du tournoi, exactement comme les deux feuilles d'un défi sont
 * visibles des deux camps.
 */
export async function lineupsOfTournament(
  tournamentId: number,
): Promise<TournamentLineupView[]> {
  const rows = await db
    .select({
      entryId: tournamentEntries.id,
      squadId: squads.id,
      squadName: squads.name,
      slot: tournamentLineups.slot,
      player: publicPlayerColumns,
    })
    .from(tournamentEntries)
    .innerJoin(squads, eq(squads.id, tournamentEntries.squadId))
    .innerJoin(
      tournamentLineups,
      eq(tournamentLineups.entryId, tournamentEntries.id),
    )
    .innerJoin(players, eq(players.id, tournamentLineups.playerId))
    /*
     * Un joueur parti du club ne figure plus sur la feuille : la jointure le
     * retire à la lecture, sans effacer sa ligne — il peut revenir, et une
     * lecture n'écrit pas.
     */
    .innerJoin(
      squadMembers,
      and(
        eq(squadMembers.playerId, tournamentLineups.playerId),
        eq(squadMembers.squadId, tournamentEntries.squadId),
        eq(squadMembers.status, "active"),
      ),
    )
    .where(eq(tournamentEntries.tournamentId, tournamentId));

  const byEntry = new Map<number, TournamentLineupView>();

  for (const row of rows) {
    let view = byEntry.get(row.entryId);
    if (!view) {
      view = {
        entryId: row.entryId,
        squad: { id: row.squadId, name: row.squadName },
        players: [],
      };
      byEntry.set(row.entryId, view);
    }
    view.players.push({ slot: row.slot, player: toPublicPlayer(row.player) });
  }

  // Chaque feuille dans l'ordre du terrain, du but à la pointe.
  for (const view of byEntry.values()) {
    view.players.sort(
      (a, b) => LINEUP_SLOTS.indexOf(a.slot) - LINEUP_SLOTS.indexOf(b.slot),
    );
  }

  return [...byEntry.values()];
}

/**
 * Enregistre le cinq, en une fois.
 *
 * **Remplacement complet plutôt que retouches**, comme pour le terrain d'un
 * club : des mises à jour emplacement par emplacement auraient ouvert la porte
 * aux états intermédiaires — un joueur à deux postes le temps d'un échange,
 * refusé par l'unicité, et une feuille à moitié enregistrée.
 *
 * Réservé au fondateur et aux capitaines : désigner qui joue est un acte de
 * direction.
 */
export async function setEntryLineup(
  actor: { playerId: number; userId: number },
  input: { entryId: number; assignments: LineupAssignment[] },
): Promise<LineupAssignment[]> {
  const seenSlots = new Set<LineupSlot>();
  const seenPlayers = new Set<number>();

  for (const { slot, playerId } of input.assignments) {
    if (seenSlots.has(slot)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Un emplacement ne peut recevoir qu'un joueur.",
      );
    }
    if (seenPlayers.has(playerId)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Un joueur ne peut occuper qu'un emplacement.",
      );
    }
    seenSlots.add(slot);
    seenPlayers.add(playerId);
  }

  return db.transaction(async (tx) => {
    const entry = await lockEntry(tx, input.entryId);
    await assertSquadRole(tx, actor.playerId, entry.squadId, "captain");
    await assertOpenForComposition(tx, entry.tournamentId);

    if (seenPlayers.size > 0) {
      /*
       * Chaque joueur aligné doit être un membre **actif** de ce club. Sans
       * cette vérification, on composerait sa feuille avec l'effectif d'en
       * face : la clé étrangère ne porte que sur l'existence du joueur, pas
       * sur son appartenance.
       */
      const members = await tx
        .select({ playerId: squadMembers.playerId })
        .from(squadMembers)
        .where(
          and(
            eq(squadMembers.squadId, entry.squadId),
            eq(squadMembers.status, "active"),
            inArray(squadMembers.playerId, [...seenPlayers]),
          ),
        );

      if (members.length !== seenPlayers.size) {
        throw new AppError(
          "RULE_VIOLATION",
          "Un joueur aligné ne fait pas partie de l'effectif.",
        );
      }
    }

    await tx
      .delete(tournamentLineups)
      .where(eq(tournamentLineups.entryId, input.entryId));

    if (input.assignments.length > 0) {
      await tx.insert(tournamentLineups).values(
        input.assignments.map(({ slot, playerId }) => ({
          entryId: input.entryId,
          slot,
          playerId,
        })),
      );
    }

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "tournament.lineup.update",
      entityType: "tournament",
      entityId: entry.tournamentId,
      after: { entryId: input.entryId, assignments: input.assignments },
    });

    return LINEUP_SLOTS.flatMap((slot) => {
      const found = input.assignments.find((row) => row.slot === slot);
      return found ? [found] : [];
    });
  });
}

/**
 * Reprend le cinq type du club comme feuille de tournoi (CLUB-002).
 *
 * C'est tout l'intérêt d'avoir composé un terrain : un club qui a posé ses
 * cinq ne les ressaisit pas à chaque engagement. Le geste reste demandé —
 * un bouton, pas un effet de bord —, et il **remplace** la feuille au lieu de
 * la compléter : on demande le cinq type, on l'obtient en entier.
 */
export async function fillEntryFromSquadLineup(
  actor: { playerId: number; userId: number },
  input: { entryId: number },
): Promise<LineupAssignment[]> {
  const entry = await lockEntryOutsideTx(input.entryId);
  const lineup = await getLineup(entry.squadId);

  if (lineup.length === 0) {
    throw new AppError(
      "RULE_VIOLATION",
      "Votre club n'a pas encore de cinq type : composez-le depuis l'effectif.",
    );
  }

  return setEntryLineup(actor, { entryId: input.entryId, assignments: lineup });
}

/** Verrouille un engagement : la feuille s'y adosse. */
async function lockEntry(executor: Executor, entryId: number) {
  const [row] = await executor
    .select()
    .from(tournamentEntries)
    .where(eq(tournamentEntries.id, entryId))
    .limit(1);

  if (!row) throw new AppError("NOT_FOUND", "Cet engagement est introuvable.");
  return row;
}

/** La même lecture, hors transaction, pour ce qui précède l'écriture. */
async function lockEntryOutsideTx(entryId: number) {
  return lockEntry(db, entryId);
}

/**
 * Un tournoi dont la feuille se compose encore.
 *
 * Une fois le tournoi joué, la feuille appartient à l'histoire : la retoucher
 * réécrirait qui a disputé une rencontre déjà disputée. Un tournoi annulé ne
 * se compose pas davantage — il n'aura pas lieu.
 */
async function assertOpenForComposition(
  executor: Executor,
  tournamentId: number,
): Promise<void> {
  const [row] = await executor
    .select({ status: tournaments.status })
    .from(tournaments)
    .where(eq(tournaments.id, tournamentId))
    .limit(1);

  if (!row) throw new AppError("NOT_FOUND", "Ce tournoi est introuvable.");
  if (row.status === "completed" || row.status === "cancelled") {
    throw new AppError(
      "RULE_VIOLATION",
      row.status === "completed"
        ? "Ce tournoi est terminé : sa feuille n'est plus modifiable."
        : "Ce tournoi est annulé.",
    );
  }
}
