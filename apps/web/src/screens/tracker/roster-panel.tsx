import { useMemo, useState } from "react";
import { Link2, Search, Shuffle, Trash2, UserPlus, Users } from "lucide-react";
import type { PublicPlayer, TrackerSheet } from "@uno/shared";
import { cn } from "@/lib/cn.js";
import { trpc, describeError } from "@/lib/trpc.js";
import { Button, Input, Select } from "@/components/ui/index.js";

/**
 * Composition de la feuille (TRACK-001).
 *
 * « À chaque session, les joueurs changent » : c'est la contrainte qui a
 * dessiné ce panneau. Trois gestes couvrent tous les cas réels :
 *
 *  - **reprendre** la composition de la séance précédente, parce que d'une
 *    semaine à l'autre la moitié des joueurs revient ;
 *  - **chercher et toucher** un nom pour l'ajouter, sans quitter le clavier ;
 *  - **rééquilibrer** d'un bouton, qui redistribue les joueurs présents en
 *    équipes de niveau comparable.
 *
 * Un joueur se déplace d'une équipe à l'autre à tout moment, y compris entre
 * deux matchs déjà saisis : c'est ce qui se passe réellement sur le terrain.
 */

export function RosterPanel({
  sheet,
  onChanged,
}: {
  sheet: TrackerSheet;
  onChanged: (next: TrackerSheet) => void;
}) {
  const directory = trpc.tracker.players.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
  const rosters = trpc.tracker.recentRosters.useQuery({ limit: 10 });

  const addParticipant = trpc.tracker.addParticipant.useMutation();
  const moveParticipant = trpc.tracker.moveParticipant.useMutation();
  const removeParticipant = trpc.tracker.removeParticipant.useMutation();
  const linkParticipant = trpc.tracker.linkParticipant.useMutation();
  const draft = trpc.tracker.draft.useMutation();
  const copyRoster = trpc.tracker.copyRoster.useMutation();

  const [query, setQuery] = useState("");
  const [targetTeamId, setTargetTeamId] = useState<number>(
    sheet.teams[0]?.id ?? 0,
  );
  const [guestName, setGuestName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState<number | null>(null);

  const locked = sheet.events.length > 0;
  const takenPlayerIds = useMemo(
    () =>
      new Set(
        sheet.participants
          .map((participant) => participant.playerId)
          .filter((id): id is number => id !== null),
      ),
    [sheet.participants],
  );

  const matching = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const pool = (directory.data ?? []).filter(
      (player) => !takenPlayerIds.has(player.id),
    );
    if (needle.length === 0) return pool.slice(0, 8);
    return pool
      .filter((player) => player.displayName.toLowerCase().includes(needle))
      .slice(0, 12);
  }, [directory.data, query, takenPlayerIds]);

  async function run(action: () => Promise<TrackerSheet>): Promise<void> {
    setError(null);
    try {
      onChanged(await action());
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-error/40 bg-error/10 px-3 py-2 text-xs text-red-200"
        >
          {error}
        </p>
      )}

      {/* --- Reprendre une composition ------------------------------------ */}
      {sheet.participants.length === 0 && (rosters.data?.length ?? 0) > 0 && (
        <div className="space-y-2 rounded-card border border-border/60 bg-surface p-3">
          <p className="text-xs font-medium text-muted">
            Reprendre la composition d'une séance précédente
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(rosters.data ?? [])
              .filter((session) => session.id !== sheet.session.id)
              .slice(0, 4)
              .map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() =>
                    void run(() =>
                      copyRoster.mutateAsync({
                        sessionId: sheet.session.id,
                        fromSessionId: session.id,
                      }),
                    )
                  }
                  className="rounded-lg border border-border bg-surface-raised px-2.5 py-1.5 text-[11px] hover:border-accent/50"
                >
                  {session.label}
                  <span className="ml-1 text-muted">
                    · {session.participantCount} joueurs
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* --- Équipes ------------------------------------------------------- */}
      <div className="space-y-3">
        {sheet.teams.map((team) => {
          const squad = sheet.participants.filter(
            (participant) => participant.teamId === team.id,
          );
          return (
            <div key={team.id} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: team.color }}
                />
                <h3 className="text-xs font-semibold uppercase tracking-wide">
                  {team.name}
                </h3>
                <span className="text-[11px] text-muted">{squad.length}</span>
              </div>

              {squad.map((participant) => (
                <div
                  key={participant.id}
                  className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-surface px-2.5 py-1.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px]">
                      {participant.displayName}
                    </span>
                    <span className="block text-[10px] text-muted">
                      {participant.player
                        ? `${participant.player.division} · niveau ${participant.player.level}`
                        : "Invité — à rattacher avant publication"}
                    </span>
                  </span>

                  {participant.playerId === null && (
                    <button
                      type="button"
                      aria-label={`Rattacher ${participant.displayName} à un compte`}
                      onClick={() =>
                        setLinking(linking === participant.id ? null : participant.id)
                      }
                      className="flex size-8 items-center justify-center rounded-lg text-accent hover:bg-surface-raised"
                    >
                      <Link2 className="size-3.5" aria-hidden />
                    </button>
                  )}

                  <Select
                    aria-label={`Équipe de ${participant.displayName}`}
                    value={participant.teamId}
                    onChange={(event) =>
                      void run(() =>
                        moveParticipant.mutateAsync({
                          participantId: participant.id,
                          teamId: Number(event.target.value),
                        }),
                      )
                    }
                    className="min-h-[32px] w-auto px-2 py-1 text-[11px]"
                  >
                    {sheet.teams.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </Select>

                  <button
                    type="button"
                    aria-label={`Retirer ${participant.displayName}`}
                    onClick={() =>
                      void run(() =>
                        removeParticipant.mutateAsync({
                          participantId: participant.id,
                        }),
                      )
                    }
                    className="flex size-8 items-center justify-center rounded-lg text-muted hover:text-red-300"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </div>
              ))}

              {linking !== null &&
                squad.some((participant) => participant.id === linking) && (
                  <GuestLinker
                    players={(directory.data ?? []).filter(
                      (player) => !takenPlayerIds.has(player.id),
                    )}
                    onPick={(playerId) => {
                      const participantId = linking;
                      setLinking(null);
                      void run(() =>
                        linkParticipant.mutateAsync({ participantId, playerId }),
                      );
                    }}
                  />
                )}
            </div>
          );
        })}
      </div>

      {/* --- Ajouter ------------------------------------------------------- */}
      <div className="space-y-2 rounded-card border border-border/60 bg-surface p-3">
        <div className="flex items-center gap-2">
          <UserPlus className="size-4 text-accent" aria-hidden />
          <p className="text-xs font-medium">Ajouter un joueur</p>
        </div>

        <Select
          aria-label="Équipe d'accueil"
          value={targetTeamId}
          onChange={(event) => setTargetTeamId(Number(event.target.value))}
          className="min-h-[40px] py-2 text-sm"
        >
          {sheet.teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </Select>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Chercher un joueur"
            aria-label="Chercher un joueur"
            className="min-h-[40px] py-2 pl-9 text-sm"
          />
        </div>

        <div className="space-y-1">
          {matching.map((player) => (
            <button
              key={player.id}
              type="button"
              onClick={() => {
                setQuery("");
                void run(() =>
                  addParticipant.mutateAsync({
                    sessionId: sheet.session.id,
                    teamId: targetTeamId,
                    playerId: player.id,
                  }),
                );
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-surface-raised"
            >
              <span className="min-w-0 flex-1 truncate">{player.displayName}</span>
              <span className="text-[10px] text-muted">
                {player.division} · {player.position}
              </span>
            </button>
          ))}
          {matching.length === 0 && query.length > 0 && (
            <p className="px-2 py-1.5 text-[11px] text-muted">
              Aucun joueur inscrit ne correspond. Ajoutez-le comme invité.
            </p>
          )}
        </div>

        <div className="flex gap-1.5">
          <Input
            value={guestName}
            onChange={(event) => setGuestName(event.target.value)}
            placeholder="Nom d'un invité"
            aria-label="Nom d'un invité"
            className="min-h-[40px] py-2 text-sm"
          />
          <Button
            variant="secondary"
            disabled={guestName.trim().length === 0}
            onClick={() => {
              const name = guestName.trim();
              setGuestName("");
              void run(() =>
                addParticipant.mutateAsync({
                  sessionId: sheet.session.id,
                  teamId: targetTeamId,
                  guestName: name,
                }),
              );
            }}
            className="min-h-[40px] shrink-0 px-3 py-2 text-sm"
          >
            Invité
          </Button>
        </div>
      </div>

      {/* --- Rééquilibrer -------------------------------------------------- */}
      <Button
        variant="secondary"
        fullWidth
        icon={<Shuffle className="size-4" aria-hidden />}
        disabled={locked || sheet.participants.length < 2}
        title={
          locked
            ? "Des actions ont déjà été saisies : les équipes ne peuvent plus être retirées."
            : undefined
        }
        onClick={() =>
          void run(() =>
            draft.mutateAsync({
              sessionId: sheet.session.id,
              playerIds: sheet.participants
                .map((participant) => participant.playerId)
                .filter((id): id is number => id !== null),
            }),
          )
        }
      >
        Rééquilibrer les équipes
      </Button>

      {locked && (
        <p className="flex items-start gap-1.5 text-[11px] text-muted">
          <Users className="mt-0.5 size-3 shrink-0" aria-hidden />
          Des actions sont saisies : les joueurs se déplacent encore d'une équipe
          à l'autre, mais un tirage complet effacerait la feuille.
        </p>
      )}
    </div>
  );
}

function GuestLinker({
  players,
  onPick,
}: {
  players: PublicPlayer[];
  onPick: (playerId: number) => void;
}) {
  const [query, setQuery] = useState("");
  const matching = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return players.slice(0, 6);
    return players
      .filter((player) => player.displayName.toLowerCase().includes(needle))
      .slice(0, 10);
  }, [players, query]);

  return (
    <div className={cn("space-y-1 rounded-xl border border-accent/40 bg-surface p-2")}>
      <Input
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Rattacher à quel compte ?"
        aria-label="Rattacher l'invité à un compte"
        className="min-h-[36px] py-1.5 text-sm"
      />
      {matching.map((player) => (
        <button
          key={player.id}
          type="button"
          onClick={() => onPick(player.id)}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-surface-raised"
        >
          <span className="min-w-0 flex-1 truncate">{player.displayName}</span>
          <span className="text-[10px] text-muted">{player.division}</span>
        </button>
      ))}
    </div>
  );
}
