import { useNavigate, useParams } from "react-router-dom";
import { CalendarClock } from "lucide-react";
import { gameModeName } from "@uno/shared";
import { trpc } from "@/lib/trpc.js";
import { Screen } from "@/components/layout/index.js";
import { Card } from "@/components/ui/index.js";
import { SessionSheet } from "@/components/supervision/session-queue.js";

/**
 * Saisie des résultats d'une session, ouverte depuis la session elle-même
 * (MATCH-003, SQUAD-005).
 *
 * La console d'administration propose une file d'attente : les sessions dont
 * l'heure est passée. Elle ne suffit pas. Un match SQUAD est créé à l'avance,
 * dès que les deux effectifs sont complets et réglés ; il n'entre dans cette
 * file qu'après le coup d'envoi, et jusque-là sa feuille n'était accessible
 * par aucun chemin — c'est ce qui s'est vu à l'essai.
 *
 * Cet écran ouvre la feuille par son identifiant, quel que soit le mode et
 * quelle que soit l'heure. Saisir avant le coup d'envoi reste une anomalie :
 * l'écran la signale plutôt que de l'interdire, car c'est l'administration
 * qui sait ce qui s'est joué.
 */
export function SessionEntryScreen() {
  const { proposalId } = useParams<{ proposalId: string }>();
  const navigate = useNavigate();
  const id = Number(proposalId);

  const detail = trpc.proposals.get.useQuery(
    { proposalId: id },
    { enabled: Number.isFinite(id) },
  );

  const session = detail.data ?? null;
  const upcoming =
    session !== null && new Date(session.startsAtUtc).getTime() > Date.now();

  return (
    <Screen
      title="Saisir les statistiques"
      back
      backTo={`/sessions/${id}`}
      withTabBar={false}
    >
      {session && (
        <Card className="mb-4 py-3">
          <p className="text-sm font-medium">
            {gameModeName(session.modeId)} · {session.venueName}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {session.localDate} · {session.localTimeLabel} ·{" "}
            {session.participantCount} joueurs
          </p>
        </Card>
      )}

      {upcoming && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-xs leading-relaxed text-warning">
          <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Cette session n'a pas encore eu lieu. Enregistrer sa feuille la
            clôturera : distinctions, récompenses et mouvements de division en
            découleront.
          </span>
        </div>
      )}

      <SessionSheet
        proposalId={id}
        onDone={async () => navigate(`/sessions/${id}`, { replace: true })}
        onCancel={() => navigate(`/sessions/${id}`)}
      />
    </Screen>
  );
}
