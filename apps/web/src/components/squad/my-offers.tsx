import { useState } from "react";
import { HandCoins } from "lucide-react";
import { describeError, trpc } from "@/lib/trpc.js";
import { tapFeedback } from "@/lib/native.js";
import { Button, Card, ErrorBanner, SectionTitle } from "@/components/ui/index.js";

/**
 * Les offres qui attendent la décision du joueur connecté (SQUAD-008).
 *
 * **C'est le troisième accord**, celui sans lequel rien ne se conclut. Il a sa
 * place en haut de l'écran SQUAD plutôt que dans un onglet : une offre a un
 * délai, et une décision qu'on ne voit pas est une décision qu'on ne prend
 * pas.
 *
 * Les montants affichés sont ceux qui ont été séquestrés : le joueur tranche
 * en connaissant la somme exacte, pas une intention.
 */
export function MySquadOffers() {
  const utils = trpc.useUtils();
  const offers = trpc.squads.myOffers.useQuery();
  const respond = trpc.squads.respondTransfer.useMutation();
  const [failure, setFailure] = useState<string | null>(null);

  async function decide(transferId: number, accept: boolean) {
    void tapFeedback();
    setFailure(null);
    try {
      await respond.mutateAsync({ transferId, accept });
      await utils.squads.myOffers.invalidate();
      await utils.squads.mine.invalidate();
      await utils.wallet.invalidate();
    } catch (caught) {
      setFailure(describeError(caught).message);
    }
  }

  const list = offers.data ?? [];
  if (list.length === 0) return null;

  return (
    <section className="space-y-2">
      <SectionTitle>On vous veut</SectionTitle>
      {failure && <ErrorBanner message={failure} />}
      {list.map((offer) => (
        <Card key={offer.id} className="space-y-3">
          <div>
            <p className="text-sm font-semibold">
              {offer.to?.name ?? "Un SQUAD"} vous propose de le rejoindre
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {offer.from?.name ?? "Votre club"} a donné son accord. La décision
              vous revient.
            </p>
          </div>

          <div className="space-y-1 border-t border-border/40 pt-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-muted">
                <HandCoins className="size-3.5" aria-hidden />
                Prime de signature
              </span>
              <span className="font-semibold tabular-nums text-accent">
                {offer.signingBonusUno} UNO
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">Indemnité à votre club</span>
              <span className="font-medium tabular-nums">{offer.feeUno} UNO</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              loading={respond.isPending}
              onClick={() => void decide(offer.id, false)}
            >
              Refuser
            </Button>
            <Button
              variant="accent"
              className="flex-1"
              loading={respond.isPending}
              onClick={() => void decide(offer.id, true)}
            >
              Signer
            </Button>
          </div>
        </Card>
      ))}
    </section>
  );
}
