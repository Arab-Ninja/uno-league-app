import { useState } from "react";
import { Trophy } from "lucide-react";
import type { ProposalStatus, PublicPlayer } from "@uno/shared";
import { trpc } from "@/lib/trpc.js";
import { FutCard } from "./fut-card.js";
import { PlayerCardDialog } from "./player-card-dialog.js";
import { Card, SectionTitle } from "@/components/ui/index.js";

/**
 * Podium d'une session terminée (§8.2).
 *
 * N'apparaît que si la session est clôturée ET qu'au moins un rapport de
 * match a été validé : sans statistiques validées, il n'y a personne à
 * distinguer, et afficher un podium vide donnerait l'impression d'un défaut.
 */
export function SessionPodium({
  proposalId,
  status,
}: {
  proposalId: number;
  status: ProposalStatus;
}) {
  const [zoomed, setZoomed] = useState<PublicPlayer | null>(null);

  const podium = trpc.proposals.podium.useQuery(
    { proposalId },
    { enabled: status === "completed" },
  );

  if (status !== "completed") return null;
  if (podium.isLoading || !podium.data || podium.data.length === 0) return null;

  return (
    <section>
      <SectionTitle>Podium de la session</SectionTitle>
      <Card className="bg-gradient-to-br from-accent/10 via-surface to-surface">
        <div className="mb-4 flex items-center justify-center gap-2 text-accent">
          <Trophy className="size-4" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-wide">
            Les joueurs distingués
          </span>
        </div>

        <div className="flex flex-wrap justify-center gap-x-3 gap-y-5">
          {podium.data.map((entry) => (
            <div
              key={entry.award}
              className="flex w-[30%] min-w-[92px] flex-col items-center gap-1.5"
            >
              <FutCard
                player={entry.player}
                size="sm"
                onClick={() => setZoomed(entry.player)}
              />
              <p className="text-center text-[10px] font-semibold uppercase leading-tight tracking-wide text-accent">
                {entry.label}
              </p>
              <p className="text-[11px] font-bold tabular-nums">{entry.value}</p>
            </div>
          ))}
        </div>
      </Card>

      {zoomed && (
        <PlayerCardDialog player={zoomed} onClose={() => setZoomed(null)} />
      )}
    </section>
  );
}
