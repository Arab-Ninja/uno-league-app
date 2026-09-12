import { useState } from "react";
import { Coins, UserMinus, UserPlus, Wallet } from "lucide-react";
import {
  SQUAD_ROSTER_SIZE,
  type SquadDetailView,
  type SquadRosterView,
  type SquadSeatView,
} from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { cn } from "@/lib/cn.js";
import { tapFeedback } from "@/lib/native.js";
import { Avatar } from "@/components/domain/index.js";
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

  const addSeat = trpc.squads.addSeat.useMutation();
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
            removeSeat.isPending ||
            paySeat.isPending ||
            coverSeats.isPending
          }
          onAdd={(playerId) =>
            void run(() => addSeat.mutateAsync({ challengeId, playerId }))
          }
          onRemove={(playerId) =>
            void run(() => removeSeat.mutateAsync({ challengeId, playerId }))
          }
          onPay={() => void run(() => paySeat.mutateAsync({ challengeId }))}
          onCover={(playerIds) =>
            void run(() => coverSeats.mutateAsync({ challengeId, playerIds }))
          }
        />
      ))}
    </section>
  );
}

function RosterCard({
  roster,
  mySquad,
  busy,
  onAdd,
  onRemove,
  onPay,
  onCover,
}: {
  roster: SquadRosterView;
  mySquad: SquadDetailView | null;
  busy: boolean;
  onAdd: (playerId: number) => void;
  onRemove: (playerId: number) => void;
  onPay: () => void;
  onCover: (playerIds: number[]) => void;
}) {
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
  const mySeat = roster.seats.find((seat) => seat.id === roster.viewer.mySeatId);
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
        <p className="text-xs text-muted">Aucun joueur inscrit pour l'instant.</p>
      ) : (
        <ul className="space-y-1.5">
          {roster.seats.map((seat) => (
            <SeatRow
              key={seat.id}
              seat={seat}
              mayRemove={roster.viewer.mayCompose && !busy}
              onRemove={() => onRemove(seat.player.id)}
            />
          ))}
        </ul>
      )}

      {roster.dueUno > 0 && (
        <p className="border-t border-border/40 pt-2 text-xs text-muted">
          Reste à régler : <span className="font-semibold tabular-nums">{roster.dueUno} UNO</span>
        </p>
      )}

      {available.length > 0 && (
        <div className="flex gap-2 border-t border-border/40 pt-3">
          <Select
            aria-label="Joueur à inscrire"
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
          >
            <option value="">Ajouter un joueur…</option>
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
          Payer ma place — {mySeat.priceUno} UNO
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
          Prendre en charge {unpaid.length === 1 ? "la place" : `les ${unpaid.length} places`} ({roster.dueUno} UNO)
        </Button>
      )}
    </Card>
  );
}

function SeatRow({
  seat,
  mayRemove,
  onRemove,
}: {
  seat: SquadSeatView;
  mayRemove: boolean;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center gap-2">
      <Avatar name={seat.player.displayName} url={seat.player.profilePhotoUrl} size="sm" />
      <span className="min-w-0 flex-1 truncate text-sm">
        {seat.player.displayName}
      </span>
      <span
        className={cn(
          "shrink-0 text-xs font-medium",
          seat.status === "paid" ? "text-success" : "text-muted",
        )}
      >
        {seat.status === "paid"
          ? seat.paidBy === "treasury"
            ? "Payé par la caisse"
            : "Payé"
          : `${seat.priceUno} UNO dus`}
      </span>
      {mayRemove && (
        <button
          type="button"
          aria-label={`Retirer ${seat.player.displayName}`}
          className="shrink-0 rounded-full p-1 text-muted transition hover:text-danger"
          onClick={onRemove}
        >
          <UserMinus className="size-4" aria-hidden />
        </button>
      )}
    </li>
  );
}
