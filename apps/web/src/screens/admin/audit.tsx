import { trpc } from "@/lib/trpc.js";
import { formatDateTime } from "@/lib/format.js";
import { Async } from "@/components/ui/async.js";
import { Card, EmptyState } from "@/components/ui/index.js";

/** Journal d'audit (ADMIN-005) : qui a changé quoi, et quand. */
const ACTION_LABELS: Record<string, string> = {
  "player.division.update": "Changement de division",
  "player.uno.adjust": "Ajustement de solde",
  "player.profile.update": "Modification de profil",
  "user.password.change": "Changement de mot de passe",
  "shop.item.create": "Création de produit",
  "shop.item.update": "Modification de produit",
  "shop.item.archive": "Archivage de produit",
  "proposal.create": "Création de session",
  "proposal.status.update": "Changement de statut de session",
  "match.validate": "Validation de match",
  "order.create": "Commande",
};

export function AdminAudit() {
  const logs = trpc.admin.auditLogs.useQuery({ limit: 50 });

  return (
    <Async query={logs}>
      {(page) =>
        page.items.length === 0 ? (
          <EmptyState
            title="Aucune entrée d'audit"
            description="Les modifications sensibles seront tracées ici."
          />
        ) : (
          <div className="space-y-2">
            {page.items.map((log) => (
              <Card key={log.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {ACTION_LABELS[log.action] ?? log.action}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {log.entityType} #{log.entityId ?? "—"} ·{" "}
                      {log.actorEmail ?? "système"}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted">
                    {formatDateTime(log.createdAt)}
                  </span>
                </div>

                {Boolean(log.beforeJson ?? log.afterJson) && (
                  <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border/40 pt-2 text-[11px]">
                    <div>
                      <p className="mb-0.5 uppercase tracking-wide text-muted">Avant</p>
                      <pre className="overflow-x-auto whitespace-pre-wrap break-all text-muted">
                        {String(JSON.stringify(log.beforeJson ?? {}))}
                      </pre>
                    </div>
                    <div>
                      <p className="mb-0.5 uppercase tracking-wide text-muted">Après</p>
                      <pre className="overflow-x-auto whitespace-pre-wrap break-all text-foreground">
                        {String(JSON.stringify(log.afterJson ?? {}))}
                      </pre>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )
      }
    </Async>
  );
}
