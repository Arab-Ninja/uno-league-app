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
import { GAME_MODES, eurToUno, type GameModeId } from "@uno/shared";
import { Screen } from "@/components/layout/index.js";
import { Badge, Card } from "@/components/ui/index.js";
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
 * Le mode SQUAD ne figure pas dans cette liste.
 *
 * Elle présente ce qu'on peut **proposer au calendrier** ; un match SQUAD naît
 * d'un défi entre deux clubs et se gère depuis l'onglet SQUAD. L'afficher ici
 * le montrerait « bientôt disponible » alors qu'il existe, ou ouvrirait un
 * parcours de réservation qui n'a pas de sens pour lui.
 */
const LISTED_MODES = GAME_MODES.filter((mode) => mode.id !== "squad");

export function ModesScreen() {
  const navigate = useNavigate();

  return (
    <Screen title="Modes de jeu" back withTabBar={false}>
      <p className="mb-4 text-sm text-muted">
        Cinq modes composent la ligue. Ceux marqués « Bientôt disponible » ne
        sont pas encore ouverts à la réservation.
      </p>

      <div className="grid grid-cols-1 gap-3">
        {LISTED_MODES.map((mode) => {
          const Icon = ICONS[mode.id];
          const clickable = mode.schedulable;

          return (
            <Card
              key={mode.id}
              className={clickable ? "cursor-pointer transition-transform active:scale-[0.99]" : "opacity-70"}
              onClick={
                clickable
                  ? () => {
                      void tapFeedback();
                      navigate(`/calendrier`);
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
                    {mode.schedulable ? (
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

                  {mode.schedulable && (
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
