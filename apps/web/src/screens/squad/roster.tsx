import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  compareForRoster,
  type LineupAssignment,
  type PublicPlayer,
  type SquadMemberView,
} from "@uno/shared";
import { trpc } from "@/lib/trpc.js";
import { cn } from "@/lib/cn.js";
import { useLibelles, useT, type Cle } from "@/lib/i18n.js";
import { Screen } from "@/components/layout/index.js";
import { Async } from "@/components/ui/async.js";
import { FutCard } from "@/components/fut-card/fut-card.js";
import { PlayerCardDialog } from "@/components/fut-card/player-card-dialog.js";
import { LineupComposer } from "@/components/pitch/futsal-pitch.js";
import { Card, SectionTitle } from "@/components/ui/index.js";

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
  const t = useT();
  const { squadId } = useParams();
  const id = Number(squadId);
  const enabled = Number.isFinite(id);

  const detail = trpc.squads.detail.useQuery({ squadId: id }, { enabled });
  const lineup = trpc.squads.lineup.useQuery({ squadId: id }, { enabled });

  const [zoomed, setZoomed] = useState<PublicPlayer | null>(null);

  return (
    <Screen
      title={t("club.squadTitle")}
      back
      backTo={`/squad`}
      withTabBar={false}
    >
      <Async query={detail}>
        {(squad) => {
          const stored = lineup.data?.assignments ?? [];
          const formation = lineup.data?.formation ?? null;
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
                {t(
                  squad.memberCount > 1
                    ? "club.membersMany"
                    : "club.membersOne",
                  { name: squad.name, count: squad.memberCount },
                )}
              </p>

              <SquadLineup
                squadId={id}
                players={players}
                stored={stored}
                formation={formation}
                mayCompose={mayCompose}
                onOpen={setZoomed}
              />

              <section>
                <SectionTitle>{t("club.rosterRanking")}</SectionTitle>
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
 * Le cinq type d'un club (CLUB-002).
 *
 * L'écran n'est plus ici : il est partagé avec la feuille de tournoi, où le
 * geste de composition est exactement le même. Ne reste que ce qui distingue
 * un club — le repli statistique quand rien n'est composé, et le retour à ce
 * repli quand on renonce à composer.
 */
function SquadLineup({
  squadId,
  players,
  stored,
  formation,
  mayCompose,
  onOpen,
}: {
  squadId: number;
  players: PublicPlayer[];
  stored: LineupAssignment[];
  formation: string | null;
  mayCompose: boolean;
  onOpen: (player: PublicPlayer) => void;
}) {
  const t = useT();
  const utils = trpc.useUtils();
  const save = trpc.squads.setLineup.useMutation();
  const clear = trpc.squads.clearLineup.useMutation();

  const refresh = () => utils.squads.lineup.invalidate({ squadId });

  return (
    <LineupComposer
      title={t("club.bestFive")}
      players={players}
      stored={stored}
      formation={formation}
      mayCompose={mayCompose}
      readHint={t("club.bestFiveRead")}
      composedHint={t("club.bestFiveChosen")}
      fallbackToStats
      saving={save.isPending}
      clearing={clear.isPending}
      onSave={async (assignments, formation) => {
        await save.mutateAsync({ squadId, assignments, formation });
        await refresh();
      }}
      onClear={async () => {
        await clear.mutateAsync({ squadId });
        await refresh();
      }}
      clearLabel={t("club.backToStats")}
      onOpen={onOpen}
    />
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
  const t = useT();
  const L = useLibelles();
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
            {L.position[player.position]} · {player.rating}
            {member.role !== "member" && (
              <>
                {" · "}
                <span
                  className={
                    member.role === "founder"
                      ? "text-accent"
                      : "text-primary-bright"
                  }
                >
                  {L.squadRole[member.role]}
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
            { cle: "club.statSaves", value: player.saves },
            { cle: "club.statDefences", value: player.defenses },
            { cle: "club.statAssists", value: player.assists },
            { cle: "club.statGoals", value: player.goals },
          ].map((stat) => (
            <div key={stat.cle} className="w-6">
              <dt className="text-[9px] uppercase text-muted">
                {t(stat.cle as Cle)}
              </dt>
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
