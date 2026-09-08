import { useState } from "react";
import {
  BellOff,
  CalendarDays,
  CreditCard,
  ShoppingBag,
  Wallet,
} from "lucide-react";
import {
  ADMIN_EVENT_CATEGORIES,
  ADMIN_EVENT_CATEGORY_LABELS,
  type AdminEventCategory,
} from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { cn } from "@/lib/cn.js";
import { formatDateTime } from "@/lib/format.js";
import { Async } from "@/components/ui/async.js";
import { Button, Card, EmptyState } from "@/components/ui/index.js";

/**
 * Flux d'évènements de l'administration (ADMIN-006).
 *
 * Chaque fait marquant du domaine y remonte : réservation formée, session
 * confirmée ou clôturée, paiement reçu ou en retard, remplaçant intégré,
 * commande, transfert, avis produit.
 *
 * L'acquittement est borné au plus récent évènement affiché : un évènement
 * arrivé pendant la lecture n'est pas marqué lu à l'insu de son lecteur.
 */

const CATEGORY_ICONS: Record<AdminEventCategory, typeof CalendarDays> = {
  calendar: CalendarDays,
  payment: CreditCard,
  shop: ShoppingBag,
  wallet: Wallet,
};

export function AdminEvents() {
  const utils = trpc.useUtils();
  const [category, setCategory] = useState<AdminEventCategory | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const events = trpc.admin.events.useQuery({
    ...(category ? { category } : {}),
    unreadOnly,
    limit: 50,
  });
  const counts = trpc.admin.eventCounts.useQuery();
  const markRead = trpc.admin.markEventsRead.useMutation();

  async function acknowledge(throughId: number) {
    setError(null);
    try {
      await markRead.mutateAsync({ throughId });
      await utils.admin.events.invalidate();
      await utils.admin.eventCounts.invalidate();
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  const unread = counts.data?.unread ?? 0;

  return (
    <div className="space-y-4">
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-red-200"
        >
          {error}
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        <FilterChip
          label="Tout"
          active={category === null}
          count={unread}
          onClick={() => setCategory(null)}
        />
        {ADMIN_EVENT_CATEGORIES.map((value) => (
          <FilterChip
            key={value}
            label={ADMIN_EVENT_CATEGORY_LABELS[value]}
            active={category === value}
            count={counts.data?.byCategory[value] ?? 0}
            onClick={() => setCategory(value)}
          />
        ))}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={unreadOnly}
          onChange={(event) => setUnreadOnly(event.target.checked)}
          className="size-4 accent-[#F97316]"
        />
        Non lus uniquement
      </label>

      <Async query={events}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState
              title="Aucun évènement"
              description={
                unreadOnly
                  ? "Tout est lu."
                  : "L'activité de la ligue apparaîtra ici."
              }
              icon={<BellOff className="size-6" aria-hidden />}
            />
          ) : (
            <>
              {list[0] && unread > 0 && (
                <Button
                  variant="secondary"
                  fullWidth
                  loading={markRead.isPending}
                  onClick={() => void acknowledge(list[0]!.id)}
                >
                  Tout marquer comme lu
                </Button>
              )}

              <div className="space-y-2">
                {list.map((event) => {
                  const Icon = CATEGORY_ICONS[event.category];
                  return (
                    <Card
                      key={event.id}
                      className={cn(
                        "flex gap-3 py-3",
                        !event.read && "border-accent/40 bg-accent/5",
                      )}
                    >
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-raised">
                        <Icon className="size-4 text-muted" aria-hidden />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-sm font-medium">
                            {event.title}
                          </p>
                          {!event.read && (
                            <span
                              className="size-2 shrink-0 rounded-full bg-accent"
                              aria-label="Non lu"
                            />
                          )}
                        </div>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted">
                          {event.body}
                        </p>
                        <p className="mt-1 text-[11px] text-muted">
                          {formatDateTime(event.createdAt)}
                          {event.playerName && ` · ${event.playerName}`}
                        </p>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </>
          )
        }
      </Async>
    </div>
  );
}

function FilterChip({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition-colors",
        active ? "bg-accent text-background" : "bg-surface text-muted hover:text-foreground",
      )}
    >
      {label}
      {count > 0 && (
        <span
          className={cn(
            "rounded-full px-1.5 text-[10px] font-bold tabular-nums",
            active ? "bg-background/25" : "bg-accent text-background",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
