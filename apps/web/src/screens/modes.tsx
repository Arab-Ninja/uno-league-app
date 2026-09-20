import { useNavigate } from "react-router-dom";
import {
  Dumbbell,
  Gamepad2,
  Goal,
  Trophy,
  Users,
  Zap,
  type LucideIcon,
  Swords,
} from "lucide-react";
import {
  GAME_MODES,
  eurToUno,
  type GameMode,
  type GameModeId,
} from "@uno/shared";
import { Screen } from "@/components/layout/index.js";
import { Badge, Card } from "@/components/ui/index.js";
import { useFeatures } from "@/lib/features.js";
import { useLibelles, useT } from "@/lib/i18n.js";
import { tapFeedback } from "@/lib/native.js";

/**
 * Écran des modes de jeu (MODE-001).
 *
 * Les cinq modes sont visibles, mais seuls les modes réellement planifiables
 * ouvrent un parcours de réservation. Les autres portent la mention
 * « Bientôt disponible » et ne déclenchent aucune action fantôme.
 */
const ICONS: Record<GameModeId, LucideIcon> = {
  league: Trophy,
  friendly: Users,
  squad: Swords,
  bigfoot: Goal,
  minigames: Gamepad2,
  training: Dumbbell,
  tournaments: Zap,
};

/**
 * Où mène chaque mode.
 *
 * Le calendrier pour ce qui se propose, l'onglet SQUAD pour ce qui se joue
 * entre clubs. Le mode SQUAD était absent de cet écran au motif qu'il ne se
 * réserve pas — mais quelqu'un qui cherche « les modes de jeu » cherche la
 * liste de ce qui existe, pas celle de ce qui passe par le calendrier. Son
 * absence le faisait passer pour inexistant.
 */
function destinationOf(mode: GameMode): string | null {
  if (mode.id === "squad") return "/squad";
  if (mode.id === "tournaments") return "/tournois";
  return mode.schedulable ? "/calendrier" : null;
}

/** Les modes qui se jouent entre clubs, et non entre joueurs. */
function isClubMode(mode: GameMode): boolean {
  return mode.id === "squad" || mode.id === "tournaments";
}

export function ModesScreen() {
  const t = useT();
  const L = useLibelles();
  const navigate = useNavigate();
  const features = useFeatures();

  /**
   * Un mode fermé par configuration n'est pas « bientôt disponible » : il
   * n'existe pas pour cet environnement. L'annoncer serait promettre une
   * porte qui ne s'ouvrira pas.
   */
  const modes = GAME_MODES.filter((mode) => {
    if (isClubMode(mode)) return features.squad;
    if (mode.id === "bigfoot") return features.bigfoot;
    return true;
  });

  return (
    <Screen title={t("modes.title")} back withTabBar={false}>
      <p className="mb-4 text-sm text-muted">{t("session.modesIntro")}</p>

      <div className="grid grid-cols-1 gap-3">
        {modes.map((mode) => {
          const Icon = ICONS[mode.id];
          const destination = destinationOf(mode);
          const clickable = destination !== null;

          return (
            <Card
              key={mode.id}
              className={
                clickable
                  ? "cursor-pointer transition-transform active:scale-[0.99]"
                  : "opacity-70"
              }
              onClick={
                destination
                  ? () => {
                      void tapFeedback();
                      navigate(destination);
                    }
                  : undefined
              }
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
            >
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-primary/25 p-3 text-accent">
                  <Icon className="size-5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">
                      {L.gameMode[mode.id]}
                    </h3>
                    {isClubMode(mode) ? (
                      <Badge tone="accent">{t("session.betweenClubs")}</Badge>
                    ) : mode.schedulable ? (
                      mode.ranked ? (
                        <Badge tone="accent">{t("session.ranked")}</Badge>
                      ) : (
                        <Badge tone="primary">{t("session.casual")}</Badge>
                      )
                    ) : (
                      <Badge tone="neutral">{t("modes.soon")}</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    {L.gameModeAbout[mode.id]}
                  </p>

                  {(mode.schedulable || mode.id === "squad") && (
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-surface-raised/60 py-2">
                        <dt className="text-[10px] uppercase text-muted">
                          {t("modes.players")}
                        </dt>
                        <dd className="text-sm font-semibold">
                          {mode.teamSizeRange &&
                          mode.teamSizeRange.max > mode.teamSizeRange.min
                            ? `${mode.teamSizeRange.min * mode.teamCount}–${
                                mode.teamSizeRange.max * mode.teamCount
                              }`
                            : mode.minParticipants}
                        </dd>
                      </div>
                      <div className="rounded-lg bg-surface-raised/60 py-2">
                        <dt className="text-[10px] uppercase text-muted">
                          {t("modes.duration")}
                        </dt>
                        <dd className="text-sm font-semibold">
                          {mode.durationHours} h
                        </dd>
                      </div>
                      <div className="rounded-lg bg-surface-raised/60 py-2">
                        <dt className="text-[10px] uppercase text-muted">
                          {t("modes.price")}
                        </dt>
                        <dd className="text-sm font-semibold text-accent">
                          {mode.priceEur === 0
                            ? t("modes.free")
                            : `${eurToUno(mode.priceEur)} UNO`}
                        </dd>
                      </div>
                    </dl>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </Screen>
  );
}
