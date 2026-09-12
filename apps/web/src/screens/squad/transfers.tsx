import { useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowRightLeft, Coins, HandCoins } from "lucide-react";
import {
  minimumCounterFee,
  transferCounterOffersLeft,
  type SquadTransferView,
} from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { tapFeedback } from "@/lib/native.js";
import { Screen } from "@/components/layout/index.js";
import { Avatar } from "@/components/domain/index.js";
import { Async } from "@/components/ui/async.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  SectionTitle,
} from "@/components/ui/index.js";

const STATUS_LABELS: Record<SquadTransferView["status"], string> = {
  pending: "Au club vendeur",
  awaiting_player: "Au joueur",
  accepted: "Conclu",
  rejected: "Refusé",
  cancelled: "Retiré",
  expired: "Expiré",
};

/**
 * Marché des transferts (SQUAD-008).
 *
 * Deux listes sur un même écran : les joueurs qu'on peut vouloir, et les
 * dossiers en cours. Elles se lisent ensemble — une offre naît de la première
 * et vit dans la seconde.
 *
 * Les boutons affichés dépendent du rôle, mais **le serveur refuse quoi
 * qu'affiche cet écran**, et dans la même transaction que l'écriture.
 */
export function SquadTransfersScreen() {
  const { squadId } = useParams<{ squadId: string }>();
  const id = Number(squadId);
  const utils = trpc.useUtils();

  const market = trpc.squads.market.useQuery({ limit: 30 });
  const transfers = trpc.squads.transfers.useQuery({ squadId: id, limit: 30 });
  const mine = trpc.squads.mine.useQuery();

  const [failure, setFailure] = useState<string | null>(null);

  async function refresh() {
    await utils.squads.market.invalidate();
    await utils.squads.transfers.invalidate({ squadId: id });
    await utils.squads.mine.invalidate();
    await utils.squads.myOffers.invalidate();
  }

  async function run(action: () => Promise<unknown>) {
    void tapFeedback();
    setFailure(null);
    try {
      await action();
      await refresh();
    } catch (caught) {
      setFailure(describeError(caught).message);
    }
  }

  const isFounder = mine.data?.squad?.viewer.role === "founder";

  return (
    <Screen title="Transferts" back backTo="/squad">
      <div className="space-y-5">
        {failure && <ErrorBanner message={failure} />}

        <section>
          <SectionTitle>Joueurs sur le marché</SectionTitle>
          <Async query={market}>
            {(list) =>
              list.length === 0 ? (
                <EmptyState
                  icon={<ArrowRightLeft className="size-6" aria-hidden />}
                  title="Personne sur le marché"
                  description="Les clubs n'ont affiché aucun joueur comme cessible."
                />
              ) : (
                <div className="space-y-2">
                  {list.map((entry) => (
                    <MarketRow
                      key={entry.player?.id ?? entry.squadId}
                      entry={entry}
                      squadId={id}
                      mayOffer={isFounder}
                      onOffer={run}
                    />
                  ))}
                </div>
              )
            }
          </Async>
        </section>

        <section>
          <SectionTitle>Dossiers en cours</SectionTitle>
          <Async query={transfers}>
            {(list) =>
              list.length === 0 ? (
                <EmptyState
                  icon={<HandCoins className="size-6" aria-hidden />}
                  title="Aucun dossier"
                  description="Faites une offre pour un joueur, ou attendez qu'on vous en fasse une."
                />
              ) : (
                <div className="space-y-2">
                  {list.map((transfer) => (
                    <TransferCard
                      key={transfer.id}
                      transfer={transfer}
                      isFounder={isFounder}
                      onAct={run}
                    />
                  ))}
                </div>
              )
            }
          </Async>
        </section>
      </div>
    </Screen>
  );
}

/** Un joueur cessible, et le formulaire d'offre replié dessous. */
function MarketRow({
  entry,
  squadId,
  mayOffer,
  onOffer,
}: {
  entry: { player: { id: number; displayName: string; profilePhotoUrl: string | null } | null; squadName: string };
  squadId: number;
  mayOffer: boolean;
  onOffer: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const open = trpc.squads.openTransfer.useMutation();
  const [showing, setShowing] = useState(false);
  const [fee, setFee] = useState("0");
  const [bonus, setBonus] = useState("0");

  if (!entry.player) return null;
  const player = entry.player;

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <Avatar name={player.displayName} url={player.profilePhotoUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{player.displayName}</p>
          <p className="truncate text-xs text-muted">{entry.squadName}</p>
        </div>
        {mayOffer && !showing && (
          <Button variant="secondary" onClick={() => setShowing(true)}>
            Offrir
          </Button>
        )}
      </div>

      {showing && (
        <div className="space-y-2 border-t border-border/40 pt-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Indemnité" htmlFor={`fee-${player.id}`}>
              <Input
                id={`fee-${player.id}`}
                type="number"
                inputMode="numeric"
                min={0}
                value={fee}
                onChange={(event) => setFee(event.target.value.replace(/\D/g, ""))}
              />
            </Field>
            <Field label="Prime au joueur" htmlFor={`bonus-${player.id}`}>
              <Input
                id={`bonus-${player.id}`}
                type="number"
                inputMode="numeric"
                min={0}
                value={bonus}
                onChange={(event) => setBonus(event.target.value.replace(/\D/g, ""))}
              />
            </Field>
          </div>
          <p className="text-xs text-muted">
            Votre caisse engagera {(Number(fee) || 0) + (Number(bonus) || 0)} UNO
            au total, à l'instant où le club vendeur accepte.
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setShowing(false)}
            >
              Annuler
            </Button>
            <Button
              variant="accent"
              className="flex-1"
              loading={open.isPending}
              onClick={() =>
                void onOffer(async () => {
                  await open.mutateAsync({
                    squadId,
                    playerId: player.id,
                    feeUno: Number(fee) || 0,
                    signingBonusUno: Number(bonus) || 0,
                  });
                  setShowing(false);
                })
              }
            >
              Envoyer l'offre
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/** Un dossier, avec les seules actions que ce club peut encore prendre. */
function TransferCard({
  transfer,
  isFounder,
  onAct,
}: {
  transfer: SquadTransferView;
  isFounder: boolean;
  onAct: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const respondSelling = trpc.squads.respondSelling.useMutation();
  const counter = trpc.squads.counterTransfer.useMutation();
  const cancel = trpc.squads.cancelTransfer.useMutation();

  const [bargaining, setBargaining] = useState(false);
  const [fee, setFee] = useState("");

  const minimum = minimumCounterFee(transfer.feeUno);
  const left = transferCounterOffersLeft(transfer.negotiationRound);
  const decidable = transfer.status === "pending";

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {transfer.target.player?.displayName ?? "Joueur"}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted">
            {transfer.from?.name ?? "?"} → {transfer.to?.name ?? "?"}
          </p>
        </div>
        <Badge tone={transfer.status === "accepted" ? "success" : "neutral"}>
          {STATUS_LABELS[transfer.status]}
        </Badge>
      </div>

      <div className="space-y-1 border-t border-border/40 pt-2 text-sm">
        <Row label="Indemnité au club" value={`${transfer.feeUno} UNO`} />
        <Row label="Prime au joueur" value={`${transfer.signingBonusUno} UNO`} />
        <Row label="Coût total" value={`${transfer.totalUno} UNO`} />
      </div>

      {/* Le club vendeur tranche : accepter met l'argent en séquestre et
          passe la main au joueur. */}
      {decidable && transfer.viewer.isSelling && (
        bargaining ? (
          <div className="space-y-2">
            <Field
              label="Nouvelle indemnité"
              htmlFor={`counter-${transfer.id}`}
              hint={`Une contre-offre monte l'indemnité : au moins ${minimum} UNO. Il reste ${left} contre-offre(s).`}
            >
              <Input
                id={`counter-${transfer.id}`}
                type="number"
                inputMode="numeric"
                min={minimum}
                value={fee}
                onChange={(event) => setFee(event.target.value.replace(/\D/g, ""))}
              />
            </Field>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setBargaining(false)}
              >
                Annuler
              </Button>
              <Button
                variant="accent"
                className="flex-1"
                loading={counter.isPending}
                disabled={Number(fee) < minimum}
                onClick={() =>
                  void onAct(async () => {
                    await counter.mutateAsync({
                      transferId: transfer.id,
                      feeUno: Number(fee),
                    });
                    setBargaining(false);
                    setFee("");
                  })
                }
              >
                Contre-offrir
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="accent"
              className="flex-1"
              loading={respondSelling.isPending}
              onClick={() =>
                void onAct(() =>
                  respondSelling.mutateAsync({
                    transferId: transfer.id,
                    accept: true,
                  }),
                )
              }
            >
              Céder
            </Button>
            {left > 0 && (
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setBargaining(true)}
              >
                Contre-offrir
              </Button>
            )}
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() =>
                void onAct(() =>
                  respondSelling.mutateAsync({
                    transferId: transfer.id,
                    accept: false,
                  }),
                )
              }
            >
              Refuser
            </Button>
          </div>
        )
      )}

      {decidable && transfer.viewer.isBuying && isFounder && (
        <Button
          variant="secondary"
          fullWidth
          loading={cancel.isPending}
          onClick={() =>
            void onAct(() => cancel.mutateAsync({ transferId: transfer.id }))
          }
        >
          Retirer l'offre
        </Button>
      )}

      {transfer.status === "awaiting_player" && (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Coins className="size-3.5" aria-hidden />
          Les montants sont engagés. Le joueur a le dernier mot.
        </p>
      )}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium tabular-nums">{value}</span>
    </div>
  );
}
