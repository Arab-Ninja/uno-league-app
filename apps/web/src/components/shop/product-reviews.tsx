import { useEffect, useState } from "react";
import { Star, Trash2 } from "lucide-react";
import { REVIEW_RATING_MAX, LIMITS } from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { tapFeedback } from "@/lib/native.js";
import { Avatar } from "@/components/domain/index.js";
import { Button, Card, SectionTitle } from "@/components/ui/index.js";

/**
 * Notes et commentaires d'un produit (SHOP-002).
 *
 * Tout joueur peut donner son avis, qu'il ait acheté ou non — c'est la règle
 * demandée. La mention « achat vérifié » distingue ceux qui ont réellement
 * commandé : elle est calculée par le serveur, jamais déclarée par l'auteur.
 *
 * Un joueur n'a qu'un avis par produit : publier de nouveau remplace le
 * précédent, ce qui ferme la porte au bourrage d'urnes tout en laissant
 * chacun corriger sa note.
 */

interface ProductReviewsProps {
  shopItemId: number;
}

export function ProductReviews({ shopItemId }: ProductReviewsProps) {
  const utils = trpc.useUtils();
  const reviews = trpc.shop.reviews.useQuery({ shopItemId });
  const publish = trpc.shop.reviewProduct.useMutation();
  const remove = trpc.shop.removeReview.useMutation();

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const mine = reviews.data?.find((review) => review.mine) ?? null;
  const others = (reviews.data ?? []).filter((review) => !review.mine);

  // Le formulaire s'initialise sur l'avis existant : le joueur retrouve ce
  // qu'il avait écrit plutôt qu'un champ vide.
  useEffect(() => {
    if (mine && !editing) {
      setRating(mine.rating);
      setComment(mine.comment ?? "");
    }
  }, [mine, editing]);

  async function refresh() {
    await utils.shop.reviews.invalidate({ shopItemId });
    await utils.shop.item.invalidate({ shopItemId });
    await utils.shop.items.invalidate();
  }

  async function submit() {
    setError(null);
    try {
      await publish.mutateAsync({
        shopItemId,
        rating,
        comment: comment.trim() === "" ? null : comment.trim(),
      });
      setEditing(false);
      await refresh();
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  async function withdraw() {
    setError(null);
    try {
      await remove.mutateAsync({ shopItemId });
      setRating(0);
      setComment("");
      setEditing(false);
      await refresh();
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  const showForm = mine === null || editing;

  return (
    <section>
      <SectionTitle>Avis</SectionTitle>

      {showForm ? (
        <Card className="space-y-3">
          <p className="text-sm font-medium">
            {mine ? "Modifier votre avis" : "Donner votre avis"}
          </p>

          <StarPicker value={rating} onChange={setRating} />

          <textarea
            value={comment}
            maxLength={LIMITS.reviewCommentMax}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Votre commentaire (facultatif)"
            aria-label="Commentaire"
            rows={3}
            className="w-full resize-none rounded-xl border border-border/60 bg-surface-raised px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent"
          />

          <div className="flex gap-2">
            <Button
              variant="accent"
              fullWidth
              disabled={rating === 0}
              loading={publish.isPending}
              onClick={() => void submit()}
            >
              Publier
            </Button>
            {mine && (
              <Button variant="secondary" onClick={() => setEditing(false)}>
                Annuler
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <Card className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Votre avis</p>
              <Stars value={mine.rating} />
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-xs font-medium text-accent"
                onClick={() => setEditing(true)}
              >
                Modifier
              </button>
              <button
                type="button"
                aria-label="Supprimer mon avis"
                onClick={() => void withdraw()}
                className="flex size-8 items-center justify-center rounded-lg text-muted hover:text-red-300"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          </div>
          {mine.comment && (
            <p className="text-sm leading-relaxed text-muted">{mine.comment}</p>
          )}
        </Card>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-300">
          {error}
        </p>
      )}

      {others.length > 0 && (
        <div className="mt-3 space-y-2">
          {others.map((review) => (
            <Card key={review.id} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Avatar
                  name={review.player.displayName}
                  url={review.player.profilePhotoUrl}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {review.player.displayName}
                  </p>
                  <Stars value={review.rating} />
                </div>
                {review.verifiedPurchase && (
                  <span className="shrink-0 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">
                    Achat vérifié
                  </span>
                )}
              </div>
              {review.comment && (
                <p className="text-sm leading-relaxed text-muted">
                  {review.comment}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      {others.length === 0 && mine === null && (
        <p className="mt-2 text-center text-xs text-muted">
          Aucun avis pour le moment. Soyez le premier.
        </p>
      )}
    </section>
  );
}

/** Étoiles en lecture seule. */
export function Stars({ value }: { value: number }) {
  return (
    <span
      className="flex items-center gap-0.5"
      aria-label={`${value} sur ${REVIEW_RATING_MAX}`}
    >
      {Array.from({ length: REVIEW_RATING_MAX }, (_unused, index) => (
        <Star
          key={index}
          aria-hidden
          className={
            index < value
              ? "size-3.5 fill-amber-300 text-amber-300"
              : "size-3.5 text-border"
          }
        />
      ))}
    </span>
  );
}

function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Note"
      className="flex items-center gap-1"
    >
      {Array.from({ length: REVIEW_RATING_MAX }, (_unused, index) => {
        const star = index + 1;
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} étoile${star > 1 ? "s" : ""}`}
            onClick={() => {
              void tapFeedback();
              onChange(star);
            }}
            className="p-1"
          >
            <Star
              aria-hidden
              className={
                star <= value
                  ? "size-7 fill-amber-300 text-amber-300"
                  : "size-7 text-border"
              }
            />
          </button>
        );
      })}
    </div>
  );
}
