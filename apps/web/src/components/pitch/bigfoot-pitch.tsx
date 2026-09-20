import {
  formationFor,
  pitchSlotLabel,
  type PitchSlot,
  type PublicPlayer,
} from "@uno/shared";
import { cn } from "@/lib/cn.js";
import { useT } from "@/lib/i18n.js";
import { Avatar } from "@/components/domain/index.js";

/**
 * Le terrain d'une séance de Grand Foot (MODE-003).
 *
 * **Pourquoi un composant à part du terrain de club.** Celui-ci affiche cinq
 * cartes FUT, qui tiennent sur une ligne. Ici il faut en placer jusqu'à
 * quatre par rangée, sur un téléphone : une carte FUT n'y entre pas. Les
 * joueurs sont donc des pastilles — portrait, prénom, poste — et la même
 * grille sert de sept à onze.
 *
 * Le terrain est dessiné en CSS, comme celui des clubs : il doit suivre les
 * deux thèmes et se redimensionner d'un appareil à l'autre, ce qu'un fichier
 * figé ne fait pas.
 */
export function BigfootPitch({
  playersPerTeam,
  formation,
  occupants,
  mySlot,
  myPlayerId,
  onSlot,
  onOpen,
  editable,
}: {
  /** L'effectif d'une équipe : il décide des formations possibles. */
  playersPerTeam: number;
  /**
   * La forme retenue (PITCH-001). `null` prend le défaut de cet effectif,
   * qui est la forme qui se jouait avant que le choix n'existe.
   */
  formation?: string | null;
  /** Qui occupe quoi, par identifiant de place. */
  occupants: Map<string, PublicPlayer>;
  /** La place du joueur connecté dans ce camp, s'il en a une. */
  mySlot: string | null;
  myPlayerId: number | undefined;
  /** Touche une place : libre pour s'y mettre, la sienne pour la quitter. */
  onSlot: (slot: string) => void;
  /** Ouvre la carte d'un joueur déjà placé — y compris dans l'autre camp. */
  onOpen: (player: PublicPlayer) => void;
  /** Faux sur le camp d'en face, ou quand la séance est jouée. */
  editable: boolean;
}) {
  const rows = formationFor(playersPerTeam, formation);

  // Un effectif hors bornes n'a pas de formation : mieux vaut ne rien
  // afficher qu'une grille inventée, qu'on chercherait à déboguer.
  if (rows.length === 0) return null;

  return (
    <div className="relative overflow-hidden rounded-card border border-border/60 bg-[#0d2818] px-2 py-4">
      <PitchLines />

      <div className="relative space-y-3">
        {rows.map((row, index) => (
          <div
            key={index}
            className="flex flex-wrap items-start justify-center gap-x-2 gap-y-3"
          >
            {row.map((slot) => (
              <PitchSpot
                key={slot.id}
                slot={slot}
                playersPerTeam={playersPerTeam}
                formation={formation}
                player={occupants.get(slot.id) ?? null}
                mine={
                  mySlot === slot.id ||
                  occupants.get(slot.id)?.id === myPlayerId
                }
                editable={editable}
                onSelect={() => onSlot(slot.id)}
                onOpen={onOpen}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Les tracés du terrain, purement décoratifs. */
function PitchLines() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {/* Pelouse : deux bandes alternées, comme une tonte. */}
      <div className="absolute inset-0 bg-[repeating-linear-gradient(180deg,rgba(255,255,255,0.035)_0_36px,transparent_36px_72px)]" />
      <div className="absolute inset-2 rounded-lg border-2 border-white/20" />
      <div className="absolute inset-x-2 top-1/2 h-0.5 -translate-y-1/2 bg-white/20" />
      <div className="absolute left-1/2 top-1/2 size-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/20" />
      <div className="absolute left-1/2 top-2 h-10 w-32 -translate-x-1/2 rounded-b-lg border-x-2 border-b-2 border-white/20" />
      <div className="absolute bottom-2 left-1/2 h-10 w-32 -translate-x-1/2 rounded-t-lg border-x-2 border-t-2 border-white/20" />
    </div>
  );
}

/**
 * Une place, occupée ou non.
 *
 * Le prénom seul plutôt que le nom d'affichage entier : quatre pastilles par
 * rangée laissent une soixantaine de pixels chacune, et « Yassine B… » n'y
 * tient pas mieux que « Yassine ».
 */
function PitchSpot({
  slot,
  playersPerTeam,
  formation,
  player,
  mine,
  editable,
  onSelect,
  onOpen,
}: {
  slot: PitchSlot;
  playersPerTeam: number;
  formation?: string | null;
  player: PublicPlayer | null;
  mine: boolean;
  editable: boolean;
  onSelect: () => void;
  onOpen: (player: PublicPlayer) => void;
}) {
  const t = useT();
  const label =
    pitchSlotLabel(playersPerTeam, slot.id, formation) ?? slot.label;

  /*
   * Un même geste, trois sens selon ce qu'il y a là — et aucun qui surprenne :
   * une place libre s'occupe, la sienne se quitte, et celle d'un autre ouvre
   * sa carte. Prendre la place occupée d'autrui n'en fait pas partie : le
   * serveur la refuse, et un bouton qui échoue est une porte peinte sur un
   * mur.
   */
  const mienne = player !== null && mine;
  const autrui = player !== null && !mine;
  const tappable = autrui || (editable && (player === null || mienne));

  return (
    <button
      type="button"
      disabled={!tappable}
      onClick={() => {
        if (autrui) {
          onOpen(player);
          return;
        }
        onSelect();
      }}
      aria-label={
        player
          ? `${label} — ${player.displayName}`
          : `${label} — ${t("detail.slotFree").toLowerCase()}`
      }
      className={cn(
        "flex w-[68px] flex-col items-center gap-1 rounded-lg px-0.5 py-1 transition-transform",
        tappable && "active:scale-95",
        mine && "bg-accent/20 ring-1 ring-accent",
      )}
    >
      {player ? (
        <Avatar
          name={player.displayName}
          url={player.profilePhotoUrl}
          size="md"
        />
      ) : (
        <span
          className={cn(
            "flex size-11 items-center justify-center rounded-full border border-dashed",
            editable ? "border-white/45" : "border-white/25",
          )}
        >
          <span className="text-[9px] font-medium uppercase tracking-wide text-white/50">
            {editable ? t("detail.slotFree") : "—"}
          </span>
        </span>
      )}

      <span className="max-w-full truncate text-[10px] font-medium leading-tight text-white">
        {player ? player.displayName.split(" ")[0] : ""}
      </span>
      <span className="max-w-full truncate text-[9px] leading-tight text-white/60">
        {label}
      </span>
    </button>
  );
}
