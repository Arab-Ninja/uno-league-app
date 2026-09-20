import { and, asc, eq, inArray, ne, or } from "drizzle-orm";
import { AppError } from "@uno/shared";
import { db, type Transaction } from "../db/client.js";
import {
  players,
  proposalParticipants,
  proposals,
  squadChallenges,
  squadJoinRequests,
  squadMembers,
  squadTransfers,
  squads,
  tournamentEntries,
  tournaments,
  type ProposalRow,
} from "../db/schema.js";
import { writeAudit } from "./audit.service.js";
import { recordAdminEvent } from "./admin-events.service.js";
import { refundSeat } from "./eligibility.service.js";
import { applySessionReopen } from "./matches.service.js";
import { lockProposal } from "./proposals.service.js";
import { applyChallengeAnnul } from "./squad-challenges.service.js";
import { challengeOfSession } from "./squad-matches.service.js";
import { releaseEscrow } from "./squad-transfers.service.js";
import { moveTreasury } from "./squad-treasury.service.js";
import { closeMembership, lockSquad } from "./squads.service.js";
import { credit } from "./ledger.service.js";

/**
 * Suppression définitive d'une session ou d'un club (ADMIN-011).
 *
 * **Pourquoi une suppression, alors que tout se retire déjà par un statut.**
 * L'application n'efface rien : une session se termine ou s'annule, un club se
 * dissout, et l'histoire reste lisible. C'est le bon réglage pour une ligue
 * qui tourne — un résultat qu'on peut faire disparaître n'est plus un
 * résultat.
 *
 * Mais une ligue commence par une phase d'essai, où l'on crée de fausses
 * sessions et de faux clubs pour voir l'application vivre. Ceux-là ne sont pas
 * de l'histoire : ce sont des déchets, et rien ne permettait de les retirer.
 * D'où ces deux fonctions, réservées à l'administration.
 *
 * **Trois règles les gouvernent.**
 *
 * 1. *L'argent revient toujours.* Une place réglée est remboursée, une mise
 *    séquestrée est rendue, un droit d'engagement est restitué. Supprimer une
 *    ligne de la base ne fait pas disparaître le débit qui lui correspond dans
 *    le portefeuille d'un joueur : le registre est le seul livre qui ne se
 *    réécrit pas.
 *
 * 2. *Rien ne se défait deux fois.* Ce qui doit être annulé passe par le
 *    chemin qui sait l'annuler — `applySessionReopen` pour une clôture,
 *    `applyChallengeAnnul` pour un défi — et jamais par une seconde
 *    implémentation écrite ici.
 *
 * 3. *Tout tient dans une transaction.* Une suppression à moitié faite
 *    laisserait une caisse créditée d'une mise dont le défi existe encore, ou
 *    un club dissous dont les membres restent prisonniers.
 *
 * **Ce que la suppression ne rend pas.** Les récompenses versées à la clôture
 * d'une session, les UNO de palier, les gains d'un défi déjà réglé restent
 * acquis. C'est le même choix que la correction d'une session (MATCH-007) :
 * ces points ont pu être dépensés depuis, et les reprendre creuserait un
 * solde négatif chez un joueur qui n'y est pour rien. Une session déjà
 * réglée entre clubs se refuse donc, plutôt que de mentir sur ce qu'elle
 * défait.
 */

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export interface ProposalDeletion {
  proposalId: number;
  /** Statut au moment de la suppression : ce n'est pas la même opération. */
  status: ProposalRow["status"];
  seatsRefunded: number;
  unoRefunded: number;
  /** Vrai si la session était clôturée et a dû être défaite d'abord. */
  reopened: boolean;
}

/**
 * Efface une proposition, une réservation ou une session (ADMIN-011).
 *
 * L'ordre des étapes est celui de la dette : on défait d'abord ce que la
 * clôture a distribué, on rend ensuite l'argent, on supprime en dernier. Dans
 * l'autre sens, la ligne aurait disparu avant qu'on ait pu lire le prix à
 * rembourser.
 *
 * Les tables filles suivent par cascade — inscrits, remplaçants, paiements,
 * équipes, matchs, vidéos. Une feuille saisie en visionnage, elle, survit :
 * sa colonne `proposal_id` passe à `NULL`. C'est voulu — une captation vidéo
 * est un travail en soi, qu'une erreur de calendrier ne doit pas emporter.
 */
export async function deleteProposal(
  actor: { userId: number },
  input: { proposalId: number; reason: string },
): Promise<ProposalDeletion> {
  const result = await db.transaction(async (tx) => {
    const proposal = await lockProposal(tx, input.proposalId);

    /*
     * Un match de club ne se supprime pas par sa session.
     *
     * Le défi porte la mise des deux caisses et la file des places ; la
     * session n'en est que le terrain. L'effacer laisserait un défi qui
     * renvoie à un match disparu — `squad_challenges.match_id` n'est pas une
     * clé étrangère — et, s'il était accepté, deux séquestres immobilisés
     * pour toujours.
     *
     * Le refus nomme le geste qui convient : annuler le défi rend les mises
     * et rembourse les places, et c'est seulement après que la session,
     * devenue ordinaire, se supprime.
     */
    const challenge = await challengeOfSession(tx, input.proposalId);
    if (challenge !== null) {
      throw new AppError(
        "RULE_VIOLATION",
        `Cette session est le match du défi #${challenge.id} entre deux clubs. ` +
          "Annulez le défi — les mises et les places seront rendues — puis " +
          "supprimez la session.",
      );
    }

    // Une session clôturée a distribué statistiques, XP, divisions et notes.
    // La réouverture sait exactement les reprendre ; la suppression, non.
    const reopened = proposal.status === "completed";
    if (reopened) {
      await applySessionReopen(tx, actor, input.proposalId);
    }

    const seats = await tx
      .select({
        playerId: proposalParticipants.playerId,
        paymentId: proposalParticipants.paymentId,
      })
      .from(proposalParticipants)
      .where(
        and(
          eq(proposalParticipants.proposalId, input.proposalId),
          eq(proposalParticipants.hasPaid, true),
        ),
      )
      // Ordre stable : deux suppressions concurrentes verrouillent les mêmes
      // joueurs dans le même ordre, et ne s'interbloquent pas.
      .orderBy(asc(proposalParticipants.playerId));

    let unoRefunded = 0;
    for (const seat of seats) {
      unoRefunded += await refundSeat(tx, proposal, seat);
    }

    await tx.delete(proposals).where(eq(proposals.id, input.proposalId));

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "proposal.delete",
      entityType: "proposal",
      entityId: input.proposalId,
      // La ligne n'existe plus : ce qu'elle contenait doit tenir ici, sans
      // quoi l'audit renverrait à un identifiant qui ne dit plus rien.
      before: {
        status: proposal.status,
        modeId: proposal.modeId,
        localDate: proposal.localDate,
        localTimeLabel: proposal.localTimeLabel,
        venueName: proposal.venueName,
        division: proposal.division,
        participantCount: proposal.participantCount,
        paidCount: proposal.paidCount,
      },
      after: {
        seatsRefunded: seats.length,
        unoRefunded,
        reopened,
        reason: input.reason,
      },
    });

    return {
      proposalId: input.proposalId,
      status: proposal.status,
      seatsRefunded: seats.length,
      unoRefunded,
      reopened,
    };
  });

  await recordAdminEvent(
    {
      type: "proposal.deleted",
      body:
        `Session #${result.proposalId} supprimée (${result.status}) : ` +
        `${result.seatsRefunded} place(s) remboursée(s), ${result.unoRefunded} UNO rendus.`,
      entityType: "proposal",
      entityId: result.proposalId,
      key: `proposal:${result.proposalId}:deleted`,
    },
    db,
  );

  return result;
}

// ---------------------------------------------------------------------------
// Clubs
// ---------------------------------------------------------------------------

export interface SquadDissolution {
  squadId: number;
  name: string;
  membersReleased: number;
  requestsRejected: number;
  challengesAnnulled: number;
  transfersCancelled: number;
  tournamentsWithdrawn: number;
  /** Solde de caisse rendu au fondateur, en UNO. */
  treasuryReturned: number;
}

/**
 * Dissout un club (ADMIN-011).
 *
 * **Dissoudre, et non supprimer.** La ligne du club survit, et ce n'est pas
 * une demi-mesure : ses matchs, ses transferts et ses défis y renvoient par
 * des clés étrangères en `restrict`, et le modèle SQUAD s'appuie sur des
 * colonnes générées que MySQL refuse de mettre en cascade (DECISIONS §40).
 * Un club dissous disparaît de toutes les listes, n'est plus consultable et
 * libère son nom — de l'extérieur, il est effacé.
 *
 * Ce que la dissolution doit défaire d'abord, c'est tout ce par quoi le club
 * tient encore à quelqu'un d'autre :
 *
 * - les **défis en cours**, dont les mises sont séquestrées des deux côtés ;
 * - les **dossiers de transfert**, dont l'acheteur a pu immobiliser son prix ;
 * - les **engagements en tournoi**, dont le droit est séquestré ;
 * - les **adhésions**, sans quoi ses joueurs resteraient attachés à un club
 *   invisible et ne pourraient plus en rejoindre aucun (l'index unique sur
 *   l'adhésion active y veille) ;
 * - la **caisse**, rendue au fondateur : cet argent est venu des poches des
 *   membres, il ne s'évapore pas avec le club.
 *
 * Un tournoi déjà tiré fait exception et bloque la dissolution. Retirer un
 * club d'un tableau en cours y laisserait un trou, et c'est une décision
 * sportive — annuler le tournoi, ou le jouer — que cette fonction n'a pas à
 * prendre à la place de l'administration.
 */
export async function dissolveSquad(
  actor: { userId: number },
  input: { squadId: number; reason: string },
): Promise<SquadDissolution> {
  const result = await db.transaction(async (tx) => {
    const squad = await lockSquad(tx, input.squadId);

    if (squad.status === "dissolved") {
      throw new AppError("RULE_VIOLATION", "Ce club est déjà dissous.");
    }

    // --- 1. Tournois : d'abord le refus, avant toute écriture -------------
    const engagements = await tx
      .select({
        entryId: tournamentEntries.id,
        entryFeeUno: tournamentEntries.entryFeeUno,
        tournamentId: tournaments.id,
        tournamentName: tournaments.name,
        tournamentStatus: tournaments.status,
      })
      .from(tournamentEntries)
      .innerJoin(
        tournaments,
        eq(tournaments.id, tournamentEntries.tournamentId),
      )
      .where(eq(tournamentEntries.squadId, input.squadId))
      .orderBy(asc(tournamentEntries.id));

    const drawn = engagements.find(
      (row) =>
        row.tournamentStatus !== "open" && row.tournamentStatus !== "cancelled",
    );
    if (drawn) {
      throw new AppError(
        "RULE_VIOLATION",
        `Ce club est engagé dans « ${drawn.tournamentName} », dont le tableau ` +
          "est tiré. Annulez le tournoi ou attendez sa fin avant de dissoudre.",
      );
    }

    let tournamentsWithdrawn = 0;
    for (const engagement of engagements) {
      await tx
        .delete(tournamentEntries)
        .where(eq(tournamentEntries.id, engagement.entryId));

      if (engagement.entryFeeUno > 0) {
        await moveTreasury(tx, {
          squadId: input.squadId,
          available: engagement.entryFeeUno,
          locked: -engagement.entryFeeUno,
          type: "tournament_refund",
          description: `Engagement rendu — ${engagement.tournamentName} (club dissous)`,
          referenceType: "tournament",
          referenceId: engagement.tournamentId,
          idempotencyKey: `squad:${input.squadId}:tournament:${engagement.tournamentId}:dissolve:${engagement.entryId}`,
        });
      }
      tournamentsWithdrawn++;
    }

    // --- 2. Défis en cours -------------------------------------------------
    const openChallenges = await tx
      .select()
      .from(squadChallenges)
      .where(
        and(
          inArray(squadChallenges.status, ["pending", "accepted"]),
          or(
            eq(squadChallenges.challengerSquadId, input.squadId),
            eq(squadChallenges.challengedSquadId, input.squadId),
          ),
        ),
      )
      .orderBy(asc(squadChallenges.id))
      .for("update");

    let challengesAnnulled = 0;
    for (const challenge of openChallenges) {
      if (challenge.status === "accepted") {
        // Mises rendues aux deux caisses, places remboursées : exactement ce
        // que fait une annulation ordinaire.
        await applyChallengeAnnul(tx, actor, challenge, "club dissous");
      } else {
        // Rien n'a encore été séquestré : la proposition s'efface seule.
        await tx
          .update(squadChallenges)
          .set({
            status: "cancelled",
            awaitingSquadId: null,
            updatedAt: new Date(),
          })
          .where(eq(squadChallenges.id, challenge.id));
      }
      challengesAnnulled++;
    }

    // --- 3. Dossiers de transfert -----------------------------------------
    const openTransfers = await tx
      .select()
      .from(squadTransfers)
      .where(
        and(
          inArray(squadTransfers.status, ["pending", "awaiting_player"]),
          or(
            eq(squadTransfers.fromSquadId, input.squadId),
            eq(squadTransfers.toSquadId, input.squadId),
          ),
        ),
      )
      .orderBy(asc(squadTransfers.id))
      .for("update");

    for (const transfer of openTransfers) {
      // L'acheteur n'immobilise son prix qu'une fois le vendeur d'accord :
      // avant cela, il n'y a rien à rendre.
      if (transfer.status === "awaiting_player") {
        await releaseEscrow(tx, transfer, "club dissous");
      }
      await tx
        .update(squadTransfers)
        .set({
          status: "cancelled",
          decidedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(squadTransfers.id, transfer.id));
    }

    // --- 4. Caisse rendue au fondateur -------------------------------------
    //
    // Relue maintenant, et non au début : les étapes précédentes viennent d'y
    // reverser les mises et les droits d'engagement rendus.
    const [current] = await tx
      .select({
        available: squads.treasuryAvailable,
        locked: squads.treasuryLocked,
      })
      .from(squads)
      .where(eq(squads.id, input.squadId))
      .limit(1);

    const available = current?.available ?? 0;
    const locked = current?.locked ?? 0;

    /*
     * Un séquestre restant est un défaut de ce code, pas une situation à
     * gérer : tout ce qui immobilise de l'argent vient d'être rendu. Le
     * signaler plutôt que de le passer sous silence, car le solde serait
     * détruit avec le club.
     */
    if (locked !== 0) {
      throw new AppError(
        "RULE_VIOLATION",
        `La caisse de ce club retient encore ${locked} UNO séquestrés. ` +
          "La dissolution est interrompue : signalez cette situation.",
      );
    }

    if (available > 0) {
      await moveTreasury(tx, {
        squadId: input.squadId,
        playerId: squad.founderPlayerId,
        available: -available,
        locked: 0,
        type: "dissolution",
        description: `Caisse rendue au fondateur — ${squad.name} dissous`,
        referenceType: "squad",
        referenceId: input.squadId,
        idempotencyKey: `squad:${input.squadId}:dissolve:treasury`,
      });

      await credit(tx, {
        playerId: squad.founderPlayerId,
        amount: available,
        type: "squad_dissolution",
        description: `Caisse du club ${squad.name}, dissous`,
        referenceType: "squad",
        referenceId: input.squadId,
        idempotencyKey: `squad:${input.squadId}:dissolve:founder`,
      });
    }

    // --- 5. Adhésions et candidatures --------------------------------------
    const memberships = await tx
      .select({ id: squadMembers.id })
      .from(squadMembers)
      .where(
        and(
          eq(squadMembers.squadId, input.squadId),
          eq(squadMembers.status, "active"),
        ),
      )
      .orderBy(asc(squadMembers.id));

    for (const membership of memberships) {
      await closeMembership(tx, membership.id, "removed");
    }

    const requests = await tx
      .update(squadJoinRequests)
      .set({ status: "rejected", decidedAt: new Date() })
      .where(
        and(
          eq(squadJoinRequests.squadId, input.squadId),
          eq(squadJoinRequests.status, "pending"),
        ),
      );

    // --- 6. Le club se retire ----------------------------------------------
    await tx
      .update(squads)
      .set({
        status: "dissolved",
        // Le nom cesse d'être réservé : il redevient disponible, sans que
        // celui-ci le perde dans son histoire (SQUAD-002).
        activeName: null,
        activeSlug: null,
        updatedAt: new Date(),
      })
      .where(eq(squads.id, input.squadId));

    const requestsRejected = Number(
      (requests as unknown as { affectedRows?: number }[])[0]?.affectedRows ??
        0,
    );

    await writeAudit(tx, {
      actorUserId: actor.userId,
      action: "squad.dissolve",
      entityType: "squad",
      entityId: input.squadId,
      before: {
        name: squad.name,
        status: squad.status,
        treasuryAvailable: available,
      },
      after: {
        membersReleased: memberships.length,
        requestsRejected,
        challengesAnnulled,
        transfersCancelled: openTransfers.length,
        tournamentsWithdrawn,
        treasuryReturned: available,
        reason: input.reason,
      },
    });

    return {
      squadId: input.squadId,
      name: squad.name,
      membersReleased: memberships.length,
      requestsRejected,
      challengesAnnulled,
      transfersCancelled: openTransfers.length,
      tournamentsWithdrawn,
      treasuryReturned: available,
    };
  });

  await recordAdminEvent(
    {
      type: "squad.dissolved",
      body:
        `Club « ${result.name} » dissous : ${result.membersReleased} membre(s) libéré(s), ` +
        `${result.treasuryReturned} UNO rendus au fondateur.`,
      entityType: "squad",
      entityId: result.squadId,
      key: `squad:${result.squadId}:dissolved`,
    },
    db,
  );

  return result;
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

export interface AdminSquadRow {
  id: number;
  name: string;
  slug: string;
  status: "active" | "dissolved";
  founderName: string;
  memberCount: number;
  treasuryAvailable: number;
  treasuryLocked: number;
  openChallenges: number;
}

/**
 * Tous les clubs, dissous compris.
 *
 * `listSquads` ne montre que les clubs actifs, ce qui est juste pour un
 * joueur : un club dissous ne se rejoint pas. L'administration, elle, doit
 * pouvoir constater qu'une dissolution a bien eu lieu — sans quoi le club
 * disparaîtrait de l'écran au moment même où l'on veut vérifier son sort.
 */
export async function listSquadsForAdmin(): Promise<AdminSquadRow[]> {
  const rows = await db
    .select({
      id: squads.id,
      name: squads.name,
      slug: squads.slug,
      status: squads.status,
      treasuryAvailable: squads.treasuryAvailable,
      treasuryLocked: squads.treasuryLocked,
      founderFirstName: players.firstName,
      founderLastName: players.lastName,
    })
    .from(squads)
    .innerJoin(players, eq(players.id, squads.founderPlayerId))
    // Les clubs vivants d'abord : ce sont eux qu'on vient administrer.
    .orderBy(asc(squads.status), asc(squads.name))
    .limit(100);

  const result: AdminSquadRow[] = [];
  for (const row of rows) {
    const members = await db
      .select({ id: squadMembers.id })
      .from(squadMembers)
      .where(
        and(
          eq(squadMembers.squadId, row.id),
          eq(squadMembers.status, "active"),
        ),
      );

    const challenges = await db
      .select({ id: squadChallenges.id })
      .from(squadChallenges)
      .where(
        and(
          inArray(squadChallenges.status, ["pending", "accepted"]),
          or(
            eq(squadChallenges.challengerSquadId, row.id),
            eq(squadChallenges.challengedSquadId, row.id),
          ),
        ),
      );

    result.push({
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status as "active" | "dissolved",
      founderName: `${row.founderFirstName} ${row.founderLastName}`,
      memberCount: members.length,
      treasuryAvailable: row.treasuryAvailable,
      treasuryLocked: row.treasuryLocked,
      openChallenges: challenges.length,
    });
  }

  return result;
}

/**
 * Les sessions que l'administration peut supprimer.
 *
 * Volontairement distincte de `listForAdmin`, qui sert la composition et ne
 * montre donc que les sessions encore ouvertes. Ici c'est l'inverse qui est
 * utile : ce sont les séances annulées et les clôtures d'essai qui encombrent
 * l'application, et elles n'apparaissaient nulle part.
 */
export async function listDeletableProposals(): Promise<
  Array<{
    id: number;
    modeId: string;
    status: ProposalRow["status"];
    localDate: string;
    localTimeLabel: string;
    venueName: string;
    division: "D1" | "D2" | "D3" | null;
    participantCount: number;
    paidCount: number;
    priceUno: number;
  }>
> {
  const rows = await db
    .select({
      id: proposals.id,
      modeId: proposals.modeId,
      status: proposals.status,
      localDate: proposals.localDate,
      localTimeLabel: proposals.localTimeLabel,
      venueName: proposals.venueName,
      division: proposals.division,
      participantCount: proposals.participantCount,
      paidCount: proposals.paidCount,
      priceUno: proposals.priceUno,
    })
    .from(proposals)
    // La plus récente d'abord : une session d'essai vient d'être créée, c'est
    // elle qu'on cherche.
    .orderBy(ne(proposals.status, "cancelled"), asc(proposals.startsAtUtc))
    .limit(100);

  return rows.map((row) => ({
    ...row,
    status: row.status as ProposalRow["status"],
    division: row.division as "D1" | "D2" | "D3" | null,
  }));
}
