import { Shield, Undo2, X } from "lucide-react";
import {
  TRACKER_ACTIONS,
  type TrackerEventType,
  type TrackerParticipantStats,
  type TrackerParticipantView,
  type TrackerTeamView,
} from "@uno/shared";
import { cn } from "@/lib/cn.js";

/**
 * Pavé de saisie (TRACK-001).
 *
 * Deux gestes pour une action : on désigne le joueur, puis ce qu'il a fait.
 * Cet ordre-là et pas l'inverse, parce qu'en regardant une action on
 * reconnaît d'abord *qui*, et que devoir choisir l'action d'abord obligerait
 * à mémoriser le joueur pendant le trajet du doigt.
 *
 * Deux raccourcis suppriment le geste le plus fréquent de chaque catégorie :
 *  - un but enchaîne directement sur la désignation du passeur, ce qui évite
 *    de resélectionner un joueur pour l'action la plus courante du futsal ;
 *  - un arrêt se saisit d'un seul geste par le bouton de l'équipe : le gardien
 *    en poste est connu, il n'y a personne à désigner.
 *
 * Chaque pastille affiche le total du joueur en direct. C'est le seul retour
 * qui compte pendant une saisie rapide : on voit que le geste a été pris sans
 * quitter la vidéo des yeux.
 */

export type PadMode =
  | { kind: "idle" }
  | { kind: "armed"; participantId: number }
  | { kind: "assist"; goalClientId: string; scorerId: number; teamId: number };

interface CapturePadProps {
  mode: PadMode;
  teamA: TrackerTeamView;
  teamB: TrackerTeamView;
  rosterA: TrackerParticipantView[];
  rosterB: TrackerParticipantView[];
  statsByParticipant: Map<number, TrackerParticipantStats>;
  goalkeepers: Record<number, number | null>;
  /** Touche associée à chaque joueur, pour la saisie au clavier. */
  keyByParticipant: Map<number, string>;
  onArm: (participantId: number) => void;
  onAction: (type: TrackerEventType) => void;
  onAssist: (participantId: number | null) => void;
  onQuickSave: (teamId: number) => void;
  onCancel: () => void;
  onUndo: () => void;
  canUndo: boolean;
  disabled: boolean;
}

export function CapturePad({
  mode,
  teamA,
  teamB,
  rosterA,
  rosterB,
  statsByParticipant,
  goalkeepers,
  keyByParticipant,
  onArm,
  onAction,
  onAssist,
  onQuickSave,
  onCancel,
  onUndo,
  canUndo,
  disabled,
}: CapturePadProps) {
  const all = [...rosterA, ...rosterB];
  const armed =
    mode.kind === "armed"
      ? (all.find((player) => player.id === mode.participantId) ?? null)
      : null;

  if (mode.kind === "assist") {
    const scorer = all.find((player) => player.id === mode.scorerId);
    const mates = (mode.teamId === teamA.id ? rosterA : rosterB).filter(
      (player) => player.id !== mode.scorerId,
    );

    return (
      <section aria-label="Passe décisive" className="space-y-3">
        <header className="flex items-center justify-between gap-2">
          <p className="text-sm">
            <span className="font-semibold text-accent">But</span> de{" "}
            <span className="font-semibold">{scorer?.displayName}</span> — qui a
            donné la passe ?
          </p>
        </header>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {mates.map((player) => (
            <PadChip
              key={player.id}
              label={player.displayName}
              shortcut={keyByParticipant.get(player.id)}
              color={mode.teamId === teamA.id ? teamA.color : teamB.color}
              onClick={() => onAssist(player.id)}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => onAssist(null)}
          className="min-h-[44px] w-full rounded-xl border border-border bg-surface-raised text-sm font-medium hover:bg-surface"
        >
          Aucune passe décisive <span className="text-muted">(Entrée)</span>
        </button>
      </section>
    );
  }

  if (armed) {
    return (
      <section aria-label={`Action de ${armed.displayName}`} className="space-y-3">
        <header className="flex items-center justify-between gap-2">
          <p className="truncate text-sm">
            <span className="font-semibold">{armed.displayName}</span> a…
          </p>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Annuler la sélection"
            className="flex size-9 items-center justify-center rounded-lg text-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>

        <div className="grid grid-cols-2 gap-2">
          {TRACKER_ACTIONS.map((action) => (
            <button
              key={action.type}
              type="button"
              onClick={() => onAction(action.type)}
              className={cn(
                "flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl border text-sm font-semibold transition-colors",
                action.primary
                  ? "border-accent/40 bg-accent/15 text-foreground hover:bg-accent/25"
                  : "border-border bg-surface-raised text-muted hover:text-foreground",
              )}
            >
              {action.label}
              <span className="text-[10px] font-normal uppercase tracking-wide text-muted">
                {action.shortcut}
              </span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Joueurs sur le terrain" className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {[
          { team: teamA, roster: rosterA },
          { team: teamB, roster: rosterB },
        ].map(({ team, roster }) => (
          <div key={team.id} className="space-y-2">
            <div className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2.5 rounded-full"
                style={{ backgroundColor: team.color }}
              />
              <h3 className="text-xs font-semibold uppercase tracking-wide">
                {team.name}
              </h3>
            </div>

            <div className="space-y-1.5">
              {roster.map((player) => {
                const stats = statsByParticipant.get(player.id);
                const isKeeper = goalkeepers[team.id] === player.id;
                return (
                  <button
                    key={player.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onArm(player.id)}
                    className={cn(
                      "flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-border/60 bg-surface-raised px-2.5 py-1.5 text-left",
                      "transition-colors hover:border-accent/50 hover:bg-surface disabled:opacity-40",
                    )}
                  >
                    <kbd className="hidden w-5 shrink-0 rounded bg-background/60 text-center text-[10px] leading-5 text-muted sm:block">
                      {keyByParticipant.get(player.id) ?? ""}
                    </kbd>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1">
                        <span className="truncate text-[13px] font-medium">
                          {player.displayName}
                        </span>
                        {isKeeper && (
                          <Shield
                            className="size-3 shrink-0 text-accent"
                            aria-label="Gardien"
                          />
                        )}
                      </span>
                      {stats && (
                        <span className="block text-[10px] tabular-nums text-muted">
                          {statLine(stats)}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
              {roster.length === 0 && (
                <p className="rounded-xl border border-dashed border-border/60 px-2 py-3 text-center text-[11px] text-muted">
                  Aucun joueur
                </p>
              )}
            </div>

            <button
              type="button"
              disabled={disabled || goalkeepers[team.id] == null}
              onClick={() => onQuickSave(team.id)}
              title={
                goalkeepers[team.id] == null
                  ? "Désignez d'abord un gardien pour cette équipe"
                  : "Arrêt du gardien"
              }
              className={cn(
                "flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-surface text-xs font-medium",
                "hover:border-accent/50 hover:text-accent disabled:opacity-40",
              )}
            >
              <Shield className="size-3.5" aria-hidden />
              Arrêt gardien
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={!canUndo}
        onClick={onUndo}
        className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface text-sm text-muted hover:text-foreground disabled:opacity-40"
      >
        <Undo2 className="size-4" aria-hidden />
        Annuler la dernière action
      </button>
    </section>
  );
}

function statLine(stats: TrackerParticipantStats): string {
  const parts: string[] = [];
  if (stats.goals > 0) parts.push(`${stats.goals} but${stats.goals > 1 ? "s" : ""}`);
  if (stats.assists > 0) parts.push(`${stats.assists} passe${stats.assists > 1 ? "s" : ""}`);
  if (stats.defenses > 0) parts.push(`${stats.defenses} déf`);
  if (stats.saves > 0) parts.push(`${stats.saves} arrêt${stats.saves > 1 ? "s" : ""}`);
  if (stats.concededGoals > 0) parts.push(`${stats.concededGoals} encaissé${stats.concededGoals > 1 ? "s" : ""}`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function PadChip({
  label,
  shortcut,
  color,
  onClick,
}: {
  label: string;
  shortcut: string | undefined;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[52px] items-center gap-2 rounded-xl border border-border/60 bg-surface-raised px-3 text-left text-[13px] font-medium hover:border-accent/50 hover:bg-surface"
    >
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {shortcut && (
        <kbd className="hidden rounded bg-background/60 px-1 text-[10px] text-muted sm:block">
          {shortcut}
        </kbd>
      )}
    </button>
  );
}
