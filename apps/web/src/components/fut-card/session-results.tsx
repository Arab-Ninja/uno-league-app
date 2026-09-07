import {
  RANKING_STATS,
  RANKING_STAT_LABELS,
  RANKING_STAT_SHORT,
  formatPoints,
  type ProposalStatus,
} from "@uno/shared";
import { trpc } from "@/lib/trpc.js";
import { cn } from "@/lib/cn.js";
import { Avatar } from "@/components/domain/index.js";
import { Card, SectionTitle } from "@/components/ui/index.js";

/**
 * Résultats d'une session jouée : score de chaque match et feuille de match.
 *
 * Ne s'affiche que lorsqu'au moins un rapport a été validé. Une session
 * confirmée mais pas encore jouée n'a rien à montrer ici, et un tableau vide
 * passerait pour un défaut.
 */
export function SessionResults({
  proposalId,
  status,
}: {
  proposalId: number;
  status: ProposalStatus;
}) {
  const relevant = status === "session" || status === "completed";

  const matches = trpc.proposals.matches.useQuery(
    { proposalId },
    { enabled: relevant },
  );
  const scoreboard = trpc.proposals.scoreboard.useQuery(
    { proposalId },
    { enabled: relevant },
  );

  if (!relevant) return null;

  const played = (matches.data ?? []).filter(
    (match) => match.status === "validated" || match.status === "finished",
  );
  const rows = scoreboard.data ?? [];

  if (played.length === 0 && rows.length === 0) return null;

  return (
    <>
      {played.length > 0 && (
        <section>
          <SectionTitle>Résultats</SectionTitle>
          <Card className="space-y-3">
            {played.map((match) => {
              const aWins = match.scoreA > match.scoreB;
              const draw = match.scoreA === match.scoreB;

              return (
                <div
                  key={match.id}
                  className="flex items-center gap-3 border-b border-border/40 pb-3 last:border-0 last:pb-0"
                >
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-right text-sm",
                      aWins && !draw ? "font-bold" : "text-muted",
                    )}
                  >
                    {match.teamA?.name ?? "Équipe A"}
                  </span>
                  <span className="shrink-0 rounded-lg bg-surface-raised px-3 py-1 text-sm font-bold tabular-nums">
                    {match.scoreA} — {match.scoreB}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-sm",
                      !aWins && !draw ? "font-bold" : "text-muted",
                    )}
                  >
                    {match.teamB?.name ?? "Équipe B"}
                  </span>
                </div>
              );
            })}
          </Card>
        </section>
      )}

      {rows.length > 0 && (
        <section>
          <SectionTitle>Feuille de match</SectionTitle>
          <Card className="overflow-x-auto p-0">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/60 text-[11px] uppercase tracking-wide text-muted">
                  <th scope="col" className="w-7 py-2.5 pl-3 text-left font-medium">
                    #
                  </th>
                  <th scope="col" className="py-2.5 pl-2 text-left font-medium">
                    Joueur
                  </th>
                  {RANKING_STATS.map((stat) => (
                    <th
                      key={stat}
                      scope="col"
                      title={RANKING_STAT_LABELS[stat]}
                      className="w-8 py-2.5 text-center font-medium"
                    >
                      {RANKING_STAT_SHORT[stat]}
                    </th>
                  ))}
                  <th scope="col" className="w-12 py-2.5 pr-3 text-right font-medium">
                    Pts
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={row.player.id}
                    className="border-b border-border/30 last:border-0"
                  >
                    <td className="py-2.5 pl-3 text-center text-xs font-bold tabular-nums text-muted">
                      {index + 1}
                    </td>
                    <td className="py-2 pl-2">
                      <div className="flex items-center gap-2">
                        <Avatar
                          name={row.player.displayName}
                          url={row.player.profilePhotoUrl}
                          size="sm"
                        />
                        <span className="truncate text-[13px]">
                          {row.player.displayName}
                        </span>
                      </div>
                    </td>
                    {RANKING_STATS.map((stat) => (
                      <td
                        key={stat}
                        className="py-2.5 text-center text-xs tabular-nums text-foreground/80"
                      >
                        {row[stat]}
                      </td>
                    ))}
                    <td className="py-2.5 pr-3 text-right text-sm font-bold tabular-nums text-accent">
                      {formatPoints(row.points)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="mt-2 text-center text-[11px] text-muted">
            Statistiques de cette session uniquement.
          </p>
        </section>
      )}
    </>
  );
}
