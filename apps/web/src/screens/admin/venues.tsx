import { useState } from "react";
import { MapPin, Plus, Trash2 } from "lucide-react";
import { DEFAULT_TIMEZONE, LIMITS, type VenueInput } from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { Async } from "@/components/ui/async.js";
import { VenueImagesField } from "@/components/admin/images-field.js";
import { ProductImage } from "@/components/ui/product-image.js";
import { Badge, Button, Card, Field, Input } from "@/components/ui/index.js";

/**
 * Gestion des salles (ADMIN-007).
 *
 * Une salle déjà utilisée par une session n'est jamais supprimée : le serveur
 * la désactive, pour que l'historique des sessions reste lisible. L'interface
 * annonce laquelle des deux voies a été prise, plutôt que de laisser croire à
 * une suppression qui n'a pas eu lieu.
 */

const EMPTY: VenueInput = {
  name: "",
  headline: null,
  description: "",
  address: null,
  timezone: DEFAULT_TIMEZONE,
  images: [],
  active: true,
};

export function AdminVenues() {
  const utils = trpc.useUtils();
  const venues = trpc.admin.venues.useQuery();

  const create = trpc.admin.createVenue.useMutation();
  const update = trpc.admin.updateVenue.useMutation();
  const remove = trpc.admin.removeVenue.useMutation();

  const [form, setForm] = useState<VenueInput>(EMPTY);
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    await utils.admin.venues.invalidate();
    await utils.proposals.venues.invalidate();
    await utils.proposals.config.invalidate();
  }

  async function submit() {
    setError(null);
    setNotice(null);
    try {
      if (editing === null) {
        await create.mutateAsync(form);
        setNotice("Salle créée.");
      } else {
        await update.mutateAsync({ venueId: editing, data: form });
        setNotice("Salle mise à jour.");
      }
      setForm(EMPTY);
      setEditing(null);
      await refresh();
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  async function drop(venueId: number) {
    setError(null);
    setNotice(null);
    try {
      const result = await remove.mutateAsync({ venueId });
      setNotice(
        result.deactivated
          ? "Salle désactivée : des sessions y sont rattachées, l'historique est préservé."
          : "Salle supprimée.",
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
          {editing === null ? "Ajouter une salle" : `Modifier la salle #${editing}`}
        </h3>

        <Field label="Nom" htmlFor="venueName">
          <Input
            id="venueName"
            value={form.name}
            maxLength={LIMITS.venueNameMax}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </Field>

        <Field
          label="Titre d'accroche"
          htmlFor="venueHeadline"
          hint="Affiché au-dessus de la description, dans l'écran Informations."
        >
          <Input
            id="venueHeadline"
            value={form.headline ?? ""}
            maxLength={LIMITS.titleMax}
            onChange={(event) =>
              setForm({ ...form, headline: event.target.value || null })
            }
          />
        </Field>

        <Field label="Description" htmlFor="venueDescription">
          <textarea
            id="venueDescription"
            value={form.description}
            maxLength={LIMITS.descriptionMax}
            rows={4}
            onChange={(event) =>
              setForm({ ...form, description: event.target.value })
            }
            className="w-full resize-none rounded-xl border border-border/60 bg-surface-raised px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent"
          />
        </Field>

        <Field label="Adresse" htmlFor="venueAddress">
          <Input
            id="venueAddress"
            value={form.address ?? ""}
            maxLength={LIMITS.addressMax}
            onChange={(event) =>
              setForm({ ...form, address: event.target.value || null })
            }
          />
        </Field>

        <VenueImagesField
          images={form.images}
          onChange={(images) => setForm({ ...form, images })}
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
          Ouverte aux nouvelles sessions
        </label>

        <div className="flex gap-2">
          <Button
            variant="accent"
            fullWidth
            icon={<Plus className="size-4" aria-hidden />}
            loading={create.isPending || update.isPending}
            disabled={form.name.trim() === ""}
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

      <Async query={venues}>
        {(list) => (
          <div className="space-y-2">
            {list.map((venue) => (
              <Card key={venue.id} className="flex items-center gap-3 py-3">
                <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-surface-raised">
                  {venue.images[0] ? (
                    <ProductImage
                      src={venue.images[0]}
                      alt=""
                      className="size-full object-cover"
                      iconClassName="size-5 text-muted"
                    />
                  ) : (
                    <MapPin className="size-5 text-muted" aria-hidden />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{venue.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                    {venue.active ? (
                      <Badge tone="success">Ouverte</Badge>
                    ) : (
                      <Badge tone="neutral">Fermée</Badge>
                    )}
                    {venue.images.length > 0 && (
                      <span className="whitespace-nowrap">
                        {venue.images.length} image
                        {venue.images.length > 1 ? "s" : ""}
                      </span>
                    )}
                  </p>
                </div>

                <button
                  type="button"
                  className="text-xs font-medium text-accent"
                  onClick={() => {
                    setEditing(venue.id);
                    setForm({
                      name: venue.name,
                      headline: venue.headline,
                      description: venue.description,
                      address: venue.address,
                      timezone: venue.timezone,
                      images: venue.images,
                      active: venue.active,
                      sortOrder: venue.sortOrder,
                    });
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  Modifier
                </button>
                <button
                  type="button"
                  aria-label={`Supprimer ${venue.name}`}
                  className="flex size-9 items-center justify-center rounded-lg text-muted hover:text-red-300"
                  onClick={() => void drop(venue.id)}
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
