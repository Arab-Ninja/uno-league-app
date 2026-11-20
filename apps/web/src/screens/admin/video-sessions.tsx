import { useState } from "react";
import { Film } from "lucide-react";
import { trpc } from "@/lib/trpc.js";
import { formatShortDate } from "@/lib/format.js";
import { Async } from "@/components/ui/async.js";
import { Badge, Button, Card, SectionTitle } from "@/components/ui/index.js";
import { SessionVideoEditor } from "@/components/supervision/session-videos.js";
import { useT } from "@/lib/i18n.js";

/**
 * Les vidéos des séances jouées (SUP-004).
 *
 * La vidéo d'UNO Vision arrive après le match, souvent une fois les
 * résultats saisis — quand la séance a déjà quitté la file de saisie. Elle a
 * donc sa propre liste : les séances des quarante derniers jours, avec ce
 * qu'elles ont déjà (match complet, résumé), et la gestion d'un geste.
 */
export function AdminVideoSessions() {
  const t = useT();
  const sessions = trpc.supervision.videoSessions.useQuery();
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="space-y-2">
      <SectionTitle>{t("admin.videoSessions.title")}</SectionTitle>
      <p className="text-xs leading-relaxed text-muted">
        {t("admin.videoSessions.lead")}
      </p>
      <Async query={sessions}>
        {(rows) =>
          rows.length === 0 ? (
            <p className="text-xs text-muted">
              {t("admin.videoSessions.empty")}
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((row) => (
                <Card key={row.proposalId} className="space-y-3 py-3">
                  <div className="flex items-center gap-3">
                    <Film className="size-4 shrink-0 text-muted" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {row.venueName}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {formatShortDate(row.localDate)} · {row.localTimeLabel}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {row.hasMatch && (
                          <Badge tone="success">{t("videos.role.match")}</Badge>
                        )}
                        {row.hasSummary && (
                          <Badge tone="success">
                            {t("videos.role.summary")}
                          </Badge>
                        )}
                        {!row.hasMatch && !row.hasSummary && (
                          <Badge>
                            {row.videos > 0
                              ? t("admin.videoSessions.links", {
                                  count: row.videos,
                                })
                              : t("admin.videoSessions.none")}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        setOpen(open === row.proposalId ? null : row.proposalId)
                      }
                    >
                      {open === row.proposalId
                        ? t("admin.videoSessions.close")
                        : t("admin.videoSessions.manage")}
                    </Button>
                  </div>
                  {open === row.proposalId && (
                    <VideoManager proposalId={row.proposalId} />
                  )}
                </Card>
              ))}
            </div>
          )
        }
      </Async>
    </section>
  );
}

function VideoManager({ proposalId }: { proposalId: number }) {
  const utils = trpc.useUtils();
  const videos = trpc.supervision.videos.useQuery({ proposalId });
  return (
    <Async query={videos}>
      {(list) => (
        <SessionVideoEditor
          proposalId={proposalId}
          videos={list}
          onChanged={async () => {
            await Promise.all([
              utils.supervision.videos.invalidate({ proposalId }),
              utils.supervision.videoSessions.invalidate(),
            ]);
          }}
        />
      )}
    </Async>
  );
}
