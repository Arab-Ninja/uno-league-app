import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc.js";
import { Async } from "@/components/ui/async.js";
import { Card, SectionTitle } from "@/components/ui/index.js";

const LABELS: Record<string, string> = {
  users: "Comptes",
  players: "Joueurs",
  proposals: "Propositions",
  proposalParticipants: "Participations",
  transactions: "Transactions",
  teams: "Équipes",
  matches: "Matchs",
  shopItems: "Produits",
  orders: "Commandes",
};

/** Tableau de bord base de données (CDC §15). */
export function AdminOverview() {
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
                <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />
              ) : (
                <AlertTriangle className="size-5 shrink-0 text-red-300" aria-hidden />
              )}
              <div>
                <p className="text-sm font-semibold">
                  {data.inconsistentBalances === 0
                    ? "Registre financier cohérent"
                    : `${data.inconsistentBalances} solde(s) incohérent(s)`}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  Chaque solde joueur doit égaler la somme de ses transactions.
                </p>
              </div>
            </div>
          </Card>

          <section>
            <SectionTitle>Contenu de la base</SectionTitle>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(data.counts).map(([key, value]) => (
                <div
                  key={key}
                  className="rounded-xl border border-border/60 bg-surface px-2 py-3 text-center"
                >
                  <p className="text-xl font-bold tabular-nums">{value}</p>
                  <p className="mt-0.5 text-[10px] uppercase leading-tight tracking-wide text-muted">
                    {LABELS[key] ?? key}
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
