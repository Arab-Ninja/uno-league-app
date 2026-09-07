import { useState } from "react";
import { Trophy } from "lucide-react";
import {
  DIVISIONS,
  RANKING_SORTS,
  RANKING_SORT_LABELS,
  RANKING_STATS,
  RANKING_STAT_LABELS,
  RANKING_STAT_SHORT,
  formatPoints,
  type Division,
  type PublicPlayer,
  type RankingSort,
} from "@uno/shared";
import { trpc } from "@/lib/trpc.js";
import { cn } from "@/lib/cn.js";
import { tapFeedback } from "@/lib/native.js";
import { useAuth } from "@/lib/auth.js";
import { Screen } from "@/components/layout/index.js";
import { Avatar } from "@/components/domain/index.js";
import { Flag } from "@/components/flag.js";
import { PlayerCardDialog } from "@/components/fut-card/player-card-dialog.js";
import { Async } from "@/components/ui/async.js";
import { Card, EmptyState } from "@/components/ui/index.js";

/**
 * Classement (CDC §10), présenté comme un tableau de championnat.
 *
 * Toutes les statistiques sont visibles en même temps, comme sur un classement
 * de football : on compare deux joueurs sur une ligne plutôt qu'en changeant
 * de filtre. Le critère de tri, lui, reste sélectionnable — et le tri est
 * toujours fait par le serveur (P-004).
 */
export function RankingScreen() {
  const { user } = useAuth();
  const profile = trpc.players.me.useQuery();

  const [division, setDivision] = useState<Division | null>(null);
  const [sort, setSort] = useState<RankingSort>("points");
  const [zoomed, setZoomed] = useState<PublicPlayer | null>(null);

  const activeDivision = division ?? profile.data?.division ?? "D3";

  const ranking = trpc.ranking.list.useQuery({
    division: activeDivision,
    sort,
    limit: 50,
  });

  return (
    <Screen title="Classement">
      <div className="mb-3 grid grid-cols-3 gap-2">
        {DIVISIONS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              void tapFeedback();
              setDivision(value);
            }}
            className={cn(
              "min-h-[44px] rounded-xl border text-sm font-semibold transition-colors",
              activeDivision === value
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-surface text-muted hover:text-foreground",
            )}
            aria-pressed={activeDivision === value}
          >
            {value}
          </button>
        ))}
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {RANKING_SORTS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              void tapFeedback();
              setSort(value);
            }}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-2 text-xs font-medium transition-colors",
              sort === value
                ? "bg-accent text-background"
                : "bg-surface text-muted hover:text-foreground",
            )}
            aria-pressed={sort === value}
          >
            {RANKING_SORT_LABELS[value]}
          </button>
        ))}
      </div>

      <Async query={ranking} loadingLabel="Chargement du classement...">
        {(data) =>
          data.entries.length === 0 ? (
            <EmptyState
              title="Aucun joueur classé"
              description="Le classement se remplit après validation des premières sessions."
              icon={<Trophy className="size-6" aria-hidden />}
            />
          ) : (
            <>
              {data.viewerPosition !== null && (
                <p className="mb-3 text-center text-xs text-muted">
                  Votre position en {activeDivision} :{" "}
                  <span className="font-semibold text-accent">
                    {data.viewerPosition}
                  </span>
                </p>
              )}

              <Card className="overflow-x-auto p-0">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border/60 text-[11px] uppercase tracking-wide text-muted">
                      <th scope="col" className="w-8 py-2.5 pl-3 text-left font-medium">
                        #
                      </th>
                      <th scope="col" className="py-2.5 pl-2 text-left font-medium">
                        Joueur
                      </th>
                      <th scope="col" className="w-9 py-2.5 text-center font-medium" title="Sessions jouées">
                        MJ
                      </th>
                      {RANKING_STATS.map((stat) => (
                        <th
                          key={stat}
                          scope="col"
                          title={RANKING_STAT_LABELS[stat]}
                          className={cn(
                            "w-8 py-2.5 text-center font-medium",
                            sort === stat && "text-accent",
                          )}
                        >
                          {RANKING_STAT_SHORT[stat]}
                        </th>
                      ))}
                      <th
                        scope="col"
                        title="Points de classement général"
                        className={cn(
                          "w-12 py-2.5 pr-3 text-right font-medium",
                          sort === "points" && "text-accent",
                        )}
                      >
                        Pts
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.entries.map((entry) => {
                      const isViewer = entry.player.id === user?.playerId;
                      return (
                        <tr
                          key={entry.player.id}
                          onClick={() => {
                            void tapFeedback();
                            setZoomed(entry.player);
                          }}
                          className={cn(
                            "cursor-pointer border-b border-border/30 transition-colors last:border-0",
                            isViewer
                              ? "bg-accent/10"
                              : "hover:bg-surface-raised/60 active:opacity-70",
                          )}
                        >
                          <td className="py-2.5 pl-3 text-center text-xs font-bold tabular-nums text-muted">
                            {entry.position <= 3 ? (
                              <span aria-label={`${entry.position}e`}>
                                {["🥇", "🥈", "🥉"][entry.position - 1]}
                              </span>
                            ) : (
                              entry.position
                            )}
                          </td>
                          <td className="min-w-0 py-2 pl-2">
                            <div className="flex items-center gap-2">
                              <Avatar
                                name={entry.player.displayName}
                                url={entry.player.profilePhotoUrl}
                                size="sm"
                              />
                              <div className="min-w-0">
                                <p className="truncate text-[13px] font-medium leading-tight">
                                  {entry.player.displayName}
                                </p>
                                <p className="flex items-center gap-1 text-[10px] leading-tight text-muted">
                                  <Flag countryCode={entry.player.nationality} />
                                  {entry.player.position}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 text-center text-xs tabular-nums text-muted">
                            {entry.player.matchesPlayed}
                          </td>
                          {RANKING_STATS.map((stat) => (
                            <td
                              key={stat}
                              className={cn(
                                "py-2.5 text-center text-xs tabular-nums",
                                sort === stat
                                  ? "font-bold text-accent"
                                  : "text-foreground/80",
                              )}
                            >
                              {entry.player[stat]}
                            </td>
                          ))}
                          <td
                            className={cn(
                              "py-2.5 pr-3 text-right text-sm font-bold tabular-nums",
                              sort === "points" ? "text-accent" : "text-foreground",
                            )}
                          >
                            {formatPoints(entry.points)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>

              <p className="mt-3 text-center text-[11px] leading-relaxed text-muted">
                MJ : sessions jouées · B : buts · P : passes · D : défenses ·
                A : arrêts · M : homme du match
                <br />
                Points = 1,5 × buts + 1 × passes + 0,5 × (défenses + arrêts)
              </p>
            </>
          )
        }
      </Async>

      {zoomed && (
        <PlayerCardDialog player={zoomed} onClose={() => setZoomed(null)} />
      )}
    </Screen>
  );
}
