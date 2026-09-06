import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Package, ShoppingBag } from "lucide-react";
import {
  SHOP_CATEGORY_FILTERS,
  SHOP_CATEGORY_LABELS,
  type ShopCategoryFilter,
} from "@uno/shared";
import { trpc } from "@/lib/trpc.js";
import { cn } from "@/lib/cn.js";
import { formatEur } from "@/lib/format.js";
import { tapFeedback } from "@/lib/native.js";
import { Screen } from "@/components/layout/index.js";
import { Async } from "@/components/ui/async.js";
import { Card, EmptyState } from "@/components/ui/index.js";

/** Catalogue de la boutique (SHOP-001). */
export function ShopScreen() {
  const navigate = useNavigate();
  const [category, setCategory] = useState<ShopCategoryFilter>("all");

  const items = trpc.shop.items.useQuery({ category });
  const wallet = trpc.wallet.summary.useQuery();

  return (
    <Screen
      title="Boutique"
      back
      withTabBar={false}
      action={
        <button
          type="button"
          aria-label="Mes commandes"
          onClick={() => navigate("/commandes")}
          className="flex size-11 items-center justify-center rounded-full text-muted hover:text-foreground active:opacity-70"
        >
          <Package className="size-5" aria-hidden />
        </button>
      }
    >
      <Card className="mb-4 flex items-center justify-between py-3">
        <span className="text-sm text-muted">Votre solde</span>
        <span className="text-lg font-bold tabular-nums text-accent">
          {wallet.data?.balance ?? "—"} UNO
        </span>
      </Card>

      <div className="mb-4 flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {SHOP_CATEGORY_FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              void tapFeedback();
              setCategory(value);
            }}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-2 text-xs font-medium transition-colors",
              category === value
                ? "bg-accent text-background"
                : "bg-surface text-muted hover:text-foreground",
            )}
            aria-pressed={category === value}
          >
            {SHOP_CATEGORY_LABELS[value]}
          </button>
        ))}
      </div>

      <Async query={items} loadingLabel="Chargement du catalogue...">
        {(products) =>
          products.length === 0 ? (
            <EmptyState
              title="Aucun produit disponible"
              description="De nouveaux articles seront ajoutés prochainement."
              icon={<ShoppingBag className="size-6" aria-hidden />}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {products.map((product) => {
                const affordable = (wallet.data?.balance ?? 0) >= product.priceUno;
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => {
                      void tapFeedback();
                      navigate(`/boutique/${product.id}`);
                    }}
                    className="overflow-hidden rounded-card border border-border/60 bg-surface text-left transition-all active:scale-[0.98] active:opacity-70"
                  >
                    <div className="flex aspect-square items-center justify-center bg-surface-raised">
                      {product.images[0] ? (
                        <img
                          src={product.images[0]}
                          alt=""
                          loading="lazy"
                          className="size-full object-cover"
                        />
                      ) : (
                        <ShoppingBag className="size-8 text-muted" aria-hidden />
                      )}
                    </div>
                    <div className="p-3">
                      <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium">
                        {product.name}
                      </p>
                      <p
                        className={cn(
                          "mt-1.5 text-sm font-bold tabular-nums",
                          affordable ? "text-accent" : "text-muted",
                        )}
                      >
                        {product.priceUno} UNO
                      </p>
                      <p className="text-[11px] text-muted">
                        {formatEur(product.priceUno)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )
        }
      </Async>
    </Screen>
  );
}
