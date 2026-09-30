import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardList, Film, Plus, Trash2, Users } from "lucide-react";
import {
  CUSTOM_MATCH,
  MATCH_FORMAT,
  SESSION_STATS,
  type PublicPlayer,
  type TeamView,
} from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { formatShortDate } from "@/lib/format.js";
import { Async, type QueryLike } from "@/components/ui/async.js";
import {
  Button,
  Card,
  EmptyState,
  SectionTitle,
  Select,
} from "@/components/ui/index.js";
import { SessionVideoEditor } from "./session-videos.js";
import { useT, useNomDEquipe, useLibelles } from "@/lib/i18n.js";

/**
 * Saisie des résultats d'une session (MATCH-003).
 *
 * Deux formats, deux façons de composer la feuille.
 *
 * **Match amical** : une rencontre, créée avec les équipes. Il n'y a rien à
 * décider.
 *
 * **UNO League** : une session de deux heures enchaîne des matchs de dix
 * minutes, le vainqueur restant sur le terrain. Leur nombre n'est pas connu à
 * l'avance : ils sont ajoutés au fur et à mesure, l'application
 * proposant l'affiche suivante d'après la règle du terrain. Elle reste une
 * suggestion : la vraie séance a pu s'en écarter.
 *
 * L'enregistrement final part d'un bloc — scores et statistiques ensemble.
 * Une session à moitié saisie produirait un classement faux, donc de fausses
 * distinctions et de faux mouvements de division.
 *
 * **Réservé à l'administration** (SUP-003). Un superviseur relève les
 * statistiques en visionnage — le bouton ci-dessous — mais ne retouche pas
 * une session déjà en base : cet écran-ci réécrit directement le classement,
 * les récompenses et les divisions. Le serveur tient la règle ; ne pas
 * afficher la file au superviseur ne fait que la rendre lisible.
 *
 * **L'organisateur d'un match personnalisé** tient la même feuille pour sa
 * séance (PRIV-003), par des routes à lui (`customMatches.*`) : mêmes gestes,
 * mêmes services, mais rien de ce qu'il écrit ne sort de la séance. Il peut
 * en plus ajouter une équipe et marquer un inscrit absent — sur un terrain
 * d'entreprise, on ne sait qu'une fois sur place combien d'équipes on fait.
 */

type StatKey = (typeof SESSION_STATS)[number];
type PlayerStats = Record<StatKey, number>;
type MatchEntry = {
  scoreA: number;
  scoreB: number;
  stats: Record<number, PlayerStats>;
};

/**
 * Ce que les deux feuilles ont en commun ; celle de l'organisateur y ajoute
 * les inscrits restés hors des équipes.
 */
type SheetData = {
  teams: TeamView[];
  matches: {
    id: number;
    matchOrder: number;
    scoreA: number;
    scoreB: number;
    teamA: TeamView | null;
    teamB: TeamView | null;
  }[];
  videos: Parameters<typeof SessionVideoEditor>[0]["videos"];
  suggestedPairing: { teamAId: number; teamBId: number } | null;
  unassigned?: PublicPlayer[];
};

const EMPTY_STATS: PlayerStats = {
  goals: 0,
  assists: 0,
  defenses: 0,
  saves: 0,
};

export function SessionQueue() {
  const t = useT();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const pending = trpc.supervision.pending.useQuery();

  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      {/*
        Deux façons de saisir, et celle-ci vaut mieux dans presque tous les
        cas : relever les actions au fil de l'enregistrement plutôt que
        remplir un tableau de mémoire. Le tableau reste, pour une séance dont
        on n'a pas la vidéo.
      */}
      {selected === null && (
        <button
          type="button"
          onClick={() => navigate("/visionnage")}
          className="flex w-full items-start gap-3 rounded-card border border-accent/40 bg-accent/10 px-4 py-3 text-left"
        >
          <Film className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          <span>
            <span className="block text-sm font-medium">
              {t("tracker.title")}
            </span>
            <span className="block text-xs text-muted">
              {t("supervision.videoEntryLead")}
            </span>
          </span>
        </button>
      )}

      {selected === null ? (
        <Async query={pending}>
          {(sessions) =>
            sessions.length === 0 ? (
              <EmptyState
                title={t("supervision.emptyTitle")}
                description={t("supervision.emptyBody")}
                icon={<ClipboardList className="size-6" aria-hidden />}
              />
            ) : (
              <div className="space-y-2">
                {sessions.map((session) => (
                  <Card
                    key={session.id}
                    className="flex items-center gap-3 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {session.venueName}
                        {session.division ? ` · ${session.division}` : ""}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {formatShortDate(session.localDate)} ·{" "}
                        {session.localTimeLabel} ·{" "}
                        {t("supervision.playersCount", {
                          count: session.participantCount,
                        })}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => setSelected(session.id)}
                    >
                      {t("supervision.enter")}
                    </Button>
                  </Card>
                ))}
              </div>
            )
          }
        </Async>
      ) : (
        <SessionSheet
          proposalId={selected}
          onDone={async () => {
            setSelected(null);
            await utils.supervision.pending.invalidate();
          }}
          onCancel={() => setSelected(null)}
        />
      )}
    </div>
  );
}

/**
 * Saisie d'une session donnée.
 *
 * Exportée : la file d'attente n'est pas le seul chemin qui y mène. Un match
 * SQUAD, par exemple, ne naît pas du calendrier — il naît d'un défi accepté —
 * et sa feuille s'ouvre depuis la session elle-même (SQUAD-005).
 */
export function SessionSheet({
  proposalId,
  onDone,
  onCancel,
  organizer = false,
}: {
  proposalId: number;
  onDone: () => Promise<void>;
  onCancel: () => void;
  /** La feuille d'un match personnalisé, tenue par son organisateur. */
  organizer?: boolean;
}) {
  const t = useT();
  const L = useLibelles();
  const nomEquipe = useNomDEquipe();
  const utils = trpc.useUtils();
  const detail = trpc.proposals.get.useQuery({ proposalId });

  /*
   * Les deux jeux de routes sont déclarés — un hook ne se déclare pas sous
   * condition —, mais une seule feuille est lue : l'autre route répondrait
   * « interdit ».
   */
  const adminSheet = trpc.supervision.sheet.useQuery(
    { proposalId },
    { enabled: !organizer },
  );
  const customSheet = trpc.customMatches.sheet.useQuery(
    { proposalId },
    { enabled: organizer, retry: false },
  );
  const sheet: QueryLike<SheetData> = organizer ? customSheet : adminSheet;

  const generate = trpc.supervision.generateTeams.useMutation();
  const adminAddMatch = trpc.supervision.addMatch.useMutation();
  const adminRemoveMatch = trpc.supervision.removeMatch.useMutation();
  const adminAssignTeam = trpc.supervision.assignTeam.useMutation();
  const adminRecord = trpc.supervision.record.useMutation();
  const customAddMatch = trpc.customMatches.addMatch.useMutation();
  const customRemoveMatch = trpc.customMatches.removeMatch.useMutation();
  const customAssignTeam = trpc.customMatches.assignTeam.useMutation();
  const customRecord = trpc.customMatches.record.useMutation();
  const addTeam = trpc.customMatches.addTeam.useMutation();
  const unassign = trpc.customMatches.unassign.useMutation();

  const addMatch = organizer ? customAddMatch : adminAddMatch;
  const removeMatch = organizer ? customRemoveMatch : adminRemoveMatch;
  const assignTeam = organizer ? customAssignTeam : adminAssignTeam;
  const record = organizer ? customRecord : adminRecord;

  const [entries, setEntries] = useState<Record<number, MatchEntry>>({});
  const [error, setError] = useState<string | null>(null);

  const matches = useMemo(() => sheet.data?.matches ?? [], [sheet.data]);
  const teams = useMemo(() => sheet.data?.teams ?? [], [sheet.data]);
  const isLeague = detail.data?.modeId === "league";
  // Un match SQUAD oppose deux clubs : ni tirage, ni match supplémentaire.
  const isSquad = detail.data?.modeId === "squad";
  // Les matchs s'enchaînent en UNO League et dans un match personnalisé ;
  // ailleurs, la séance est une rencontre.
  const manyMatches = isLeague || organizer;
  // Un match personnalisé se joue au format choisi par son organisateur.
  const capacity = organizer
    ? Math.max(1, Math.floor((detail.data?.minParticipants ?? 2) / 2))
    : MATCH_FORMAT.playersPerTeam;

  // Les matchs déjà saisis réapparaissent avec leurs scores ; un match ajouté
  // ensuite prend sa place sans effacer ce qui a déjà été tapé.
  useEffect(() => {
    if (matches.length === 0) return;
    setEntries((current) => {
      const next = { ...current };
      for (const match of matches) {
        next[match.id] ??= {
          scoreA: match.scoreA,
          scoreB: match.scoreB,
          stats: {},
        };
      }
      return next;
    });
  }, [matches]);

  async function reload() {
    await (organizer
      ? utils.customMatches.sheet.invalidate({ proposalId })
      : utils.supervision.sheet.invalidate({ proposalId }));
  }

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await reload();
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  async function submit() {
    setError(null);
    try {
      await record.mutateAsync({
        proposalId,
        matches: matches.map((match) => {
          const entry = entries[match.id];
          const roster = [
            ...(match.teamA?.players ?? []),
            ...(match.teamB?.players ?? []),
          ];
          return {
            matchId: match.id,
            scoreA: entry?.scoreA ?? 0,
            scoreB: entry?.scoreB ?? 0,
            stats: roster.map((player) => ({
              playerId: player.id,
              ...(entry?.stats[player.id] ?? EMPTY_STATS),
            })),
          };
        }),
        complete: true,
      });
      await utils.proposals.list.invalidate();
      await utils.proposals.get.invalidate({ proposalId });
      await utils.ranking.invalidate();
      await onDone();
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  function setScore(matchId: number, side: "scoreA" | "scoreB", value: number) {
    setEntries((current) => ({
      ...current,
      [matchId]: {
        scoreA: current[matchId]?.scoreA ?? 0,
        scoreB: current[matchId]?.scoreB ?? 0,
        stats: current[matchId]?.stats ?? {},
        [side]: value,
      },
    }));
  }

  function setStat(
    matchId: number,
    playerId: number,
    stat: StatKey,
    value: number,
  ) {
    setEntries((current) => {
      const entry = current[matchId] ?? { scoreA: 0, scoreB: 0, stats: {} };
      const player = entry.stats[playerId] ?? EMPTY_STATS;
      return {
        ...current,
        [matchId]: {
          ...entry,
          stats: { ...entry.stats, [playerId]: { ...player, [stat]: value } },
        },
      };
    });
  }

  const suggested = sheet.data?.suggestedPairing ?? null;
  const teamName = (id: number) =>
    nomEquipe(
      teams.find((team) => team.id === id)?.name ??
        t("supervision.teamN", { id }),
    );

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {t("common.back")}
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-red-200"
        >
          {error}
        </div>
      )}

      <Async query={sheet}>
        {(data) => (
          <>
            {/*
              La vidéo vient en premier : c'est en la regardant qu'on remplit
              le reste. La proposer après la feuille reviendrait à demander de
              saisir de mémoire.
            */}
            <SessionVideoEditor
              proposalId={proposalId}
              videos={data.videos}
              organizer={organizer}
              onChanged={reload}
            />
            {organizer && (
              <p className="text-xs leading-relaxed text-muted">
                {t("customSheet.lead")}
              </p>
            )}
            {data.teams.length === 0 && !organizer ? (
              <Card className="space-y-3 text-center">
                <Users className="mx-auto size-8 text-muted" aria-hidden />
                <p className="text-sm text-muted">
                  {t("supervision.noTeamsYet")}
                </p>
                <Button
                  variant="accent"
                  fullWidth
                  loading={generate.isPending}
                  onClick={() =>
                    void run(() => generate.mutateAsync({ proposalId }))
                  }
                >
                  {t("supervision.drawTeams")}
                </Button>
              </Card>
            ) : (
              <>
                {/* Composition : réajustable tant qu'aucun match n'est validé */}
                <TeamComposition
                  teams={data.teams}
                  capacity={capacity}
                  onMove={(playerId, teamId) =>
                    void run(() =>
                      assignTeam.mutateAsync({ proposalId, playerId, teamId }),
                    )
                  }
                  pending={
                    assignTeam.isPending ||
                    unassign.isPending ||
                    addTeam.isPending
                  }
                  fixed={isSquad}
                  {...(organizer
                    ? {
                        unassigned: data.unassigned ?? [],
                        onUnassign: (playerId: number) =>
                          void run(() =>
                            unassign.mutateAsync({ proposalId, playerId }),
                          ),
                        onAddTeam:
                          data.teams.length < CUSTOM_MATCH.maxTeams
                            ? () =>
                                void run(() =>
                                  addTeam.mutateAsync({ proposalId }),
                                )
                            : undefined,
                      }
                    : {})}
                />

                {data.matches.map((match) => {
                  const entry = entries[match.id];
                  const roster = [
                    ...(match.teamA?.players ?? []).map((player) => ({
                      player,
                      team: nomEquipe(match.teamA?.name ?? "Équipe A"),
                    })),
                    ...(match.teamB?.players ?? []).map((player) => ({
                      player,
                      team: nomEquipe(match.teamB?.name ?? "Équipe B"),
                    })),
                  ];

                  return (
                    <section key={match.id}>
                      <div className="mb-2 flex items-center justify-between">
                        <SectionTitle>
                          {t("supervision.matchTitle", {
                            n: match.matchOrder,
                            a: nomEquipe(match.teamA?.name ?? "Équipe A"),
                            b: nomEquipe(match.teamB?.name ?? "Équipe B"),
                          })}
                        </SectionTitle>
                        {manyMatches && data.matches.length > 1 && (
                          <button
                            type="button"
                            aria-label={t("supervision.removeMatchN", {
                              n: match.matchOrder,
                            })}
                            onClick={() =>
                              void run(() =>
                                removeMatch.mutateAsync({ matchId: match.id }),
                              )
                            }
                            className="flex size-8 items-center justify-center rounded-lg text-muted hover:text-red-300"
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </button>
                        )}
                      </div>

                      <Card className="space-y-3">
                        <div className="flex items-center justify-center gap-3">
                          <ScoreInput
                            label={nomEquipe(match.teamA?.name ?? "Équipe A")}
                            value={entry?.scoreA ?? 0}
                            onChange={(value) =>
                              setScore(match.id, "scoreA", value)
                            }
                          />
                          <span className="text-muted">—</span>
                          <ScoreInput
                            label={nomEquipe(match.teamB?.name ?? "Équipe B")}
                            value={entry?.scoreB ?? 0}
                            onChange={(value) =>
                              setScore(match.id, "scoreB", value)
                            }
                          />
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse text-sm">
                            <thead>
                              <tr className="border-b border-border/60 text-[11px] uppercase tracking-wide text-muted">
                                <th
                                  scope="col"
                                  className="py-2 text-left font-medium"
                                >
                                  {t("supervision.player")}
                                </th>
                                {SESSION_STATS.map((stat) => (
                                  <th
                                    key={stat}
                                    scope="col"
                                    className="w-14 py-2 text-center font-medium"
                                  >
                                    {L.rankingStat[stat]}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {roster.map(({ player, team }) => (
                                <tr
                                  key={player.id}
                                  className="border-b border-border/30 last:border-0"
                                >
                                  <td className="py-1.5 pr-2">
                                    <p className="truncate text-[13px]">
                                      {player.displayName}
                                    </p>
                                    <p className="text-[10px] text-muted">
                                      {team} · {L.position[player.position]}
                                    </p>
                                  </td>
                                  {SESSION_STATS.map((stat) => (
                                    <td
                                      key={stat}
                                      className="py-1.5 text-center"
                                    >
                                      <input
                                        type="number"
                                        min={0}
                                        max={99}
                                        inputMode="numeric"
                                        aria-label={t("supervision.statOf", {
                                          stat: L.rankingStat[stat],
                                          name: player.displayName,
                                        })}
                                        value={
                                          entry?.stats[player.id]?.[stat] ?? 0
                                        }
                                        onChange={(event) =>
                                          setStat(
                                            match.id,
                                            player.id,
                                            stat,
                                            Math.max(
                                              0,
                                              Number(event.target.value) || 0,
                                            ),
                                          )
                                        }
                                        className="w-12 rounded-lg border border-border/60 bg-surface-raised px-1 py-1 text-center text-sm tabular-nums outline-none focus:border-accent"
                                      />
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </Card>
                    </section>
                  );
                })}

                {/* MATCH-001 : la suite de la séance, match par match */}
                {manyMatches && data.teams.length >= 2 && (
                  <NextMatch
                    teams={data.teams}
                    suggested={suggested}
                    teamName={teamName}
                    lead={t(
                      organizer
                        ? "customSheet.nextMatchLead"
                        : "supervision.nextMatchRule",
                    )}
                    pending={addMatch.isPending}
                    onAdd={(teamAId, teamBId) =>
                      void run(() =>
                        addMatch.mutateAsync({ proposalId, teamAId, teamBId }),
                      )
                    }
                  />
                )}

                <Card className="space-y-2">
                  <p className="text-xs leading-relaxed text-muted">
                    {t(
                      organizer
                        ? "customSheet.recordNote"
                        : "supervision.recordNote",
                      { count: data.matches.length },
                    )}
                  </p>
                  <Button
                    variant="accent"
                    fullWidth
                    loading={record.isPending}
                    disabled={data.matches.length === 0}
                    onClick={() => void submit()}
                  >
                    {t(
                      organizer
                        ? "customSheet.record"
                        : "supervision.recordAndClose",
                    )}
                  </Button>
                  {/*
                  Une sortie au pied de la feuille, en plus de celle du haut.
                  La saisie d'une session de ligue dépasse deux mille pixels :
                  remonter jusqu'en haut pour renoncer n'est pas une sortie.
                */}
                  <Button variant="ghost" fullWidth onClick={onCancel}>
                    {t("supervision.leaveWithoutSaving")}
                  </Button>
                </Card>
              </>
            )}
          </>
        )}
      </Async>
    </div>
  );
}

/**
 * Composition des équipes, réajustable à la main.
 *
 * Le tirage automatique est un point de départ : sur le terrain, un joueur
 * arrive en retard, un autre repart plus tôt, et les équipes se réajustent.
 * Le serveur refuse la modification dès qu'un match est validé — les
 * compositions sont alors figées dans les statistiques déjà reportées.
 */
function TeamComposition({
  teams,
  capacity,
  onMove,
  pending,
  /**
   * Effectifs figés : deux clubs qui s'affrontent ne se réorganisent pas
   * (SQUAD-005). Le serveur le refuse ; l'écran ne le propose pas.
   */
  fixed = false,
  unassigned,
  onUnassign,
  onAddTeam,
}: {
  teams: TeamView[];
  /** Joueurs attendus par équipe. */
  capacity: number;
  onMove: (playerId: number, teamId: number) => void;
  pending: boolean;
  fixed?: boolean;
  /** Les inscrits hors des équipes : absents, ou pas encore placés. */
  unassigned?: PublicPlayer[];
  /** Retirer un joueur des équipes : il n'est pas venu. */
  onUnassign?: (playerId: number) => void;
  /** Ajouter une équipe ; absent quand le plafond est atteint. */
  onAddTeam?: (() => void) | undefined;
}) {
  const t = useT();
  const nomEquipe = useNomDEquipe();
  const ABSENT = "absent";
  return (
    <section>
      <SectionTitle>{t("supervision.composition")}</SectionTitle>
      <Card className="space-y-3">
        {teams.map((team) => (
          <div key={team.id}>
            <p className="mb-1.5 text-xs font-semibold text-accent">
              {nomEquipe(team.name)}
              <span className="ml-1 font-normal text-muted">
                ({team.players.length}/{capacity})
              </span>
            </p>
            <ul className="space-y-1">
              {team.players.map((player) => (
                <li
                  key={player.id}
                  className="flex items-center gap-2 text-[13px]"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {player.displayName}
                  </span>
                  {fixed ? null : (
                    <Select
                      aria-label={t("supervision.teamOf", {
                        name: player.displayName,
                      })}
                      value={team.id}
                      disabled={pending}
                      onChange={(event) =>
                        event.target.value === ABSENT
                          ? onUnassign?.(player.id)
                          : onMove(player.id, Number(event.target.value))
                      }
                      className="w-32 py-1 text-xs"
                    >
                      {teams.map((option) => (
                        <option key={option.id} value={option.id}>
                          {nomEquipe(option.name)}
                        </option>
                      ))}
                      {onUnassign && (
                        <option value={ABSENT}>
                          {t("customSheet.absent")}
                        </option>
                      )}
                    </Select>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}

        {/* Ceux qui ne jouent dans aucune équipe : on les voit, et on les
            place d'un geste s'ils sont finalement venus. */}
        {unassigned && unassigned.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted">
              {t("customSheet.unassigned")}
            </p>
            <ul className="space-y-1">
              {unassigned.map((player) => (
                <li
                  key={player.id}
                  className="flex items-center gap-2 text-[13px]"
                >
                  <span className="min-w-0 flex-1 truncate text-muted">
                    {player.displayName}
                  </span>
                  <Select
                    aria-label={t("supervision.teamOf", {
                      name: player.displayName,
                    })}
                    value=""
                    disabled={pending}
                    onChange={(event) =>
                      event.target.value &&
                      onMove(player.id, Number(event.target.value))
                    }
                    className="w-32 py-1 text-xs"
                  >
                    <option value="">{t("customSheet.absent")}</option>
                    {teams.map((option) => (
                      <option key={option.id} value={option.id}>
                        {nomEquipe(option.name)}
                      </option>
                    ))}
                  </Select>
                </li>
              ))}
            </ul>
          </div>
        )}

        {onAddTeam && (
          <Button
            variant="secondary"
            fullWidth
            icon={<Plus className="size-4" aria-hidden />}
            disabled={pending}
            onClick={onAddTeam}
          >
            {t("customSheet.addTeam")}
          </Button>
        )}
      </Card>
    </section>
  );
}

/**
 * Ajout du match suivant (MATCH-001).
 *
 * L'affiche proposée applique la règle du terrain — le vainqueur reste, et
 * l'équipe entrante reste en cas de nul. Elle est modifiable : c'est une
 * commodité, pas une contrainte.
 */
function NextMatch({
  teams,
  suggested,
  teamName,
  lead,
  pending,
  onAdd,
}: {
  teams: TeamView[];
  suggested: { teamAId: number; teamBId: number } | null;
  teamName: (id: number) => string;
  /** La règle qui a dicté l'affiche proposée. */
  lead: string;
  pending: boolean;
  onAdd: (teamAId: number, teamBId: number) => void;
}) {
  const t = useT();
  const nomEquipe = useNomDEquipe();
  const [teamAId, setTeamAId] = useState<number | null>(null);
  const [teamBId, setTeamBId] = useState<number | null>(null);

  // La suggestion sert de valeur de départ et se rafraîchit après chaque
  // match enregistré : l'administrateur n'a qu'à confirmer dans le cas courant.
  useEffect(() => {
    if (!suggested) return;
    setTeamAId(suggested.teamAId);
    setTeamBId(suggested.teamBId);
  }, [suggested]);

  const a = teamAId ?? suggested?.teamAId ?? teams[0]?.id ?? null;
  const b = teamBId ?? suggested?.teamBId ?? teams[1]?.id ?? null;
  const valid = a !== null && b !== null && a !== b;

  return (
    <section>
      <SectionTitle>{t("supervision.nextMatch")}</SectionTitle>
      <Card className="space-y-3">
        <p className="text-xs leading-relaxed text-muted">{lead}</p>

        <div className="flex items-center gap-2">
          <Select
            aria-label={t("supervision.firstTeam")}
            value={a ?? ""}
            onChange={(event) => setTeamAId(Number(event.target.value))}
          >
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {nomEquipe(team.name)}
              </option>
            ))}
          </Select>
          <span className="shrink-0 text-xs text-muted">
            {t("supervision.versus")}
          </span>
          <Select
            aria-label={t("supervision.secondTeam")}
            value={b ?? ""}
            onChange={(event) => setTeamBId(Number(event.target.value))}
          >
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {nomEquipe(team.name)}
              </option>
            ))}
          </Select>
        </div>

        <Button
          variant="secondary"
          fullWidth
          icon={<Plus className="size-4" aria-hidden />}
          loading={pending}
          disabled={!valid}
          onClick={() => {
            if (a !== null && b !== null) onAdd(a, b);
          }}
        >
          {valid
            ? t("supervision.addVersus", { a: teamName(a), b: teamName(b) })
            : t("supervision.twoDifferentTeams")}
        </Button>
      </Card>
    </section>
  );
}

function ScoreInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const t = useT();
  return (
    <input
      type="number"
      min={0}
      max={99}
      inputMode="numeric"
      aria-label={t("supervision.scoreOf", { team: label })}
      value={value}
      onChange={(event) =>
        onChange(Math.max(0, Math.min(99, Number(event.target.value) || 0)))
      }
      className="w-16 rounded-xl border border-border/60 bg-surface-raised px-2 py-2 text-center text-lg font-bold tabular-nums outline-none focus:border-accent"
    />
  );
}
