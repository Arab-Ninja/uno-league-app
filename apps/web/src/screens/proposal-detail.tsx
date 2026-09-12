import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  MapPin,
  Pencil,
  Users,
  Whistle,
} from "lucide-react";
import {
  MOVEMENT_LABELS,
  PAYMENT_METHOD_HINTS,
  PAYMENT_METHOD_LABELS,
  formatEur,
  type PaymentMethod,
  type ProposalDetail,
  type PublicPlayer,
  gameModeName,
  getGameMode,
} from "@uno/shared";
import { describeError, newIdempotencyKey, trpc } from "@/lib/trpc.js";
import { cn } from "@/lib/cn.js";
import { useAuth } from "@/lib/auth.js";
import { formatLongDate } from "@/lib/format.js";
import { notificationFeedback, tapFeedback } from "@/lib/native.js";
import { useOnline } from "@/lib/use-online.js";
import { Screen } from "@/components/layout/index.js";
import { DivisionBadge, ProposalStatusBadge } from "@/components/domain/index.js";
import { FutCard } from "@/components/fut-card/fut-card.js";
import { PlayerCardDialog } from "@/components/fut-card/player-card-dialog.js";
import { SessionPodium } from "@/components/fut-card/session-podium.js";
import { SessionResults } from "@/components/fut-card/session-results.js";
import { SessionVideoPanel } from "@/components/supervision/session-videos.js";
import { Async } from "@/components/ui/async.js";
import {
  Button,
  Card,
  ErrorBanner,
  ProgressBar,
  SectionTitle,
} from "@/components/ui/index.js";

/**
 * Détail d'une session (CAL-012) et matrice des actions (§8.1).
 *
 * Le bouton affiché dépend du statut de la session, de la participation du
 * joueur et de son paiement — tous fournis par le serveur, jamais déduits
 * localement (P-004).
 */
export function ProposalDetailScreen() {
  const { proposalId } = useParams();
  const navigate = useNavigate();
  const online = useOnline();
  const utils = trpc.useUtils();

  const { user, isSupervisor } = useAuth();

  const id = Number(proposalId);
  const detail = trpc.proposals.get.useQuery({ proposalId: id }, { enabled: Number.isFinite(id) });
  const config = trpc.proposals.config.useQuery();
  const profile = trpc.players.me.useQuery();

  const join = trpc.proposals.join.useMutation();
  const leave = trpc.proposals.leave.useMutation();
  const pay = trpc.proposals.pay.useMutation();

  const [action, setAction] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("uno");
  const [zoomed, setZoomed] = useState<PublicPlayer | null>(null);

  async function refresh() {
    await utils.proposals.get.invalidate({ proposalId: id });
    await utils.proposals.list.invalidate();
    await utils.players.dashboard.invalidate();
    await utils.wallet.summary.invalidate();
  }

  async function run(operation: () => Promise<unknown>) {
    setAction(null);
    try {
      await operation();
      await notificationFeedback();
      await refresh();
    } catch (error) {
      setAction(describeError(error).message);
    }
  }

  const methods = config.data?.paymentMethods ?? ["uno"];

  return (
    <Screen title="Détail de la session" back backTo="/calendrier" withTabBar={false}>
      <Async query={detail}>
        {(proposal) => {
          const viewer = proposal.viewer;
          const isParticipant = viewer?.isParticipant ?? false;
          const hasPaid = viewer?.hasPaid ?? false;
          // ROLE-003 : un arbitre ne s'inscrit pas comme joueur, il se propose
          // pour diriger. Les deux parcours ne se croisent jamais.
          const isReferee = profile.data?.accountType === "referee";
          const isLeague = proposal.modeId === "league";
          // Une session jouée : ce qui reste à faire n'a plus d'intérêt, seul
          // le résultat en a.
          const played =
            proposal.status === "completed" || proposal.status === "session";

          return (
            <div className="space-y-5">
              {action && (
                <div
                  role="alert"
                  className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-red-200"
                >
                  {action}
                </div>
              )}

              <Card className="bg-gradient-to-br from-primary/40 via-surface to-surface">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold">
                      {gameModeName(proposal.modeId)}
                    </h2>
                    <p className="mt-0.5 text-sm capitalize text-muted">
                      {formatLongDate(proposal.localDate)}
                    </p>
                  </div>
                  <ProposalStatusBadge status={proposal.status} />
                </div>

                <div className="space-y-2 text-sm text-muted">
                  <p className="flex items-center gap-2">
                    <Clock className="size-4" aria-hidden />
                    {proposal.localTimeLabel}
                  </p>
                  <p className="flex items-center gap-2">
                    <MapPin className="size-4" aria-hidden />
                    {proposal.venueName}
                  </p>
                  <div className="flex items-center gap-2">
                    <Users className="size-4" aria-hidden />
                    <DivisionBadge division={proposal.division} />
                  </div>
                </div>

                <div className="mt-4 flex items-baseline justify-between">
                  <span className="text-sm text-muted">Participation</span>
                  <span className="text-xl font-bold text-accent">
                    {proposal.priceUno} UNO
                    <span className="ml-1.5 text-xs font-normal text-muted">
                      ({formatEur(proposal.priceUno)})
                    </span>
                  </span>
                </div>
              </Card>

              {/*
                Progression des inscriptions et des paiements.
                Elle ne vaut que tant qu'il reste quelque chose à remplir : sur
                une session déjà jouée, « 15/15 » n'apprend rien à personne et
                occupe la place de ce qu'on est venu voir — le résultat.
              */}
              {!played && (
              <Card>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium">Inscriptions</span>
                  <span className="tabular-nums text-muted">
                    {proposal.participantCount} / {proposal.minParticipants}
                  </span>
                </div>
                <ProgressBar
                  value={proposal.participantCount}
                  max={proposal.minParticipants}
                  tone={proposal.participantCount >= proposal.minParticipants ? "success" : "accent"}
                  label="Inscriptions"
                />

                {proposal.status !== "proposal" && (
                  <>
                    <div className="mb-2 mt-4 flex items-center justify-between text-sm">
                      <span className="font-medium">Paiements</span>
                      <span className="tabular-nums text-muted">
                        {proposal.paidCount} / {proposal.participantCount}
                      </span>
                    </div>
                    <ProgressBar
                      value={proposal.paidCount}
                      max={Math.max(1, proposal.participantCount)}
                      tone={proposal.paymentComplete ? "success" : "primary"}
                      label="Paiements"
                    />
                  </>
                )}
              </Card>
              )}

              {/* Récompenses de la session — un amical n'en verse aucune */}
              <section>
                <SectionTitle>Récompenses</SectionTitle>
                <Card className="space-y-2">
                  {proposal.rewards.length === 0 && (
                    <p className="text-xs leading-relaxed text-muted">
                      {getGameMode(proposal.modeId)?.effects.careerStats
                        ? // Le cas du SQUAD : pas d'UNO ni de division, mais les
                          // statistiques comptent bel et bien.
                          "Ce mode ne verse aucun point UNO et ne touche ni aux divisions ni à la note de carte. Les statistiques et l'XP de la session, elles, comptent."
                        : "Ce mode ne rapporte aucun point UNO et n'a aucun effet sur les divisions : on y joue pour le plaisir. Les statistiques de la session restent affichées."}
                    </p>
                  )}
                  {proposal.rewards.map((reward) => (
                    <div
                      key={reward.kind}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="flex items-center gap-2 text-muted">
                        <Award className="size-3.5 text-accent" aria-hidden />
                        {reward.label}
                      </span>
                      <span className="font-semibold tabular-nums">
                        {reward.amountUno} UNO
                      </span>
                    </div>
                  ))}
                </Card>
              </section>

              {/* CAL-008 : l'échéance de règlement, et ce qu'elle implique */}
              {proposal.status === "reservation" && proposal.paymentDeadline && (
                <PaymentDeadlineBanner
                  deadline={proposal.paymentDeadline}
                  paidCount={proposal.paidCount}
                  participantCount={proposal.participantCount}
                  viewerHasPaid={isParticipant && hasPaid}
                />
              )}

              {/* Podium et résultats, sur une session jouée */}
              <SessionPodium proposalId={proposal.id} status={proposal.status} />
              <SessionResults proposalId={proposal.id} status={proposal.status} />

              {/*
                SUP-002 : les vidéos ne s'affichent qu'à ceux qui ont joué la
                session, à son arbitre et aux superviseurs. Être filmé au
                futsal n'est pas consentir à une diffusion à toute la ligue.
              */}
              <SessionVideoPanel
                proposalId={proposal.id}
                enabled={
                  proposal.viewer?.isParticipant === true ||
                  proposal.referee?.id === user?.playerId ||
                  isSupervisor
                }
              />

              {/* ROLE-003 : l'arbitre, au même titre que les joueurs */}
              {(proposal.referee || isLeague) && (
                <section>
                  <SectionTitle>Arbitre</SectionTitle>
                  {proposal.referee ? (
                    <div className="flex flex-col items-center gap-1.5">
                      <FutCard
                        player={proposal.referee}
                        size="sm"
                        onClick={() => setZoomed(proposal.referee)}
                      />
                      <span className="text-[11px] font-medium text-success">
                        {proposal.referee.displayName}
                      </span>
                    </div>
                  ) : (
                    <Card>
                      <p className="text-center text-xs text-muted">
                        Aucun arbitre pour l'instant.
                      </p>
                    </Card>
                  )}
                </section>
              )}

              {/* Participants, chacun avec sa carte */}
              <section>
                <SectionTitle>Participants ({proposal.participants.length})</SectionTitle>
                <div className="grid grid-cols-3 gap-x-2 gap-y-4">
                  {proposal.participants.map((participant) => (
                    <div
                      key={participant.player.id}
                      className="flex flex-col items-center gap-1.5"
                    >
                      <FutCard
                        player={participant.player}
                        size="sm"
                        onClick={() => setZoomed(participant.player)}
                      />

                      {/* Déplacement de la note au terme de la session
                          (CARD-002) : la carte affiche la note d'aujourd'hui,
                          cette ligne dit ce que la séance lui a fait. */}
                      {participant.ratingAfter !== null &&
                        participant.ratingBefore !== null &&
                        participant.ratingAfter !== participant.ratingBefore && (
                          <span
                            className={cn(
                              "flex items-center gap-0.5 text-[10px] font-semibold tabular-nums",
                              participant.ratingAfter > participant.ratingBefore
                                ? "text-success"
                                : "text-red-300",
                            )}
                            title={`Note ${participant.ratingBefore} → ${participant.ratingAfter}`}
                          >
                            {participant.ratingAfter > participant.ratingBefore ? (
                              <ChevronUp className="size-3" aria-hidden />
                            ) : (
                              <ChevronDown className="size-3" aria-hidden />
                            )}
                            {participant.ratingAfter}
                          </span>
                        )}

                      {participant.movement ? (
                        <span
                          className={cn(
                            "flex items-center gap-1 text-[10px] font-medium",
                            participant.movement === "promoted"
                              ? "text-success"
                              : participant.movement === "relegated"
                                ? "text-red-300"
                                : "text-muted",
                          )}
                        >
                          {participant.movement === "promoted" && (
                            <ChevronUp className="size-3" aria-hidden />
                          )}
                          {participant.movement === "relegated" && (
                            <ChevronDown className="size-3" aria-hidden />
                          )}
                          {participant.sessionRank
                            ? `${participant.sessionRank}ᵉ · `
                            : ""}
                          {MOVEMENT_LABELS[participant.movement]}
                        </span>
                      ) : played ? (
                        /* Une session jouée l'a forcément été complète et
                           payée : le rappeler sous chaque carte n'apprend
                           rien. Seul le rang de session, quand il existe,
                           dit quelque chose du match. */
                        participant.sessionRank ? (
                          <span className="text-[10px] font-medium text-muted">
                            {participant.sessionRank}ᵉ de la session
                          </span>
                        ) : null
                      ) : participant.hasPaid ? (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-success">
                          <CheckCircle2 className="size-3" aria-hidden />
                          Payé
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted">En attente</span>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* Actions : dépendent du statut, de la participation et du paiement */}
              <div className="space-y-3">
                {proposal.status === "proposal" && !isParticipant && !isReferee && (
                  <Button
                    variant="accent"
                    fullWidth
                    disabled={!online}
                    loading={join.isPending}
                    onClick={() =>
                      void run(() => join.mutateAsync({ proposalId: proposal.id }))
                    }
                  >
                    Rejoindre la session
                  </Button>
                )}

                {proposal.status === "proposal" && isParticipant && (
                  <Button
                    variant="secondary"
                    fullWidth
                    disabled={!online}
                    loading={leave.isPending}
                    onClick={() =>
                      void run(() => leave.mutateAsync({ proposalId: proposal.id }))
                    }
                  >
                    Quitter la session
                  </Button>
                )}

                {proposal.status === "reservation" && isParticipant && !hasPaid && (
                  <>
                    {methods.length > 1 && (
                      <>
                        <div className="flex gap-2 overflow-x-auto no-scrollbar">
                          {methods.map((option) => (
                            <button
                              key={option}
                              type="button"
                              onClick={() => setMethod(option)}
                              className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-medium transition-colors ${
                                method === option
                                  ? "bg-accent text-background"
                                  : "bg-surface text-muted"
                              }`}
                            >
                              {PAYMENT_METHOD_LABELS[option]}
                            </button>
                          ))}
                        </div>
                        <p className="text-center text-xs text-muted">
                          {PAYMENT_METHOD_HINTS[method]}
                        </p>
                      </>
                    )}
                    <Button
                      variant="accent"
                      fullWidth
                      // STATE-003 : une écriture financière exige une connexion.
                      disabled={!online}
                      loading={pay.isPending}
                      onClick={() =>
                        void run(async () => {
                          const result = await pay.mutateAsync({
                            proposalId: proposal.id,
                            method,
                            // STATE-002 : une clé par tentative de paiement.
                            idempotencyKey: newIdempotencyKey(),
                          });
                          // Paiement externe : on redirige vers le prestataire.
                          if (result.redirectUrl) {
                            window.location.assign(result.redirectUrl);
                          }
                        })
                      }
                    >
                      Payer {proposal.priceUno} UNO
                    </Button>
                    {!online && (
                      <p className="text-center text-xs text-warning">
                        Le paiement nécessite une connexion internet.
                      </p>
                    )}
                  </>
                )}

                {/* ROLE-003 : un arbitre se propose pour diriger la session */}
                {isReferee && isLeague && (
                  <RefereeActions
                    proposal={proposal}
                    online={online}
                    onDone={() => void refresh()}
                  />
                )}

                {/* CAL-008 : se déclarer remplaçant, puis reprendre une place */}
                {proposal.status === "reservation" && !isParticipant && !isReferee && (
                  <SubstituteActions
                    proposal={proposal}
                    online={online}
                    onDone={() => void refresh()}
                  />
                )}

                {isParticipant && hasPaid && (
                  <div className="flex items-center justify-center gap-2 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm font-medium text-success">
                    <CheckCircle2 className="size-4" aria-hidden />
                    Votre participation est payée
                  </div>
                )}

                {proposal.status === "session" && (
                  <Button
                    variant="secondary"
                    fullWidth
                    onClick={() => navigate(`/sessions/${proposal.id}`)}
                  >
                    Session confirmée
                  </Button>
                )}

                {/* MATCH-007 : corriger une saisie déjà attribuée. Réservé à
                    ceux qui saisissent, et le serveur refuse de toute façon
                    à un superviseur qui a joué cette session. */}
                {proposal.status === "completed" && isSupervisor && (
                  <ReopenSession
                    proposalId={proposal.id}
                    online={online}
                    onDone={() => void refresh()}
                  />
                )}
              </div>
            </div>
          );
        }}
      </Async>

      {zoomed && (
        <PlayerCardDialog player={zoomed} onClose={() => setZoomed(null)} />
      )}
    </Screen>
  );
}

/**
 * Échéance de règlement d'une réservation (CAL-008).
 *
 * Le compte à rebours n'est pas décoratif : passé zéro, une place non réglée
 * peut être reprise par un remplaçant. L'afficher évite qu'un joueur découvre
 * la règle en perdant sa place.
 */
function PaymentDeadlineBanner({
  deadline,
  paidCount,
  participantCount,
  viewerHasPaid,
}: {
  deadline: string;
  paidCount: number;
  participantCount: number;
  viewerHasPaid: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());

  // Une minute suffit : l'échéance se compte en heures, pas en secondes.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const remaining = new Date(deadline).getTime() - now;
  const expired = remaining <= 0;
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3 text-sm",
        expired
          ? "border-error/40 bg-error/10 text-red-200"
          : "border-warning/40 bg-warning/10 text-warning",
      )}
    >
      <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="space-y-1">
        {expired ? (
          <p className="font-medium">Délai de paiement dépassé</p>
        ) : (
          <p className="font-medium">
            {hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`} pour
            régler
          </p>
        )}
        <p className="text-xs leading-relaxed opacity-90">
          {paidCount}/{participantCount} places réglées.{" "}
          {expired
            ? viewerHasPaid
              ? "Les places non réglées peuvent être reprises par des remplaçants."
              : "Votre place peut désormais être reprise par un remplaçant."
            : "Passé ce délai, une place non réglée peut être reprise par un remplaçant."}
        </p>
      </div>
    </div>
  );
}

/**
 * File d'attente d'une réservation, du point de vue d'un joueur non inscrit
 * (CAL-008).
 *
 * Deux temps distincts : se déclarer remplaçant, ce qui est possible dès que
 * la réservation est formée ; puis reprendre effectivement une place, ce que
 * le serveur n'autorise qu'une fois le délai écoulé. L'interface montre les
 * deux, mais c'est le serveur qui tranche.
 */
function SubstituteActions({
  proposal,
  online,
  onDone,
}: {
  proposal: ProposalDetail;
  online: boolean;
  onDone: () => void;
}) {
  const become = trpc.proposals.becomeSubstitute.useMutation();
  const withdraw = trpc.proposals.withdrawSubstitute.useMutation();
  const claim = trpc.proposals.claimSeat.useMutation();

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { user } = useAuth();
  const waiting = proposal.substitutes.some(
    (substitute) =>
      substitute.player.id === user?.playerId && substitute.status === "waiting",
  );
  const seats = proposal.claimableSeats;

  async function run(action: () => Promise<unknown>, message: string) {
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(message);
      onDone();
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  return (
    <div className="space-y-3">
      {proposal.substitutes.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-surface px-4 py-3">
          <p className="text-xs font-medium text-muted">
            Remplaçants ({proposal.substitutes.length})
          </p>
          <p className="mt-1 text-sm">
            {proposal.substitutes
              .map((substitute) => substitute.player.displayName)
              .join(", ")}
          </p>
        </div>
      )}

      {waiting ? (
        <>
          {seats.length > 0 && (
            <Button
              variant="accent"
              fullWidth
              disabled={!online}
              loading={claim.isPending}
              onClick={() =>
                void run(
                  () =>
                    claim.mutateAsync({
                      proposalId: proposal.id,
                      idempotencyKey: newIdempotencyKey(),
                    }),
                  "Place reprise et réglée. Vous participez à cette session.",
                )
              }
            >
              Reprendre une place — {proposal.priceUno} UNO
            </Button>
          )}
          <Button
            variant="secondary"
            fullWidth
            loading={withdraw.isPending}
            onClick={() =>
              void run(
                () => withdraw.mutateAsync({ proposalId: proposal.id }),
                "Vous n'êtes plus remplaçant.",
              )
            }
          >
            Retirer ma candidature
          </Button>
          {seats.length === 0 && (
            <p className="text-center text-xs text-muted">
              Vous êtes remplaçant. Si une place n'est pas réglée dans les
              délais, vous pourrez la prendre.
            </p>
          )}
        </>
      ) : (
        <Button
          variant="secondary"
          fullWidth
          disabled={!online}
          loading={become.isPending}
          onClick={() =>
            void run(
              () => become.mutateAsync({ proposalId: proposal.id }),
              "Vous êtes inscrit comme remplaçant.",
            )
          }
        >
          Me proposer comme remplaçant
        </Button>
      )}

      {error && (
        <p role="alert" className="text-center text-xs text-red-300">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-center text-xs text-success">
          {notice}
        </p>
      )}
    </div>
  );
}

/**
 * Actions d'un arbitre sur une session UNO League (ROLE-003).
 *
 * Un arbitre ne s'inscrit pas et ne paie pas : il se propose pour diriger.
 * Une session n'accepte qu'un arbitre, et le serveur tranche en cas de
 * simultanéité — l'interface se contente de proposer.
 */
function RefereeActions({
  proposal,
  online,
  onDone,
}: {
  proposal: ProposalDetail;
  online: boolean;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const become = trpc.proposals.becomeReferee.useMutation();
  const withdraw = trpc.proposals.withdrawReferee.useMutation();

  const [error, setError] = useState<string | null>(null);
  const mine = proposal.referee?.id === user?.playerId;
  const taken = proposal.referee !== null && !mine;
  const closed =
    proposal.status === "completed" || proposal.status === "cancelled";

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      onDone();
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  if (closed) return null;

  return (
    <div className="space-y-2">
      {mine ? (
        <>
          <div className="flex items-center justify-center gap-2 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm font-medium text-success">
            <Whistle className="size-4" aria-hidden />
            Vous arbitrez cette session
          </div>
          <Button
            variant="secondary"
            fullWidth
            loading={withdraw.isPending}
            onClick={() =>
              void run(() =>
                withdraw.mutateAsync({ proposalId: proposal.id }),
              )
            }
          >
            Me retirer de l'arbitrage
          </Button>
        </>
      ) : taken ? (
        <p className="text-center text-xs text-muted">
          Cette session a déjà un arbitre.
        </p>
      ) : (
        <Button
          variant="accent"
          fullWidth
          disabled={!online}
          loading={become.isPending}
          onClick={() =>
            void run(() => become.mutateAsync({ proposalId: proposal.id }))
          }
        >
          Me proposer comme arbitre
        </Button>
      )}

      {error && (
        <p role="alert" className="text-center text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Correction d'une session déjà clôturée (MATCH-007).
 *
 * Deux temps volontaires : la rouvrir, puis la ressaisir. La clôture a
 * distribué des distinctions, des montées de division et une note de carte ;
 * on ne corrige pas cela en écrivant par-dessus, on le défait d'abord.
 *
 * Ce que la réouverture ne défait pas est écrit avant de confirmer, pas
 * après. Une correction n'est pas une annulation, et découvrir la nuance une
 * fois le bouton pressé serait la découvrir trop tard.
 */
function ReopenSession({
  proposalId,
  online,
  onDone,
}: {
  proposalId: number;
  online: boolean;
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const reopen = trpc.supervision.reopen.useMutation();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    void tapFeedback();
    setError(null);
    try {
      await reopen.mutateAsync({ proposalId });
      onDone();
      // La session redevient « confirmée » : elle réapparaît dans la file de
      // saisie, à l'endroit exact où on la saisit d'habitude.
      navigate("/supervision");
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  if (!confirming) {
    return (
      <Button
        variant="secondary"
        fullWidth
        disabled={!online}
        onClick={() => {
          void tapFeedback();
          setConfirming(true);
        }}
      >
        <Pencil className="size-4" aria-hidden />
        Corriger les statistiques
      </Button>
    );
  }

  return (
    <Card className="space-y-3 border-amber-400/40">
      <p className="text-sm font-semibold">Rouvrir cette session ?</p>
      <p className="text-xs leading-relaxed text-muted">
        Les statistiques, l'XP, l'homme du match, les montées de division et
        les notes de carte que cette session a produits seront défaits, puis
        recalculés à partir de votre nouvelle saisie.
      </p>
      <ul className="space-y-1.5 text-xs leading-relaxed text-amber-200/90">
        <li>
          • Les UNO déjà versés restent acquis : une récompense remise n'est
          pas reprise.
        </li>
        <li>
          • Les places retirées d'autres sessions à cause d'une montée de
          division ne reviennent pas.
        </li>
      </ul>

      {error && <ErrorBanner message={error} />}

      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => setConfirming(false)}
        >
          Annuler
        </Button>
        <Button
          variant="accent"
          className="flex-1"
          loading={reopen.isPending}
          disabled={!online}
          onClick={() => void run()}
        >
          Rouvrir
        </Button>
      </div>
    </Card>
  );
}
