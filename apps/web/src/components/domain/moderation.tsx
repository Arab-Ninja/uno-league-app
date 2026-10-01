import { useState } from "react";
import { Ban, Flag, MoreHorizontal, X } from "lucide-react";
import {
  MODERATION_LIMITS,
  REPORT_REASONS,
  type ReportReason,
} from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { useT } from "@/lib/i18n.js";
import { tapFeedback } from "@/lib/native.js";
import { cn } from "@/lib/cn.js";
import { Button, ErrorBanner } from "@/components/ui/index.js";

/**
 * Signaler un contenu, bloquer son auteur (MOD-001).
 *
 * Un bouton discret « ⋯ » posé sur ce qu'un autre joueur a écrit — un message
 * de club, un avis produit — ouvre une feuille à deux gestes. C'est ce que les
 * stores exigent d'une application où l'on écrit pour les autres, et ce que
 * chacun attend le jour où quelqu'un dépasse les bornes : **signaler** pour
 * que la ligue tranche, **bloquer** pour ne plus le voir tout de suite.
 */
export function ModerationButton({
  kind,
  targetId,
  author,
  onBlocked,
  className,
}: {
  kind: "message" | "review";
  targetId: number;
  author: { playerId: number; displayName: string };
  /** Appelé après un blocage : l'écran recharge ce qu'il affiche. */
  onBlocked?: () => void;
  className?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label={t("moderation.options")}
        onClick={() => {
          void tapFeedback();
          setOpen(true);
        }}
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full text-muted hover:text-foreground active:opacity-70",
          className,
        )}
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </button>
      {open && (
        <ModerationSheet
          kind={kind}
          targetId={targetId}
          author={author}
          onClose={() => setOpen(false)}
          onBlocked={() => {
            setOpen(false);
            onBlocked?.();
          }}
        />
      )}
    </>
  );
}

function ModerationSheet({
  kind,
  targetId,
  author,
  onClose,
  onBlocked,
}: {
  kind: "message" | "review";
  targetId: number;
  author: { playerId: number; displayName: string };
  onClose: () => void;
  onBlocked: () => void;
}) {
  const t = useT();
  const utils = trpc.useUtils();
  const report = trpc.moderation.report.useMutation();
  const block = trpc.moderation.block.useMutation();

  const [step, setStep] = useState<"menu" | "report" | "block" | "thanks">(
    "menu",
  );
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [failure, setFailure] = useState<string | null>(null);

  async function sendReport() {
    if (!reason) return;
    setFailure(null);
    try {
      await report.mutateAsync({
        kind,
        targetId,
        reason,
        details: details.trim() || null,
      });
      setStep("thanks");
    } catch (caught) {
      setFailure(describeError(caught).message);
    }
  }

  async function confirmBlock() {
    setFailure(null);
    try {
      await block.mutateAsync({ playerId: author.playerId });
      await utils.moderation.blocked.invalidate();
      onBlocked();
    } catch (caught) {
      setFailure(describeError(caught).message);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t("moderation.options")}
      onClick={onClose}
    >
      <div
        className="max-h-[88dvh] w-full max-w-[520px] animate-rise overflow-y-auto overflow-x-hidden overscroll-contain rounded-t-3xl border-t border-border bg-background px-5 pt-4"
        style={{ paddingBottom: "calc(var(--safe-bottom) + 1.5rem)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="mx-auto mb-4 h-1 w-10 rounded-full bg-border"
          aria-hidden
        />
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            aria-label={t("moderation.close")}
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-full text-muted hover:text-foreground"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {step === "menu" && (
          <div className="space-y-2">
            <SheetAction
              icon={<Flag className="size-4" aria-hidden />}
              label={
                kind === "message"
                  ? t("moderation.reportMessage")
                  : t("moderation.reportReview")
              }
              onClick={() => setStep("report")}
            />
            <SheetAction
              icon={<Ban className="size-4" aria-hidden />}
              label={t("moderation.block", { name: author.displayName })}
              tone="danger"
              onClick={() => setStep("block")}
            />
          </div>
        )}

        {step === "report" && (
          <div className="space-y-3">
            <p className="text-sm font-medium">{t("moderation.reasonTitle")}</p>
            <div className="space-y-1.5" role="radiogroup">
              {REPORT_REASONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  role="radio"
                  aria-checked={reason === item}
                  onClick={() => setReason(item)}
                  className={cn(
                    "w-full rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                    reason === item
                      ? "border-accent bg-accent/10 text-foreground"
                      : "border-border/60 text-muted hover:text-foreground",
                  )}
                >
                  {t(`moderation.reasons.${item}`)}
                </button>
              ))}
            </div>
            <textarea
              value={details}
              maxLength={MODERATION_LIMITS.detailsMax}
              onChange={(event) => setDetails(event.target.value)}
              placeholder={t("moderation.details")}
              aria-label={t("moderation.details")}
              rows={3}
              className="w-full resize-none rounded-xl border border-border/60 bg-surface-raised px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent"
            />
            {failure && <ErrorBanner message={failure} />}
            <Button
              variant="accent"
              fullWidth
              disabled={reason === null}
              loading={report.isPending}
              onClick={() => void sendReport()}
            >
              {t("moderation.send")}
            </Button>
          </div>
        )}

        {step === "block" && (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed">
              {t("moderation.blockConfirm", { name: author.displayName })}
            </p>
            {failure && <ErrorBanner message={failure} />}
            <div className="flex gap-2">
              <Button
                variant="danger"
                fullWidth
                loading={block.isPending}
                onClick={() => void confirmBlock()}
              >
                {t("moderation.block", { name: author.displayName })}
              </Button>
              <Button variant="secondary" onClick={() => setStep("menu")}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        )}

        {step === "thanks" && (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed">{t("moderation.thanks")}</p>
            <SheetAction
              icon={<Ban className="size-4" aria-hidden />}
              label={t("moderation.block", { name: author.displayName })}
              tone="danger"
              onClick={() => setStep("block")}
            />
            <Button variant="secondary" fullWidth onClick={onClose}>
              {t("moderation.close")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function SheetAction({
  icon,
  label,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  tone?: "danger";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        void tapFeedback();
        onClick();
      }}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl bg-surface px-4 py-3 text-left text-sm font-medium hover:bg-surface-raised",
        tone === "danger" ? "text-red-300" : "text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/** La liste des joueurs bloqués, avec de quoi revenir sur sa décision. */
export function BlockedPlayers() {
  const t = useT();
  const utils = trpc.useUtils();
  const blocked = trpc.moderation.blocked.useQuery();
  const unblock = trpc.moderation.unblock.useMutation();

  const rows = blocked.data ?? [];
  if (rows.length === 0) {
    return (
      <p className="py-2 text-center text-xs text-muted">
        {t("moderation.blockedEmpty")}
      </p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {rows.map((row) => (
        <li
          key={row.playerId}
          className="flex items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2"
        >
          <span className="truncate text-sm">{row.displayName}</span>
          <Button
            variant="secondary"
            loading={
              unblock.isPending && unblock.variables?.playerId === row.playerId
            }
            onClick={async () => {
              await unblock.mutateAsync({ playerId: row.playerId });
              await utils.moderation.blocked.invalidate();
              await utils.squads.messages.invalidate();
              await utils.shop.reviews.invalidate();
            }}
          >
            {t("moderation.unblock")}
          </Button>
        </li>
      ))}
    </ul>
  );
}
