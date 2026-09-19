import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Check, Pencil, RotateCcw, X } from "lucide-react";
import {
  LINEUP_SLOTS,
  POSITION_LABELS,
  SQUAD_ROLE_LABELS,
  compareForRoster,
  lineupFromAssignments,
  resolveLineup,
  type LineupAssignment,
  type LineupPick,
  type LineupSlot,
  type PublicPlayer,
  type SquadMemberView,
} from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { cn } from "@/lib/cn.js";
import { tapFeedback } from "@/lib/native.js";
import { Screen } from "@/components/layout/index.js";
import { Async } from "@/components/ui/async.js";
import { FutCard } from "@/components/fut-card/fut-card.js";
import { PlayerCardDialog } from "@/components/fut-card/player-card-dialog.js";
import { Button, Card, ErrorBanner, SectionTitle } from "@/components/ui/index.js";

/**
 * L'effectif d'un club, en entier (CLUB-001, CLUB-002).
 *
 * Deux lectures, dans cet ordre. **Le terrain d'abord** : cinq cartes à leur
 * poste. C'est ce qu'on veut voir d'un club, et une liste de noms ne le dit
 * jamais. **Le classement ensuite**, pour ceux qui cherchent quelqu'un en
 * particulier ou veulent comparer.
 *
 * Le terrain affiche ce que le club a composé, et à défaut ce que disent les
 * statistiques — la règle vit dans le paquet partagé, pas ici : ce que le
 * terrain montre est une affirmation sur l'effectif, et une affirmation se
 * vérifie.
 *
 * **Composer se fait sur le terrain lui-même** : on touche un emplacement,
 * puis le joueur qui doit l'occuper. Deux emplacements touchés l'un après
 * l'autre échangent leurs joueurs. Le glisser-déposer aurait été plus joli et
 * moins sûr — au doigt, sur une carte de la taille d'un timbre, on rate.
 */
export function SquadRosterScreen() {
  const { squadId } = useParams();
  const id = Number(squadId);
  const enabled = Number.isFinite(id);

  const detail = trpc.squads.detail.useQuery({ squadId: id }, { enabled });
  const lineup = trpc.squads.lineup.useQuery({ squadId: id }, { enabled });

  const [zoomed, setZoomed] = useState<PublicPlayer | null>(null);

  return (
    <Screen title="Effectif" back backTo={`/squad`} withTabBar={false}>
      <Async query={detail}>
        {(squad) => {
          const stored = lineup.data ?? [];
          const players = squad.members.map((member) => member.player);
          const ranked = [...squad.members].sort((a, b) =>
            compareForRoster(a.player, b.player),
          );

          // Composer est un acte de direction, comme inscrire sur la feuille
          // d'un défi. Le serveur applique la même règle : ce que cet écran
          // cache reste interdit là-bas.
          const mayCompose =
            squad.viewer.role === "founder" || squad.viewer.role === "captain";

          return (
            <div className="space-y-5">
              <p className="text-sm text-muted">
                {squad.name} — {squad.memberCount} joueur
                {squad.memberCount > 1 ? "s" : ""}.
              </p>

              <LineupSection
                squadId={id}
                players={players}
                members={ranked}
                stored={stored}
                mayCompose={mayCompose}
                onOpen={setZoomed}
              />

              <section>
                <SectionTitle>Classement de l'effectif</SectionTitle>
                <div className="space-y-2">
                  {ranked.map((member, index) => (
                    <RosterRow
                      key={member.player.id}
                      rank={index + 1}
                      member={member}
                      onOpen={setZoomed}
                    />
                  ))}
                </div>
              </section>
            </div>
          );
        }}
      </Async>

      {zoomed && (
        <PlayerCardDialog player={zoomed} onClose={() => setZoomed(null)} />
      )}
    </Screen>
  );
}

/**
 * Le terrain, en lecture puis en composition.
 *
 * La composition en cours vit ici, dans un brouillon local : tant qu'elle
 * n'est pas enregistrée, rien ne part au serveur. Un écran qui écrirait à
 * chaque déplacement aurait fait payer une hésitation au réseau, et laissé
 * des compositions à moitié faites derrière un échange interrompu.
 */
function LineupSection({
  squadId,
  players,
  members,
  stored,
  mayCompose,
  onOpen,
}: {
  squadId: number;
  players: PublicPlayer[];
  members: SquadMemberView[];
  stored: LineupAssignment[];
  mayCompose: boolean;
  onOpen: (player: PublicPlayer) => void;
}) {
  const utils = trpc.useUtils();
  const save = trpc.squads.setLineup.useMutation();
  const clear = trpc.squads.clearLineup.useMutation();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LineupAssignment[]>([]);
  const [selected, setSelected] = useState<LineupSlot | null>(null);
  const [error, setError] = useState<string | null>(null);

  /*
   * Ce qui s'affiche : le brouillon en composition, la composition
   * enregistrée sinon — et la déduction statistique quand il n'y en a pas.
   *
   * En composition, pas de repli statistique : vider le dernier emplacement
   * doit donner un terrain vide, et non faire surgir cinq joueurs que
   * personne n'a alignés.
   */
  const picks = useMemo(
    () =>
      editing
        ? lineupFromAssignments(players, draft)
        : resolveLineup(players, stored),
    [players, editing, draft, stored],
  );

  const occupantOf = (slot: LineupSlot) =>
    draft.find((entry) => entry.slot === slot)?.playerId ?? null;
  const slotOf = (playerId: number) =>
    draft.find((entry) => entry.playerId === playerId)?.slot ?? null;

  function startEditing() {
    void tapFeedback();
    setError(null);
    /*
     * On part de ce qui est affiché, composition enregistrée ou déduction.
     * Repartir d'un terrain vide aurait obligé à reposer cinq joueurs pour en
     * déplacer un seul.
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
      await utils.squads.lineup.invalidate({ squadId });
      setEditing(false);
      setSelected(null);
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  const busy = save.isPending || clear.isPending;

  return (
    <section>
      <SectionTitle>Le Cinq type</SectionTitle>

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
            ? "Touchez un emplacement, puis le joueur qui doit l'occuper."
            : "Touchez un joueur ci-dessous, ou un autre emplacement pour échanger."
          : stored.length > 0
            ? "La composition choisie par le club."
            : "Le meilleur de l'effectif à chaque poste, d'après les statistiques de la saison."}
      </p>

      {error && <div className="mt-2"><ErrorBanner message={error} /></div>}

      {mayCompose && !editing && (
        <Button
          variant="secondary"
          fullWidth
          className="mt-3"
          onClick={startEditing}
        >
          <Pencil className="size-4" aria-hidden />
          Modifier la compo
        </Button>
      )}

      {editing && (
        <div className="mt-3 space-y-3">
          {/* La liste de l'effectif, à portée du pouce : c'est là qu'on prend
              le joueur qu'on vient d'appeler. */}
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {members.map((member) => {
              const slot = slotOf(member.player.id);
              return (
                <button
                  key={member.player.id}
                  type="button"
                  disabled={selected === null}
                  onClick={() => tapPlayer(member.player.id)}
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
                  <FutCard player={member.player} size="xs" animated={false} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {member.player.displayName}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted">
                    {slot !== null
                      ? picks.find((pick) => pick.slot === slot)?.label
                      : POSITION_LABELS[member.player.position]}
                  </span>
                </button>
              );
            })}
          </div>

          {selected !== null && occupantOf(selected) !== null && (
            <Button variant="secondary" fullWidth onClick={clearSlot}>
              <X className="size-4" aria-hidden />
              Vider cet emplacement
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
              Annuler
            </Button>
            <Button
              variant="accent"
              fullWidth
              loading={save.isPending}
              disabled={busy}
              onClick={() =>
                void run(() =>
                  save.mutateAsync({
                    squadId,
                    // L'ordre du terrain : une composition se relit mieux
                    // ainsi dans le registre que dans l'ordre des touchers.
                    assignments: LINEUP_SLOTS.flatMap((slot) => {
                      const entry = draft.find((row) => row.slot === slot);
                      return entry ? [entry] : [];
                    }),
                  }),
                )
              }
            >
              <Check className="size-4" aria-hidden />
              Enregistrer
            </Button>
          </div>

          {/*
            Revenir aux statistiques : un club dont l'effectif a beaucoup
            changé préfère souvent repartir de ce que disent les chiffres
            plutôt que de corriger cinq emplacements un à un.
          */}
          {stored.length > 0 && (
            <Button
              variant="ghost"
              fullWidth
              loading={clear.isPending}
              disabled={busy}
              onClick={() => void run(() => clear.mutateAsync({ squadId }))}
            >
              <RotateCcw className="size-4" aria-hidden />
              Revenir au cinq statistique
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Le terrain.
 *
 * Dessiné en CSS plutôt qu'en image : il doit suivre les deux thèmes et se
 * redimensionner d'un téléphone à l'autre, ce qu'un fichier figé ne fait pas.
 * Les lignes sont celles d'un terrain de futsal — surfaces arrondies, rond
 * central, ligne médiane — et rien de plus : ce qu'on regarde, ce sont les
 * cartes.
 */
function Pitch({
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
                <PitchSlot
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

function PitchSlot({
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
        aria-label={`${pick.label} — libre`}
        className={cn(
          "flex h-[74px] w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/25 text-center",
          halo,
        )}
      >
        <span className="text-[10px] font-medium uppercase tracking-wide text-white/50">
          {pick.label}
        </span>
        {/* Un poste vide se dit, plutôt que de disparaître : l'absence est
            une information sur le club. */}
        <span className="px-1 text-[9px] leading-tight text-white/35">
          {editing ? "À pourvoir" : "Personne encore"}
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
        là.
      */}
      <span className="text-[10px] text-accent">
        {editing ? pick.label : `${pick.value} ${pick.statLabel}`}
      </span>
    </button>
  );
}

function RosterRow({
  rank,
  member,
  onOpen,
}: {
  rank: number;
  member: SquadMemberView;
  onOpen: (player: PublicPlayer) => void;
}) {
  const player = member.player;

  return (
    <Card
      className="cursor-pointer py-2.5 transition-transform active:scale-[0.99]"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(player)}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "w-5 shrink-0 text-center text-sm font-bold tabular-nums",
            rank <= 3 ? "text-accent" : "text-muted",
          )}
        >
          {rank}
        </span>
        <FutCard player={player} size="xs" animated={false} />

        <div className="min-w-0 flex-1">
          {/* Le nom occupe sa ligne seul : le badge de rôle à côté le
              réduisait à « Y… » sur les noms un peu longs. */}
          <p className="truncate text-sm font-medium">{player.displayName}</p>
          {/* Court à dessein : les matchs joués figurent déjà sur la carte,
              et une méta sur trois lignes écrasait le nom. */}
          <p className="text-xs leading-tight text-muted">
            {POSITION_LABELS[player.position]} · {player.rating}
            {member.role !== "member" && (
              <>
                {" · "}
                <span
                  className={
                    member.role === "founder" ? "text-accent" : "text-primary-bright"
                  }
                >
                  {SQUAD_ROLE_LABELS[member.role]}
                </span>
              </>
            )}
          </p>
        </div>

        {/*
          Les quatre chiffres qui décident du terrain.
          Quatre et non cinq : les deux ailes se départagent sur la même
          statistique, et afficher deux fois le compte de passes donnerait une
          colonne qui n'apprend rien.
        */}
        <dl className="flex shrink-0 gap-1.5 text-center">
          {[
            { key: "ARR", value: player.saves },
            { key: "DÉF", value: player.defenses },
            { key: "PAS", value: player.assists },
            { key: "BUT", value: player.goals },
          ].map((stat) => (
            <div key={stat.key} className="w-6">
              <dt className="text-[9px] uppercase text-muted">{stat.key}</dt>
              <dd className="text-[11px] font-semibold tabular-nums">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Card>
  );
}
