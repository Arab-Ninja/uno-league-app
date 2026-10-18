import { Lock } from "lucide-react";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_RULES,
  REMINDER_HOURS_CHOICES,
  type NotificationCategory,
  type NotificationSettingsView,
  type UpdateNotificationSettingsInput,
} from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { cn } from "@/lib/cn.js";
import { useT, type Cle } from "@/lib/i18n.js";
import { tapFeedback } from "@/lib/native.js";
import { useState } from "react";
import { Screen } from "@/components/layout/index.js";
import { Async } from "@/components/ui/async.js";
import {
  Card,
  ErrorBanner,
  SectionTitle,
  Select,
} from "@/components/ui/index.js";
import { PushSettings } from "@/components/push-settings.js";

const CATEGORY_LABELS: Record<NotificationCategory, { title: Cle; body: Cle }> =
  {
    sessions: {
      title: "notifSettings.sessions",
      body: "notifSettings.sessionsBody",
    },
    payments: {
      title: "notifSettings.payments",
      body: "notifSettings.paymentsBody",
    },
    reminders: {
      title: "notifSettings.reminders",
      body: "notifSettings.remindersBody",
    },
    newProposals: {
      title: "notifSettings.newProposals",
      body: "notifSettings.newProposalsBody",
    },
    wallet: { title: "notifSettings.wallet", body: "notifSettings.walletBody" },
    shop: { title: "notifSettings.shop", body: "notifSettings.shopBody" },
    announcements: {
      title: "notifSettings.announcements",
      body: "notifSettings.announcementsBody",
    },
  };

/** Un interrupteur, lisible par un lecteur d'écran. */
function Toggle({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        void tapFeedback();
        onChange(!checked);
      }}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-accent" : "bg-surface-raised border border-border",
      )}
    >
      <span
        className={cn(
          "inline-block size-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

/**
 * Régler ses notifications (NOTIF-001).
 *
 * L'appareil d'abord — sans push activé ici, les réglages de push ne
 * servent à rien sur ce téléphone —, puis ce que le joueur reçoit, catégorie
 * par catégorie, par push et par e-mail. Séances et paiements ne se coupent
 * pas : l'écran le montre plutôt que de cacher la ligne.
 */
export function NotificationSettingsScreen() {
  const t = useT();
  const utils = trpc.useUtils();
  const query = trpc.players.notificationSettings.useQuery();
  const update = trpc.players.updateNotificationSettings.useMutation();
  const [error, setError] = useState<string | null>(null);

  async function save(change: UpdateNotificationSettingsInput) {
    setError(null);
    try {
      const next = await update.mutateAsync(change);
      utils.players.notificationSettings.setData(undefined, next);
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  return (
    <Screen title={t("notifSettings.title")} back withTabBar={false}>
      <div className="space-y-5">
        <section className="empty:hidden">
          <PushSettings />
        </section>

        <Async query={query}>
          {(data: NotificationSettingsView) => {
            const { settings, emailOptOut } = data;
            return (
              <>
                <section>
                  <SectionTitle>{t("notifSettings.what")}</SectionTitle>
                  <Card className="space-y-1 p-0">
                    <div className="flex items-center gap-3 border-b border-border/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                      <span className="flex-1" />
                      <span className="w-11 text-center">
                        {t("notifSettings.push")}
                      </span>
                      <span className="w-11 text-center">
                        {t("notifSettings.email")}
                      </span>
                    </div>
                    {NOTIFICATION_CATEGORIES.map((category) => {
                      const rule = NOTIFICATION_RULES[category];
                      const labels = CATEGORY_LABELS[category];
                      const title = t(labels.title);
                      return (
                        <div
                          key={category}
                          className="border-b border-border/40 px-4 py-3 last:border-b-0"
                        >
                          <div className="flex items-center gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="flex items-center gap-1.5 text-sm font-medium">
                                {title}
                                {rule.locked && (
                                  <Lock
                                    className="size-3 text-muted"
                                    aria-label={t("notifSettings.locked")}
                                  />
                                )}
                              </p>
                              <p className="mt-0.5 text-xs leading-relaxed text-muted">
                                {t(labels.body)}
                              </p>
                            </div>
                            <Toggle
                              label={`${title} — ${t("notifSettings.push")}`}
                              checked={settings.push[category]}
                              disabled={rule.locked || update.isPending}
                              onChange={(value) =>
                                void save({ push: { [category]: value } })
                              }
                            />
                            {rule.email === null ? (
                              <span className="w-11 text-center text-xs text-muted">
                                —
                              </span>
                            ) : (
                              <Toggle
                                label={`${title} — ${t("notifSettings.email")}`}
                                checked={
                                  settings.email[category] && !emailOptOut
                                }
                                disabled={
                                  rule.locked || emailOptOut || update.isPending
                                }
                                onChange={(value) =>
                                  void save({ email: { [category]: value } })
                                }
                              />
                            )}
                          </div>
                          {category === "reminders" &&
                            settings.push.reminders && (
                              <div className="mt-2 flex items-center gap-2">
                                <label
                                  htmlFor="reminder-hours"
                                  className="text-xs text-muted"
                                >
                                  {t("notifSettings.reminderWhen")}
                                </label>
                                <Select
                                  id="reminder-hours"
                                  value={String(settings.reminderHours)}
                                  disabled={update.isPending}
                                  onChange={(event) =>
                                    void save({
                                      reminderHours: Number(
                                        event.target.value,
                                      ) as (typeof REMINDER_HOURS_CHOICES)[number],
                                    })
                                  }
                                >
                                  {REMINDER_HOURS_CHOICES.map((hours) => (
                                    <option key={hours} value={hours}>
                                      {t("notifSettings.hoursBefore", {
                                        count: hours,
                                      })}
                                    </option>
                                  ))}
                                </Select>
                              </div>
                            )}
                        </div>
                      );
                    })}
                  </Card>
                  <p className="mt-2 text-xs leading-relaxed text-muted">
                    {t("notifSettings.lockedNote")}
                  </p>
                </section>

                <section>
                  <SectionTitle>{t("notifSettings.quietTitle")}</SectionTitle>
                  <Card className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {t("notifSettings.quiet")}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted">
                        {t("notifSettings.quietBody")}
                      </p>
                    </div>
                    <Toggle
                      label={t("notifSettings.quiet")}
                      checked={settings.quietHours}
                      disabled={update.isPending}
                      onChange={(value) => void save({ quietHours: value })}
                    />
                  </Card>
                </section>

                <section>
                  <SectionTitle>{t("notifSettings.emailsTitle")}</SectionTitle>
                  <Card className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {t("notifSettings.emails")}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted">
                        {emailOptOut
                          ? t("notifSettings.emailsOff")
                          : t("notifSettings.emailsBody")}
                      </p>
                    </div>
                    <Toggle
                      label={t("notifSettings.emails")}
                      checked={!emailOptOut}
                      disabled={update.isPending}
                      onChange={(value) => void save({ emails: value })}
                    />
                  </Card>
                </section>
              </>
            );
          }}
        </Async>

        {error && <ErrorBanner message={error} />}
      </div>
    </Screen>
  );
}
