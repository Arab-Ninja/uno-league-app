import { useState } from "react";
import { ExternalLink, HeartHandshake, Plus } from "lucide-react";
import { LIMITS, type CharityInput } from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { Async } from "@/components/ui/async.js";
import { CharityImageField } from "@/components/admin/images-field.js";
import { ProductImage } from "@/components/ui/product-image.js";
import { Badge, Button, Card, Field, Input } from "@/components/ui/index.js";

/**
 * Associations caritatives (SHOP-008).
 *
 * Elles alimentent la liste déroulante des dons. Une association n'est jamais
 * supprimée — un don lui a peut-être déjà été adressé : elle est retirée de la
 * liste en la désactivant, et l'historique reste lisible.
 */

const EMPTY: CharityInput = {
  name: "",
  description: "",
  imageUrl: null,
  websiteUrl: "",
  active: true,
};

export function AdminCharities() {
  const utils = trpc.useUtils();
  const charities = trpc.admin.charities.useQuery();

  const create = trpc.admin.createCharity.useMutation();
  const update = trpc.admin.updateCharity.useMutation();

  const [form, setForm] = useState<CharityInput>(EMPTY);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    await utils.admin.charities.invalidate();
    await utils.shop.charities.invalidate();
  }

  async function submit() {
    setError(null);
    setNotice(null);
    try {
      if (editing === null) {
        await create.mutateAsync(form);
        setNotice("Association ajoutée.");
      } else {
        await update.mutateAsync({ charityId: editing, data: form });
        setNotice("Association mise à jour.");
      }
      setForm(EMPTY);
      setEditing(null);
      await refresh();
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  const complete = form.name.trim() !== "" && form.websiteUrl.trim() !== "";

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
          {editing === null
            ? "Ajouter une association"
            : `Modifier l'association #${editing}`}
        </h3>

        <Field label="Nom" htmlFor="charityName">
          <Input
            id="charityName"
            value={form.name}
            maxLength={LIMITS.charityNameMax}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </Field>

        <Field
          label="Présentation"
          htmlFor="charityDescription"
          hint="Deux phrases : ce que fait l'association."
        >
          <textarea
            id="charityDescription"
            value={form.description}
            maxLength={LIMITS.charityDescriptionMax}
            rows={3}
            onChange={(event) =>
              setForm({ ...form, description: event.target.value })
            }
            className="w-full resize-none rounded-xl border border-border/60 bg-surface-raised px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent"
          />
        </Field>

        <Field
          label="Site officiel"
          htmlFor="charityWebsite"
          hint="Le joueur peut le consulter avant de choisir où va son don."
        >
          <Input
            id="charityWebsite"
            type="url"
            inputMode="url"
            value={form.websiteUrl}
            maxLength={LIMITS.imageUrlMax}
            placeholder="https://"
            onChange={(event) =>
              setForm({ ...form, websiteUrl: event.target.value })
            }
          />
        </Field>

        <CharityImageField
          images={form.imageUrl ? [form.imageUrl] : []}
          onChange={(images) =>
            setForm({ ...form, imageUrl: images[0] ?? null })
          }
        />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(event) =>
              setForm({ ...form, active: event.target.checked })
            }
            className="size-4 accent-[#F97316]"
          />
          Proposée aux dons
        </label>

        <div className="flex gap-2">
          <Button
            variant="accent"
            fullWidth
            icon={<Plus className="size-4" aria-hidden />}
            loading={create.isPending || update.isPending}
            disabled={!complete}
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

      <Async query={charities}>
        {(list) =>
          list.length === 0 ? (
            <Card className="py-6 text-center text-sm text-muted">
              Aucune association. Ajoutez-en une pour ouvrir la catégorie
              « Don » de la boutique.
            </Card>
          ) : (
            <div className="space-y-2">
              {list.map((charity) => (
                <Card key={charity.id} className="flex items-center gap-3 py-3">
                  <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-surface-raised">
                    {charity.imageUrl ? (
                      <ProductImage
                        src={charity.imageUrl}
                        alt=""
                        className="size-full object-cover"
                        iconClassName="size-5 text-muted"
                      />
                    ) : (
                      <HeartHandshake className="size-5 text-muted" aria-hidden />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{charity.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                      {charity.active ? (
                        <Badge tone="success">Proposée</Badge>
                      ) : (
                        <Badge tone="neutral">Retirée</Badge>
                      )}
                    </p>
                  </div>

                  <a
                    href={charity.websiteUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={`Site officiel de ${charity.name}`}
                    className="flex size-9 items-center justify-center rounded-lg text-muted hover:text-foreground"
                  >
                    <ExternalLink className="size-4" aria-hidden />
                  </a>
                  <button
                    type="button"
                    className="text-xs font-medium text-accent"
                    onClick={() => {
                      setEditing(charity.id);
                      setForm({
                        name: charity.name,
                        description: charity.description,
                        imageUrl: charity.imageUrl,
                        websiteUrl: charity.websiteUrl,
                        active: charity.active,
                      });
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    Modifier
                  </button>
                </Card>
              ))}
            </div>
          )
        }
      </Async>
    </div>
  );
}
