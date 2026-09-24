import { trpc } from "@/lib/trpc.js";
import { formatDateTime } from "@/lib/format.js";
import { Async } from "@/components/ui/async.js";
import { Card, EmptyState } from "@/components/ui/index.js";
import { useT, type Cle } from "@/lib/i18n.js";

/** Journal d'audit (ADMIN-005) : qui a changé quoi, et quand. */
const ACTION_LABELS: Record<string, Cle> = {
  "player.division.update": "admin.audit.divisionUpdate",
  "player.uno.adjust": "admin.audit.unoAdjust",
  "player.profile.update": "admin.audit.profileUpdate",
  "user.password.change": "admin.audit.passwordChange",
  "shop.item.create": "admin.audit.itemCreate",
  "shop.item.update": "admin.audit.itemUpdate",
  "shop.item.archive": "admin.audit.itemArchive",
  "proposal.create": "admin.audit.proposalCreate",
  "proposal.status.update": "admin.audit.proposalStatus",
  "match.validate": "admin.audit.matchValidate",
  "order.create": "admin.audit.orderCreate",
};

export function AdminAudit() {
  const t = useT();
  const libelle = (action: string): string => {
    const cle = ACTION_LABELS[action];
    return cle ? t(cle) : action;
  };
  const logs = trpc.admin.auditLogs.useQuery({ limit: 50 });

  return (
    <Async query={logs}>
      {(page) =>
        page.items.length === 0 ? (
          <EmptyState
            title={t("admin.audit.emptyTitle")}
            description={t("admin.audit.emptyBody")}
          />
        ) : (
          <div className="space-y-2">
            {page.items.map((log) => (
              <Card key={log.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{libelle(log.action)}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {log.entityType} #{log.entityId ?? "—"} ·{" "}
                      {log.actorEmail ?? t("admin.audit.system")}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted">
                    {formatDateTime(log.createdAt)}
                  </span>
                </div>

                {Boolean(log.beforeJson ?? log.afterJson) && (
                  <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border/40 pt-2 text-[11px]">
                    <div>
                      <p className="mb-0.5 uppercase tracking-wide text-muted">
                        {t("admin.audit.before")}
                      </p>
                      <pre className="overflow-x-auto whitespace-pre-wrap break-all text-muted">
                        {String(JSON.stringify(log.beforeJson ?? {}))}
                      </pre>
                    </div>
                    <div>
                      <p className="mb-0.5 uppercase tracking-wide text-muted">
                        {t("admin.audit.after")}
                      </p>
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
