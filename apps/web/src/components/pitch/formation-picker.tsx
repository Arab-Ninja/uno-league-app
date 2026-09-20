import { formationsFor } from "@uno/shared";
import { cn } from "@/lib/cn.js";
import { tapFeedback } from "@/lib/native.js";
import { useT } from "@/lib/i18n.js";

/**
 * Le choix de la forme du terrain (PITCH-001).
 *
 * **La notation seule, sans surnom.** « 1-3-1 » se lit de la même façon en
 * trois langues, et un joueur de futsal sait ce qu'elle dessine. Y accoler
 * « le losange » ou « le carré » aurait demandé de nommer vingt formes dans
 * trois langues pour n'ajouter, à chaque fois, qu'un mot au-dessus d'un
 * dessin qui dit déjà tout.
 *
 * Une seule rangée de pastilles, comme les filtres du calendrier : le geste
 * est le même, et cet écran en a déjà assez de neufs.
 *
 * Le composant ne décide rien — ni qui a le droit, ni ce que le changement
 * déloge. Il rend ce que le serveur accepte, et le serveur tranche.
 */
export function FormationPicker({
  playersPerTeam,
  value,
  editable,
  busy,
  onPick,
}: {
  playersPerTeam: number;
  /** `null` : le défaut de cet effectif, qui est le premier de la liste. */
  value: string | null;
  /** Faux sur le camp d'en face, ou quand la séance est jouée. */
  editable: boolean;
  busy: boolean;
  onPick: (formation: string) => void;
}) {
  const t = useT();
  const formations = formationsFor(playersPerTeam);

  // Un effectif hors bornes n'a pas de forme à proposer, et un seul choix
  // n'est pas un choix : mieux vaut ne rien afficher qu'une rangée inerte.
  if (formations.length < 2) return null;

  const active = value ?? formations[0]!.id;

  return (
    <div className="mb-2">
      <p className="mb-1.5 text-xs font-medium text-muted">
        {editable ? t("detail.formationPick") : t("detail.formationRead")}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {formations.map((formation) => {
          const choisie = formation.id === active;
          return (
            <button
              key={formation.id}
              type="button"
              disabled={!editable || busy}
              aria-pressed={choisie}
              onClick={() => {
                if (choisie) return;
                void tapFeedback();
                onPick(formation.id);
              }}
              className={cn(
                "min-h-[36px] rounded-full px-3 text-xs font-semibold tabular-nums transition-colors",
                choisie
                  ? "bg-accent text-background"
                  : "bg-surface text-muted hover:text-foreground",
                // Sur le camp d'en face, la forme se lit sans se toucher :
                // l'estomper évite de proposer un geste qui serait refusé.
                !editable && "opacity-70",
              )}
            >
              {formation.id}
            </button>
          );
        })}
      </div>
    </div>
  );
}
