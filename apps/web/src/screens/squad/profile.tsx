import { useState } from "react";
import { useParams } from "react-router-dom";
import { SQUAD_ROLE_LABELS } from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { useLibelles, useT } from "@/lib/i18n.js";
import { tapFeedback } from "@/lib/native.js";
import { Screen } from "@/components/layout/index.js";
import { Async } from "@/components/ui/async.js";
import {
  Badge,
  Button,
  Card,
  ErrorBanner,
  SectionTitle,
} from "@/components/ui/index.js";
import { SquadHeader } from "./index.js";

/**
 * Profil d'un SQUAD vu de l'extérieur (SQUAD-002).
 *
 * Le serveur décide de ce qui s'y affiche : l'effectif et le bilan sont
 * publics, la trésorerie et les demandes en attente ne le sont pas. L'écran
 * ne cache rien lui-même — il ne reçoit tout simplement pas ce qui ne le
 * regarde pas.
 */
export function SquadProfileScreen() {
  const t = useT();
  const { slug } = useParams<{ slug: string }>();
  const squad = trpc.squads.get.useQuery({ slug: slug ?? "" });

  return (
    <Screen title={t("club.title")} back backTo="/squad">
      <Async query={squad}>
        {(view) => <SquadProfileBody squadId={view.id} />}
      </Async>
    </Screen>
  );
}

function SquadProfileBody({ squadId }: { squadId: number }) {
  const t = useT();
  const L = useLibelles();
  const utils = trpc.useUtils();
  const detail = trpc.squads.detail.useQuery({ squadId });
  const request = trpc.squads.requestToJoin.useMutation();
  const [failure, setFailure] = useState<string | null>(null);

  async function join() {
    void tapFeedback();
    setFailure(null);
    try {
      await request.mutateAsync({ squadId });
      await utils.squads.detail.invalidate({ squadId });
      await utils.squads.mine.invalidate();
    } catch (caught) {
      setFailure(describeError(caught).message);
    }
  }

  return (
    <Async query={detail}>
      {(squad) => (
        <div className="space-y-5">
          <SquadHeader squad={squad} />

          {failure && <ErrorBanner message={failure} />}

          {squad.viewer.role === null && (
            <>
              {squad.viewer.hasPendingRequest ? (
                <Card>
                  <p className="text-center text-xs text-muted">
                    {t("club.requestSent")}
                  </p>
                </Card>
              ) : (
                <Button
                  variant="accent"
                  fullWidth
                  loading={request.isPending}
                  disabled={
                    !squad.viewer.mayRequestToJoin || squad.status !== "active"
                  }
                  onClick={() => void join()}
                >
                  {squad.status !== "active"
                    ? t("club.closedToNew")
                    : squad.viewer.mayRequestToJoin
                      ? t("club.askToJoin")
                      : t("club.alreadyInClub")}
                </Button>
              )}
            </>
          )}

          <section>
            <SectionTitle>
              {t("club.squad", { count: squad.memberCount })}
            </SectionTitle>
            <div className="space-y-2">
              {squad.members.map((member) => (
                <Card
                  key={member.player.id}
                  className="flex items-center gap-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {member.player.displayName}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {member.player.division ?? t("profile.referee")} ·{" "}
                      {t("club.rating", { rating: member.player.rating })}
                    </p>
                  </div>
                  {member.role !== "member" && (
                    <Badge
                      tone={member.role === "founder" ? "accent" : "primary"}
                    >
                      {L.squadRole[member.role]}
                    </Badge>
                  )}
                </Card>
              ))}
            </div>
          </section>
        </div>
      )}
    </Async>
  );
}
