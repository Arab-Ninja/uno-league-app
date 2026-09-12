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
  | "player.profile.update"
  | "user.password.change"
  | "user.role.update"
  | "shop.item.create"
  | "shop.item.update"
  | "shop.item.archive"
  | "proposal.create"
  | "proposal.status.update"
  | "proposal.cancel"
  | "proposal.reopen"
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
  | "squad.transfer.cancel";

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
