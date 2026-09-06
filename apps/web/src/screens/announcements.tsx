import { useState } from "react";
import { X } from "lucide-react";
import type { AnnouncementView } from "@uno/shared";
import { trpc } from "@/lib/trpc.js";
import { formatDateTime } from "@/lib/format.js";
import { tapFeedback } from "@/lib/native.js";
import { Screen } from "@/components/layout/index.js";
import { AnnouncementRow } from "@/components/domain/index.js";
import { Async } from "@/components/ui/async.js";
import { EmptyState } from "@/components/ui/index.js";

/** Liste et détail des annonces (ANN-001, ANN-002). */
export function AnnouncementsScreen() {
  const utils = trpc.useUtils();
  const list = trpc.announcements.list.useQuery({ limit: 50 });
  const open = trpc.announcements.get.useMutation();

  const [selected, setSelected] = useState<AnnouncementView | null>(null);

  async function openAnnouncement(announcementId: number) {
    void tapFeedback();
    const detail = await open.mutateAsync({ announcementId });
    setSelected(detail);
    // L'annonce est marquée lue côté serveur : on rafraîchit les compteurs.
    await utils.announcements.list.invalidate();
    await utils.announcements.unreadCount.invalidate();
    await utils.players.dashboard.invalidate();
  }

  return (
    <Screen title="Annonces" back withTabBar={false}>
      <Async query={list}>
        {(page) =>
          page.items.length === 0 ? (
            <EmptyState
              title="Aucune annonce"
              description="Les communications de la ligue apparaîtront ici."
            />
          ) : (
            <div className="space-y-3">
              {page.items.map((announcement) => (
                <AnnouncementRow
                  key={announcement.id}
                  announcement={announcement}
                  onOpen={() => void openAnnouncement(announcement.id)}
                />
              ))}
            </div>
          )
        }
      </Async>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={selected.title}
          onClick={() => setSelected(null)}
        >
          <div
            className="max-h-[85dvh] w-full max-w-[520px] animate-rise overflow-y-auto rounded-t-3xl border-t border-border bg-background px-5 pt-4"
            style={{ paddingBottom: "calc(var(--safe-bottom) + 1.5rem)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" aria-hidden />
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{selected.title}</h2>
                <p className="mt-1 text-xs text-muted">
                  {formatDateTime(selected.publishedAt)}
                </p>
              </div>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setSelected(null)}
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:text-foreground active:opacity-70"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">
              {selected.content}
            </p>
          </div>
        </div>
      )}
    </Screen>
  );
}
