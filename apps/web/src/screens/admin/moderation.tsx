import { useState } from "react";
import { Flag } from "lucide-react";
import { describeError, trpc } from "@/lib/trpc.js";
import { formatDateTime } from "@/lib/format.js";
import { Async } from "@/components/ui/async.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
} from "@/components/ui/index.js";
import { useT } from "@/lib/i18n.js";

/**
 * Signalements des joueurs (MOD-001).
 *
 * La file que les stores demandent qu'on traite « dans des délais
 * raisonnables » : l'administration est prévenue par push à chaque
 * signalement, et tranche ici. Retirer un contenu clôt tous les signalements
 * qui le visaient ; un joueur signalé, lui, se traite depuis l'onglet Joueurs,
 * où sa fiche permet de supprimer le compte.
 */
export function AdminModeration() {
  const t = useT();
  const utils = trpc.useUtils();
  const reports = trpc.moderation.reports.useQuery({ status: "open" });
  const resolve = trpc.moderation.resolve.useMutation();
  const [failure, setFailure] = useState<string | null>(null);

  async function decide(reportId: number, action: "remove" | "dismiss") {
    setFailure(null);
    try {
      await resolve.mutateAsync({ reportId, action });
      await utils.moderation.reports.invalidate();
    } catch (caught) {
      setFailure(describeError(caught).message);
    }
  }

  return (
    <div className="space-y-3">
      {failure && <ErrorBanner message={failure} />}
      <Async query={reports}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState
              title={t("moderation.adminEmpty")}
              icon={<Flag className="size-6" aria-hidden />}
            />
          ) : (
            <div className="space-y-2">
              {rows.map((report) => (
                <Card key={report.id} className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="warning">
                      {t(`moderation.adminKind.${report.kind}`)}
                    </Badge>
                    <Badge>{t(`moderation.reasons.${report.reason}`)}</Badge>
                    <span className="text-[11px] text-muted">
                      {formatDateTime(report.createdAt)}
                    </span>
                  </div>

                  {report.excerpt && (
                    <p className="whitespace-pre-wrap break-words rounded-lg bg-surface-raised px-3 py-2 text-sm">
                      {report.excerpt}
                    </p>
                  )}
                  {report.details && (
                    <p className="text-xs italic text-muted">
                      « {report.details} »
                    </p>
                  )}

                  <p className="text-xs text-muted">
                    {report.reported &&
                      t("moderation.adminAuthor", {
                        name: report.reported.displayName,
                      })}
                    {report.reported && report.reporter && " · "}
                    {report.reporter &&
                      t("moderation.adminBy", {
                        name: report.reporter.displayName,
                      })}
                  </p>

                  {report.kind === "player" && (
                    <p className="text-xs text-muted">
                      {t("moderation.adminPlayerHint")}
                    </p>
                  )}

                  <div className="flex gap-2">
                    {report.kind !== "player" && (
                      <Button
                        variant="danger"
                        loading={
                          resolve.isPending &&
                          resolve.variables?.reportId === report.id &&
                          resolve.variables.action === "remove"
                        }
                        onClick={() => void decide(report.id, "remove")}
                      >
                        {t("moderation.adminRemove")}
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      loading={
                        resolve.isPending &&
                        resolve.variables?.reportId === report.id &&
                        resolve.variables.action === "dismiss"
                      }
                      onClick={() => void decide(report.id, "dismiss")}
                    >
                      {t("moderation.adminDismiss")}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )
        }
      </Async>
    </div>
  );
}
