import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  LINEUP_SLOTS,
  POSITION_LABELS,
  SQUAD_ROLE_LABELS,
  compareForRoster,
  composeLineup,
  type LineupPick,
  type LineupSlot,
  type PublicPlayer,
  type SquadMemberView,
} from "@uno/shared";
import { trpc } from "@/lib/trpc.js";
import { cn } from "@/lib/cn.js";
import { Screen } from "@/components/layout/index.js";
import { Async } from "@/components/ui/async.js";
import { FutCard } from "@/components/fut-card/fut-card.js";
import { PlayerCardDialog } from "@/components/fut-card/player-card-dialog.js";
import { Card, SectionTitle } from "@/components/ui/index.js";

/**
 * L'effectif d'un club, en entier (CLUB-001).
 *
 * Deux lectures, dans cet ordre. **Le terrain d'abord** : quatre cartes à
 * leur poste, celles des joueurs qui mènent leur classement. C'est ce qu'on
 * veut voir d'un club — qui marque, qui donne, qui défend, qui arrête —, et
 * une liste de noms ne le dit jamais. **Le classement ensuite**, pour ceux
 * qui cherchent quelqu'un en particulier ou veulent comparer.
 *
 * Aucune donnée nouvelle n'est demandée au serveur : tout se calcule sur les
 * cartes déjà chargées pour la fiche du club.
 */
export function SquadRosterScreen() {
  const { squadId } = useParams();
  const id = Number(squadId);
  const detail = trpc.squads.detail.useQuery(
    { squadId: id },
    { enabled: Number.isFinite(id) },
  );

  const [zoomed, setZoomed] = useState<PublicPlayer | null>(null);

  return (
    <Screen title="Effectif" back backTo={`/squad`} withTabBar={false}>
      <Async query={detail}>
        {(squad) => {
          const lineup = composeLineup(
            squad.members.map((member) => member.player),
          );
          const ranked = [...squad.members].sort((a, b) =>
            compareForRoster(a.player, b.player),
          );

          return (
            <div className="space-y-5">
              <p className="text-sm text-muted">
                {squad.name} — {squad.memberCount} joueur
                {squad.memberCount > 1 ? "s" : ""}.
              </p>

              <Pitch lineup={lineup} onOpen={setZoomed} />

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
 * Le terrain.
 *
 * Dessiné en CSS plutôt qu'en image : il doit suivre les deux thèmes et se
 * redimensionner d'un téléphone à l'autre, ce qu'un fichier figé ne fait pas.
 * Les lignes sont celles d'un terrain de futsal — surfaces arrondies, rond
 * central, ligne médiane — et rien de plus : ce qu'on regarde, ce sont les
 * cartes.
 */
function Pitch({
  lineup,
  onOpen,
}: {
  lineup: LineupPick<PublicPlayer>[];
  onOpen: (player: PublicPlayer) => void;
}) {
  const bySlot = new Map(lineup.map((pick) => [pick.slot, pick]));
  // Du haut vers le bas de l'image : l'attaque en premier, le but en dernier.
  const rows: LineupSlot[] = ["ATT", "MIL", "DEF", "GB"];

  return (
    <section>
      <SectionTitle>Le onze type</SectionTitle>
      <div className="relative overflow-hidden rounded-card border border-border/60 bg-[#0d2818] py-4">
        <PitchLines />

        <div className="relative grid grid-rows-4 gap-1">
          {rows.map((slot) => {
            const pick = bySlot.get(slot);
            if (!pick) return null;
            return (
              <div key={slot} className="flex justify-center">
                <PitchSlot pick={pick} onOpen={onOpen} />
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-center text-xs text-muted">
        Le meilleur de l'effectif à chaque poste, d'après les statistiques de
        la saison.
      </p>
    </section>
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
  onOpen,
}: {
  pick: LineupPick<PublicPlayer>;
  onOpen: (player: PublicPlayer) => void;
}) {
  if (!pick.player) {
    return (
      <div className="flex h-[74px] w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/25 text-center">
        <span className="text-[10px] font-medium uppercase tracking-wide text-white/50">
          {pick.label}
        </span>
        {/* Un poste vide se dit, plutôt que de disparaître : l'absence est
            une information sur le club. */}
        <span className="px-1 text-[9px] leading-tight text-white/35">
          Personne encore
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(pick.player!)}
      className="flex flex-col items-center gap-0.5 transition-transform active:scale-95"
    >
      <FutCard player={pick.player} size="xs" animated={false} />
      <span className="max-w-[110px] truncate text-[11px] font-medium text-white">
        {pick.player.displayName}
      </span>
      <span className="text-[10px] text-accent">
        {pick.value} {pick.statLabel}
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

        {/* Les quatre chiffres qui composent le terrain, dans le même ordre. */}
        <dl className="flex shrink-0 gap-1.5 text-center">
          {LINEUP_SLOTS.map((slot) => {
            const stat = {
              GB: { value: player.saves, label: "ARR" },
              DEF: { value: player.defenses, label: "DÉF" },
              MIL: { value: player.assists, label: "PAS" },
              ATT: { value: player.goals, label: "BUT" },
            }[slot];
            return (
              <div key={slot} className="w-6">
                <dt className="text-[9px] uppercase text-muted">{stat.label}</dt>
                <dd className="text-[11px] font-semibold tabular-nums">
                  {stat.value}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
    </Card>
  );
}
