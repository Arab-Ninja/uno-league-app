import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Users } from "lucide-react";
import { SESSION_STATS, RANKING_STAT_LABELS } from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { formatShortDate } from "@/lib/format.js";
import { Async } from "@/components/ui/async.js";
import { Button, Card, EmptyState, SectionTitle } from "@/components/ui/index.js";

/**
 * Saisie des résultats d'une session (MATCH-003).
 *
 * L'administration entre les scores de chaque match et les statistiques de
 * chaque joueur, puis valide en une fois. Tout le reste en découle
 * automatiquement : statistiques de carrière, classement de session,
 * distinctions, récompenses, montées et descentes de division.
 *
 * La saisie est envoyée d'un bloc plutôt que match par match : une session à
 * moitié enregistrée produirait un classement faux, donc de fausses
 * distinctions et de faux mouvements de division.
 */

type StatKey = (typeof SESSION_STATS)[number];
type PlayerStats = Record<StatKey, number>;
type MatchEntry = {
  scoreA: number;
  scoreB: number;
  stats: Record<number, PlayerStats>;
};

const EMPTY_STATS: PlayerStats = { goals: 0, assists: 0, defenses: 0, saves: 0 };

export function AdminSessions() {
  const utils = trpc.useUtils();
  const pending = trpc.admin.pendingSessions.useQuery();

  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      {selected === null ? (
        <Async query={pending}>
          {(sessions) =>
            sessions.length === 0 ? (
              <EmptyState
                title="Aucune session à saisir"
                description="Les sessions confirmées dont la date est passée apparaîtront ici."
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
                        {session.localTimeLabel} · {session.participantCount}{" "}
                        joueurs
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => setSelected(session.id)}
                    >
                      Saisir
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
            await utils.admin.pendingSessions.invalidate();
          }}
          onCancel={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function SessionSheet({
  proposalId,
  onDone,
  onCancel,
}: {
  proposalId: number;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const utils = trpc.useUtils();
  const sheet = trpc.admin.sessionSheet.useQuery({ proposalId });
  const generate = trpc.admin.generateTeams.useMutation();
  const record = trpc.admin.recordSession.useMutation();

  const [entries, setEntries] = useState<Record<number, MatchEntry>>({});
  const [error, setError] = useState<string | null>(null);

  const matches = useMemo(() => sheet.data?.matches ?? [], [sheet.data]);

  // Les matchs déjà saisis réapparaissent avec leurs scores : reprendre une
  // saisie interrompue ne doit pas obliger à tout retaper.
  useEffect(() => {
    if (matches.length === 0) return;
    setEntries((current) => {
      if (Object.keys(current).length > 0) return current;
      const initial: Record<number, MatchEntry> = {};
      for (const match of matches) {
        initial[match.id] = {
          scoreA: match.scoreA,
          scoreB: match.scoreB,
          stats: {},
        };
      }
      return initial;
    });
  }, [matches]);

  async function draw() {
    setError(null);
    try {
      await generate.mutateAsync({ proposalId });
      await utils.admin.sessionSheet.invalidate({ proposalId });
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

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Retour
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
        {(data) =>
          data.matches.length === 0 ? (
            <Card className="space-y-3 text-center">
              <Users className="mx-auto size-8 text-muted" aria-hidden />
              <p className="text-sm text-muted">
                Les équipes ne sont pas encore constituées. Le tirage forme
                trois équipes de cinq et leurs trois rencontres.
              </p>
              <Button
                variant="accent"
                fullWidth
                loading={generate.isPending}
                onClick={() => void draw()}
              >
                Tirer les équipes
              </Button>
            </Card>
          ) : (
            <>
              {data.matches.map((match) => {
                const entry = entries[match.id];
                const roster = [
                  ...(match.teamA?.players ?? []).map((player) => ({
                    player,
                    team: match.teamA?.name ?? "Équipe A",
                  })),
                  ...(match.teamB?.players ?? []).map((player) => ({
                    player,
                    team: match.teamB?.name ?? "Équipe B",
                  })),
                ];

                return (
                  <section key={match.id}>
                    <SectionTitle>
                      {match.teamA?.name} contre {match.teamB?.name}
                    </SectionTitle>

                    <Card className="space-y-3">
                      <div className="flex items-center justify-center gap-3">
                        <ScoreInput
                          label={match.teamA?.name ?? "Équipe A"}
                          value={entry?.scoreA ?? 0}
                          onChange={(value) =>
                            setScore(match.id, "scoreA", value)
                          }
                        />
                        <span className="text-muted">—</span>
                        <ScoreInput
                          label={match.teamB?.name ?? "Équipe B"}
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
                                Joueur
                              </th>
                              {SESSION_STATS.map((stat) => (
                                <th
                                  key={stat}
                                  scope="col"
                                  className="w-14 py-2 text-center font-medium"
                                >
                                  {RANKING_STAT_LABELS[stat]}
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
                                    {team} · {player.position}
                                  </p>
                                </td>
                                {SESSION_STATS.map((stat) => (
                                  <td key={stat} className="py-1.5 text-center">
                                    <input
                                      type="number"
                                      min={0}
                                      max={99}
                                      inputMode="numeric"
                                      aria-label={`${RANKING_STAT_LABELS[stat]} de ${player.displayName}`}
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

              <Card className="space-y-2">
                <p className="text-xs leading-relaxed text-muted">
                  L'enregistrement valide tous les matchs et clôture la
                  session : distinctions, récompenses UNO, montées et descentes
                  de division en découlent. Il ne peut être fait qu'une fois.
                </p>
                <Button
                  variant="accent"
                  fullWidth
                  loading={record.isPending}
                  onClick={() => void submit()}
                >
                  Enregistrer et clôturer la session
                </Button>
              </Card>
            </>
          )
        }
      </Async>
    </div>
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
  return (
    <input
      type="number"
      min={0}
      max={99}
      inputMode="numeric"
      aria-label={`Score de ${label}`}
      value={value}
      onChange={(event) =>
        onChange(Math.max(0, Math.min(99, Number(event.target.value) || 0)))
      }
      className="w-16 rounded-xl border border-border/60 bg-surface-raised px-2 py-2 text-center text-lg font-bold tabular-nums outline-none focus:border-accent"
    />
  );
}
