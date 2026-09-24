import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc.js";
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

/** Tableau de bord base de données (CDC §15). */
export function AdminOverview() {
  const t = useT();
  const libelle = (table: string): string => {
    const cle = LABELS[table];
    return cle ? t(cle) : table;
  };
  const stats = trpc.admin.stats.useQuery();

  return (
    <Async query={stats}>
      {(data) => (
        <div className="space-y-5">
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

          {/*
            Les arbitres ne sont pas une table : ce sont des lignes de
            `players` parmi d'autres, et le total de joueurs les noyait.
            Savoir combien on en a est pourtant ce qui dit si les sessions à
            venir pourront être dirigées (ADMIN-009).
          */}
          <section>
            <SectionTitle>{t("admin.overview.accounts")}</SectionTitle>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-border/60 bg-surface px-2 py-3 text-center">
                <p className="text-xl font-bold tabular-nums">
                  {data.roles.referees}
                </p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {t("admin.overview.referees")}
                </p>
              </div>
            </div>
          </section>

          <section>
            <SectionTitle>{t("admin.overview.database")}</SectionTitle>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(data.counts).map(([key, value]) => (
                <div
                  key={key}
                  className="rounded-xl border border-border/60 bg-surface px-2 py-3 text-center"
                >
                  <p className="text-xl font-bold tabular-nums">{value}</p>
                  <p className="mt-0.5 text-[10px] uppercase leading-tight tracking-wide text-muted">
                    {libelle(key)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </Async>
  );
}
