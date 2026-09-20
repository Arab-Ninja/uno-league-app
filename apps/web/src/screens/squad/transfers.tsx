import { useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowRightLeft, Coins, HandCoins } from "lucide-react";
import {
  minimumCounterFee,
  transferCounterOffersLeft,
  type PublicPlayer,
  type SquadTransferTarget,
  type SquadTransferView,
} from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { tapFeedback } from "@/lib/native.js";
import { useLibelles, useT } from "@/lib/i18n.js";
import { Screen } from "@/components/layout/index.js";
import { PlayerChip } from "@/components/fut-card/player-chip.js";
import { PlayerCardDialog } from "@/components/fut-card/player-card-dialog.js";
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
  const t = useT();
  const { squadId } = useParams<{ squadId: string }>();
  const id = Number(squadId);
  const utils = trpc.useUtils();

  const market = trpc.squads.market.useQuery({ limit: 30 });
  const transfers = trpc.squads.transfers.useQuery({ squadId: id, limit: 30 });
  const mine = trpc.squads.mine.useQuery();

  const [failure, setFailure] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState<PublicPlayer | null>(null);

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
    <Screen title={t("club.transfersTitle")} back backTo="/squad">
      <div className="space-y-5">
        {failure && <ErrorBanner message={failure} />}

        <section>
          <SectionTitle>{t("club.market")}</SectionTitle>
          <Async query={market}>
            {(list) =>
              list.length === 0 ? (
                <EmptyState
                  icon={<ArrowRightLeft className="size-6" aria-hidden />}
                  title={t("club.marketEmpty")}
                  description={t("club.marketEmptyBody")}
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
                      onOpen={setZoomed}
                    />
                  ))}
                </div>
              )
            }
          </Async>
        </section>

        <section>
          <SectionTitle>{t("club.deals")}</SectionTitle>
          <Async query={transfers}>
            {(list) =>
              list.length === 0 ? (
                <EmptyState
                  icon={<HandCoins className="size-6" aria-hidden />}
                  title={t("club.dealsEmpty")}
                  description={t("club.dealsEmptyBody")}
                />
              ) : (
                <div className="space-y-2">
                  {list.map((transfer) => (
                    <TransferCard
                      key={transfer.id}
                      transfer={transfer}
                      isFounder={isFounder}
                      onAct={run}
                      onOpen={setZoomed}
                    />
                  ))}
                </div>
              )
            }
          </Async>
        </section>

        {zoomed && (
          <PlayerCardDialog player={zoomed} onClose={() => setZoomed(null)} />
        )}
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
  onOpen,
}: {
  entry: SquadTransferTarget;
  squadId: number;
  mayOffer: boolean;
  onOffer: (action: () => Promise<unknown>) => Promise<void>;
  onOpen: (player: PublicPlayer) => void;
}) {
  const t = useT();
  const open = trpc.squads.openTransfer.useMutation();
  const [showing, setShowing] = useState(false);
  const [fee, setFee] = useState("0");
  const [bonus, setBonus] = useState("0");

  if (!entry.player) return null;
  const player = entry.player;

  return (
    <Card className="space-y-3">
      <PlayerChip
        player={player}
        onOpen={onOpen}
        subtitle={entry.squadName}
        trailing={
          mayOffer && !showing ? (
            <Button variant="secondary" onClick={() => setShowing(true)}>
              {t("club.offer")}
            </Button>
          ) : undefined
        }
      />

      {showing && (
        <div className="space-y-2 border-t border-border/40 pt-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("club.fee")} htmlFor={`fee-${player.id}`}>
              <Input
                id={`fee-${player.id}`}
                type="number"
                inputMode="numeric"
                min={0}
                value={fee}
                onChange={(event) =>
                  setFee(event.target.value.replace(/\D/g, ""))
                }
              />
            </Field>
            <Field label={t("club.playerBonus")} htmlFor={`bonus-${player.id}`}>
              <Input
                id={`bonus-${player.id}`}
                type="number"
                inputMode="numeric"
                min={0}
                value={bonus}
                onChange={(event) =>
                  setBonus(event.target.value.replace(/\D/g, ""))
                }
              />
            </Field>
          </div>
          <p className="text-xs text-muted">
            {t("club.escrowNote", {
              amount: (Number(fee) || 0) + (Number(bonus) || 0),
            })}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setShowing(false)}
            >
              {t("common.cancel")}
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
              {t("club.sendOffer")}
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
  onOpen,
}: {
  transfer: SquadTransferView;
  isFounder: boolean;
  onAct: (action: () => Promise<unknown>) => Promise<void>;
  onOpen: (player: PublicPlayer) => void;
}) {
  const t = useT();
  const L = useLibelles();
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
      {transfer.target.player ? (
        <PlayerChip
          player={transfer.target.player}
          onOpen={onOpen}
          subtitle={`${transfer.from?.name ?? "?"} → ${transfer.to?.name ?? "?"}`}
          trailing={
            <Badge
              tone={transfer.status === "accepted" ? "success" : "neutral"}
            >
              {L.transferStatus[transfer.status]}
            </Badge>
          }
        />
      ) : (
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold">{t("club.player")}</p>
          <Badge tone="neutral">{L.transferStatus[transfer.status]}</Badge>
        </div>
      )}

      <div className="space-y-1 border-t border-border/40 pt-2 text-sm">
        <Row label={t("club.feeToClub")} value={`${transfer.feeUno} UNO`} />
        <Row
          label={t("club.playerBonus")}
          value={`${transfer.signingBonusUno} UNO`}
        />
        <Row label={t("club.totalCost")} value={`${transfer.totalUno} UNO`} />
      </div>

      {/* Le club vendeur tranche : accepter met l'argent en séquestre et
          passe la main au joueur. */}
      {decidable &&
        transfer.viewer.isSelling &&
        (bargaining ? (
          <div className="space-y-2">
            <Field
              label={t("club.newFee")}
              htmlFor={`counter-${transfer.id}`}
              hint={t("club.counterHint", { minimum, left })}
            >
              <Input
                id={`counter-${transfer.id}`}
                type="number"
                inputMode="numeric"
                min={minimum}
                value={fee}
                onChange={(event) =>
                  setFee(event.target.value.replace(/\D/g, ""))
                }
              />
            </Field>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setBargaining(false)}
              >
                {t("common.cancel")}
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
                {t("club.counter")}
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
              {t("club.sell")}
            </Button>
            {left > 0 && (
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setBargaining(true)}
              >
                {t("club.counter")}
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
              {t("club.refuse")}
            </Button>
          </div>
        ))}

      {decidable && transfer.viewer.isBuying && isFounder && (
        <Button
          variant="secondary"
          fullWidth
          loading={cancel.isPending}
          onClick={() =>
            void onAct(() => cancel.mutateAsync({ transferId: transfer.id }))
          }
        >
          {t("club.withdrawOffer")}
        </Button>
      )}

      {transfer.status === "awaiting_player" && (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Coins className="size-3.5" aria-hidden />
          {t("club.playerDecides")}
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
