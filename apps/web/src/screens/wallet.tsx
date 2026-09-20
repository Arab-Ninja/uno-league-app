import { useNavigate } from "react-router-dom";
import { ArrowUpRight, CalendarDays, History, ShoppingBag } from "lucide-react";
import { UNO_PER_EUR } from "@uno/shared";
import { trpc } from "@/lib/trpc.js";
import { formatEur } from "@/lib/format.js";
import { useOnline } from "@/lib/use-online.js";
import { Screen } from "@/components/layout/index.js";
import { TransactionRow } from "@/components/domain/index.js";
import { Async } from "@/components/ui/async.js";
import {
  Button,
  Card,
  EmptyState,
  SectionTitle,
} from "@/components/ui/index.js";

/** Portefeuille UNO (CDC §11). */
export function WalletScreen() {
  const navigate = useNavigate();
  const online = useOnline();
  const wallet = trpc.wallet.summary.useQuery();

  return (
    <Screen title="Portefeuille">
      <Async query={wallet} loadingLabel="Chargement du portefeuille...">
        {(data) => (
          <div className="space-y-5">
            <Card className="bg-gradient-to-br from-primary via-primary/70 to-surface py-7 text-center">
              <p className="text-xs font-medium uppercase tracking-wide text-blue-100">
                Solde disponible
              </p>
              <p className="mt-2 text-5xl font-black tabular-nums">
                {data.balance}
              </p>
              <p className="mt-1 text-sm font-medium text-blue-100">UNO</p>
              <p className="mt-2 text-sm text-blue-200/80">
                {formatEur(data.balance)}
              </p>
            </Card>

            {data.balance === 0 && (
              /*
               * À zéro, les deux actions de cet écran — envoyer, acheter —
               * demandent des points, et rien ne disait d'où ils viennent.
               * Pire : le barème en bas de page laissait croire qu'on peut en
               * acheter. On ne peut pas. Une place se paie par carte, et les
               * points se gagnent en jouant.
               */
              <Card className="border-accent/30 bg-accent/5">
                <p className="text-sm font-semibold">
                  Vous n'avez pas encore de points
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Les points UNO ne s'achètent pas : ils se gagnent en jouant,
                  et davantage à qui marque, passe ou défend. Pour votre
                  première séance,{" "}
                  <strong className="text-ink">
                    réglez votre place par carte ou Bancontact
                  </strong>{" "}
                  — le paiement en points n'est qu'une autre façon de faire.
                </p>
                <Button
                  className="mt-3 w-full"
                  variant="accent"
                  icon={<CalendarDays className="size-4" aria-hidden />}
                  onClick={() => navigate("/calendrier")}
                >
                  Voir les séances ouvertes
                </Button>
              </Card>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Button
                variant={data.balance === 0 ? "secondary" : "accent"}
                icon={<ArrowUpRight className="size-4" aria-hidden />}
                // WAL-001 : le débit est impossible sans solde et hors ligne.
                disabled={!online || data.balance === 0}
                onClick={() => navigate("/wallet/envoyer")}
              >
                Envoyer
              </Button>
              <Button
                variant="secondary"
                icon={<ShoppingBag className="size-4" aria-hidden />}
                onClick={() => navigate("/boutique")}
              >
                Boutique
              </Button>
            </div>

            <section>
              <SectionTitle
                action={
                  <button
                    type="button"
                    onClick={() => navigate("/wallet/transactions")}
                    className="flex items-center gap-1 text-xs font-medium text-accent"
                  >
                    <History className="size-3.5" aria-hidden />
                    Tout l'historique
                  </button>
                }
              >
                Dernières transactions
              </SectionTitle>

              {data.transactions.length === 0 ? (
                <EmptyState
                  title="Aucune transaction"
                  description="Vos mouvements de points apparaîtront ici."
                />
              ) : (
                <Card className="py-0">
                  {data.transactions.map((transaction) => (
                    <TransactionRow
                      key={transaction.id}
                      transaction={transaction}
                    />
                  ))}
                </Card>
              )}
            </section>

            <p className="text-center text-[11px] text-muted">
              Barème : {UNO_PER_EUR} UNO = 1,00 €. Les points ne s'achètent pas.
            </p>
          </div>
        )}
      </Async>
    </Screen>
  );
}
