import { useState } from "react";
import { Package } from "lucide-react";
import { ORDER_STATUS_LABELS } from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { formatDateTime } from "@/lib/format.js";
import { Screen } from "@/components/layout/index.js";
import { Async } from "@/components/ui/async.js";
import { Badge, Button, Card, EmptyState } from "@/components/ui/index.js";

/** Historique des commandes (SHOP-004, SHOP-005). */
export function OrdersScreen() {
  const utils = trpc.useUtils();
  const orders = trpc.shop.orders.useQuery({ limit: 50 });
  const cancel = trpc.shop.cancelOrder.useMutation();

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function cancelOrder(orderId: number) {
    setError(null);
    setNotice(null);
    try {
      const order = await cancel.mutateAsync({ orderId });
      setNotice(`Commande #${order.id} annulée, ${order.totalUno} UNO recrédités.`);
      await utils.shop.orders.invalidate();
      await utils.wallet.summary.invalidate();
      await utils.players.dashboard.invalidate();
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  return (
    <Screen title="Mes commandes" back withTabBar={false}>
      {error && (
        <div
          role="alert"
          className="mb-3 rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-red-200"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="mb-3 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
        >
          {notice}
        </div>
      )}

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
                      {ORDER_STATUS_LABELS[order.status]}
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
                          {line.size && (
                            <span className="ml-1 text-foreground/70">
                              · taille {line.size}
                            </span>
                          )}
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

                  {/* SHOP-005 : annulable tant que l'organisation n'a pas
                      confirmé la commande. Le serveur reste seul juge. */}
                  {order.cancellable && (
                    <div className="mt-3">
                      <Button
                        variant="secondary"
                        fullWidth
                        loading={cancel.isPending}
                        onClick={() => void cancelOrder(order.id)}
                      >
                        Annuler et être remboursé
                      </Button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )
        }
      </Async>
    </Screen>
  );
}
