import { and, eq, inArray } from "drizzle-orm";
import {
  AppError,
  LINEUP_SLOTS,
  type LineupAssignment,
  type LineupSlot,
} from "@uno/shared";
import { db, type Executor } from "../db/client.js";
import { squadLineups, squadMembers } from "../db/schema.js";
import { assertSquadRole } from "./squads.service.js";
import { writeAudit } from "./audit.service.js";

/**
 * La composition d'un club (CLUB-002).
 *
 * **Ce que cela change.** Le terrain affichait une déduction — meilleur
 * buteur à la pointe, meilleur passeur sur une aile — et personne ne décidait
 * rien. C'est juste pour décrire un effectif, et faux pour aligner une
 * équipe : un entraîneur ne choisit pas ses cinq à la statistique, il choisit
 * ceux qui jouent bien ensemble.
 *
 * La composition enregistrée prend donc le pas sur la déduction, quand elle
 * existe. Sans elle, rien ne change : le terrain reste statistique, et un
 * club qui ne s'en occupe pas n'a rien à faire.
 *
 * **Elle ne donne aucun pouvoir sur l'argent.** Aligner quelqu'un sur le
 * terrain ne l'inscrit à aucune rencontre et ne débite personne. C'est une
 * intention, que les défis et les tournois reprendront comme point de départ
 * — et qu'un fondateur confirmera là-bas, place par place, selon les règles
 * de paiement qui existent déjà. Une composition qui engagerait la caisse
 * d'un simple glissement de carte serait un piège.
 */

/*
 * `LineupAssignment` vient du paquet partagé : l'écran, le serveur et les
 * défis parlent de la même chose, et la définir deux fois aurait fini par la
 * définir différemment.
 */
export type { LineupAssignment };

/**
 * La composition enregistrée, **filtrée des partants**.
 *
 * Un joueur quitte son club sans que la composition en sache rien : la ligne
 * survit, et le terrain afficherait quelqu'un qui n'est plus là. Le filtre
 * est ici plutôt qu'à l'écran parce que la même question se pose aux défis et
 * aux tournois, qui n'ont pas d'écran.
 *
 * Les lignes périmées ne sont pas effacées au passage : une lecture ne doit
 * rien écrire, et le joueur peut revenir. Elles disparaîtront au prochain
 * enregistrement.
 */
export async function getLineup(
  squadId: number,
  executor: Executor = db,
): Promise<LineupAssignment[]> {
  const rows = await executor
    .select({ slot: squadLineups.slot, playerId: squadLineups.playerId })
    .from(squadLineups)
    .innerJoin(
      squadMembers,
      and(
        eq(squadMembers.playerId, squadLineups.playerId),
        eq(squadMembers.squadId, squadLineups.squadId),
        eq(squadMembers.status, "active"),
      ),
    )
    .where(eq(squadLineups.squadId, squadId));

  // L'ordre du terrain, du but à la pointe : l'écran n'a pas à le reconstruire.
  return LINEUP_SLOTS.flatMap((slot) => {
    const row = rows.find((candidate) => candidate.slot === slot);
    return row ? [{ slot, playerId: row.playerId }] : [];
  });
}

/**
 * Enregistre la composition, en une fois.
 *
 * **Remplacement complet plutôt que retouches.** L'écran envoie les cinq
 * emplacements tels qu'ils doivent être ; le serveur efface et réécrit dans
 * une transaction. Des mises à jour emplacement par emplacement auraient
 * ouvert la porte aux états intermédiaires — un joueur à deux postes le temps
 * d'un échange, refusé par l'unicité, et une composition à moitié enregistrée.
 *
 * Réservé au fondateur et aux capitaines : composer est un acte de direction,
 * comme inscrire sur la feuille d'un défi.
 */
export async function setLineup(
  actor: { playerId: number; userId: number },
  input: { squadId: number; assignments: LineupAssignment[] },
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
    await assertSquadRole(tx, actor.playerId, input.squadId, "captain");

    if (seenPlayers.size > 0) {
      /*
       * Chaque joueur aligné doit être un membre **actif** de ce club. Sans
       * cette vérification, on composerait son cinq avec l'effectif d'en
       * face : la clé étrangère ne porte que sur l'existence du joueur, pas
       * sur son appartenance.
       */
      const members = await tx
        .select({ playerId: squadMembers.playerId })
        .from(squadMembers)
        .where(
          and(
            eq(squadMembers.squadId, input.squadId),
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

    await tx.delete(squadLineups).where(eq(squadLineups.squadId, input.squadId));

    if (input.assignments.length > 0) {
      await tx.insert(squadLineups).values(
        input.assignments.map(({ slot, playerId }) => ({
          squadId: input.squadId,
          slot,
          playerId,
        })),
      );
    }

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "squad.lineup.update",
      entityType: "squad",
      entityId: input.squadId,
      after: { assignments: input.assignments },
    });

    return LINEUP_SLOTS.flatMap((slot) => {
      const found = input.assignments.find((a) => a.slot === slot);
      return found ? [found] : [];
    });
  });
}

/**
 * Efface la composition : le terrain revient à la déduction statistique.
 *
 * Utile plus qu'il n'y paraît — un club dont l'effectif a beaucoup changé
 * préfère souvent repartir de ce que disent les chiffres plutôt que de
 * corriger cinq emplacements un à un.
 */
export async function clearLineup(
  actor: { playerId: number; userId: number },
  input: { squadId: number },
): Promise<void> {
  await db.transaction(async (tx) => {
    await assertSquadRole(tx, actor.playerId, input.squadId, "captain");
    await tx.delete(squadLineups).where(eq(squadLineups.squadId, input.squadId));

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "squad.lineup.update",
      entityType: "squad",
      entityId: input.squadId,
      after: { assignments: [] },
    });
  });
}
