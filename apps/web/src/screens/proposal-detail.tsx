import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
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
  type ProposalParticipantView,
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
import {
  DivisionBadge,
  ProposalStatusBadge,
} from "@/components/domain/index.js";
import { FutCard } from "@/components/fut-card/fut-card.js";
import { PlayerCardDialog } from "@/components/fut-card/player-card-dialog.js";
import { SessionPodium } from "@/components/fut-card/session-podium.js";
import { SessionResults } from "@/components/fut-card/session-results.js";
import { SessionVideoPanel } from "@/components/supervision/session-videos.js";
import { BigfootPitch } from "@/components/pitch/bigfoot-pitch.js";
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

  const { user, isAdmin, isSupervisor } = useAuth();

  const id = Number(proposalId);
  const detail = trpc.proposals.get.useQuery(
    { proposalId: id },
    { enabled: Number.isFinite(id) },
  );
  const config = trpc.proposals.config.useQuery();
  const profile = trpc.players.me.useQuery();

  const join = trpc.proposals.join.useMutation();
  const leave = trpc.proposals.leave.useMutation();
  const chooseSide = trpc.proposals.chooseSide.useMutation();
  const choosePitchSlot = trpc.proposals.choosePitchSlot.useMutation();
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
    <Screen
      title="Détail de la session"
      back
      backTo="/calendrier"
      withTabBar={false}
    >
      <Async query={detail}>
        {(proposal) => {
          const viewer = proposal.viewer;
          const isParticipant = viewer?.isParticipant ?? false;
          const hasPaid = viewer?.hasPaid ?? false;
          // ROLE-003 : un arbitre ne s'inscrit pas comme joueur, il se propose
          // pour diriger. Les deux parcours ne se croisent jamais.
          const isReferee = profile.data?.accountType === "referee";

          /*
           * Les modes où le camp se choisit (MODE-003) : le joueur s'inscrit
           * dans une équipe, pas seulement dans la séance. Ailleurs, les
           * équipes se composent à la clôture et il n'y a rien à afficher.
           */
          const sidesChosen =
            getGameMode(proposal.modeId)?.playersChooseSide === true;
          // L'effectif d'un camp se déduit du total attendu : une séance à 16
          // inscrits se joue à huit contre huit.
          const perSide = Math.floor(proposal.minParticipants / 2);
          const sideCount = (camp: "A" | "B") =>
            proposal.participants.filter(
              (participant) => participant.side === camp,
            ).length;
          const ownSide =
            proposal.participants.find(
              (participant) => participant.player.id === user?.playerId,
            )?.side ?? null;

          /*
           * La grille des cartes, rendue une fois par groupe : une seule
           * fois d'ordinaire, une fois par camp en grand foot. Le même
           * rendu pour les deux — deux copies auraient divergé.
           */
          const participantGrid = (list: ProposalParticipantView[]) => (
            <div className="grid grid-cols-3 gap-x-2 gap-y-4">
              {list.map((participant) => (
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
          );
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
                  {/* Un terrain gratuit annonce « Gratuit », pas « 0 UNO
                      (0,00 €) » : le second se lit comme un prix qu'on aurait
                      oublié de remplir. */}
                  <span className="text-xl font-bold text-accent">
                    {proposal.priceUno === 0 ? (
                      "Gratuit"
                    ) : (
                      <>
                        {proposal.priceUno} UNO
                        <span className="ml-1.5 text-xs font-normal text-muted">
                          ({formatEur(proposal.priceUno)})
                        </span>
                      </>
                    )}
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
                    {/*
                    Une réservation ouverte aux remplaçants compte plus
                    d'inscrits que de places. « 11 / 10 » se lisait comme une
                    erreur d'affichage : on dit alors les deux nombres pour ce
                    qu'ils sont.
                  */}
                    <span className="tabular-nums text-muted">
                      {proposal.participantCount > proposal.minParticipants
                        ? `${proposal.participantCount} inscrits pour ${proposal.minParticipants} places`
                        : `${proposal.participantCount} / ${proposal.minParticipants}`}
                    </span>
                  </div>
                  <ProgressBar
                    value={proposal.participantCount}
                    max={proposal.minParticipants}
                    tone={
                      proposal.participantCount >= proposal.minParticipants
                        ? "success"
                        : "accent"
                    }
                    label="Inscriptions"
                  />

                  {proposal.status !== "proposal" && (
                    <>
                      <div className="mb-2 mt-4 flex items-center justify-between text-sm">
                        <span className="font-medium">Paiements</span>
                        {/* Ce sont les places qui se paient, pas les inscrits. */}
                        <span className="tabular-nums text-muted">
                          {proposal.paidCount} / {proposal.minParticipants}
                        </span>
                      </div>
                      <ProgressBar
                        value={proposal.paidCount}
                        max={Math.max(1, proposal.minParticipants)}
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
              {proposal.status === "reservation" &&
                proposal.paymentDeadline && (
                  <PaymentDeadlineBanner
                    deadline={proposal.paymentDeadline}
                    paidCount={proposal.paidCount}
                    seats={proposal.minParticipants}
                    viewerHasPaid={isParticipant && hasPaid}
                  />
                )}

              {/* Podium et résultats, sur une session jouée */}
              <SessionPodium
                proposalId={proposal.id}
                status={proposal.status}
              />
              <SessionResults
                proposalId={proposal.id}
                status={proposal.status}
              />

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

              {/*
                Participants. En Grand Foot, c'est un terrain : on y voit qui
                joue où, et on s'y place soi-même (MODE-003). Ailleurs, les
                cartes suffisent — les équipes n'existent pas encore.

                Se placer reste possible sur une séance confirmée : en Grand
                Foot, « session » veut dire complète, pas jouée — le plateau
                plein bascule aussitôt, faute de paiement à attendre. Seule
                une séance disputée ou annulée fige son terrain.
              */}
              {sidesChosen ? (
                <SidesLineup
                  proposal={proposal}
                  perSide={perSide}
                  ownSide={ownSide}
                  myPlayerId={user?.playerId}
                  editable={
                    isParticipant &&
                    proposal.status !== "completed" &&
                    proposal.status !== "cancelled"
                  }
                  busy={choosePitchSlot.isPending}
                  onSlot={(slot) =>
                    void run(() =>
                      choosePitchSlot.mutateAsync({
                        proposalId: proposal.id,
                        slot,
                      }),
                    )
                  }
                  onOpen={setZoomed}
                />
              ) : (
                <DraftedLineup
                  proposal={proposal}
                  myPlayerId={user?.playerId}
                  busy={choosePitchSlot.isPending}
                  onSlot={(slot) =>
                    void run(() =>
                      choosePitchSlot.mutateAsync({
                        proposalId: proposal.id,
                        slot,
                      }),
                    )
                  }
                  onOpen={setZoomed}
                  fallback={() => participantGrid(proposal.participants)}
                />
              )}

              {/* Actions : dépendent du statut, de la participation et du paiement */}
              <div className="space-y-3">
                {proposal.status === "proposal" &&
                  !isParticipant &&
                  !isReferee &&
                  (sidesChosen ? (
                    /*
                     * Deux boutons plutôt qu'un (MODE-003) : on ne rejoint pas
                     * une séance de grand foot, on rejoint une équipe. Un
                     * camp complet se voit avant d'être touché — apprendre
                     * qu'il est plein après avoir cliqué est une impasse
                     * inutile.
                     */
                    <div className="grid grid-cols-2 gap-2">
                      {(["A", "B"] as const).map((camp) => {
                        const complet = sideCount(camp) >= perSide;
                        return (
                          <Button
                            key={camp}
                            variant="accent"
                            fullWidth
                            disabled={!online || complet}
                            loading={join.isPending}
                            onClick={() =>
                              void run(() =>
                                join.mutateAsync({
                                  proposalId: proposal.id,
                                  side: camp,
                                }),
                              )
                            }
                          >
                            {complet
                              ? `Équipe ${camp} complète`
                              : `Rejoindre l'équipe ${camp}`}
                          </Button>
                        );
                      })}
                    </div>
                  ) : (
                    <Button
                      variant="accent"
                      fullWidth
                      disabled={!online}
                      loading={join.isPending}
                      onClick={() =>
                        void run(() =>
                          join.mutateAsync({ proposalId: proposal.id }),
                        )
                      }
                    >
                      Rejoindre la session
                    </Button>
                  ))}

                {/*
                  Changer de camp tant que la séance n'est pas jouée : rien
                  n'est engagé, et deux joueurs qui veulent échanger la veille
                  du match n'ont aucune raison d'en être empêchés.
                */}
                {sidesChosen && isParticipant && ownSide && (
                  <Button
                    variant="secondary"
                    fullWidth
                    disabled={
                      !online ||
                      sideCount(ownSide === "A" ? "B" : "A") >= perSide
                    }
                    loading={chooseSide.isPending}
                    onClick={() =>
                      void run(() =>
                        chooseSide.mutateAsync({
                          proposalId: proposal.id,
                          side: ownSide === "A" ? "B" : "A",
                        }),
                      )
                    }
                  >
                    Passer dans l'équipe {ownSide === "A" ? "B" : "A"}
                  </Button>
                )}

                {(proposal.status === "proposal" ||
                  (proposal.status === "session" && proposal.priceUno === 0)) &&
                  isParticipant && (
                    <Button
                      variant="secondary"
                      fullWidth
                      disabled={!online}
                      loading={leave.isPending}
                      onClick={() =>
                        void run(() =>
                          leave.mutateAsync({ proposalId: proposal.id }),
                        )
                      }
                    >
                      Quitter la session
                    </Button>
                  )}

                {proposal.status === "reservation" &&
                  isParticipant &&
                  !hasPaid && (
                    <>
                      {/*
                      Un bouton par moyen de paiement, plutôt qu'un sélecteur
                      suivi d'un bouton unique. Le sélecteur demandait deux
                      gestes et cachait ce qui était disponible derrière un
                      choix déjà fait : « Payer 200 UNO » restait affiché alors
                      qu'une puce Bancontact était sélectionnée.
                    */}
                      {methods.map((option) => (
                        <PayButton
                          key={option}
                          method={option}
                          priceUno={proposal.priceUno}
                          online={online}
                          pending={pay.isPending && method === option}
                          onPay={() => {
                            setMethod(option);
                            void run(async () => {
                              const result = await pay.mutateAsync({
                                proposalId: proposal.id,
                                method: option,
                                // STATE-002 : une clé par tentative de paiement.
                                idempotencyKey: newIdempotencyKey(),
                              });
                              // Paiement externe : redirection vers le prestataire.
                              if (result.redirectUrl) {
                                window.location.assign(result.redirectUrl);
                              }
                            });
                          }}
                        />
                      ))}
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
                {proposal.status === "reservation" &&
                  !isParticipant &&
                  !isReferee && (
                    <SubstituteActions
                      proposal={proposal}
                      online={online}
                      onDone={() => void refresh()}
                    />
                  )}

                {/*
                  Une fois la session jouée et ses statistiques attribuées, ce
                  rappel n'apprend plus rien : ce qui compte alors, c'est le
                  résultat. Il ne s'affiche donc que tant que la séance est
                  devant soi.
                */}
                {isParticipant && hasPaid && !played && (
                  <div className="flex items-center justify-center gap-2 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm font-medium text-success">
                    <CheckCircle2 className="size-4" aria-hidden />
                    Votre participation est payée
                  </div>
                )}

                {/*
                  MATCH-003 : la saisie s'ouvre depuis la session.

                  La file d'attente de la console ne liste que les sessions
                  dont l'heure est passée. Un match SQUAD, lui, est créé dès
                  que les deux effectifs sont complets et réglés : avant son
                  coup d'envoi, sa feuille n'était accessible par aucun chemin
                  (SQUAD-005).
                */}
                {proposal.status === "session" && isAdmin && (
                  <Button
                    variant="accent"
                    fullWidth
                    onClick={() => {
                      void tapFeedback();
                      navigate(`/sessions/${proposal.id}/saisie`);
                    }}
                  >
                    <Pencil className="size-4" aria-hidden />
                    Saisir les statistiques
                  </Button>
                )}

                {/*
                  MATCH-007 : corriger une saisie déjà attribuée.

                  **Réservé à l'administration**, et pas aux superviseurs
                  (§39) : rouvrir une session réécrit directement le
                  classement, les récompenses et les divisions. La route est
                  en `adminProcedure` depuis ce jour-là, mais l'écran, lui,
                  continuait d'offrir le bouton à tout superviseur — qui ne
                  récoltait qu'un refus. Un bouton qui échoue toujours vaut
                  moins que pas de bouton.
                */}
                {proposal.status === "completed" && isAdmin && (
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
 * Un bouton d'appel par moyen de paiement (CAL-009 / CAL-010).
 *
 * Le libellé dit ce que le bouton fait et ce qu'il coûte, parce qu'un bouton
 * de paiement qui ne montre pas le montant se clique à l'aveugle. La
 * précision sous le bouton reste celle du moyen : elle explique le chemin
 * (solde débité, redirection bancaire), pas le prix.
 *
 * Apple Pay n'est pas un moyen de paiement distinct chez Stripe mais une
 * façon de présenter une carte. On ne le nomme donc que là où l'appareil
 * l'annonce lui-même : le promettre sur un Android serait mentir, et le taire
 * sur un iPhone ferait manquer le geste le plus court.
 */
function PayButton({
  method,
  priceUno,
  online,
  pending,
  onPay,
}: {
  method: PaymentMethod;
  priceUno: number;
  online: boolean;
  pending: boolean;
  onPay: () => void;
}) {
  const label =
    method === "stripe_card"
      ? cardMethodLabel()
      : PAYMENT_METHOD_LABELS[method];

  return (
    <div className="space-y-1">
      <Button
        variant={method === "uno" ? "accent" : "secondary"}
        fullWidth
        // STATE-003 : une écriture financière exige une connexion.
        disabled={!online}
        loading={pending}
        icon={
          method === "uno" ? undefined : (
            <CreditCard className="size-4" aria-hidden />
          )
        }
        onClick={onPay}
      >
        {method === "uno"
          ? `Payer ${priceUno} UNO`
          : `Payer ${formatEur(priceUno)} — ${label}`}
      </Button>
      <p className="text-center text-xs text-muted">
        {PAYMENT_METHOD_HINTS[method]}
      </p>
    </div>
  );
}

/**
 * Libellé du paiement par carte, adapté à l'appareil.
 *
 * `ApplePaySession` n'existe que dans Safari sur un appareil Apple capable de
 * payer ; sa présence est donc le seul signal honnête. Ailleurs, on s'en tient
 * au libellé générique, Google Pay apparaissant de lui-même dans Checkout
 * quand le navigateur le propose.
 */
function cardMethodLabel(): string {
  const applePay = typeof window !== "undefined" && "ApplePaySession" in window;
  return applePay ? "Apple Pay ou carte" : PAYMENT_METHOD_LABELS.stripe_card;
}

/**
 * Échéance de règlement d'une réservation (CAL-008).
 *
 * Le compte à rebours n'est pas décoratif : passé zéro, des remplaçants
 * peuvent régler leur place, et celles qui resteront impayées quand le
 * compte y sera tomberont. L'afficher évite qu'un joueur découvre la règle
 * en perdant sa place.
 *
 * Le dénominateur est le nombre de places, jamais le nombre d'inscrits : une
 * réservation ouverte aux remplaçants compte plus d'inscrits que de places, et
 * « 12/17 places réglées » aurait annoncé un objectif qui n'existe pas.
 */
/**
 * Le terrain d'une séance où le camp se choisit (MODE-003, MODE-004).
 *
 * Le Grand Foot et l'amical : deux modes, un même geste. On s'inscrit dans
 * une équipe, puis on prend une place dedans — à sept contre sept sur gazon
 * comme à cinq contre cinq en salle, la seule différence étant la formation.
 *
 * **Un camp à la fois.** Deux terrains empilés sur un téléphone font deux
 * écrans de défilement, et on ne regarde jamais les deux en même temps : on
 * cherche sa place, puis on jette un œil en face. L'onglet ouvre sur son
 * propre camp quand on en a un.
 *
 * On ne se place que dans son équipe : le camp d'en face se regarde. Le
 * serveur applique la même règle — ce que cet écran n'offre pas reste
 * interdit là-bas.
 */
function SidesLineup({
  proposal,
  perSide,
  ownSide,
  myPlayerId,
  editable,
  busy,
  onSlot,
  onOpen,
}: {
  proposal: ProposalDetail;
  perSide: number;
  ownSide: "A" | "B" | null;
  myPlayerId: number | undefined;
  editable: boolean;
  busy: boolean;
  onSlot: (slot: string | null) => void;
  onOpen: (player: PublicPlayer) => void;
}) {
  const [camp, setCamp] = useState<"A" | "B">(ownSide ?? "A");

  const inSide = (side: "A" | "B") =>
    proposal.participants.filter((participant) => participant.side === side);

  const shown = inSide(camp);
  const occupants = new Map(
    shown
      .filter((participant) => participant.pitchSlot !== null)
      .map((participant) => [participant.pitchSlot!, participant.player]),
  );
  const unplaced = shown.filter(
    (participant) => participant.pitchSlot === null,
  );

  const mine = proposal.participants.find(
    (participant) => participant.player.id === myPlayerId,
  );
  const mySlot = mine?.side === camp ? (mine.pitchSlot ?? null) : null;

  return (
    <section>
      <SectionTitle>
        Sur le terrain ({proposal.participants.length} /{" "}
        {proposal.minParticipants})
      </SectionTitle>

      {/* Le choix du camp affiché, et non du camp joué : changer d'équipe se
          fait plus bas, avec les autres décisions qui engagent. */}
      <div className="mb-2 grid grid-cols-2 gap-2">
        {(["A", "B"] as const).map((side) => (
          <button
            key={side}
            type="button"
            onClick={() => {
              void tapFeedback();
              setCamp(side);
            }}
            className={cn(
              "min-h-[40px] rounded-xl border px-3 text-sm font-medium transition-colors",
              camp === side
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-surface text-muted hover:bg-surface-raised",
            )}
            aria-pressed={camp === side}
          >
            Équipe {side}
            <span className="ml-1.5 text-xs tabular-nums opacity-80">
              ({inSide(side).length}/{perSide})
            </span>
            {ownSide === side && (
              <span className="ml-1 text-[10px] uppercase">· vous</span>
            )}
          </button>
        ))}
      </div>

      <BigfootPitch
        playersPerTeam={perSide}
        occupants={occupants}
        mySlot={mySlot}
        myPlayerId={myPlayerId}
        editable={editable && ownSide === camp && !busy}
        onSlot={(slot) => onSlot(slot === mySlot ? null : slot)}
        onOpen={onOpen}
      />

      <p className="mt-2 text-center text-xs text-muted">
        {!editable
          ? "La composition annoncée par les joueurs."
          : ownSide !== camp
            ? "Vous regardez l'équipe adverse. Votre place se choisit dans la vôtre."
            : mySlot === null
              ? "Touchez une place libre pour l'occuper."
              : "Touchez votre place pour la libérer, ou une autre pour vous déplacer."}
      </p>

      {/*
        Ceux qui n'ont pas de poste. Ce n'est pas un défaut — on peut venir
        jouer sans se placer d'avance —, mais il faut les voir : sinon un
        inscrit disparaît de l'écran parce qu'il n'a touché aucune pastille.
      */}
      {unplaced.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-medium text-muted">
            Sans poste ({unplaced.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unplaced.map((participant) => (
              <button
                key={participant.player.id}
                type="button"
                onClick={() => onOpen(participant.player)}
                className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs transition-colors hover:bg-surface-raised"
              >
                {participant.player.displayName}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Le terrain d'une séance dont les équipes sont tirées (MODE-004).
 *
 * **Ce que la UNO League promet, et ce qu'elle ne promet pas.** On n'y
 * choisit ni ses coéquipiers ni son camp : les trois équipes sortent d'un
 * tirage par chapeaux, et c'est ce qui donne sa valeur au classement. Le
 * poste, lui, n'avait aucune raison d'être imposé aussi — une fois l'équipe
 * connue, chacun dit ce qu'il vient y jouer.
 *
 * Les équipes n'existent qu'à partir de la réservation. Avant, il n'y a rien
 * à montrer d'autre que les inscrits : c'est ce que `fallback` affiche.
 */
function DraftedLineup({
  proposal,
  myPlayerId,
  busy,
  onSlot,
  onOpen,
  fallback,
}: {
  proposal: ProposalDetail;
  myPlayerId: number | undefined;
  busy: boolean;
  onSlot: (slot: string | null) => void;
  onOpen: (player: PublicPlayer) => void;
  fallback: () => ReactNode;
}) {
  const squads = trpc.proposals.teams.useQuery({ proposalId: proposal.id });

  const teams = squads.data ?? [];
  const mine = teams.find((team) =>
    team.players.some((player) => player.id === myPlayerId),
  );
  const [shown, setShown] = useState<number | null>(null);

  if (teams.length === 0) {
    return (
      <section>
        <SectionTitle>
          Participants ({proposal.participants.length})
        </SectionTitle>
        {fallback()}
        <p className="mt-2 text-center text-xs text-muted">
          Les équipes se tirent dès que le plateau est complet.
        </p>
      </section>
    );
  }

  const current =
    teams.find((team) => team.id === (shown ?? mine?.id)) ?? teams[0]!;
  const teamSize = Math.max(
    1,
    Math.floor(proposal.minParticipants / teams.length),
  );

  const occupants = new Map(
    current.slots.flatMap((slot) => {
      const player = current.players.find((row) => row.id === slot.playerId);
      return player ? [[slot.pitchSlot, player] as const] : [];
    }),
  );
  const unplaced = current.players.filter(
    (player) => !current.slots.some((slot) => slot.playerId === player.id),
  );

  const mySlot =
    current.id === mine?.id
      ? (current.slots.find((slot) => slot.playerId === myPlayerId)
          ?.pitchSlot ?? null)
      : null;

  // Le banc : inscrit, mais qu'aucune équipe ne porte. Sa place se gagne en
  // réglant, et il faut donc le voir plutôt que de le faire disparaître.
  const onPitch = new Set(
    teams.flatMap((team) => team.players.map((p) => p.id)),
  );
  const bench = proposal.participants.filter(
    (participant) => !onPitch.has(participant.player.id),
  );

  const jouee =
    proposal.status === "completed" || proposal.status === "cancelled";

  return (
    <section>
      <SectionTitle>
        Les équipes ({proposal.participants.length} / {proposal.minParticipants}
        )
      </SectionTitle>

      <div className="mb-2 grid grid-cols-3 gap-2">
        {teams.map((team) => (
          <button
            key={team.id}
            type="button"
            onClick={() => {
              void tapFeedback();
              setShown(team.id);
            }}
            className={cn(
              "min-h-[40px] rounded-xl border px-2 text-xs font-medium transition-colors",
              current.id === team.id
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-surface text-muted hover:bg-surface-raised",
            )}
            aria-pressed={current.id === team.id}
          >
            {team.name}
            {mine?.id === team.id && (
              <span className="ml-1 text-[10px] uppercase">· vous</span>
            )}
          </button>
        ))}
      </div>

      <BigfootPitch
        playersPerTeam={teamSize}
        occupants={occupants}
        mySlot={mySlot}
        myPlayerId={myPlayerId}
        editable={current.id === mine?.id && !jouee && !busy}
        onSlot={(slot) => onSlot(slot === mySlot ? null : slot)}
        onOpen={onOpen}
      />

      <p className="mt-2 text-center text-xs text-muted">
        {jouee
          ? "La composition annoncée par les joueurs."
          : mine === undefined
            ? "Les équipes sont tirées au sort : on ne choisit pas ses coéquipiers."
            : current.id !== mine.id
              ? "Vous regardez une autre équipe. Votre place se choisit dans la vôtre."
              : mySlot === null
                ? "Touchez une place libre pour l'occuper."
                : "Touchez votre place pour la libérer, ou une autre pour vous déplacer."}
      </p>

      {unplaced.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-medium text-muted">
            Sans poste ({unplaced.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unplaced.map((player) => (
              <button
                key={player.id}
                type="button"
                onClick={() => onOpen(player)}
                className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs transition-colors hover:bg-surface-raised"
              >
                {player.displayName}
              </button>
            ))}
          </div>
        </div>
      )}

      {bench.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-medium text-muted">
            Sur le banc ({bench.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {bench.map((participant) => (
              <button
                key={participant.player.id}
                type="button"
                onClick={() => onOpen(participant.player)}
                className="rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs text-warning transition-colors"
              >
                {participant.player.displayName}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
            Une place non réglée revient à un remplaçant : régler la sienne,
            c'est entrer sur le terrain.
          </p>
        </div>
      )}
    </section>
  );
}

function PaymentDeadlineBanner({
  deadline,
  paidCount,
  seats,
  viewerHasPaid,
}: {
  deadline: string;
  paidCount: number;
  seats: number;
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
          {paidCount}/{seats} places réglées.{" "}
          {expired
            ? viewerHasPaid
              ? "Des remplaçants peuvent régler leur place. Quand toutes les places seront payées, celles qui ne le sont pas seront retirées."
              : "Des remplaçants peuvent désormais régler leur place. Réglez la vôtre : quand toutes les places seront payées, les impayées seront retirées."
            : "Passé ce délai, des remplaçants pourront régler leur place à votre place."}
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
 * la réservation est formée ; puis régler sa place, ce que le serveur
 * n'autorise qu'une fois le délai écoulé. L'interface montre les deux, mais
 * c'est le serveur qui tranche.
 *
 * On ne parle plus de « reprendre la place de quelqu'un » : le remplaçant qui
 * paie entre dans la réservation sans faire sortir personne. Les places non
 * réglées ne tombent que lorsque le compte des paiements est complet.
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
      substitute.player.id === user?.playerId &&
      substitute.status === "waiting",
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
            <p className="text-xs leading-relaxed text-muted">
              {seats.length === 1
                ? "Une place n'est toujours pas réglée."
                : `${seats.length} places ne sont toujours pas réglées.`}{" "}
              En payant, vous entrez dans la réservation sans faire sortir
              personne : ce sont les places encore impayées au moment où le
              compte sera complet qui seront retirées.
            </p>
          )}
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
                  "Place réglée. Vous participez à cette session.",
                )
              }
            >
              Prendre une place — {proposal.priceUno} UNO
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
              délais, vous pourrez régler la vôtre et entrer dans la
              réservation.
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
              void run(() => withdraw.mutateAsync({ proposalId: proposal.id }))
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
        Les statistiques, l'XP, l'homme du match, les montées de division et les
        notes de carte que cette session a produits seront défaits, puis
        recalculés à partir de votre nouvelle saisie.
      </p>
      <ul className="space-y-1.5 text-xs leading-relaxed text-amber-200/90">
        <li>
          • Les UNO déjà versés restent acquis : une récompense remise n'est pas
          reprise.
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
