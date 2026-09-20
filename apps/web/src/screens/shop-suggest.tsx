import { useState } from "react";
import { Lightbulb } from "lucide-react";
import { LIMITS, type ShopSuggestionStatus } from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { formatDateTime } from "@/lib/format.js";
import { useLibelles, useT } from "@/lib/i18n.js";
import { Screen } from "@/components/layout/index.js";
import { Async } from "@/components/ui/async.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
} from "@/components/ui/index.js";

const STATUS_TONE: Record<
  ShopSuggestionStatus,
  "neutral" | "success" | "warning"
> = {
  pending: "warning",
  approved: "success",
  rejected: "neutral",
};

const EMPTY = { title: "", description: "", url: "" };

/**
 * Proposer un produit à la boutique (SHOP-009).
 *
 * Le joueur donne un titre, deux phrases et le lien d'achat ; l'administration
 * tranche et la réponse revient en notification. Rien n'est ajouté au
 * catalogue automatiquement — le prix en UNO reste une décision de la ligue.
 */
export function ShopSuggestScreen() {
  const t = useT();
  const L = useLibelles();
  const utils = trpc.useUtils();
  const mine = trpc.shop.mySuggestions.useQuery();
  const suggest = trpc.shop.suggest.useMutation();

  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const complete =
    form.title.trim().length >= 3 &&
    form.description.trim().length >= 10 &&
    form.url.trim() !== "";

  async function submit() {
    setError(null);
    setNotice(null);
    try {
      await suggest.mutateAsync({
        title: form.title.trim(),
        description: form.description.trim(),
        url: form.url.trim(),
      });
      setForm(EMPTY);
      setNotice(t("suggest.sent"));
      await utils.shop.mySuggestions.invalidate();
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  return (
    <Screen
      title={t("suggest.title")}
      back
      backTo="/boutique"
      withTabBar={false}
    >
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

      <Card className="space-y-3">
        <p className="text-sm text-muted">{t("suggest.intro")}</p>

        <Field label={t("suggest.product")} htmlFor="suggestionTitle">
          <Input
            id="suggestionTitle"
            value={form.title}
            maxLength={LIMITS.suggestionTitleMax}
            placeholder={t("suggest.productPlaceholder")}
            onChange={(event) =>
              setForm({ ...form, title: event.target.value })
            }
          />
        </Field>

        <Field
          label={t("suggest.description")}
          htmlFor="suggestionDescription"
          hint={t("suggest.descriptionHint")}
        >
          <textarea
            id="suggestionDescription"
            value={form.description}
            maxLength={LIMITS.suggestionDescriptionMax}
            rows={4}
            onChange={(event) =>
              setForm({ ...form, description: event.target.value })
            }
            className="w-full resize-none rounded-xl border border-border/60 bg-surface-raised px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent"
          />
        </Field>

        <Field
          label={t("suggest.link")}
          htmlFor="suggestionUrl"
          hint={t("suggest.linkHint")}
        >
          <Input
            id="suggestionUrl"
            type="url"
            inputMode="url"
            value={form.url}
            maxLength={LIMITS.imageUrlMax}
            placeholder="https://"
            onChange={(event) => setForm({ ...form, url: event.target.value })}
          />
        </Field>

        <Button
          variant="accent"
          fullWidth
          disabled={!complete}
          loading={suggest.isPending}
          onClick={() => void submit()}
        >
          {t("suggest.submit")}
        </Button>
      </Card>

      <h3 className="mb-2 mt-6 text-sm font-semibold">{t("suggest.mine")}</h3>
      <Async query={mine} loadingLabel={t("suggest.loading")}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState
              title={t("suggest.emptyTitle")}
              description={t("suggest.emptyBody")}
              icon={<Lightbulb className="size-6" aria-hidden />}
            />
          ) : (
            <div className="space-y-2">
              {list.map((suggestion) => (
                <Card key={suggestion.id} className="space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium">{suggestion.title}</p>
                    <Badge tone={STATUS_TONE[suggestion.status]}>
                      {L.suggestionStatus[suggestion.status]}
                    </Badge>
                  </div>
                  <p className="text-xs leading-relaxed text-muted">
                    {suggestion.description}
                  </p>
                  {suggestion.decisionNote && (
                    <p className="text-xs text-foreground">
                      « {suggestion.decisionNote} »
                    </p>
                  )}
                  <p className="text-[11px] text-muted">
                    {t("suggest.sentOn", {
                      date: formatDateTime(suggestion.createdAt),
                    })}
                  </p>
                </Card>
              ))}
            </div>
          )
        }
      </Async>
    </Screen>
  );
}
