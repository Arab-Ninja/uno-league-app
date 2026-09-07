import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Package, Search, ShoppingBag, Star, X } from "lucide-react";
import { ProductImage } from "@/components/ui/product-image.js";
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
import { Card, EmptyState, Input } from "@/components/ui/index.js";

/** Catalogue de la boutique (SHOP-001). */
export function ShopScreen() {
  const navigate = useNavigate();
  const [category, setCategory] = useState<ShopCategoryFilter>("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  // La recherche part 300 ms après la dernière frappe : interroger le serveur
  // à chaque caractère n'apporterait rien et multiplierait les requêtes.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const items = trpc.shop.items.useQuery(
    query === "" ? { category } : { category, query },
  );
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

      <div className="relative mb-3">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Rechercher un produit"
          aria-label="Rechercher un produit"
          className="pl-9 pr-9"
        />
        {search !== "" && (
          <button
            type="button"
            aria-label="Effacer la recherche"
            onClick={() => setSearch("")}
            className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

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
              title={
                query === "" ? "Aucun produit disponible" : "Aucun résultat"
              }
              description={
                query === ""
                  ? "De nouveaux articles seront ajoutés prochainement."
                  : `Rien ne correspond à « ${query} ». Essayez un autre terme.`
              }
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
                      <ProductImage
                        src={product.images[0]}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
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
                      {product.ratingAverage !== null && (
                        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted">
                          <Star
                            className="size-3 fill-amber-300 text-amber-300"
                            aria-hidden
                          />
                          <span className="tabular-nums">
                            {product.ratingAverage.toLocaleString("fr-BE", {
                              minimumFractionDigits: 1,
                              maximumFractionDigits: 1,
                            })}
                          </span>
                          <span>({product.ratingCount})</span>
                        </p>
                      )}
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
