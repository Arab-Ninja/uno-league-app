import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Award,
  CheckCircle2,
  Clock,
  MapPin,
  Users,
} from "lucide-react";
import {
  PAYMENT_METHOD_LABELS,
  formatEur,
  type PaymentMethod,
} from "@uno/shared";
import { describeError, newIdempotencyKey, trpc } from "@/lib/trpc.js";
import { formatLongDate } from "@/lib/format.js";
import { notificationFeedback } from "@/lib/native.js";
import { useOnline } from "@/lib/use-online.js";
import { Screen } from "@/components/layout/index.js";
import {
  Avatar,
  DivisionBadge,
  ProposalStatusBadge,
} from "@/components/domain/index.js";
import { Async } from "@/components/ui/async.js";
import {
  Button,
  Card,
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

  const id = Number(proposalId);
  const detail = trpc.proposals.get.useQuery({ proposalId: id }, { enabled: Number.isFinite(id) });
  const config = trpc.proposals.config.useQuery();

  const join = trpc.proposals.join.useMutation();
  const leave = trpc.proposals.leave.useMutation();
  const pay = trpc.proposals.pay.useMutation();

  const [action, setAction] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("uno");

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
    <Screen title="Détail de la session" back withTabBar={false}>
      <Async query={detail}>
        {(proposal) => {
          const viewer = proposal.viewer;
          const isParticipant = viewer?.isParticipant ?? false;
          const hasPaid = viewer?.hasPaid ?? false;

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
                      {proposal.modeId === "league" ? "UNO League" : "Match amical"}
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

              {/* Progression des inscriptions et des paiements */}
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

              {/* Récompenses de la session */}
              <section>
                <SectionTitle>Récompenses</SectionTitle>
                <Card className="space-y-2">
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

              {/* Participants */}
              <section>
                <SectionTitle>Participants ({proposal.participants.length})</SectionTitle>
                <Card className="space-y-3">
                  {proposal.participants.map((participant) => (
                    <div key={participant.playerId} className="flex items-center gap-3">
                      <Avatar
                        name={participant.displayName}
                        url={participant.profilePhotoUrl}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {participant.displayName}
                      </span>
                      {participant.hasPaid ? (
                        <span className="flex items-center gap-1 text-xs font-medium text-success">
                          <CheckCircle2 className="size-3.5" aria-hidden />
                          Payé
                        </span>
                      ) : (
                        <span className="text-xs text-muted">En attente</span>
                      )}
                    </div>
                  ))}
                </Card>
              </section>

              {/* Actions : dépendent du statut, de la participation et du paiement */}
              <div className="space-y-3">
                {proposal.status === "proposal" && !isParticipant && (
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
              </div>
            </div>
          );
        }}
      </Async>
    </Screen>
  );
}
