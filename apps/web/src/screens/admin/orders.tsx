import { useState } from "react";
import { MapPin, PackageCheck, Undo2, XCircle } from "lucide-react";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  type OrderStatus,
} from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { cn } from "@/lib/cn.js";
import { formatDateTime } from "@/lib/format.js";
import { tapFeedback } from "@/lib/native.js";
import { Async } from "@/components/ui/async.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
} from "@/components/ui/index.js";

/**
 * Traitement des commandes (CDC §15).
 *
 * Les transitions proposées sont celles que la machine à états autorise depuis
 * le statut courant : le serveur refuserait les autres, les afficher ne ferait
 * qu'inviter à une erreur.
 */
const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  pending: ["paid", "cancelled"],
  paid: ["fulfilled", "refunded"],
  fulfilled: ["refunded"],
  cancelled: [],
  refunded: [],
};

const STATUS_TONES: Record<OrderStatus, "neutral" | "primary" | "success" | "error"> = {
  pending: "neutral",
  paid: "primary",
  fulfilled: "success",
  cancelled: "error",
  refunded: "error",
};

const ACTION_ICONS: Partial<Record<OrderStatus, typeof PackageCheck>> = {
  fulfilled: PackageCheck,
  cancelled: XCircle,
  refunded: Undo2,
};

export function AdminOrders() {
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const orders = trpc.admin.orders.useQuery({
    limit: 50,
    ...(filter !== "all" ? { status: filter } : {}),
  });
  const setStatus = trpc.admin.setOrderStatus.useMutation();

  async function advance(orderId: number, status: OrderStatus) {
    void tapFeedback();
    setError(null);
    setNotice(null);

    try {
      await setStatus.mutateAsync({
        orderId,
        status: status as "paid" | "fulfilled" | "cancelled" | "refunded",
      });
      await utils.admin.orders.invalidate();
      await utils.admin.stats.invalidate();
      setNotice(
        status === "cancelled" || status === "refunded"
          ? `Commande #${orderId} ${ORDER_STATUS_LABELS[status].toLowerCase()} — le joueur a été recrédité.`
          : `Commande #${orderId} marquée « ${ORDER_STATUS_LABELS[status]} ».`,
      );
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {(["all", ...ORDER_STATUSES] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              void tapFeedback();
              setFilter(value);
            }}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-2 text-xs font-medium transition-colors",
              filter === value
                ? "bg-accent text-background"
                : "bg-surface text-muted hover:text-foreground",
            )}
            aria-pressed={filter === value}
          >
            {value === "all" ? "Toutes" : ORDER_STATUS_LABELS[value]}
          </button>
        ))}
      </div>

      {error && <ErrorBanner message={error} />}
      {notice && (
        <div
          role="status"
          className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
        >
          {notice}
        </div>
      )}

      <Async query={orders}>
        {(page) =>
          page.items.length === 0 ? (
            <EmptyState
              title="Aucune commande"
              description="Les achats effectués à la boutique apparaîtront ici."
            />
          ) : (
            <div className="space-y-3">
              {page.items.map((order) => (
                <Card key={order.id}>
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        Commande #{order.id}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {order.playerName} · {order.playerEmail}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {formatDateTime(order.createdAt)}
                      </p>
                    </div>
                    <Badge tone={STATUS_TONES[order.status]}>
                      {ORDER_STATUS_LABELS[order.status]}
                    </Badge>
                  </div>

                  <div className="space-y-1 border-t border-border/40 pt-3">
                    {order.items.map((line, index) => (
                      <div
                        key={`${order.id}-${index}`}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="min-w-0 flex-1 truncate text-muted">
                          {line.quantity} × {line.productName}
                        </span>
                        <span className="ml-2 shrink-0 tabular-nums">
                          {line.totalUno} UNO
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Adresse de livraison : c'est ici, au moment d'expédier,
                      qu'elle sert. Le joueur ne la renseigne pas pour autre
                      chose. */}
                  {order.playerAddress ? (
                    <div className="mt-3 flex items-start gap-2 border-t border-border/40 pt-3">
                      <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden />
                      <p className="text-xs leading-relaxed text-muted">
                        {order.playerAddress}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-3 flex items-start gap-2 border-t border-border/40 pt-3">
                      <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden />
                      <p className="text-xs leading-relaxed text-amber-300/80">
                        Aucune adresse renseignée — à demander au joueur avant
                        l'envoi.
                      </p>
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-3">
                    <span className="text-sm font-medium">Total</span>
                    <span className="text-base font-bold tabular-nums text-accent">
                      {order.totalUno} UNO
                    </span>
                  </div>

                  {NEXT_STATUSES[order.status].length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {NEXT_STATUSES[order.status].map((next) => {
                        const Icon = ACTION_ICONS[next];
                        return (
                          <Button
                            key={next}
                            variant={next === "fulfilled" ? "accent" : "secondary"}
                            className="flex-1"
                            loading={setStatus.isPending}
                            {...(Icon ? { icon: <Icon className="size-4" aria-hidden /> } : {})}
                            onClick={() => void advance(order.id, next)}
                          >
                            {ORDER_STATUS_LABELS[next]}
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )
        }
      </Async>
    </div>
  );
}
