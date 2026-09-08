import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { requiresSize } from "@uno/shared";
import { formatEur } from "@/lib/format.js";
import { describeError, newIdempotencyKey, trpc } from "@/lib/trpc.js";
import { notificationFeedback } from "@/lib/native.js";
import { useOnline } from "@/lib/use-online.js";
import { Screen } from "@/components/layout/index.js";
import { Async } from "@/components/ui/async.js";
import { ImageCarousel } from "@/components/ui/image-carousel.js";
import { ProductReviews, Stars } from "@/components/shop/product-reviews.js";
import { Button, Card } from "@/components/ui/index.js";

/** Détail produit et achat (SHOP-002, SHOP-003, SHOP-005). */
export function ProductDetailScreen() {
  const { shopItemId } = useParams();
  const navigate = useNavigate();
  const online = useOnline();
  const utils = trpc.useUtils();

  const id = Number(shopItemId);
  const product = trpc.shop.item.useQuery({ shopItemId: id }, { enabled: Number.isFinite(id) });
  const wallet = trpc.wallet.summary.useQuery();
  const purchase = trpc.shop.purchase.useMutation();

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [size, setSize] = useState<string | null>(null);

  const balance = wallet.data?.balance ?? 0;

  async function buy(priceUno: number) {
    setError(null);
    try {
      await purchase.mutateAsync({
        items: [{ shopItemId: id, quantity: 1, size }],
        // STATE-002 : une clé par tentative, un double tap ne débite qu'une fois.
        idempotencyKey: newIdempotencyKey(),
      });
      await notificationFeedback();
      await utils.wallet.summary.invalidate();
      await utils.shop.orders.invalidate();
      await utils.players.dashboard.invalidate();
      setSuccess(true);
      setTimeout(() => navigate("/commandes"), 1200);
      void priceUno;
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  return (
    <Screen title="Produit" back withTabBar={false}>
      <Async query={product}>
        {(item) => {
          const affordable = balance >= item.priceUno;
          const balanceAfter = balance - item.priceUno;
          const needsSize = requiresSize(item.sizeKind);
          const sizeMissing = needsSize && size === null;

          return (
            <div className="space-y-5">
              <ImageCarousel images={item.images} alt={item.name} />

              <div>
                <h2 className="text-xl font-bold">{item.name}</h2>
                {item.ratingAverage !== null && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <Stars value={Math.round(item.ratingAverage)} />
                    <span className="text-xs text-muted tabular-nums">
                      {item.ratingAverage.toLocaleString("fr-BE", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}{" "}
                      · {item.ratingCount} avis
                    </span>
                  </div>
                )}
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {item.description}
                </p>
              </div>

              {needsSize && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    {item.sizeKind === "shoes" ? "Pointure (EU)" : "Taille"}
                  </p>
                  <div
                    role="radiogroup"
                    aria-label={
                      item.sizeKind === "shoes" ? "Pointure" : "Taille"
                    }
                    className="flex flex-wrap gap-2"
                  >
                    {item.sizes.map((value) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={size === value}
                        onClick={() => setSize(value)}
                        className={`min-w-12 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                          size === value
                            ? "border-accent bg-accent/15 text-accent"
                            : "border-border/60 text-muted hover:text-foreground"
                        }`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <Card className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted">Prix</span>
                  <span className="text-2xl font-bold text-accent tabular-nums">
                    {item.priceUno} UNO
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>Équivalent</span>
                  <span>{formatEur(item.priceUno)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border/50 pt-3 text-sm">
                  <span className="text-muted">Solde après achat</span>
                  <span
                    className={`font-semibold tabular-nums ${
                      affordable ? "text-foreground" : "text-red-300"
                    }`}
                  >
                    {affordable ? balanceAfter : balance - item.priceUno} UNO
                  </span>
                </div>
                {item.stock !== null && (
                  <p className="text-xs text-muted">
                    {item.stock > 0 ? `${item.stock} en stock` : "Rupture de stock"}
                  </p>
                )}
              </Card>

              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-red-200"
                >
                  {error}
                </div>
              )}
              {success && (
                <div
                  role="status"
                  className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
                >
                  Commande confirmée.
                </div>
              )}

              <Button
                variant="accent"
                fullWidth
                // SHOP-002 : le bouton est désactivé si le solde ne suffit pas,
                // ou tant qu'aucune taille n'a été choisie.
                disabled={
                  !affordable ||
                  !online ||
                  success ||
                  item.stock === 0 ||
                  sizeMissing
                }
                loading={purchase.isPending}
                onClick={() => void buy(item.priceUno)}
              >
                {!affordable
                  ? "Solde insuffisant"
                  : sizeMissing
                    ? item.sizeKind === "shoes"
                      ? "Choisissez une pointure"
                      : "Choisissez une taille"
                    : "Acheter"}
              </Button>

              {!affordable && (
                <p className="text-center text-xs text-muted">
                  Il vous manque {item.priceUno - balance} UNO.
                </p>
              )}
              {!online && (
                <p className="text-center text-xs text-warning">
                  L'achat nécessite une connexion internet.
                </p>
              )}

              <ProductReviews shopItemId={item.id} />
            </div>
          );
        }}
      </Async>
    </Screen>
  );
}
