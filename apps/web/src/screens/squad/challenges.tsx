import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Swords } from "lucide-react";
import {
  SQUAD_MATCH_DURATIONS,
  SQUAD_SEAT_PRICE_EUR,
  SQUAD_SEAT_PRICE_UNO,
  type SquadChallengeDetail,
  type SquadChallengeView,
} from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { useAuth } from "@/lib/auth.js";
import { cn } from "@/lib/cn.js";
import { formatDateTime } from "@/lib/format.js";
import { tapFeedback } from "@/lib/native.js";
import { Screen } from "@/components/layout/index.js";
import { SquadChat } from "@/components/squad/chat.js";
import { SquadRosterPanel } from "@/components/squad/roster.js";
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
  Select,
} from "@/components/ui/index.js";

const STATUS_LABELS: Record<SquadChallengeView["status"], string> = {
  pending: "En cours",
  accepted: "Accepté",
  rejected: "Refusé",
  cancelled: "Retiré",
  expired: "Expiré",
  completed: "Joué",
};

/** Liste des défis d'un club : ceux qui attendent une réponse en tête. */
export function SquadChallengesScreen() {
  const { squadId } = useParams<{ squadId: string }>();
  const id = Number(squadId);
  const navigate = useNavigate();
  const challenges = trpc.squads.challenges.useQuery({ squadId: id, limit: 30 });

  return (
    <Screen title="Défis" back backTo="/squad">
      <div className="space-y-4">
        <Button
          variant="accent"
          fullWidth
          onClick={() => {
            void tapFeedback();
            navigate(`/squad/${id}/defis/nouveau`);
          }}
        >
          <Swords className="size-4" aria-hidden />
          Lancer un défi
        </Button>

        <Async query={challenges}>
          {(list) =>
            list.length === 0 ? (
              <EmptyState
                title="Aucun défi"
                description="Défiez un autre SQUAD, ou attendez qu'on vous défie."
                icon={<Swords className="size-6" aria-hidden />}
              />
            ) : (
              <div className="space-y-2">
                {list.map((challenge) => (
                  <button
                    key={challenge.id}
                    type="button"
                    onClick={() => {
                      void tapFeedback();
                      navigate(`/squad/defis/${challenge.id}`);
                    }}
                    className="flex w-full items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 text-left transition-colors hover:bg-surface-raised active:opacity-70"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {challenge.viewer.isChallenger
                          ? `Contre ${challenge.challenged?.name ?? "?"}`
                          : `${challenge.challenger?.name ?? "?"} vous défie`}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {formatDateTime(challenge.scheduledAt)} ·{" "}
                        {challenge.durationMinutes} min
                        {challenge.currentStake > 0 &&
                          ` · ${challenge.currentStake} UNO`}
                      </p>
                    </div>
                    <Badge
                      tone={
                        challenge.viewer.awaitingReply
                          ? "accent"
                          : challenge.status === "accepted"
                            ? "success"
                            : "neutral"
                      }
                    >
                      {challenge.viewer.awaitingReply
                        ? "À répondre"
                        : STATUS_LABELS[challenge.status]}
                    </Badge>
                  </button>
                ))}
              </div>
            )
          }
        </Async>
      </div>
    </Screen>
  );
}

/** Lancer un défi : adversaire, salle, créneau, durée et mise. */
export function SquadChallengeCreateScreen() {
  const { squadId } = useParams<{ squadId: string }>();
  const id = Number(squadId);
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const config = trpc.proposals.config.useQuery();
  const squads = trpc.squads.list.useQuery({ limit: 50 });
  const create = trpc.squads.createChallenge.useMutation();

  const [opponent, setOpponent] = useState("");
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState("");
  const [hour, setHour] = useState("20");
  const [duration, setDuration] = useState<60 | 120>(60);
  const [stake, setStake] = useState("0");
  const [failure, setFailure] = useState<string | null>(null);

  const others = (squads.data ?? []).filter((squad) => squad.id !== id);

  async function submit() {
    void tapFeedback();
    setFailure(null);
    try {
      const challenge = await create.mutateAsync({
        squadId: id,
        opponentSquadId: Number(opponent),
        venueId: venue,
        date,
        startHour: Number(hour),
        durationMinutes: duration,
        stakeUno: Number(stake) || 0,
      });
      await utils.squads.challenges.invalidate({ squadId: id });
      navigate(`/squad/defis/${challenge.id}`, { replace: true });
    } catch (caught) {
      setFailure(describeError(caught).message);
    }
  }

  const ready = opponent !== "" && venue !== "" && date !== "";

  return (
    <Screen title="Lancer un défi" back backTo={`/squad/${id}/defis`}>
      <div className="space-y-4">
        {failure && <ErrorBanner message={failure} />}

        <Field label="Adversaire" htmlFor="opponent">
          <Select
            id="opponent"
            value={opponent}
            onChange={(event) => setOpponent(event.target.value)}
          >
            <option value="">Choisir un SQUAD</option>
            {others.map((squad) => (
              <option key={squad.id} value={squad.id}>
                {squad.name} — cote {squad.rating}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Salle" htmlFor="venue">
          <Select
            id="venue"
            value={venue}
            onChange={(event) => setVenue(event.target.value)}
          >
            <option value="">Choisir une salle</option>
            {(config.data?.venues ?? []).map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Date" htmlFor="date">
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
          <Field label="Heure" htmlFor="hour">
            <Select
              id="hour"
              value={hour}
              onChange={(event) => setHour(event.target.value)}
            >
              {Array.from({ length: 17 }, (_, index) => index + 7).map((value) => (
                <option key={value} value={value}>
                  {String(value).padStart(2, "0")}:00
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label="Durée"
          htmlFor="duration"
          hint={`Place : ${SQUAD_SEAT_PRICE_UNO[duration]} UNO par joueur (${SQUAD_SEAT_PRICE_EUR[duration]} €), hors mise.`}
        >
          <Select
            id="duration"
            value={String(duration)}
            onChange={(event) => setDuration(Number(event.target.value) as 60 | 120)}
          >
            {SQUAD_MATCH_DURATIONS.map((value) => (
              <option key={value} value={value}>
                {value} minutes
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Mise (facultative)"
          htmlFor="stake"
          hint="Les deux SQUADs engagent le même montant. Laissez à 0 pour un défi d'honneur."
        >
          <Input
            id="stake"
            type="number"
            inputMode="numeric"
            min={0}
            value={stake}
            onChange={(event) => setStake(event.target.value.replace(/\D/g, ""))}
          />
        </Field>

        <Button
          variant="accent"
          fullWidth
          loading={create.isPending}
          disabled={!ready}
          onClick={() => void submit()}
        >
          Envoyer le défi
        </Button>
      </div>
    </Screen>
  );
}

/** Un défi, sa négociation et son fil de discussion. */
export function SquadChallengeScreen() {
  const { challengeId } = useParams<{ challengeId: string }>();
  const id = Number(challengeId);
  const utils = trpc.useUtils();
  const challenge = trpc.squads.challenge.useQuery({ challengeId: id });

  const accept = trpc.squads.acceptChallenge.useMutation();
  const reject = trpc.squads.rejectChallenge.useMutation();
  const cancel = trpc.squads.cancelChallenge.useMutation();
  const counter = trpc.squads.counterOffer.useMutation();
  // L'effectif du club du joueur : c'est là qu'on puise pour composer.
  const mine = trpc.squads.mine.useQuery();
  const { isAdmin } = useAuth();

  const [amount, setAmount] = useState("");
  const [negotiating, setNegotiating] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    void tapFeedback();
    setFailure(null);
    try {
      await action();
      await utils.squads.challenge.invalidate({ challengeId: id });
      await utils.squads.mine.invalidate();
      setNegotiating(false);
      setAmount("");
    } catch (caught) {
      setFailure(describeError(caught).message);
    }
  }

  return (
    <Screen title="Défi" back backTo="/squad">
      <Async query={challenge}>
        {(view) => (
          <div className="space-y-5">
            <Card className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {view.challenger?.name ?? "?"}
                </p>
                <span className="shrink-0 text-xs font-bold text-muted">VS</span>
                <p className="min-w-0 flex-1 truncate text-right text-sm font-semibold">
                  {view.challenged?.name ?? "?"}
                </p>
              </div>

              <div className="space-y-1.5 border-t border-border/40 pt-3 text-sm">
                <Row label="Salle" value={view.venueName} />
                <Row label="Créneau" value={formatDateTime(view.scheduledAt)} />
                <Row label="Durée" value={`${view.durationMinutes} minutes`} />
                <Row
                  label="Mise par SQUAD"
                  value={
                    view.currentStake === 0
                      ? "Défi d'honneur"
                      : `${view.currentStake} UNO`
                  }
                />
                {view.currentStake > 0 && (
                  <Row label="Total en jeu" value={`${view.currentStake * 2} UNO`} />
                )}
                <Row label="État" value={STATUS_LABELS[view.status]} />
              </div>
            </Card>

            {failure && <ErrorBanner message={failure} />}

            {/* Toute la négociation reste lisible : rien n'est écrasé, et
                c'est ce qui permet de comprendre comment on est arrivé au
                montant final. */}
            {view.offers.length > 1 && (
              <section>
                <SectionTitle>Négociation</SectionTitle>
                <Card className="space-y-1.5">
                  {view.offers.map((offer) => (
                    <div
                      key={offer.id}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="min-w-0 flex-1 truncate text-muted">
                        {offer.squadName} · {offer.playerName}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {offer.stakeUno} UNO
                      </span>
                    </div>
                  ))}
                </Card>
              </section>
            )}

            {view.status === "pending" && view.viewer.awaitingReply && (
              <section className="space-y-2">
                {negotiating ? (
                  <Card className="space-y-2">
                    <Field
                      label="Nouvelle mise"
                      htmlFor="counter"
                      hint={`Une contre-offre monte la mise : au moins ${view.currentStake + 1} UNO. Il reste ${view.counterOffersLeft} contre-offre(s).`}
                    >
                      <Input
                        id="counter"
                        type="number"
                        inputMode="numeric"
                        min={view.currentStake + 1}
                        value={amount}
                        onChange={(event) =>
                          setAmount(event.target.value.replace(/\D/g, ""))
                        }
                      />
                    </Field>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        className="flex-1"
                        onClick={() => setNegotiating(false)}
                      >
                        Annuler
                      </Button>
                      <Button
                        variant="accent"
                        className="flex-1"
                        loading={counter.isPending}
                        disabled={Number(amount) <= view.currentStake}
                        onClick={() =>
                          void run(() =>
                            counter.mutateAsync({
                              challengeId: id,
                              stakeUno: Number(amount),
                            }),
                          )
                        }
                      >
                        Contre-offrir
                      </Button>
                    </div>
                  </Card>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="accent"
                      className="flex-1"
                      loading={accept.isPending}
                      onClick={() =>
                        void run(() => accept.mutateAsync({ challengeId: id }))
                      }
                    >
                      Accepter
                    </Button>
                    {view.counterOffersLeft > 0 && (
                      <Button
                        variant="secondary"
                        className="flex-1"
                        onClick={() => setNegotiating(true)}
                      >
                        Contre-offrir
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      className="flex-1"
                      loading={reject.isPending}
                      onClick={() =>
                        void run(() => reject.mutateAsync({ challengeId: id }))
                      }
                    >
                      Refuser
                    </Button>
                  </div>
                )}
              </section>
            )}

            {view.status === "pending" && !view.viewer.awaitingReply && (
              <Button
                variant="secondary"
                fullWidth
                loading={cancel.isPending}
                onClick={() => void run(() => cancel.mutateAsync({ challengeId: id }))}
              >
                Retirer le défi
              </Button>
            )}

            {/* Composition et places : elles n'existent qu'une fois le défi
                accepté, et le panneau ne s'affiche pas avant. */}
            <SquadRosterPanel
              challengeId={id}
              rosters={view.rosters}
              mySquad={mine.data?.squad ?? null}
            />

            {isAdmin && view.status === "accepted" && (
              <SettlementPanel challengeId={id} view={view} />
            )}

            {view.viewer.squadId !== null && (
              <SquadChat
                thread={{ scope: "challenge", challengeId: id }}
                title="Discussion du défi"
                emptyLabel="Les deux SQUADs peuvent échanger ici."
              />
            )}
          </div>
        )}
      </Async>
    </Screen>
  );
}


/**
 * Règlement d'un défi par l'administration (SQUAD-006).
 *
 * En phase 5, c'est le résultat du match qui déplacera les mises. Ce panneau
 * existe d'ici là pour trancher à la main — et pour que le mouvement d'argent
 * soit éprouvé avant que le match n'en dépende.
 */
function SettlementPanel({
  challengeId,
  view,
}: {
  challengeId: number;
  view: SquadChallengeDetail;
}) {
  const utils = trpc.useUtils();
  const settle = trpc.squads.settleChallenge.useMutation();
  const annul = trpc.squads.annulChallenge.useMutation();

  const [winner, setWinner] = useState("");
  const [failure, setFailure] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    void tapFeedback();
    setFailure(null);
    try {
      await action();
      await utils.squads.challenge.invalidate({ challengeId });
      await utils.squads.mine.invalidate();
    } catch (caught) {
      setFailure(describeError(caught).message);
    }
  }

  return (
    <section className="space-y-2">
      <SectionTitle>Administration</SectionTitle>
      {failure && <ErrorBanner message={failure} />}
      <Card className="space-y-3">
        <Field
          label="Vainqueur"
          htmlFor="winner"
          hint={
            view.currentStake === 0
              ? "Défi d'honneur : aucune mise à déplacer."
              : `Le vainqueur emporte les ${view.currentStake * 2} UNO en jeu. Un nul rend à chacun sa mise.`
          }
        >
          <Select
            id="winner"
            value={winner}
            onChange={(event) => setWinner(event.target.value)}
          >
            <option value="">Match nul</option>
            <option value={String(view.challenger?.id ?? "")}>
              {view.challenger?.name ?? "Défieur"}
            </option>
            <option value={String(view.challenged?.id ?? "")}>
              {view.challenged?.name ?? "Défié"}
            </option>
          </Select>
        </Field>

        <Button
          variant="accent"
          fullWidth
          loading={settle.isPending}
          onClick={() =>
            void run(() =>
              settle.mutateAsync({
                challengeId,
                winnerSquadId: winner ? Number(winner) : null,
              }),
            )
          }
        >
          Régler le défi
        </Button>

        {/* Annuler rend les mises **et** rembourse les places : le match
            n'ayant pas eu lieu, la salle n'est due par personne. */}
        <Button
          variant="secondary"
          fullWidth
          loading={annul.isPending}
          onClick={() => void run(() => annul.mutateAsync({ challengeId }))}
        >
          Annuler le défi
        </Button>
      </Card>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className={cn("text-right font-medium")}>{value}</span>
    </div>
  );
}
