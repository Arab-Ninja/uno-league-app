import { useNavigate } from "react-router-dom";
import { Shield, TrendingDown, TrendingUp } from "lucide-react";
import { squadTier, type SquadView } from "@uno/shared";
import { trpc } from "@/lib/trpc.js";
import { useT } from "@/lib/i18n.js";
import { cn } from "@/lib/cn.js";
import { tapFeedback } from "@/lib/native.js";
import { Avatar } from "@/components/domain/index.js";
import { Async } from "@/components/ui/async.js";
import { Card, EmptyState } from "@/components/ui/index.js";

/**
 * Classement des SQUADs par cote (SQUAD-007).
 *
 * La cote prime, et rien d'autre : ni la richesse de la caisse, ni le nombre
 * de matchs. C'est la décision de fond du mode — force sportive et activité
 * économique sont deux mesures séparées — et un classement qui mélangerait
 * les deux permettrait d'acheter sa place.
 *
 * Le tri vient du serveur, comme pour le classement des joueurs (P-004).
 */
export function SquadLeaderboard() {
  const t = useT();
  const navigate = useNavigate();
  const squads = trpc.squads.list.useQuery({ limit: 50 });

  return (
    <Async query={squads} loadingLabel={t("club.loading")}>
      {(list) =>
        list.length === 0 ? (
          <EmptyState
            title={t("club.emptyTitle")}
            description={t("club.emptyBody")}
            icon={<Shield className="size-6" aria-hidden />}
          />
        ) : (
          <div className="space-y-2">
            {list.map((squad, index) => (
              <SquadRow
                key={squad.id}
                squad={squad}
                position={index + 1}
                onOpen={() => {
                  void tapFeedback();
                  navigate(`/squad/${squad.slug}`);
                }}
              />
            ))}
          </div>
        )
      }
    </Async>
  );
}

function SquadRow({
  squad,
  position,
  onOpen,
}: {
  squad: SquadView;
  position: number;
  onOpen: () => void;
}) {
  return (
    <Card className="p-0">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 p-3 text-left active:opacity-70"
      >
        <span
          className={cn(
            "w-6 shrink-0 text-center text-sm font-bold tabular-nums",
            position <= 3 ? "text-accent" : "text-muted",
          )}
        >
          {position}
        </span>

        <Avatar name={squad.name} url={squad.avatarUrl} size="sm" />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{squad.name}</p>
          <p className="mt-0.5 truncate text-xs text-muted">
            {squadTier(squad.rating)} · {squad.matchesPlayed} match
            {squad.matchesPlayed > 1 ? "s" : ""}
            {squad.winRate !== null ? ` · ${squad.winRate} % de réussite` : ""}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-sm font-bold tabular-nums">{squad.rating}</p>
          <Streak value={squad.streak} />
        </div>
      </button>
    </Card>
  );
}

/** Série en cours : positive pour des victoires, négative pour des défaites. */
function Streak({ value }: { value: number }) {
  const t = useT();
  if (value === 0) {
    return <p className="text-[11px] text-muted">—</p>;
  }

  const wins = value > 0;
  const Icon = wins ? TrendingUp : TrendingDown;

  return (
    <p
      className={cn(
        "flex items-center justify-end gap-0.5 text-[11px] font-medium",
        wins ? "text-success" : "text-error",
      )}
    >
      <Icon className="size-3" aria-hidden />
      {Math.abs(value)}
      <span className="sr-only">
        {wins ? t("club.winStreak") : t("club.lossStreak")}
      </span>
    </p>
  );
}
