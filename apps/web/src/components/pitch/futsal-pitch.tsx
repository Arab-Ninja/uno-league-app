import { useMemo, useState } from "react";
import { Check, Pencil, RotateCcw, X } from "lucide-react";
import {
  LINEUP_SLOTS,
  composeLineup,
  lineupFromAssignments,
  resolveLineup,
  type LineupAssignment,
  type LineupPick,
  type LineupSlot,
  type PublicPlayer,
} from "@uno/shared";
import { describeError } from "@/lib/trpc.js";
import { cn } from "@/lib/cn.js";
import { useLibelles, useT } from "@/lib/i18n.js";
import { tapFeedback } from "@/lib/native.js";
import { FutCard } from "@/components/fut-card/fut-card.js";
import { Button, ErrorBanner, SectionTitle } from "@/components/ui/index.js";

/**
 * Le terrain à cinq, et sa composition (CLUB-002, TOUR-007).
 *
 * Le même écran sert deux fois : le cinq type d'un club, et la feuille de ce
 * club pour un tournoi. Les règles d'interaction sont identiques — on touche
 * un emplacement, puis le joueur —, et deux copies auraient fini par diverger
 * sur le geste le plus délicat de l'application.
 *
 * Ce qui change d'un usage à l'autre passe en propriétés : le titre, la
 * phrase sous le terrain, et surtout **le repli statistique**. Un club sans
 * composition montre son meilleur joueur à chaque poste, parce qu'un terrain
 * nu n'apprendrait rien de son effectif. Une feuille de tournoi sans
 * composition n'annonce personne : deviner qui joue serait une information
 * fausse, et c'est précisément celle qu'on est venu chercher.
 */
export function LineupComposer({
  players,
  stored,
  mayCompose,
  title,
  readHint,
  composedHint,
  fallbackToStats,
  saving,
  clearing,
  onSave,
  onClear,
  clearLabel,
  onOpen,
}: {
  /** L'effectif dans lequel on compose. */
  players: PublicPlayer[];
  stored: LineupAssignment[];
  mayCompose: boolean;
  title: string;
  /** Sous le terrain, quand rien n'est composé. */
  readHint: string;
  /** Sous le terrain, quand une composition existe. */
  composedHint: string;
  /** Vrai pour le cinq type d'un club, faux pour une feuille de tournoi. */
  fallbackToStats: boolean;
  saving: boolean;
  clearing: boolean;
  onSave: (assignments: LineupAssignment[]) => Promise<unknown>;
  /** Absent quand il n'y a rien à quoi revenir. */
  onClear?: () => Promise<unknown>;
  clearLabel?: string;
  onOpen: (player: PublicPlayer) => void;
}) {
  const t = useT();
  const L = useLibelles();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LineupAssignment[]>([]);
  const [selected, setSelected] = useState<LineupSlot | null>(null);
  const [error, setError] = useState<string | null>(null);

  /*
   * Ce qui s'affiche : le brouillon en composition, la composition
   * enregistrée sinon.
   *
   * En composition, pas de repli statistique même là où la lecture en a un :
   * vider le dernier emplacement doit donner un terrain vide, et non faire
   * surgir cinq joueurs que personne n'a alignés.
   */
  const picks = useMemo(() => {
    if (editing) return lineupFromAssignments(players, draft);
    if (fallbackToStats) return resolveLineup(players, stored);
    return lineupFromAssignments(players, stored);
  }, [players, editing, draft, stored, fallbackToStats]);

  // Le classement sert de sélecteur pendant la composition : on cherche un
  // joueur par son nom, pas par sa place dans la liste des adhésions.
  const ranked = useMemo(
    () => [...players].sort((a, b) => b.rating - a.rating || a.id - b.id),
    [players],
  );

  const occupantOf = (slot: LineupSlot) =>
    draft.find((entry) => entry.slot === slot)?.playerId ?? null;
  const slotOf = (playerId: number) =>
    draft.find((entry) => entry.playerId === playerId)?.slot ?? null;

  function startEditing() {
    void tapFeedback();
    setError(null);
    /*
     * On part de ce qui est affiché. Repartir d'un terrain vide aurait obligé
     * à reposer cinq joueurs pour en déplacer un seul — et, pour un club,
     * aurait jeté la déduction statistique qui faisait déjà l'essentiel du
     * travail.
     */
    setDraft(
      stored.length > 0
        ? stored
        : picks.flatMap((pick) =>
            pick.player ? [{ slot: pick.slot, playerId: pick.player.id }] : [],
          ),
    );
    setSelected(null);
    setEditing(true);
  }

  /**
   * Un emplacement touché.
   *
   * Le premier se sélectionne ; le second échange. Deux emplacements occupés
   * troquent leurs joueurs, un emplacement vide reçoit celui d'en face — et
   * dans les deux cas, personne ne se retrouve aligné deux fois.
   */
  function tapSlot(slot: LineupSlot) {
    void tapFeedback();
    if (selected === null) {
      setSelected(slot);
      return;
    }
    if (selected === slot) {
      setSelected(null);
      return;
    }

    const here = occupantOf(slot);
    const there = occupantOf(selected);

    setDraft((current) => {
      const rest = current.filter(
        (entry) => entry.slot !== slot && entry.slot !== selected,
      );
      return [
        ...rest,
        ...(here !== null ? [{ slot: selected, playerId: here }] : []),
        ...(there !== null ? [{ slot, playerId: there }] : []),
      ];
    });
    setSelected(null);
  }

  /** Un joueur touché dans la liste : il prend l'emplacement sélectionné. */
  function tapPlayer(playerId: number) {
    if (selected === null) return;
    void tapFeedback();

    const previous = slotOf(playerId);
    const displaced = occupantOf(selected);

    setDraft((current) => {
      const rest = current.filter(
        (entry) => entry.slot !== selected && entry.playerId !== playerId,
      );
      return [
        ...rest,
        { slot: selected, playerId },
        /*
         * Le joueur qui cède sa place prend celle d'où vient l'arrivant : un
         * échange plutôt qu'une éviction. Si l'arrivant n'était nulle part,
         * le remplacé sort du terrain — c'est ce qu'on a demandé.
         */
        ...(previous !== null && displaced !== null
          ? [{ slot: previous, playerId: displaced }]
          : []),
      ];
    });
    setSelected(null);
  }

  /** Vide l'emplacement sélectionné : une composition partielle est valable. */
  function clearSlot() {
    if (selected === null) return;
    void tapFeedback();
    setDraft((current) => current.filter((entry) => entry.slot !== selected));
    setSelected(null);
  }

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      setEditing(false);
      setSelected(null);
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  const busy = saving || clearing;

  return (
    <section>
      <SectionTitle>{title}</SectionTitle>

      <Pitch
        picks={picks}
        editing={editing}
        selected={selected}
        onSlot={tapSlot}
        onOpen={onOpen}
      />

      <p className="mt-2 text-center text-xs text-muted">
        {editing
          ? selected === null
            ? t("club.tapSlot")
            : t("club.tapPlayer")
          : stored.length > 0
            ? composedHint
            : readHint}
      </p>

      {error && (
        <div className="mt-2">
          <ErrorBanner message={error} />
        </div>
      )}

      {mayCompose && !editing && (
        <Button
          variant="secondary"
          fullWidth
          className="mt-3"
          onClick={startEditing}
        >
          <Pencil className="size-4" aria-hidden />
          {stored.length > 0 ? t("club.editLineup") : t("club.compose")}
        </Button>
      )}

      {editing && (
        <div className="mt-3 space-y-3">
          {/* La liste de l'effectif, à portée du pouce : c'est là qu'on prend
              le joueur qu'on vient d'appeler. */}
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {ranked.map((player) => {
              const slot = slotOf(player.id);
              return (
                <button
                  key={player.id}
                  type="button"
                  disabled={selected === null}
                  onClick={() => tapPlayer(player.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors",
                    slot !== null
                      ? "border-accent/50 bg-accent/10"
                      : "border-border bg-surface",
                    selected === null
                      ? "opacity-60"
                      : "hover:bg-surface-raised active:scale-[0.99]",
                  )}
                >
                  <FutCard player={player} size="xs" animated={false} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {player.displayName}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted">
                    {slot !== null
                      ? L.lineupSlot[slot]
                      : L.position[player.position]}
                  </span>
                </button>
              );
            })}
          </div>

          {selected !== null && occupantOf(selected) !== null && (
            <Button variant="secondary" fullWidth onClick={clearSlot}>
              <X className="size-4" aria-hidden />
              {t("club.clearSlot")}
            </Button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              fullWidth
              disabled={busy}
              onClick={() => {
                void tapFeedback();
                setEditing(false);
                setSelected(null);
                setError(null);
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="accent"
              fullWidth
              loading={saving}
              disabled={busy}
              onClick={() =>
                void run(() =>
                  onSave(
                    // L'ordre du terrain : une composition se relit mieux
                    // ainsi dans le registre que dans l'ordre des touchers.
                    LINEUP_SLOTS.flatMap((slot) => {
                      const entry = draft.find((row) => row.slot === slot);
                      return entry ? [entry] : [];
                    }),
                  ),
                )
              }
            >
              <Check className="size-4" aria-hidden />
              {t("password.save")}
            </Button>
          </div>

          {onClear && stored.length > 0 && (
            <Button
              variant="ghost"
              fullWidth
              loading={clearing}
              disabled={busy}
              onClick={() => void run(onClear)}
            >
              <RotateCcw className="size-4" aria-hidden />
              {clearLabel ?? t("club.clearLineup")}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Le terrain de futsal.
 *
 * Dessiné en CSS plutôt qu'en image : il doit suivre les deux thèmes et se
 * redimensionner d'un téléphone à l'autre, ce qu'un fichier figé ne fait pas.
 * Les lignes sont celles d'un terrain de futsal — surfaces arrondies, rond
 * central, ligne médiane — et rien de plus : ce qu'on regarde, ce sont les
 * cartes.
 */
export function Pitch({
  picks,
  editing,
  selected,
  onSlot,
  onOpen,
}: {
  picks: LineupPick<PublicPlayer>[];
  editing: boolean;
  selected: LineupSlot | null;
  onSlot: (slot: LineupSlot) => void;
  onOpen: (player: PublicPlayer) => void;
}) {
  const bySlot = new Map(picks.map((pick) => [pick.slot, pick]));
  /*
   * Du haut vers le bas de l'image : la pointe, les deux ailes côte à côte,
   * la défense, le but. C'est la forme du futsal, et elle tient dans les
   * mêmes quatre rangées qu'avant — le cinquième joueur n'a coûté aucune
   * hauteur d'écran.
   */
  const rows: LineupSlot[][] = [["ATT"], ["AILE_G", "AILE_D"], ["DEF"], ["GB"]];

  return (
    <div className="relative overflow-hidden rounded-card border border-border/60 bg-[#0d2818] py-4">
      <PitchLines />

      <div className="relative grid grid-rows-4 gap-1">
        {rows.map((row) => (
          <div key={row.join("-")} className="flex justify-center gap-3">
            {row.map((slot) => {
              const pick = bySlot.get(slot);
              if (!pick) return null;
              return (
                <PitchSlotTile
                  key={slot}
                  pick={pick}
                  editing={editing}
                  selected={selected === slot}
                  onSlot={() => onSlot(slot)}
                  onOpen={onOpen}
                />
              );
            })}
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
      {/* Ligne médiane et rond central. */}
      <div className="absolute inset-x-2 top-1/2 h-0.5 -translate-y-1/2 bg-white/20" />
      <div className="absolute left-1/2 top-1/2 size-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/20" />
      {/* Les deux surfaces. */}
      <div className="absolute left-1/2 top-2 h-10 w-32 -translate-x-1/2 rounded-b-lg border-x-2 border-b-2 border-white/20" />
      <div className="absolute bottom-2 left-1/2 h-10 w-32 -translate-x-1/2 rounded-t-lg border-x-2 border-t-2 border-white/20" />
    </div>
  );
}

function PitchSlotTile({
  pick,
  editing,
  selected,
  onSlot,
  onOpen,
}: {
  pick: LineupPick<PublicPlayer>;
  editing: boolean;
  selected: boolean;
  onSlot: () => void;
  onOpen: (player: PublicPlayer) => void;
}) {
  const t = useT();
  const L = useLibelles();
  // En composition, toucher une carte la déplace ; en lecture, elle s'ouvre.
  // Le même geste ne doit pas faire deux choses selon l'humeur de l'écran.
  const activate = () => {
    if (editing) {
      onSlot();
      return;
    }
    if (pick.player) onOpen(pick.player);
  };

  const halo = selected
    ? "rounded-lg ring-2 ring-accent ring-offset-2 ring-offset-[#0d2818]"
    : "";

  if (!pick.player) {
    return (
      <button
        type="button"
        onClick={activate}
        disabled={!editing}
        aria-label={t("club.slotFree", { slot: L.lineupSlot[pick.slot] })}
        className={cn(
          "flex h-[74px] w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/25 text-center",
          halo,
        )}
      >
        <span className="text-[10px] font-medium uppercase tracking-wide text-white/50">
          {L.lineupSlot[pick.slot]}
        </span>
        {/* Un poste vide se dit, plutôt que de disparaître : l'absence est
            une information sur le club. */}
        <span className="px-1 text-[9px] leading-tight text-white/35">
          {editing ? t("club.toFill") : t("club.nobodyYet")}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={activate}
      className={cn(
        "flex flex-col items-center gap-0.5 transition-transform active:scale-95",
        halo,
      )}
    >
      <FutCard player={pick.player} size="xs" animated={false} />
      <span className="max-w-[110px] truncate text-[11px] font-medium text-white">
        {pick.player.displayName}
      </span>
      {/*
        En composition, l'emplacement compte plus que la statistique : c'est
        lui qu'on déplace. En lecture, le chiffre dit pourquoi ce joueur est
        là — sauf sur une feuille choisie, où il n'a rien décidé.
      */}
      <span className="text-[10px] text-accent">
        {editing
          ? L.lineupSlot[pick.slot]
          : `${pick.value} ${
              pick.value === 1
                ? L.lineupStatOne[pick.slot]
                : L.lineupStatMany[pick.slot]
            }`}
      </span>
    </button>
  );
}

/** Ré-export pour les écrans qui n'affichent qu'un terrain, sans l'éditer. */
export { composeLineup };
