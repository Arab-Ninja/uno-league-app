import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Check, Copy, Gift, Share2, Users } from "lucide-react";
import { formatUno } from "@uno/shared";
import { trpc } from "@/lib/trpc.js";
import { cn } from "@/lib/cn.js";
import { useT } from "@/lib/i18n.js";
import { formatShortDate } from "@/lib/format.js";
import { tapFeedback } from "@/lib/native.js";
import { shareLink } from "@/lib/share.js";
import { Screen } from "@/components/layout/index.js";
import { Avatar } from "@/components/domain/index.js";
import { Async } from "@/components/ui/async.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ProgressBar,
  SectionTitle,
} from "@/components/ui/index.js";

/**
 * Parrainage (REF-001) : le code du joueur, le lien à partager et ce que
 * chaque parrainé a déjà rapporté.
 */
export function ReferralsScreen() {
  const t = useT();
  const summary = trpc.referrals.mine.useQuery();
  const config = trpc.proposals.config.useQuery();
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  // Même règle que l'invitation à une séance : le domaine de la ligue, jamais
  // l'adresse technique de l'application (`https://localhost`).
  const base =
    config.data?.publicWebUrl ??
    (Capacitor.isNativePlatform() ? null : window.location.origin);

  function flash(what: "code" | "link") {
    setCopied(what);
    setTimeout(() => setCopied(null), 2500);
  }

  async function copyCode(code: string) {
    void tapFeedback();
    try {
      await navigator.clipboard.writeText(code);
      flash("code");
    } catch {
      // Presse-papiers refusé : le code reste lisible à l'écran.
    }
  }

  async function share(code: string) {
    void tapFeedback();
    const url = base
      ? `${base}/inscription?parrain=${encodeURIComponent(code)}`
      : null;
    const outcome = await shareLink({
      title: t("referral.shareTitle"),
      text: t("referral.shareText", { code }),
      url,
    });
    if (outcome === "copied") flash("link");
  }

  return (
    <Screen
      title={t("referral.title")}
      back
      backTo="/profil"
      withTabBar={false}
    >
      <Async query={summary}>
        {(data) => {
          const { rewards } = data;
          return (
            <div className="space-y-5">
              <Card className="text-center">
                <Gift className="mx-auto size-8 text-accent" aria-hidden />
                <p className="mt-3 text-sm text-muted">
                  {t("referral.yourCode")}
                </p>
                <button
                  type="button"
                  onClick={() => void copyCode(data.code)}
                  className="mt-1 inline-flex items-center gap-2 font-display text-[32px] font-extrabold tracking-[0.08em]"
                  aria-label={t("referral.copyCode")}
                >
                  {data.code}
                  {copied === "code" ? (
                    <Check className="size-5 text-success" aria-hidden />
                  ) : (
                    <Copy className="size-5 text-muted" aria-hidden />
                  )}
                </button>
                <p
                  aria-live="polite"
                  className={cn(
                    "h-4 text-xs",
                    copied ? "text-success" : "text-transparent",
                  )}
                >
                  {copied === "code"
                    ? t("referral.codeCopied")
                    : copied === "link"
                      ? t("referral.linkCopied")
                      : ""}
                </p>
                <div className="mt-3">
                  <Button
                    variant="accent"
                    fullWidth
                    onClick={() => void share(data.code)}
                  >
                    <Share2 className="size-[18px]" aria-hidden />
                    {t("referral.share")}
                  </Button>
                </div>
              </Card>

              <section>
                <SectionTitle>{t("referral.howTitle")}</SectionTitle>
                <Card>
                  <ol className="space-y-2 text-sm">
                    <li>{t("referral.step1")}</li>
                    <li>
                      {t("referral.step2", {
                        amount: formatUno(rewards.firstSessionUno),
                      })}
                    </li>
                    <li>
                      {t("referral.step3", {
                        count: rewards.milestoneSessions,
                        amount: formatUno(rewards.milestoneUno),
                      })}
                    </li>
                  </ol>
                  <p className="mt-3 text-xs text-muted">
                    {t("referral.fairPlay")}
                  </p>
                </Card>
              </section>

              <section>
                <SectionTitle
                  action={
                    <span className="text-sm font-semibold text-accent">
                      {t("referral.earned", {
                        amount: formatUno(data.earnedUno),
                      })}
                    </span>
                  }
                >
                  {t("referral.listTitle")}
                </SectionTitle>
                {data.referrals.length === 0 ? (
                  <EmptyState
                    title={t("referral.emptyTitle")}
                    description={t("referral.emptyBody")}
                    icon={<Users className="size-6" aria-hidden />}
                  />
                ) : (
                  <div className="space-y-2">
                    {data.referrals.map((referral) => (
                      <Card
                        key={referral.id}
                        className="flex items-center gap-3"
                      >
                        <Avatar
                          name={referral.displayName}
                          url={referral.profilePhotoUrl}
                          size="md"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold">
                              {referral.displayName}
                            </p>
                            {referral.cancelled ? (
                              <Badge tone="error">
                                {t("referral.cancelled")}
                              </Badge>
                            ) : referral.milestoneRewarded ? (
                              <Badge tone="success">
                                +
                                {formatUno(
                                  rewards.firstSessionUno +
                                    rewards.milestoneUno,
                                )}
                              </Badge>
                            ) : referral.firstRewarded ? (
                              <Badge tone="accent">
                                +{formatUno(rewards.firstSessionUno)}
                              </Badge>
                            ) : (
                              <Badge>{t("referral.waiting")}</Badge>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-muted">
                            {t("referral.joined", {
                              date: formatShortDate(
                                new Date(referral.joinedAt)
                                  .toISOString()
                                  .slice(0, 10),
                              ),
                            })}
                          </p>
                          {!referral.cancelled &&
                            !referral.milestoneRewarded && (
                              <ReferralProgress
                                played={referral.paidSessions}
                                total={rewards.milestoneSessions}
                              />
                            )}
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </section>
            </div>
          );
        }}
      </Async>
    </Screen>
  );
}

/** « 2/5 séances UNO League » : le chemin vers le second versement. */
function ReferralProgress({
  played,
  total,
}: {
  played: number;
  total: number;
}) {
  const t = useT();
  const label = t("referral.progress", {
    count: Math.min(played, total),
    total,
  });
  return (
    <div className="mt-2">
      <ProgressBar value={Math.min(played, total)} max={total} label={label} />
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}
