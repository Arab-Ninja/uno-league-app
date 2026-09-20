import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Swords } from "lucide-react";
import {
  SQUAD_MATCH_DURATIONS,
  SQUAD_SEAT_PRICE_EUR,
  SQUAD_SEAT_PRICE_UNO,
  squadRoleAtLeast,
  type SquadChallengeDetail,
  type SquadChallengeView,
  type SquadRole,
} from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { useAuth } from "@/lib/auth.js";
import { useLibelles, useT } from "@/lib/i18n.js";
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

/**
 * Le rôle du joueur dans le club qu'il regarde — `null` s'il n'en est pas.
 *
 * Défier, négocier et retirer un défi engagent le club entier : sa mise, sa
 * caisse et sa cote. Ce sont des actes de fondateur ou de capitaine
 * (SQUAD-004). Le serveur le tient déjà, dans la même transaction que
 * l'écriture ; l'écran s'aligne pour ne pas proposer un geste qui finira en
 * refus — un bouton qui échoue toujours vaut moins que pas de bouton.
 */
function useSquadRole(squadId: number | null): SquadRole | null {
  const mine = trpc.squads.mine.useQuery();
  const squad = mine.data?.squad ?? null;
  if (!squad) return null;
  if (squadId !== null && squad.id !== squadId) return null;
  return squad.viewer.role;
}

/** Liste des défis d'un club : ceux qui attendent une réponse en tête. */
export function SquadChallengesScreen() {
  const t = useT();
  const L = useLibelles();
  const { squadId } = useParams<{ squadId: string }>();
  const id = Number(squadId);
  const navigate = useNavigate();
  const challenges = trpc.squads.challenges.useQuery({
    squadId: id,
    limit: 30,
  });
  const mayChallenge = squadRoleAtLeast(useSquadRole(id), "captain");

  return (
    <Screen title={t("club.challengesTitle")} back backTo="/squad">
      <div className="space-y-4">
        {mayChallenge ? (
          <Button
            variant="accent"
            fullWidth
            onClick={() => {
              void tapFeedback();
              navigate(`/squad/${id}/defis/nouveau`);
            }}
          >
            <Swords className="size-4" aria-hidden />
            {t("club.startChallenge")}
          </Button>
        ) : (
          <Card>
            <p className="text-center text-xs text-muted">
              {t("club.onlyLeadersStart")}
            </p>
          </Card>
        )}

        <Async query={challenges}>
          {(list) =>
            list.length === 0 ? (
              <EmptyState
                title={t("club.noChallenge")}
                description={t("club.noChallengeBody")}
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
                          ? t("club.against", {
                              club: challenge.challenged?.name ?? "?",
                            })
                          : t("club.challengesYou", {
                              club: challenge.challenger?.name ?? "?",
                            })}
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
                        ? t("club.toAnswer")
                        : L.challengeStatus[challenge.status]}
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
  const t = useT();
  const L = useLibelles();
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
  const mayChallenge = squadRoleAtLeast(useSquadRole(id), "captain");

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

  // L'adresse est connue : la garde ne peut pas tenir au seul bouton de
  // l'écran précédent.
  if (!mayChallenge) {
    return (
      <Screen
        title={t("club.startChallenge")}
        back
        backTo={`/squad/${id}/defis`}
      >
        <Card>
          <p className="text-center text-xs text-muted">
            {t("club.onlyLeadersHere")}
          </p>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title={t("club.startChallenge")} back backTo={`/squad/${id}/defis`}>
      <div className="space-y-4">
        {failure && <ErrorBanner message={failure} />}

        <Field label={t("club.opponent")} htmlFor="opponent">
          <Select
            id="opponent"
            value={opponent}
            onChange={(event) => setOpponent(event.target.value)}
          >
            <option value="">{t("club.chooseClub")}</option>
            {others.map((squad) => (
              <option key={squad.id} value={squad.id}>
                {t("club.clubWithRating", {
                  name: squad.name,
                  rating: squad.rating,
                })}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t("club.venue")} htmlFor="venue">
          <Select
            id="venue"
            value={venue}
            onChange={(event) => setVenue(event.target.value)}
          >
            <option value="">{t("club.chooseVenue")}</option>
            {(config.data?.venues ?? []).map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label={t("club.date")} htmlFor="date">
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
          <Field label={t("club.hour")} htmlFor="hour">
            <Select
              id="hour"
              value={hour}
              onChange={(event) => setHour(event.target.value)}
            >
              {Array.from({ length: 17 }, (_, index) => index + 7).map(
                (value) => (
                  <option key={value} value={value}>
                    {String(value).padStart(2, "0")}:00
                  </option>
                ),
              )}
            </Select>
          </Field>
        </div>

        <Field
          label={t("club.duration")}
          htmlFor="duration"
          hint={t("club.durationHint", {
            uno: SQUAD_SEAT_PRICE_UNO[duration],
            eur: SQUAD_SEAT_PRICE_EUR[duration],
          })}
        >
          <Select
            id="duration"
            value={String(duration)}
            onChange={(event) =>
              setDuration(Number(event.target.value) as 60 | 120)
            }
          >
            {SQUAD_MATCH_DURATIONS.map((value) => (
              <option key={value} value={value}>
                {t("club.minutes", { count: value })}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label={t("club.stake")}
          htmlFor="stake"
          hint={t("club.stakeHint")}
        >
          <Input
            id="stake"
            type="number"
            inputMode="numeric"
            min={0}
            value={stake}
            onChange={(event) =>
              setStake(event.target.value.replace(/\D/g, ""))
            }
          />
        </Field>

        <Button
          variant="accent"
          fullWidth
          loading={create.isPending}
          disabled={!ready}
          onClick={() => void submit()}
        >
          {t("club.sendChallenge")}
        </Button>
      </div>
    </Screen>
  );
}

/** Un défi, sa négociation et son fil de discussion. */
export function SquadChallengeScreen() {
  const t = useT();
  const L = useLibelles();
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

  /**
   * Répondre engage la mise du club et sa caisse : capitaine ou fondateur,
   * et seulement dans le club partie au défi.
   */
  const myRole = mine.data?.squad?.viewer.role ?? null;
  const mayNegotiate = squadRoleAtLeast(myRole, "captain");

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
    <Screen title={t("club.challengeTitle")} back backTo="/squad">
      <Async query={challenge}>
        {(view) => (
          <div className="space-y-5">
            <Card className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {view.challenger?.name ?? "?"}
                </p>
                <span className="shrink-0 text-xs font-bold text-muted">
                  VS
                </span>
                <p className="min-w-0 flex-1 truncate text-right text-sm font-semibold">
                  {view.challenged?.name ?? "?"}
                </p>
              </div>

              <div className="space-y-1.5 border-t border-border/40 pt-3 text-sm">
                <Row label={t("club.venue")} value={view.venueName} />
                <Row
                  label={t("club.slot")}
                  value={formatDateTime(view.scheduledAt)}
                />
                <Row
                  label={t("club.duration")}
                  value={t("club.minutes", { count: view.durationMinutes })}
                />
                <Row
                  label={t("club.stakePerClub")}
                  value={
                    view.currentStake === 0
                      ? t("club.honourChallenge")
                      : `${view.currentStake} UNO`
                  }
                />
                {view.currentStake > 0 && (
                  <Row
                    label={t("club.totalAtStake")}
                    value={`${view.currentStake * 2} UNO`}
                  />
                )}
                <Row
                  label={t("club.state")}
                  value={L.challengeStatus[view.status]}
                />
              </div>
            </Card>

            {failure && <ErrorBanner message={failure} />}

            {/* Toute la négociation reste lisible : rien n'est écrasé, et
                c'est ce qui permet de comprendre comment on est arrivé au
                montant final. */}
            {view.offers.length > 1 && (
              <section>
                <SectionTitle>{t("club.negotiation")}</SectionTitle>
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

            {view.status === "pending" &&
              view.viewer.awaitingReply &&
              !mayNegotiate && (
                <Card>
                  <p className="text-center text-xs text-muted">
                    {t("club.awaitingYourClub")}
                  </p>
                </Card>
              )}

            {view.status === "pending" &&
              view.viewer.awaitingReply &&
              mayNegotiate && (
                <section className="space-y-2">
                  {negotiating ? (
                    <Card className="space-y-2">
                      <Field
                        label={t("club.newStake")}
                        htmlFor="counter"
                        hint={t("club.counterStakeHint", {
                          minimum: view.currentStake + 1,
                          left: view.counterOffersLeft,
                        })}
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
                          {t("common.cancel")}
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
                          {t("club.counter")}
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
                          void run(() =>
                            accept.mutateAsync({ challengeId: id }),
                          )
                        }
                      >
                        {t("club.accept")}
                      </Button>
                      {view.counterOffersLeft > 0 && (
                        <Button
                          variant="secondary"
                          className="flex-1"
                          onClick={() => setNegotiating(true)}
                        >
                          {t("club.counter")}
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        className="flex-1"
                        loading={reject.isPending}
                        onClick={() =>
                          void run(() =>
                            reject.mutateAsync({ challengeId: id }),
                          )
                        }
                      >
                        {t("club.refuse")}
                      </Button>
                    </div>
                  )}
                </section>
              )}

            {view.status === "pending" &&
              !view.viewer.awaitingReply &&
              mayNegotiate && (
                <Button
                  variant="secondary"
                  fullWidth
                  loading={cancel.isPending}
                  onClick={() =>
                    void run(() => cancel.mutateAsync({ challengeId: id }))
                  }
                >
                  {t("club.withdrawChallenge")}
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
                title={t("club.challengeChat")}
                emptyLabel={t("club.challengeChatEmpty")}
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
  const navigate = useNavigate();
  const settle = trpc.squads.settleChallenge.useMutation();
  const annul = trpc.squads.annulChallenge.useMutation();
  const createMatch = trpc.squads.createMatch.useMutation();

  const [winner, setWinner] = useState("");
  const [failure, setFailure] = useState<string | null>(null);

  // Dix places tenues et toutes réglées : le serveur l'exigera de toute
  // façon, autant le dire avant le clic plutôt qu'après.
  const complet =
    view.rosters.length === 2 &&
    view.rosters.every(
      (roster) => roster.openSlots === 0 && roster.dueUno === 0,
    );

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
        {view.sessionId === null ? (
          <MatchCreation
            complet={complet}
            pending={createMatch.isPending}
            onCreate={() =>
              void run(async () => {
                const created = await createMatch.mutateAsync({ challengeId });
                navigate(`/sessions/${created.proposalId}`);
              })
            }
          />
        ) : (
          <MatchOpened sessionId={view.sessionId} onOpen={navigate} />
        )}

        {/* Règlement à la main : il ne vaut que pour un défi joué hors de
            l'application. Dès qu'un match existe, c'est son résultat qui fait
            foi, et la mise suit la clôture de la session. */}
        {view.sessionId === null && (
          <div className="space-y-3 border-t border-border/40 pt-3">
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
              variant="secondary"
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
              Régler sans match
            </Button>
          </div>
        )}

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

/** Le match n'existe pas encore : l'ouvrir fige les deux effectifs. */
function MatchCreation({
  complet,
  pending,
  onCreate,
}: {
  complet: boolean;
  pending: boolean;
  onCreate: () => void;
}) {
  return (
    <>
      <Button
        variant="accent"
        fullWidth
        disabled={!complet}
        loading={pending}
        onClick={onCreate}
      >
        Créer le match
      </Button>
      <p className="text-xs text-muted">
        {complet
          ? "La composition sera figée : le résultat se saisit ensuite comme celui de n'importe quelle session."
          : "Les deux feuilles doivent être complètes et toutes les places réglées."}
      </p>
    </>
  );
}

/** Le match existe : tout se passe désormais sur sa feuille. */
function MatchOpened({
  sessionId,
  onOpen,
}: {
  sessionId: number;
  onOpen: (path: string) => void;
}) {
  return (
    <>
      <Button
        variant="accent"
        fullWidth
        onClick={() => {
          void tapFeedback();
          onOpen(`/sessions/${sessionId}`);
        }}
      >
        Ouvrir la feuille de match
      </Button>
      <p className="text-xs text-muted">
        La mise est réglée à la clôture de la session, d'après le score.
      </p>
    </>
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
