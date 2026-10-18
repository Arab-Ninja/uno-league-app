import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc.js";
import { bcp47 } from "@/lib/format.js";
import { Async } from "@/components/ui/async.js";
import { Card, SectionTitle } from "@/components/ui/index.js";
import { useT, type Cle } from "@/lib/i18n.js";

/** Les tables comptées, et le libellé de chacune. */
const LABELS: Record<string, Cle> = {
  users: "admin.overview.count.users",
  players: "admin.overview.count.players",
  proposals: "admin.overview.count.proposals",
  proposalParticipants: "admin.overview.count.proposalParticipants",
  transactions: "admin.overview.count.transactions",
  teams: "admin.overview.count.teams",
  matches: "admin.overview.count.matches",
  shopItems: "admin.overview.count.shopItems",
  orders: "admin.overview.count.orders",
};

/** Une tuile : un chiffre, ce qu'il compte, et un détail facultatif. */
function Kpi({
  value,
  label,
  hint,
  tone,
}: {
  value: string | number;
  label: string;
  hint?: string | undefined;
  tone?: "warning" | "success" | undefined;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface px-2 py-3 text-center">
      <p
        className={
          tone === "warning"
            ? "text-xl font-bold tabular-nums text-warning"
            : tone === "success"
              ? "text-xl font-bold tabular-nums text-success"
              : "text-xl font-bold tabular-nums"
        }
      >
        {value}
      </p>
      <p className="mt-0.5 text-[11px] leading-tight text-muted">{label}</p>
      {hint && <p className="mt-0.5 text-[10px] text-muted/80">{hint}</p>}
    </div>
  );
}

/**
 * Tableau de bord de l'administration (ADMIN-015).
 *
 * Ce qui se regarde chaque jour, d'abord : les séances à chaque étape, les
 * joueurs qui viennent, ceux qu'on peut joindre, l'argent du mois. Le
 * contrôle du registre reste en tête — il ne doit jamais passer inaperçu —,
 * et le compte des tables descend en bas, replié : il sert à vérifier une
 * base, pas à piloter une ligue.
 */
export function AdminOverview() {
  const t = useT();
  const libelle = (table: string): string => {
    const cle = LABELS[table];
    return cle ? t(cle) : table;
  };
  const stats = trpc.admin.stats.useQuery();
  const kpis = trpc.admin.kpis.useQuery();
  const euros = (cents: number) =>
    new Intl.NumberFormat(bcp47(), {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(cents / 100);

  return (
    <div className="space-y-5">
      <Async query={kpis}>
        {(k) => (
          <>
            <section>
              <SectionTitle>{t("admin.overview.sessionsTitle")}</SectionTitle>
              <div className="grid grid-cols-3 gap-2">
                <Kpi
                  value={k.sessions.open}
                  label={t("admin.overview.open")}
                  hint={
                    k.sessions.fillRate === null
                      ? undefined
                      : t("admin.overview.fillRate", {
                          rate: Math.round(k.sessions.fillRate * 100),
                        })
                  }
                />
                <Kpi
                  value={k.sessions.reservations}
                  label={t("admin.overview.reservations")}
                />
                <Kpi
                  value={k.sessions.confirmed}
                  label={t("admin.overview.confirmed")}
                  tone={k.sessions.confirmed > 0 ? "success" : undefined}
                />
                <Kpi
                  value={k.sessions.toEnter}
                  label={t("admin.overview.toEnter")}
                  tone={k.sessions.toEnter > 0 ? "warning" : undefined}
                />
                <Kpi
                  value={k.sessions.playedThisMonth}
                  label={t("admin.overview.playedMonth")}
                  hint={t("admin.overview.playedTotal", {
                    count: k.sessions.playedTotal,
                  })}
                />
                <Kpi
                  value={k.sessions.cancelled30d}
                  label={t("admin.overview.cancelled30d")}
                />
              </div>
              <p className="mt-2 text-xs text-muted">
                {t("admin.overview.upcomingSignups", {
                  count: k.sessions.upcomingSignups,
                })}
              </p>
            </section>

            <section>
              <SectionTitle>{t("admin.overview.playersTitle")}</SectionTitle>
              <div className="grid grid-cols-3 gap-2">
                <Kpi
                  value={k.players.total}
                  label={t("admin.overview.playersTotal")}
                  hint={t("admin.overview.new7d", { count: k.players.new7d })}
                />
                <Kpi
                  value={k.players.active30d}
                  label={t("admin.overview.active30d")}
                />
                <Kpi
                  value={k.players.referees}
                  label={t("admin.overview.referees")}
                />
              </div>
            </section>

            <section>
              <SectionTitle>{t("admin.overview.reachTitle")}</SectionTitle>
              <div className="grid grid-cols-2 gap-2">
                <Kpi
                  value={k.reach.pushEnabled}
                  label={t("admin.overview.pushEnabled")}
                  hint={
                    k.players.total + k.players.referees > 0
                      ? t("admin.overview.ofPlayers", {
                          rate: Math.round(
                            (k.reach.pushEnabled /
                              (k.players.total + k.players.referees)) *
                              100,
                          ),
                        })
                      : undefined
                  }
                />
                <Kpi
                  value={k.reach.emailOptOut}
                  label={t("admin.overview.emailOptOut")}
                />
              </div>
            </section>

            <section>
              <SectionTitle>{t("admin.overview.paymentsTitle")}</SectionTitle>
              <div className="grid grid-cols-3 gap-2">
                <Kpi
                  value={k.payments.paidThisMonth}
                  label={t("admin.overview.paidMonth")}
                />
                <Kpi
                  value={euros(k.payments.eurThisMonthCents)}
                  label={t("admin.overview.eurMonth")}
                />
                <Kpi
                  value={k.payments.overdue}
                  label={t("admin.overview.overdue")}
                  tone={k.payments.overdue > 0 ? "warning" : undefined}
                />
              </div>
            </section>
          </>
        )}
      </Async>

      <Async query={stats}>
        {(data) => (
          <>
            {/* Contrôle de cohérence du registre financier (WAL-006) */}
            <Card
              className={
                data.inconsistentBalances === 0
                  ? "border-success/40 bg-success/5"
                  : "border-error/40 bg-error/5"
              }
            >
              <div className="flex items-center gap-3">
                {data.inconsistentBalances === 0 ? (
                  <CheckCircle2
                    className="size-5 shrink-0 text-success"
                    aria-hidden
                  />
                ) : (
                  <AlertTriangle
                    className="size-5 shrink-0 text-red-300"
                    aria-hidden
                  />
                )}
                <div>
                  <p className="text-sm font-semibold">
                    {data.inconsistentBalances === 0
                      ? t("admin.overview.ledgerOk")
                      : t("admin.overview.ledgerBad", {
                          count: data.inconsistentBalances,
                        })}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {t("admin.overview.ledgerRule")}
                  </p>
                </div>
              </div>
            </Card>

            <details className="rounded-xl border border-border/60 bg-surface px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium text-muted">
                {t("admin.overview.database")}
              </summary>
              <div className="mt-3 grid grid-cols-3 gap-2 pb-1">
                {Object.entries(data.counts).map(([key, value]) => (
                  <div
                    key={key}
                    className="rounded-xl border border-border/60 bg-surface-raised px-2 py-3 text-center"
                  >
                    <p className="text-lg font-bold tabular-nums">{value}</p>
                    <p className="mt-0.5 text-[10px] uppercase leading-tight tracking-wide text-muted">
                      {libelle(key)}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          </>
        )}
      </Async>
    </div>
  );
}
