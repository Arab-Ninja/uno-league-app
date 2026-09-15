import { useNavigate } from "react-router-dom";
import {
  Dumbbell,
  Gamepad2,
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
  return mode.schedulable ? "/calendrier" : null;
}

export function ModesScreen() {
  const navigate = useNavigate();
  const features = useFeatures();

  /**
   * Un mode fermé par configuration n'est pas « bientôt disponible » : il
   * n'existe pas pour cet environnement. L'annoncer serait promettre une
   * porte qui ne s'ouvrira pas.
   */
  const modes = GAME_MODES.filter(
    (mode) => mode.id !== "squad" || features.squad,
  );

  return (
    <Screen title="Modes de jeu" back withTabBar={false}>
      <p className="mb-4 text-sm text-muted">
        Les modes qui composent la ligue. Ceux marqués « Bientôt disponible »
        ne sont pas encore ouverts.
      </p>

      <div className="grid grid-cols-1 gap-3">
        {modes.map((mode) => {
          const Icon = ICONS[mode.id];
          const destination = destinationOf(mode);
          const clickable = destination !== null;

          return (
            <Card
              key={mode.id}
              className={clickable ? "cursor-pointer transition-transform active:scale-[0.99]" : "opacity-70"}
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
                    <h3 className="text-sm font-semibold">{mode.name}</h3>
                    {mode.id === "squad" ? (
                      <Badge tone="accent">Entre clubs</Badge>
                    ) : mode.schedulable ? (
                      mode.ranked ? (
                        <Badge tone="accent">Classé</Badge>
                      ) : (
                        <Badge tone="primary">Loisir</Badge>
                      )
                    ) : (
                      <Badge tone="neutral">Bientôt disponible</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    {mode.shortDescription}
                  </p>

                  {(mode.schedulable || mode.id === "squad") && (
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-surface-raised/60 py-2">
                        <dt className="text-[10px] uppercase text-muted">Joueurs</dt>
                        <dd className="text-sm font-semibold">{mode.minParticipants}</dd>
                      </div>
                      <div className="rounded-lg bg-surface-raised/60 py-2">
                        <dt className="text-[10px] uppercase text-muted">Durée</dt>
                        <dd className="text-sm font-semibold">{mode.durationHours} h</dd>
                      </div>
                      <div className="rounded-lg bg-surface-raised/60 py-2">
                        <dt className="text-[10px] uppercase text-muted">Prix</dt>
                        <dd className="text-sm font-semibold text-accent">
                          {eurToUno(mode.priceEur)}
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
