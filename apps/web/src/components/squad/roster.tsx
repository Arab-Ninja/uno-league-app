import { useState } from "react";
import { Coins, Shirt, UserMinus, UserPlus, Wallet } from "lucide-react";
import {
  SQUAD_ROSTER_SIZE,
  type PublicPlayer,
  type SquadDetailView,
  type SquadRosterView,
  type SquadSeatView,
} from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { cn } from "@/lib/cn.js";
import { useT } from "@/lib/i18n.js";
import { tapFeedback } from "@/lib/native.js";
import { PlayerChip } from "@/components/fut-card/player-chip.js";
import { PlayerCardDialog } from "@/components/fut-card/player-card-dialog.js";
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  SectionTitle,
  Select,
} from "@/components/ui/index.js";

/**
 * Composition et places d'un défi (SQUAD-006).
 *
 * Les deux feuilles sont visibles des deux camps — savoir qui l'on affronte
 * fait partie du défi. Les boutons, eux, ne s'affichent que pour son propre
 * club, et **le serveur refuse quoi qu'affiche cet écran** : ce qui est caché
 * ici reste interdit là-bas.
 */
export function SquadRosterPanel({
  challengeId,
  rosters,
  mySquad,
}: {
  challengeId: number;
  rosters: SquadRosterView[];
  /** Le club du joueur connecté, pour proposer ses membres à l'inscription. */
  mySquad: SquadDetailView | null;
}) {
  const utils = trpc.useUtils();
  const [failure, setFailure] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState<PublicPlayer | null>(null);

  /*
   * Le cinq type du club, s'il en a un (CLUB-002). Il sert ici à n'offrir le
   * raccourci que lorsqu'il a quelque chose à poser : un bouton qui répond
   * « vous n'avez pas de cinq type » est une porte peinte sur un mur.
   */
  const lineup = trpc.squads.lineup.useQuery(
    { squadId: mySquad?.id ?? 0 },
    { enabled: mySquad !== null },
  );

  const addSeat = trpc.squads.addSeat.useMutation();
  const fillFromLineup = trpc.squads.fillSeatsFromLineup.useMutation();
  const removeSeat = trpc.squads.removeSeat.useMutation();
  const paySeat = trpc.squads.paySeat.useMutation();
  const coverSeats = trpc.squads.coverSeats.useMutation();

  async function run(action: () => Promise<unknown>) {
    void tapFeedback();
    setFailure(null);
    try {
      await action();
      await utils.squads.challenge.invalidate({ challengeId });
      await utils.squads.roster.invalidate({ challengeId });
      // Une place réglée bouge un portefeuille ou une caisse : les deux
      // affichages doivent suivre, sans quoi le joueur doute du paiement.
      await utils.squads.mine.invalidate();
      await utils.wallet.invalidate();
    } catch (caught) {
      setFailure(describeError(caught).message);
    }
  }

  if (rosters.length === 0) return null;

  return (
    <section className="space-y-2">
      <SectionTitle>Composition</SectionTitle>
      {failure && <ErrorBanner message={failure} />}

      {rosters.map((roster) => (
        <RosterCard
          key={roster.squad?.id ?? Math.random()}
          roster={roster}
          mySquad={mySquad}
          busy={
            addSeat.isPending ||
            fillFromLineup.isPending ||
            removeSeat.isPending ||
            paySeat.isPending ||
            coverSeats.isPending
          }
          lineupSize={lineup.data?.assignments.length ?? 0}
          onAdd={(playerId) =>
            void run(() => addSeat.mutateAsync({ challengeId, playerId }))
          }
          onFillFromLineup={() =>
            void run(() => fillFromLineup.mutateAsync({ challengeId }))
          }
          onRemove={(playerId) =>
            void run(() => removeSeat.mutateAsync({ challengeId, playerId }))
          }
          onPay={() => void run(() => paySeat.mutateAsync({ challengeId }))}
          onCover={(playerIds) =>
            void run(() => coverSeats.mutateAsync({ challengeId, playerIds }))
          }
          onOpen={setZoomed}
        />
      ))}

      {zoomed && (
        <PlayerCardDialog player={zoomed} onClose={() => setZoomed(null)} />
      )}
    </section>
  );
}

function RosterCard({
  roster,
  mySquad,
  busy,
  lineupSize,
  onAdd,
  onFillFromLineup,
  onRemove,
  onPay,
  onCover,
  onOpen,
}: {
  roster: SquadRosterView;
  mySquad: SquadDetailView | null;
  busy: boolean;
  /** Combien d'emplacements le club a composés sur son terrain (CLUB-002). */
  lineupSize: number;
  onAdd: (playerId: number) => void;
  onFillFromLineup: () => void;
  onRemove: (playerId: number) => void;
  onPay: () => void;
  onCover: (playerIds: number[]) => void;
  onOpen: (player: PublicPlayer) => void;
}) {
  const t = useT();
  const [choice, setChoice] = useState("");

  const seated = new Set(roster.seats.map((seat) => seat.player.id));
  const isMine = mySquad !== null && mySquad.id === roster.squad?.id;

  // Les membres encore disponibles : l'écran ne propose pas d'inscrire deux
  // fois le même joueur.
  const available =
    isMine && roster.viewer.mayCompose
      ? mySquad.members.filter((member) => !seated.has(member.player.id))
      : [];

  // Le serveur désigne lui-même la place du spectateur : la retrouver ici
  // en comparant des identifiants risquerait de diverger de sa règle.
  const mySeat = roster.seats.find(
    (seat) => seat.id === roster.viewer.mySeatId,
  );
  const unpaid = roster.seats.filter((seat) => seat.status !== "paid");

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">
          {roster.squad?.name ?? "?"}
        </p>
        <Badge tone={roster.openSlots === 0 ? "success" : "neutral"}>
          {roster.seats.length}/{SQUAD_ROSTER_SIZE}
        </Badge>
      </div>

      {roster.seats.length === 0 ? (
        <p className="text-xs text-muted">{t("club.noSeats")}</p>
      ) : (
        <ul className="space-y-1.5">
          {roster.seats.map((seat) => (
            <SeatRow
              key={seat.id}
              seat={seat}
              mayRemove={roster.viewer.mayCompose && !busy}
              onRemove={() => onRemove(seat.player.id)}
              onOpen={onOpen}
            />
          ))}
        </ul>
      )}

      {roster.dueUno > 0 && (
        <p className="border-t border-border/40 pt-2 text-xs text-muted">
          {t("club.stillDue")}{" "}
          <span className="font-semibold tabular-nums">
            {roster.dueUno} UNO
          </span>
        </p>
      )}

      {/*
        Le cinq type d'abord, l'ajout un par un ensuite : c'est l'ordre dans
        lequel on compose. Un club qui a posé son terrain retrouve ses cinq
        noms d'un geste, puis corrige à la main ce qui doit l'être.
      */}
      {isMine &&
        roster.viewer.mayCompose &&
        roster.openSlots > 0 &&
        lineupSize > 0 && (
          <Button
            variant="secondary"
            fullWidth
            disabled={busy}
            onClick={onFillFromLineup}
          >
            <Shirt className="size-4" aria-hidden />
            {t("club.alignBestFive")}
          </Button>
        )}

      {available.length > 0 && (
        <div className="flex gap-2 border-t border-border/40 pt-3">
          <Select
            aria-label={t("club.playerToSeat")}
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
          >
            <option value="">{t("club.addPlayer")}</option>
            {available.map((member) => (
              <option key={member.player.id} value={member.player.id}>
                {member.player.displayName}
              </option>
            ))}
          </Select>
          <Button
            variant="secondary"
            disabled={!choice || busy}
            onClick={() => {
              onAdd(Number(choice));
              setChoice("");
            }}
          >
            <UserPlus className="size-4" aria-hidden />
          </Button>
        </div>
      )}

      {isMine && mySeat && mySeat.status !== "paid" && (
        <Button
          variant="accent"
          fullWidth
          disabled={busy}
          onClick={() => onPay()}
        >
          <Wallet className="size-4" aria-hidden />
          {t("club.payMySeat", { amount: mySeat.priceUno })}
        </Button>
      )}

      {/* Prise en charge : le fondateur seul, et seulement s'il reste
          quelque chose à prendre en charge. */}
      {roster.viewer.mayCover && unpaid.length > 0 && (
        <Button
          variant="secondary"
          fullWidth
          disabled={busy}
          onClick={() => onCover(unpaid.map((seat) => seat.player.id))}
        >
          <Coins className="size-4" aria-hidden />
          {unpaid.length === 1
            ? t("club.coverOne", { amount: roster.dueUno })
            : t("club.coverMany", {
                count: unpaid.length,
                amount: roster.dueUno,
              })}
        </Button>
      )}
    </Card>
  );
}

function SeatRow({
  seat,
  mayRemove,
  onRemove,
  onOpen,
}: {
  seat: SquadSeatView;
  mayRemove: boolean;
  onRemove: () => void;
  onOpen: (player: PublicPlayer) => void;
}) {
  const t = useT();
  return (
    <li>
      <PlayerChip
        player={seat.player}
        onOpen={onOpen}
        subtitle={
          seat.status === "paid"
            ? seat.paidBy === "treasury"
              ? t("club.paidByTreasury")
              : t("club.paid")
            : t("club.due", { amount: seat.priceUno })
        }
        trailing={
          mayRemove ? (
            <button
              type="button"
              aria-label={t("club.removePlayer", {
                name: seat.player.displayName,
              })}
              className="shrink-0 rounded-full p-1 text-muted transition hover:text-danger"
              onClick={onRemove}
            >
              <UserMinus className="size-4" aria-hidden />
            </button>
          ) : undefined
        }
      />
    </li>
  );
}
