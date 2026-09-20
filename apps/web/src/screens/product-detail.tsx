import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DONATION_CATEGORY, requiresSize } from "@uno/shared";
import { formatEur, formatRating } from "@/lib/format.js";
import { useT } from "@/lib/i18n.js";
import { describeError, newIdempotencyKey, trpc } from "@/lib/trpc.js";
import { notificationFeedback } from "@/lib/native.js";
import { useOnline } from "@/lib/use-online.js";
import { ExternalLink, HeartHandshake } from "lucide-react";
import { Screen } from "@/components/layout/index.js";
import { ProductImage } from "@/components/ui/product-image.js";
import { Async } from "@/components/ui/async.js";
import { ImageCarousel } from "@/components/ui/image-carousel.js";
import { ProductReviews, Stars } from "@/components/shop/product-reviews.js";
import { Button, Card } from "@/components/ui/index.js";

/** Détail produit et achat (SHOP-002, SHOP-003, SHOP-005). */
export function ProductDetailScreen() {
  const t = useT();
  const { shopItemId } = useParams();
  const navigate = useNavigate();
  const online = useOnline();
  const utils = trpc.useUtils();

  const id = Number(shopItemId);
  const product = trpc.shop.item.useQuery(
    { shopItemId: id },
    { enabled: Number.isFinite(id) },
  );
  const wallet = trpc.wallet.summary.useQuery();
  const purchase = trpc.shop.purchase.useMutation();

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [size, setSize] = useState<string | null>(null);
  const [charityId, setCharityId] = useState<number | null>(null);

  const balance = wallet.data?.balance ?? 0;

  /**
   * Les associations ne sont demandées que pour un don : le reste du catalogue
   * n'a pas à provoquer cette requête.
   */
  const isDonation = product.data?.category === DONATION_CATEGORY;
  const charities = trpc.shop.charities.useQuery(undefined, {
    enabled: isDonation,
  });

  async function buy(priceUno: number) {
    setError(null);
    try {
      await purchase.mutateAsync({
        items: [{ shopItemId: id, quantity: 1, size, charityId }],
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
    <Screen
      title={t("product.title")}
      back
      backTo="/boutique"
      withTabBar={false}
    >
      <Async query={product}>
        {(item) => {
          const affordable = balance >= item.priceUno;
          const balanceAfter = balance - item.priceUno;
          const needsSize = requiresSize(item.sizeKind);
          const sizeMissing = needsSize && size === null;
          const donation = item.category === DONATION_CATEGORY;
          const charityMissing = donation && charityId === null;

          return (
            <div className="space-y-5">
              <ImageCarousel images={item.images} alt={item.name} />

              <div>
                <h2 className="text-xl font-bold">{item.name}</h2>
                {item.ratingAverage !== null && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <Stars value={Math.round(item.ratingAverage)} />
                    <span className="text-xs text-muted tabular-nums">
                      {formatRating(item.ratingAverage)} ·{" "}
                      {t("product.reviews", { count: item.ratingCount })}
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
                    {item.sizeKind === "shoes"
                      ? t("product.shoeSize")
                      : t("product.size")}
                  </p>
                  <div
                    role="radiogroup"
                    aria-label={
                      item.sizeKind === "shoes"
                        ? t("product.shoeSizeShort")
                        : t("product.size")
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

              {donation && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t("product.charity")}</p>
                  <p className="text-xs text-muted">
                    {t("product.charityHelp")}
                  </p>
                  <Async
                    query={charities}
                    loadingLabel={t("product.charityLoading")}
                  >
                    {(list) =>
                      list.length === 0 ? (
                        <p className="text-sm text-muted">
                          {t("product.charityNone")}
                        </p>
                      ) : (
                        <div
                          role="radiogroup"
                          aria-label={t("product.charity")}
                          className="space-y-2"
                        >
                          {list.map((charity) => (
                            <div
                              key={charity.id}
                              className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                                charityId === charity.id
                                  ? "border-accent bg-accent/10"
                                  : "border-border/60"
                              }`}
                            >
                              <button
                                type="button"
                                role="radio"
                                aria-checked={charityId === charity.id}
                                onClick={() => setCharityId(charity.id)}
                                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                              >
                                <ProductImage
                                  src={charity.imageUrl ?? undefined}
                                  alt=""
                                  fallbackIcon={HeartHandshake}
                                  iconClassName="size-5 shrink-0 text-muted"
                                  className="size-11 shrink-0 rounded-lg object-cover"
                                />
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-medium">
                                    {charity.name}
                                  </span>
                                  {charity.description !== "" && (
                                    <span className="line-clamp-2 block text-xs text-muted">
                                      {charity.description}
                                    </span>
                                  )}
                                </span>
                              </button>
                              {/* Le site officiel permet de vérifier
                                  l'association avant de lui confier un don. */}
                              <a
                                href={charity.websiteUrl}
                                target="_blank"
                                rel="noreferrer noopener"
                                aria-label={t("product.charitySite", {
                                  name: charity.name,
                                })}
                                className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:text-foreground"
                              >
                                <ExternalLink className="size-4" aria-hidden />
                              </a>
                            </div>
                          ))}
                        </div>
                      )
                    }
                  </Async>
                </div>
              )}

              <Card className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted">
                    {t("product.price")}
                  </span>
                  <span className="text-2xl font-bold text-accent tabular-nums">
                    {item.priceUno} UNO
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>{t("product.equivalent")}</span>
                  <span>{formatEur(item.priceUno)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border/50 pt-3 text-sm">
                  <span className="text-muted">
                    {t("product.balanceAfter")}
                  </span>
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
                    {item.stock > 0
                      ? t("product.inStock", { count: item.stock })
                      : t("product.outOfStock")}
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
                  {donation
                    ? t("product.donationDone")
                    : t("product.orderDone")}
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
                  sizeMissing ||
                  charityMissing
                }
                loading={purchase.isPending}
                onClick={() => void buy(item.priceUno)}
              >
                {!affordable
                  ? t("product.notEnough")
                  : sizeMissing
                    ? item.sizeKind === "shoes"
                      ? t("product.chooseShoeSize")
                      : t("product.chooseSize")
                    : charityMissing
                      ? t("product.chooseCharity")
                      : donation
                        ? t("product.give")
                        : t("product.buy")}
              </Button>

              {!affordable && (
                <p className="text-center text-xs text-muted">
                  {t("product.missing", { count: item.priceUno - balance })}
                </p>
              )}
              {!online && (
                <p className="text-center text-xs text-warning">
                  {t("product.offline")}
                </p>
              )}

              {/* Noter un don n'a pas de sens : on ne juge pas un geste. */}
              {!donation && <ProductReviews shopItemId={item.id} />}
            </div>
          );
        }}
      </Async>
    </Screen>
  );
}
