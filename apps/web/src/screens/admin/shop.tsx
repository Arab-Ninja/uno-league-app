import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  SHOP_CATEGORIES,
  SHOP_CATEGORY_LABELS,
  type ShopCategory,
  type ShopItemInput,
} from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { ProductImagesField } from "@/components/admin/product-images-field.js";
import { ProductImage } from "@/components/ui/product-image.js";
import { Async } from "@/components/ui/async.js";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Select,
} from "@/components/ui/index.js";

/**
 * Gestion du catalogue (ADMIN-004).
 * La suppression d'un produit déjà commandé est convertie en archivage par le
 * serveur, afin de préserver l'historique des commandes.
 */
const EMPTY: ShopItemInput = {
  name: "",
  description: "",
  category: "accessories",
  priceUno: 100,
  priceEuros: null,
  productUrl: null,
  images: [],
  available: true,
  stock: null,
};

export function AdminShop() {
  const utils = trpc.useUtils();
  const items = trpc.admin.shopItems.useQuery();

  const create = trpc.admin.createShopItem.useMutation();
  const update = trpc.admin.updateShopItem.useMutation();
  const remove = trpc.admin.removeShopItem.useMutation();

  const [form, setForm] = useState<ShopItemInput>(EMPTY);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    await utils.admin.shopItems.invalidate();
    await utils.shop.items.invalidate();
    await utils.admin.stats.invalidate();
  }

  async function submit() {
    setError(null);
    setNotice(null);
    try {
      if (editing === null) {
        await create.mutateAsync(form);
        setNotice("Produit créé.");
      } else {
        await update.mutateAsync({ shopItemId: editing, data: form });
        setNotice("Produit mis à jour.");
      }

      setForm(EMPTY);
      setEditing(null);
      await refresh();
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  async function archive(shopItemId: number) {
    setError(null);
    setNotice(null);
    try {
      const result = await remove.mutateAsync({ shopItemId });
      setNotice(
        result.archived
          ? "Produit archivé : il a déjà été commandé, l'historique est préservé."
          : "Produit supprimé.",
      );
      await refresh();
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

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
      {notice && (
        <div
          role="status"
          className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
        >
          {notice}
        </div>
      )}

      <Card className="space-y-3">
        <h3 className="text-sm font-semibold">
          {editing === null ? "Ajouter un produit" : `Modifier le produit #${editing}`}
        </h3>

        <Field label="Nom" htmlFor="productName">
          <Input
            id="productName"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </Field>

        <Field label="Description" htmlFor="productDescription">
          <Input
            id="productDescription"
            value={form.description}
            onChange={(event) =>
              setForm({ ...form, description: event.target.value })
            }
          />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Catégorie" htmlFor="productCategory">
            <Select
              id="productCategory"
              value={form.category}
              onChange={(event) =>
                setForm({ ...form, category: event.target.value as ShopCategory })
              }
            >
              {SHOP_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {SHOP_CATEGORY_LABELS[category]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Prix (UNO)" htmlFor="productPrice">
            <Input
              id="productPrice"
              type="number"
              min={1}
              value={form.priceUno}
              onChange={(event) =>
                setForm({ ...form, priceUno: Number(event.target.value) || 0 })
              }
            />
          </Field>
        </div>

        <ProductImagesField
          images={form.images}
          onChange={(images) => setForm({ ...form, images })}
        />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.available}
            onChange={(event) =>
              setForm({ ...form, available: event.target.checked })
            }
            className="size-4 accent-[#F97316]"
          />
          Disponible à la vente
        </label>

        <div className="flex gap-2">
          <Button
            variant="accent"
            fullWidth
            icon={<Plus className="size-4" aria-hidden />}
            loading={create.isPending || update.isPending}
            disabled={form.name.trim() === "" || form.priceUno <= 0}
            onClick={() => void submit()}
          >
            {editing === null ? "Créer" : "Enregistrer"}
          </Button>
          {editing !== null && (
            <Button
              variant="secondary"
              onClick={() => {
                setEditing(null);
                setForm(EMPTY);
              }}
            >
              Annuler
            </Button>
          )}
        </div>
      </Card>

      <Async query={items}>
        {(products) => (
          <div className="space-y-2">
            {products.map((product) => (
              <Card key={product.id} className="flex items-center gap-3 py-3">
                <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-surface-raised">
                  <ProductImage
                    src={product.images[0]}
                    alt=""
                    className="size-full object-cover"
                    iconClassName="size-5 text-muted"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{product.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                    <span className="whitespace-nowrap">{product.priceUno} UNO</span>
                    {product.images.length > 1 && (
                      <span className="whitespace-nowrap">
                        {product.images.length} images
                      </span>
                    )}
                    {product.archived ? (
                      <Badge tone="neutral">Archivé</Badge>
                    ) : product.available ? (
                      <Badge tone="success">En vente</Badge>
                    ) : (
                      <Badge tone="warning">Masqué</Badge>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-xs font-medium text-accent"
                  onClick={() => {
                    setEditing(product.id);
                    setForm({
                      name: product.name,
                      description: product.description,
                      category: product.category,
                      priceUno: product.priceUno,
                      priceEuros: product.priceEuros,
                      productUrl: product.productUrl,
                      images: product.images,
                      available: product.available,
                      stock: product.stock,
                    });
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  Modifier
                </button>
                <button
                  type="button"
                  aria-label={`Supprimer ${product.name}`}
                  className="flex size-9 items-center justify-center rounded-lg text-muted hover:text-red-300"
                  onClick={() => void archive(product.id)}
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </Card>
            ))}
          </div>
        )}
      </Async>
    </div>
  );
}
