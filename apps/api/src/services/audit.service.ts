import { auditLogs } from "../db/schema.js";
import type { Executor } from "../db/client.js";

/**
 * Journal d'audit (ADMIN-005).
 *
 * Toute modification de solde, division, produit ou statut de session est
 * tracée avec son acteur, l'entité concernée et les valeurs avant/après.
 * L'écriture participe à la transaction courante : si l'opération est
 * annulée, sa trace l'est aussi.
 */

export type AuditAction =
  | "player.division.update"
  | "player.uno.adjust"
  // Remise à zéro générale des soldes (ADMIN-010) : une seule entrée pour
  // toute la ligue, sans identifiant de joueur — c'est l'opération qui est
  // auditée, le détail par compte se lit dans le registre de chacun.
  | "player.uno.zeroAll"
  | "player.profile.update"
  | "user.password.change"
  /*
   * Réinitialisation par lien (AUTH-009).
   *
   * Une action distincte du changement ordinaire, et pas par souci de
   * classement : les deux ne disent pas la même chose. Un changement prouve
   * que le joueur connaissait son ancien mot de passe ; une réinitialisation
   * prouve seulement qu'il a eu accès à sa boîte. Le jour où l'on cherche
   * comment un compte a changé de mains, la distinction est la première chose
   * qu'on veut lire.
   */
  | "user.password.reset"
  | "user.role.update"
  /*
   * Suppression d'un compte joueur (ADMIN-012).
   *
   * La trace ne porte ni le nom ni l'adresse effacés : le journal se conserve
   * douze mois, et y recopier l'identité rendrait la suppression vaine pendant
   * un an. Les identifiants disent quel compte a été fermé, par qui et quand.
   */
  | "user.account.delete"
  | "shop.item.create"
  | "shop.item.update"
  | "shop.item.archive"
  | "proposal.create"
  | "proposal.status.update"
  | "proposal.cancel"
  | "proposal.reopen"
  // Déplacement d'une séance gratuite (MODE-003) : la trace porte l'ancienne
  // et la nouvelle heure, puisque c'est tout ce que l'opération change.
  | "proposal.reschedule"
  // Suppressions par l'administration (ADMIN-011) : la trace porte ce que la
  // ligne contenait, puisqu'elle n'existe plus pour le dire.
  | "proposal.delete"
  | "squad.dissolve"
  // Composition du terrain (CLUB-002) : qui l'a changée, et pour quel cinq.
  | "squad.lineup.update"
  // Le cinq d'un club pour un tournoi (TOUR-007) : qui joue, et qui l'a dit.
  | "tournament.lineup.update"
  // Composition d'une session par l'administration (ADMIN-008) : c'est
  // l'administrateur qui est l'acteur, le joueur inscrit figure à côté.
  | "proposal.participant.add"
  | "proposal.participant.remove"
  | "match.validate"
  | "match.correct"
  | "announcement.publish"
  | "order.create"
  | "order.fulfill"
  | "venue.create"
  | "venue.update"
  | "venue.delete"
  | "session.record"
  | "substitute.promote"
  | "referee.assign"
  | "player.supervisor.update"
  | "session.video.add"
  | "session.video.delete"
  | "player.type.update"
  // Boutique : dons et propositions de produits (SHOP-008, SHOP-009)
  | "charity.create"
  | "charity.update"
  | "shop.suggestion.create"
  | "shop.suggestion.decide"
  // Mode SQUAD (SQUAD-001)
  | "squad.create"
  | "squad.update"
  | "squad.member.join"
  | "squad.member.leave"
  | "squad.member.remove"
  | "squad.member.role"
  | "squad.ownership.transfer"
  | "squad.seat.add"
  | "squad.seat.remove"
  | "squad.seat.cover"
  | "squad.challenge.settle"
  | "squad.challenge.annul"
  | "squad.match.create"
  | "squad.transfer.list"
  | "squad.transfer.open"
  | "squad.transfer.accept"
  | "squad.transfer.cancel"
  | "squad.treasury.distribute"
  // Tournois entre SQUADs (TOUR-001)
  | "tournament.format.save"
  | "tournament.propose"
  | "tournament.create"
  | "tournament.cancel"
  | "tournament.draw"
  | "tournament.match.record"
  | "tournament.complete";

export interface AuditEntry {
  actorUserId: number | null;
  action: AuditAction;
  entityType: string;
  entityId: number | null;
  before?: unknown;
  after?: unknown;
}

export async function writeAudit(
  executor: Executor,
  entry: AuditEntry,
): Promise<void> {
  await executor.insert(auditLogs).values({
    actorUserId: entry.actorUserId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    beforeJson: entry.before ?? null,
    afterJson: entry.after ?? null,
  });
}
