import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { describeError, trpc } from "@/lib/trpc.js";
import { Screen } from "@/components/layout/index.js";
import { Button, Card, ErrorBanner } from "@/components/ui/index.js";
import { Async } from "@/components/ui/async.js";
import { SessionSheet } from "@/components/supervision/session-queue.js";
import { useNomDeMode, useT } from "@/lib/i18n.js";

/**
 * La feuille de match d'un match personnalisé, tenue par son organisateur
 * (PRIV-003).
 *
 * La même feuille que celle de l'administration — équipes, matchs, scores,
 * statistiques, vidéo —, branchée sur les routes de l'organisateur. Rien de
 * ce qui s'y écrit ne compte ailleurs : ni XP, ni statistiques de carrière,
 * ni UNO. Elle ne sert qu'à garder le souvenir de la séance.
 *
 * Une feuille déjà enregistrée se rouvre d'un geste pour être corrigée : il
 * n'y a rien à défaire ailleurs.
 */
export function CustomSheetScreen() {
  const t = useT();
  const nomDeMode = useNomDeMode();
  const { proposalId } = useParams<{ proposalId: string }>();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const id = Number(proposalId);

  const detail = trpc.proposals.get.useQuery(
    { proposalId: id },
    { enabled: Number.isFinite(id) },
  );
  const reopen = trpc.customMatches.reopen.useMutation();
  const [error, setError] = useState<string | null>(null);

  const back = () => navigate(`/sessions/${id}`);

  return (
    <Screen
      title={t("customSheet.title")}
      back
      backTo={`/sessions/${id}`}
      withTabBar={false}
    >
      <Async query={detail}>
        {(session) => (
          <div className="space-y-4">
            <Card className="py-3">
              <p className="text-sm font-medium">
                {nomDeMode(session.modeId)} · {session.venueName}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {t("admin.sessionHeader", {
                  date: session.localDate,
                  time: session.localTimeLabel,
                  players: session.participantCount,
                })}
              </p>
            </Card>

            {error && <ErrorBanner message={error} />}

            {session.status === "completed" ? (
              <Card className="space-y-3 text-center">
                <CheckCircle2
                  className="mx-auto size-8 text-success"
                  aria-hidden
                />
                <p className="text-sm font-medium">
                  {t("customSheet.recorded")}
                </p>
                <p className="text-xs leading-relaxed text-muted">
                  {t("customSheet.recordedHint")}
                </p>
                <Button
                  variant="secondary"
                  fullWidth
                  loading={reopen.isPending}
                  onClick={async () => {
                    setError(null);
                    try {
                      await reopen.mutateAsync({ proposalId: id });
                      await utils.proposals.get.invalidate({ proposalId: id });
                      await utils.customMatches.sheet.invalidate({
                        proposalId: id,
                      });
                    } catch (caught) {
                      setError(describeError(caught).message);
                    }
                  }}
                >
                  {t("customSheet.reopen")}
                </Button>
                <Button variant="ghost" fullWidth onClick={back}>
                  {t("common.back")}
                </Button>
              </Card>
            ) : (
              <SessionSheet
                proposalId={id}
                organizer
                onDone={async () =>
                  navigate(`/sessions/${id}`, { replace: true })
                }
                onCancel={back}
              />
            )}
          </div>
        )}
      </Async>
    </Screen>
  );
}
