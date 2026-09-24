import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ExternalLink, HeartHandshake } from "lucide-react";
import { LIMITS } from "@uno/shared";
import { formatEur } from "@/lib/format.js";
import { useT } from "@/lib/i18n.js";
import { describeError, newIdempotencyKey, trpc } from "@/lib/trpc.js";
import { notificationFeedback, tapFeedback } from "@/lib/native.js";
import { useOnline } from "@/lib/use-online.js";
import { cn } from "@/lib/cn.js";
import { Screen } from "@/components/layout/index.js";
import { Async } from "@/components/ui/async.js";
import { ProductImage } from "@/components/ui/product-image.js";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
} from "@/components/ui/index.js";

/** Les montants proposés d'un geste ; tout autre montant se saisit. */
const PRESETS = [50, 100, 250, 500] as const;

/**
 * Un don à une association, au montant que le joueur choisit (SHOP-010).
 *
 * Le montant est libre à partir de `LIMITS.donationMinUno` : l'écran le
 * vérifie pour le dire tôt, le serveur le vérifie pour de bon.
 */
export function DonateScreen() {
  const t = useT();
  const { charityId } = useParams();
  const navigate = useNavigate();
  const online = useOnline();
  const utils = trpc.useUtils();

  const id = Number(charityId);
  const charities = trpc.shop.charities.useQuery();
  const wallet = trpc.wallet.summary.useQuery();
  const donate = trpc.shop.donate.useMutation();

  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const balance = wallet.data?.balance ?? 0;
  const parsed = Number.parseInt(amount, 10);
  const entered = amount !== "" && Number.isInteger(parsed);
  const tooLow = entered && parsed < LIMITS.donationMinUno;
  const tooHigh = entered && parsed > LIMITS.donationMaxUno;
  const overBalance = entered && !tooHigh && parsed > balance;
  const amountValid = entered && !tooLow && !tooHigh && !overBalance;

  const amountError = !entered
    ? undefined
    : tooLow
      ? t("donate.amountMin", { min: LIMITS.donationMinUno })
      : tooHigh
        ? t("donate.amountMax", { max: LIMITS.donationMaxUno })
        : overBalance
          ? t("donate.amountOver", { count: parsed - balance })
          : undefined;

  async function give(name: string) {
    if (!amountValid) return;
    setError(null);
    try {
      await donate.mutateAsync({
        charityId: id,
        amountUno: parsed,
        // STATE-002 : une clé par tentative, un double tap ne débite qu'une fois.
        idempotencyKey: newIdempotencyKey(),
      });
      await notificationFeedback();
      await utils.wallet.summary.invalidate();
      await utils.shop.orders.invalidate();
      await utils.players.dashboard.invalidate();
      setSuccess(t("donate.done", { amount: parsed, name }));
      setTimeout(() => navigate("/commandes"), 1500);
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  return (
    <Screen
      title={t("donate.title")}
      back
      backTo="/boutique?categorie=donation"
      withTabBar={false}
    >
      <Async query={charities} loadingLabel={t("shop.charitiesLoading")}>
        {(list) => {
          const charity = list.find((entry) => entry.id === id);
          if (!charity) {
            return (
              <EmptyState
                title={t("donate.goneTitle")}
                description={t("donate.goneBody")}
                icon={<HeartHandshake className="size-6" aria-hidden />}
              />
            );
          }

          return (
            <div className="space-y-5">
              <div className="flex items-start gap-4">
                <ProductImage
                  src={charity.imageUrl ?? undefined}
                  alt=""
                  fallbackIcon={HeartHandshake}
                  iconClassName="size-8 text-muted"
                  className="size-20 shrink-0 rounded-2xl object-cover"
                />
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-bold">{charity.name}</h2>
                  {/* Le site officiel permet de vérifier l'association avant
                      de lui confier un don. */}
                  <a
                    href={charity.websiteUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent"
                  >
                    {t("donate.website")}
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                </div>
              </div>

              {charity.description !== "" && (
                <p className="text-sm leading-relaxed text-muted">
                  {charity.description}
                </p>
              )}

              <Card className="flex items-center justify-between py-3">
                <span className="text-sm text-muted">
                  {t("shop.yourBalance")}
                </span>
                <span className="text-lg font-bold tabular-nums text-accent">
                  {wallet.data?.balance ?? "—"} UNO
                </span>
              </Card>

              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {t("donate.chooseAmount")}
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      aria-pressed={parsed === preset}
                      onClick={() => {
                        void tapFeedback();
                        setAmount(String(preset));
                      }}
                      className={cn(
                        "rounded-xl border py-2.5 text-sm font-semibold tabular-nums transition-colors",
                        parsed === preset
                          ? "border-accent bg-accent/15 text-accent"
                          : "border-border/60 text-muted hover:text-foreground",
                      )}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <Field
                label={t("donate.amount")}
                htmlFor="donationAmount"
                error={amountError}
                hint={
                  amountValid
                    ? t("donate.amountHint", { euros: formatEur(parsed) })
                    : t("donate.amountRule", { min: LIMITS.donationMinUno })
                }
              >
                <Input
                  id="donationAmount"
                  type="number"
                  inputMode="numeric"
                  min={LIMITS.donationMinUno}
                  max={Math.min(LIMITS.donationMaxUno, balance)}
                  step={1}
                  placeholder={String(LIMITS.donationMinUno)}
                  value={amount}
                  invalid={amountError !== undefined}
                  onChange={(event) =>
                    setAmount(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                />
              </Field>

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
                  {success}
                </div>
              )}

              <Button
                variant="accent"
                fullWidth
                icon={<HeartHandshake className="size-4" aria-hidden />}
                disabled={!online || !amountValid || success !== null}
                loading={donate.isPending}
                onClick={() => void give(charity.name)}
              >
                {amountValid
                  ? t("donate.give", { amount: parsed })
                  : t("donate.giveEmpty")}
              </Button>

              {!online && (
                <p className="text-center text-xs text-warning">
                  {t("donate.offline")}
                </p>
              )}
            </div>
          );
        }}
      </Async>
    </Screen>
  );
}
