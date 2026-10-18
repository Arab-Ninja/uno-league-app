import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlarmClock,
  Bell,
  CalendarDays,
  Coins,
  Megaphone,
  Settings2,
  ShoppingBag,
  Sparkles,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { NotificationCategory, NotificationView } from "@uno/shared";
import { trpc } from "@/lib/trpc.js";
import { cn } from "@/lib/cn.js";
import { formatDateTime } from "@/lib/format.js";
import { useT } from "@/lib/i18n.js";
import { tapFeedback } from "@/lib/native.js";
import { Screen } from "@/components/layout/index.js";
import { Async } from "@/components/ui/async.js";
import { EmptyState } from "@/components/ui/index.js";

const ICONS: Record<NotificationCategory, LucideIcon> = {
  sessions: CalendarDays,
  payments: Wallet,
  reminders: AlarmClock,
  newProposals: Sparkles,
  wallet: Coins,
  shop: ShoppingBag,
  announcements: Megaphone,
};

/**
 * Les deux onglets du centre de notifications (NOTIF-001) : ce qui concerne
 * le joueur, et les annonces de la ligue. Deux adresses plutôt qu'un état :
 * la notification d'une annonce mène à `/annonces?id=…`, et doit continuer à
 * ouvrir le bon onglet.
 */
export function NotificationTabs({
  active,
}: {
  active: "mine" | "announcements";
}) {
  const t = useT();
  const navigate = useNavigate();
  const tabs = [
    { id: "mine", label: t("notifications.mine"), to: "/notifications" },
    {
      id: "announcements",
      label: t("notifications.announcements"),
      to: "/annonces",
    },
  ] as const;

  return (
    <div className="mb-4 flex items-center gap-2">
      <div
        role="tablist"
        className="flex flex-1 gap-1 rounded-xl border border-border bg-surface p-1"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === active}
            onClick={() => {
              if (tab.id === active) return;
              void tapFeedback();
              navigate(tab.to, { replace: true });
            }}
            className={cn(
              "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              tab.id === active
                ? "bg-accent text-background"
                : "text-muted hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-label={t("notifications.settings")}
        onClick={() => {
          void tapFeedback();
          navigate("/profil/notifications");
        }}
        className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-surface text-muted hover:text-foreground"
      >
        <Settings2 className="size-5" aria-hidden />
      </button>
    </div>
  );
}

/**
 * L'onglet « Pour moi » (NOTIF-001) : tout ce qui est arrivé au joueur, que
 * le push l'ait porté ou non — séance confirmée, déplacée, annulée, place à
 * régler, points reçus…
 *
 * Ouvrir l'onglet vaut lecture : la pastille de la cloche s'éteint. Les
 * points de « non lu » restent visibles pendant la visite, le temps de voir
 * ce qui est nouveau.
 */
export function NotificationsScreen() {
  const t = useT();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const list = trpc.players.notifications.useQuery({ limit: 50 });
  const markRead = trpc.players.markNotificationsRead.useMutation();
  const marked = useRef(false);

  useEffect(() => {
    const items = list.data;
    if (!items || marked.current) return;
    marked.current = true;
    const newest = Math.max(0, ...items.map((item) => item.id));
    if (newest === 0 || items.every((item) => item.read)) return;
    void markRead
      .mutateAsync({ throughId: newest })
      .then(() => utils.players.dashboard.invalidate())
      .catch(() => undefined);
    // Une seule fois par visite.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data]);

  return (
    <Screen title={t("notifications.title")} back withTabBar={false}>
      <NotificationTabs active="mine" />
      <Async query={list}>
        {(items) =>
          items.length === 0 ? (
            <EmptyState
              title={t("notifications.emptyTitle")}
              description={t("notifications.emptyBody")}
            />
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  onOpen={
                    item.url
                      ? () => {
                          void tapFeedback();
                          navigate(item.url!);
                        }
                      : undefined
                  }
                />
              ))}
            </ul>
          )
        }
      </Async>
    </Screen>
  );
}

function NotificationRow({
  item,
  onOpen,
}: {
  item: NotificationView;
  onOpen: (() => void) | undefined;
}) {
  const Icon = item.category ? ICONS[item.category] : Bell;
  const content = (
    <>
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          item.read ? "bg-surface-raised" : "bg-accent/15",
        )}
      >
        <Icon
          className={cn("size-4", item.read ? "text-muted" : "text-accent")}
          aria-hidden
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              "text-sm",
              item.read ? "font-medium" : "font-semibold",
            )}
          >
            {item.title}
          </p>
          {!item.read && (
            <span
              className="mt-1.5 size-2 shrink-0 rounded-full bg-accent"
              aria-hidden
            />
          )}
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{item.body}</p>
        <p className="mt-1 text-[11px] text-muted/80">
          {formatDateTime(item.createdAt)}
        </p>
      </div>
    </>
  );

  return (
    <li>
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="flex w-full items-start gap-3 rounded-xl border border-border/60 bg-surface px-3 py-3 text-left transition-colors hover:bg-surface-raised"
        >
          {content}
        </button>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-surface px-3 py-3">
          {content}
        </div>
      )}
    </li>
  );
}
