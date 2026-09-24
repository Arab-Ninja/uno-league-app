import { useState } from "react";
import { ExternalLink, Lightbulb } from "lucide-react";
import {
  LIMITS,
  SHOP_SUGGESTION_STATUSES,
  type ShopSuggestionStatus,
} from "@uno/shared";
import { cn } from "@/lib/cn.js";
import { describeError, trpc } from "@/lib/trpc.js";
import { formatDateTime } from "@/lib/format.js";
import { Async } from "@/components/ui/async.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
} from "@/components/ui/index.js";
import { useT, useLibelles } from "@/lib/i18n.js";

/**
 * Propositions de produits (SHOP-009).
 *
 * L'administration tranche : retenue, la proposition sera ajoutée à la main au
 * catalogue — avec son prix en UNO, ses images et sa catégorie ; écartée, elle
 * disparaît de la file. Dans les deux cas l'auteur reçoit la réponse, avec le
 * mot qu'on y joint.
 */

const FILTERS = [
  "pending",
  ...SHOP_SUGGESTION_STATUSES.filter((s) => s !== "pending"),
] as const;

const TONES: Record<ShopSuggestionStatus, "warning" | "success" | "neutral"> = {
  pending: "warning",
  approved: "success",
  rejected: "neutral",
};

export function AdminSuggestions() {
  const t = useT();
  const L = useLibelles();
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<ShopSuggestionStatus>("pending");
  const suggestions = trpc.admin.suggestions.useQuery({ status, limit: 50 });
  const decide = trpc.admin.decideSuggestion.useMutation();

  const [notes, setNotes] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function answer(
    suggestionId: number,
    decision: "approved" | "rejected",
  ) {
    setError(null);
    setNotice(null);
    try {
      await decide.mutateAsync({
        suggestionId,
        decision,
        note: notes[suggestionId]?.trim() || null,
      });
      setNotice(
        decision === "approved"
          ? t("admin.suggestions.approved")
          : t("admin.suggestions.rejected"),
      );
      setNotes((current) => {
        const next = { ...current };
        delete next[suggestionId];
        return next;
      });
      await utils.admin.suggestions.invalidate();
      await utils.admin.stats.invalidate();
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

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setStatus(value)}
            aria-pressed={status === value}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-2 text-xs font-medium transition-colors",
              status === value
                ? "bg-accent text-background"
                : "bg-surface text-muted hover:text-foreground",
            )}
          >
            {L.suggestionStatus[value]}
          </button>
        ))}
      </div>

      <Async query={suggestions}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState
              title={t("admin.suggestions.emptyTitle")}
              description={t("admin.suggestions.emptyBody")}
              icon={<Lightbulb className="size-6" aria-hidden />}
            />
          ) : (
            <div className="space-y-2">
              {list.map((suggestion) => (
                <Card key={suggestion.id} className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{suggestion.title}</p>
                      <p className="text-xs text-muted">
                        {suggestion.player
                          ? `${suggestion.player.firstName} ${suggestion.player.lastName}`
                          : t("admin.suggestions.unknownPlayer")}{" "}
                        · {formatDateTime(suggestion.createdAt)}
                      </p>
                    </div>
                    <Badge tone={TONES[suggestion.status]}>
                      {L.suggestionStatus[suggestion.status]}
                    </Badge>
                  </div>

                  <p className="text-xs leading-relaxed text-muted">
                    {suggestion.description}
                  </p>

                  <a
                    href={suggestion.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-accent"
                  >
                    <ExternalLink className="size-3.5" aria-hidden />
                    {t("admin.suggestions.seeProduct")}
                  </a>

                  {suggestion.status === "pending" ? (
                    <>
                      <Input
                        value={notes[suggestion.id] ?? ""}
                        maxLength={LIMITS.suggestionNoteMax}
                        placeholder={t("admin.suggestions.notePlaceholder")}
                        aria-label={t("admin.suggestions.answerTo", {
                          title: suggestion.title,
                        })}
                        onChange={(event) =>
                          setNotes({
                            ...notes,
                            [suggestion.id]: event.target.value,
                          })
                        }
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="accent"
                          fullWidth
                          loading={decide.isPending}
                          onClick={() => void answer(suggestion.id, "approved")}
                        >
                          {t("admin.suggestions.accept")}
                        </Button>
                        <Button
                          variant="secondary"
                          fullWidth
                          loading={decide.isPending}
                          onClick={() => void answer(suggestion.id, "rejected")}
                        >
                          {t("admin.suggestions.decline")}
                        </Button>
                      </div>
                    </>
                  ) : (
                    suggestion.decisionNote && (
                      <p className="text-xs text-foreground">
                        {t("admin.suggestions.answer", {
                          note: suggestion.decisionNote,
                        })}
                      </p>
                    )
                  )}
                </Card>
              ))}
            </div>
          )
        }
      </Async>
    </div>
  );
}
