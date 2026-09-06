import { useState } from "react";
import { Trophy } from "lucide-react";
import {
  DIVISIONS,
  RANKING_STATS,
  RANKING_STAT_LABELS,
  type Division,
  type RankingStat,
} from "@uno/shared";
import { trpc } from "@/lib/trpc.js";
import { cn } from "@/lib/cn.js";
import { tapFeedback } from "@/lib/native.js";
import { useAuth } from "@/lib/auth.js";
import { Screen } from "@/components/layout/index.js";
import { PlayerRow } from "@/components/domain/index.js";
import { Async } from "@/components/ui/async.js";
import { Card, EmptyState } from "@/components/ui/index.js";

/** Classements par division et par statistique (RANK-001, RANK-002). */
export function RankingScreen() {
  const { user } = useAuth();
  const profile = trpc.players.me.useQuery();

  const [division, setDivision] = useState<Division | null>(null);
  const [stat, setStat] = useState<RankingStat>("goals");

  // Par défaut, on ouvre sur la division du joueur.
  const activeDivision = division ?? profile.data?.division ?? "D3";

  const ranking = trpc.ranking.list.useQuery({
    division: activeDivision,
    stat,
    limit: 50,
  });

  return (
    <Screen title="Classement">
      {/* Divisions */}
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

      {/* Statistiques */}
      <div className="mb-4 flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {RANKING_STATS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              void tapFeedback();
              setStat(value);
            }}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-2 text-xs font-medium transition-colors",
              stat === value
                ? "bg-accent text-background"
                : "bg-surface text-muted hover:text-foreground",
            )}
            aria-pressed={stat === value}
          >
            {RANKING_STAT_LABELS[value]}
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
              <Card className="space-y-0.5 p-2">
                {data.entries.map((entry) => (
                  <PlayerRow
                    key={entry.player.id}
                    position={entry.position}
                    displayName={entry.player.displayName}
                    nationality={entry.player.nationality}
                    profilePhotoUrl={entry.player.profilePhotoUrl}
                    division={entry.player.division}
                    value={entry.value}
                    statLabel={RANKING_STAT_LABELS[stat]}
                    highlighted={entry.player.id === user?.playerId}
                  />
                ))}
              </Card>
            </>
          )
        }
      </Async>
    </Screen>
  );
}
