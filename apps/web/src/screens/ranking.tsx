import { useState } from "react";
import { Trophy } from "lucide-react";
import {
  DIVISIONS,
  RANKING_SORTS,
  RANKING_STATS,
  formatPoints,
  type Division,
  type PublicPlayer,
  type RankingSort,
} from "@uno/shared";
import { trpc } from "@/lib/trpc.js";
import { useFeatures } from "@/lib/features.js";
import { cn } from "@/lib/cn.js";
import { CompetitionsSwitch } from "@/components/competitions/switch.js";
import { tapFeedback } from "@/lib/native.js";
import { useAuth } from "@/lib/auth.js";
import { useLibelles, useT, type Traduire } from "@/lib/i18n.js";
import { Screen } from "@/components/layout/index.js";
import { Avatar } from "@/components/domain/index.js";
import { Flag } from "@/components/flag.js";
import { PlayerCardDialog } from "@/components/fut-card/player-card-dialog.js";
import { Async } from "@/components/ui/async.js";
import { Card, EmptyState } from "@/components/ui/index.js";
import { SquadLeaderboard } from "@/components/squad/leaderboard.js";

/**
 * Classement (CDC §10), présenté comme un tableau de championnat.
 *
 * Toutes les statistiques sont visibles en même temps, comme sur un classement
 * de football : on compare deux joueurs sur une ligne plutôt qu'en changeant
 * de filtre. Le critère de tri, lui, reste sélectionnable — et le tri est
 * toujours fait par le serveur (P-004).
 */
export function RankingScreen() {
  const t = useT();
  const L = useLibelles();
  const { user } = useAuth();
  const profile = trpc.players.me.useQuery();
  const features = useFeatures();

  /**
   * Deux classements sous un même onglet (SQUAD-007).
   *
   * Le joueur qui cherche « le classement » ne se demande pas d'abord s'il
   * parle de lui ou de son club : mieux vaut une bascule en tête d'écran
   * qu'un second onglet dans une barre de navigation déjà pleine.
   */
  const [scope, setScope] = useState<"players" | "squads">("players");

  const [division, setDivision] = useState<Division | null>(null);
  const [sort, setSort] = useState<RankingSort>("points");
  const [zoomed, setZoomed] = useState<PublicPlayer | null>(null);

  const activeDivision = division ?? profile.data?.division ?? "D3";

  const ranking = trpc.ranking.list.useQuery({
    division: activeDivision,
    sort,
    limit: 50,
  });

  if (features.squad && scope === "squads") {
    return (
      <Screen title={t("nav.competitions")}>
        <CompetitionsSwitch />
        <ScopeSwitch scope={scope} onChange={setScope} />
        <SquadLeaderboard />
      </Screen>
    );
  }

  return (
    <Screen title={features.squad ? t("nav.competitions") : t("ranking.title")}>
      {features.squad && <CompetitionsSwitch />}
      {features.squad && <ScopeSwitch scope={scope} onChange={setScope} />}

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
              "min-h-[44px] rounded-xl border font-display text-[18px] font-extrabold italic transition-colors",
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
            {libelleTri(L, value)}
          </button>
        ))}
      </div>

      <Async query={ranking} loadingLabel={t("ranking.loading")}>
        {(data) =>
          data.entries.length === 0 ? (
            <EmptyState
              title={t("ranking.emptyTitle")}
              description={t("ranking.emptyBody")}
              icon={<Trophy className="size-6" aria-hidden />}
            />
          ) : (
            <>
              {data.viewerPosition !== null && (
                <p className="mb-3 text-center text-xs text-muted">
                  {t("ranking.yourPosition", { division: activeDivision })}{" "}
                  <span className="font-display text-[16px] font-extrabold italic text-accent">
                    {data.viewerPosition}
                  </span>
                </p>
              )}

              <Card className="overflow-x-auto p-0">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border/60 text-[11px] uppercase tracking-wide text-muted">
                      <th
                        scope="col"
                        className="w-8 py-2.5 pl-3 text-left font-medium"
                      >
                        #
                      </th>
                      <th
                        scope="col"
                        className="py-2.5 pl-2 text-left font-medium"
                      >
                        {t("ranking.player")}
                      </th>
                      <th
                        scope="col"
                        className="w-9 py-2.5 text-center font-medium"
                        title={t("ranking.playedTitle")}
                      >
                        {t("ranking.playedShort")}
                      </th>
                      {RANKING_STATS.map((stat) => (
                        <th
                          key={stat}
                          scope="col"
                          title={L.rankingStat[stat]}
                          className={cn(
                            "w-8 py-2.5 text-center font-medium",
                            sort === stat && "text-accent",
                          )}
                        >
                          {L.rankingStatShort[stat]}
                        </th>
                      ))}
                      <th
                        scope="col"
                        title={t("ranking.pointsTitle")}
                        className={cn(
                          "w-12 py-2.5 pr-3 text-right font-medium",
                          sort === "points" && "text-accent",
                        )}
                      >
                        {t("ranking.pointsShort")}
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
                          <td className="py-2.5 pl-3 text-center">
                            <RankBadge position={entry.position} />
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
                                  <Flag
                                    countryCode={entry.player.nationality}
                                  />
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
                              "py-2.5 pr-3 text-right font-display text-[17px] font-extrabold italic tabular-nums",
                              sort === "points"
                                ? "text-accent"
                                : "text-foreground",
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
                {t("ranking.legend")}
                <br />
                {t("ranking.formula")}
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

/**
 * Le rang d'une ligne : le podium en couleurs, le reste en chiffres.
 *
 * Des pastilles plutôt que des médailles émoji : l'émoji change de dessin
 * d'un téléphone à l'autre, et jurait avec le reste du tableau.
 */
function RankBadge({ position }: { position: number }) {
  const podium = [
    "bg-accent text-background",
    "bg-flood/85 text-background",
    "bg-amber-700/80 text-foreground",
  ][position - 1];

  return (
    <span
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-md font-display text-[14px] font-extrabold italic tabular-nums",
        podium ?? "text-muted",
      )}
    >
      {position}
    </span>
  );
}

/**
 * Le libellé d'un critère de tri.
 *
 * `RankingSort` vaut « général » ou l'une des statistiques : deux familles de
 * libellés côté dictionnaire, réunies ici plutôt que dupliquées.
 */
function libelleTri(
  L: ReturnType<typeof useLibelles>,
  tri: RankingSort,
): string {
  return tri === "points" ? L.rankingSort.points : L.rankingStat[tri];
}

/** Bascule entre le classement des joueurs et celui des clubs. */
function ScopeSwitch({
  scope,
  onChange,
}: {
  scope: "players" | "squads";
  onChange: (next: "players" | "squads") => void;
}) {
  const t: Traduire = useT();
  const options = [
    ["players", "ranking.players"],
    ["squads", "ranking.clubs"],
  ] as const;

  return (
    <div className="mb-3 grid grid-cols-2 gap-2">
      {options.map(([value, cle]) => (
        <button
          key={value}
          type="button"
          onClick={() => {
            void tapFeedback();
            onChange(value);
          }}
          className={cn(
            "min-h-[44px] rounded-xl border text-sm font-semibold transition-colors",
            scope === value
              ? "border-accent bg-accent/10 text-accent"
              : "border-border bg-surface text-muted hover:text-foreground",
          )}
          aria-pressed={scope === value}
        >
          {t(cle)}
        </button>
      ))}
    </div>
  );
}
