import { Package } from "lucide-react";
import { ORDER_STATUSES } from "@uno/shared";
import { trpc } from "@/lib/trpc.js";
import { formatDateTime } from "@/lib/format.js";
import { Screen } from "@/components/layout/index.js";
import { Async } from "@/components/ui/async.js";
import { Badge, Card, EmptyState } from "@/components/ui/index.js";

/** Historique des commandes (SHOP-004). */
const STATUS_LABELS: Record<(typeof ORDER_STATUSES)[number], string> = {
  pending: "En attente",
  paid: "Payée",
  fulfilled: "Livrée",
  cancelled: "Annulée",
  refunded: "Remboursée",
};

export function OrdersScreen() {
  const orders = trpc.shop.orders.useQuery({ limit: 50 });

  return (
    <Screen title="Mes commandes" back withTabBar={false}>
      <Async query={orders}>
        {(page) =>
          page.items.length === 0 ? (
            <EmptyState
              title="Aucune commande"
              description="Vos achats à la boutique apparaîtront ici."
              icon={<Package className="size-6" aria-hidden />}
            />
          ) : (
            <div className="space-y-3">
              {page.items.map((order) => (
                <Card key={order.id}>
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">Commande #{order.id}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        {formatDateTime(order.createdAt)}
                      </p>
                    </div>
                    <Badge
                      tone={
                        order.status === "fulfilled"
                          ? "success"
                          : order.status === "paid"
                            ? "primary"
                            : order.status === "refunded" || order.status === "cancelled"
                              ? "error"
                              : "neutral"
                      }
                    >
                      {STATUS_LABELS[order.status]}
                    </Badge>
                  </div>

                  <div className="space-y-1.5 border-t border-border/40 pt-3">
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

                  <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-3">
                    <span className="text-sm font-medium">Total</span>
                    <span className="text-base font-bold tabular-nums text-accent">
                      {order.totalUno} UNO
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          )
        }
      </Async>
    </Screen>
  );
}
