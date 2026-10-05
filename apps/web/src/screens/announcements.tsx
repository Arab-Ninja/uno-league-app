import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { X } from "lucide-react";
import type { AnnouncementView } from "@uno/shared";
import { trpc } from "@/lib/trpc.js";
import { formatDateTime } from "@/lib/format.js";
import { useT } from "@/lib/i18n.js";
import { tapFeedback } from "@/lib/native.js";
import { Screen } from "@/components/layout/index.js";
import { AnnouncementRow } from "@/components/domain/index.js";
import { Async } from "@/components/ui/async.js";
import { EmptyState } from "@/components/ui/index.js";
import { ImageCarousel } from "@/components/ui/image-carousel.js";

/** Liste et détail des annonces (ANN-001, ANN-002). */
export function AnnouncementsScreen() {
  const t = useT();
  const utils = trpc.useUtils();
  const list = trpc.announcements.list.useQuery({ limit: 50 });
  const open = trpc.announcements.get.useMutation();

  const [selected, setSelected] = useState<AnnouncementView | null>(null);
  // `/annonces?id=12` : c'est là que mène la notification d'une nouvelle
  // annonce (ANN-005) — elle s'ouvre directement.
  const [searchParams, setSearchParams] = useSearchParams();
  const linked = Number(searchParams.get("id"));

  async function openAnnouncement(announcementId: number) {
    void tapFeedback();
    const detail = await open.mutateAsync({ announcementId });
    setSelected(detail);
    // L'annonce est marquée lue côté serveur : on rafraîchit les compteurs.
    await utils.announcements.list.invalidate();
    await utils.announcements.unreadCount.invalidate();
    await utils.players.dashboard.invalidate();
  }

  useEffect(() => {
    if (!Number.isInteger(linked) || linked <= 0) return;
    setSearchParams({}, { replace: true });
    void openAnnouncement(linked).catch(() => undefined);
    // Une seule fois par lien : l'identifiant est effacé de l'adresse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked]);

  return (
    <Screen title={t("announcements.title")} back withTabBar={false}>
      <Async query={list}>
        {(page) =>
          page.items.length === 0 ? (
            <EmptyState
              title={t("announcements.emptyTitle")}
              description={t("announcements.emptyBody")}
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          style={{
            paddingTop: "calc(var(--safe-top) + 1rem)",
            paddingBottom: "calc(var(--safe-bottom) + 1rem)",
          }}
          role="dialog"
          aria-modal="true"
          aria-label={selected.title}
          onClick={() => setSelected(null)}
        >
          {/* Une annonce se lit au centre de l'écran, comme une carte qu'on
              tend au joueur — pas comme un tiroir qu'on remonte. */}
          <div
            className="max-h-full w-full max-w-[520px] animate-rise overflow-y-auto overflow-x-hidden overscroll-contain rounded-3xl border border-border bg-background px-5 pb-6 pt-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{selected.title}</h2>
                <p className="mt-1 text-xs text-muted">
                  {formatDateTime(selected.publishedAt)}
                </p>
              </div>
              <button
                type="button"
                aria-label={t("announcements.close")}
                onClick={() => setSelected(null)}
                className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:text-foreground active:opacity-70"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            {selected.images.length > 0 && (
              <ImageCarousel
                images={selected.images}
                alt={selected.title}
                className="mb-4"
              />
            )}
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">
              {selected.content}
            </p>
          </div>
        </div>
      )}
    </Screen>
  );
}
