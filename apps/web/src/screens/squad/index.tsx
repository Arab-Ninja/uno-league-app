import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Shield, Users } from "lucide-react";
import { SQUAD_ROLE_LABELS, type SquadView } from "@uno/shared";
import { trpc } from "@/lib/trpc.js";
import { cn } from "@/lib/cn.js";
import { tapFeedback } from "@/lib/native.js";
import { Screen } from "@/components/layout/index.js";
import { Async } from "@/components/ui/async.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  SectionTitle,
} from "@/components/ui/index.js";

/**
 * Accueil du mode SQUAD (SQUAD-001).
 *
 * Deux situations, deux écrans : celui qui a un club y arrive directement,
 * celui qui n'en a pas voit l'annuaire et de quoi en fonder un. Un seul
 * écran qui basculerait entre les deux aurait obligé chacun à traverser ce
 * qui ne le concerne pas.
 */
export function SquadHomeScreen() {
  const mine = trpc.squads.mine.useQuery();

  return (
    <Screen title="SQUAD">
      <Async query={mine}>
        {(data) => (data.squad ? <MySquad squadId={data.squad.id} /> : <NoSquad />)}
      </Async>
    </Screen>
  );
}

/** Tableau de bord d'un club dont on est membre. */
function MySquad({ squadId }: { squadId: number }) {
  const navigate = useNavigate();
  const detail = trpc.squads.detail.useQuery({ squadId });

  return (
    <Async query={detail}>
      {(squad) => (
        <div className="space-y-5">
          <SquadHeader squad={squad} />

          {squad.treasury && (
            <Card className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted">Trésorerie</p>
                <p className="text-2xl font-black tabular-nums text-accent">
                  {squad.treasury.available}
                  <span className="ml-1 text-sm font-medium text-muted">UNO</span>
                </p>
              </div>
              {squad.treasury.locked > 0 && (
                <div className="text-right">
                  <p className="text-xs text-muted">Engagés</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {squad.treasury.locked} UNO
                  </p>
                </div>
              )}
            </Card>
          )}

          {squad.pendingRequests.length > 0 && (
            <section>
              <SectionTitle>
                Demandes d'adhésion ({squad.pendingRequests.length})
              </SectionTitle>
              <div className="space-y-2">
                {squad.pendingRequests.map((request) => (
                  <JoinRequestRow
                    key={request.id}
                    request={request}
                    squadId={squadId}
                  />
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionTitle>Effectif ({squad.memberCount})</SectionTitle>
            <div className="space-y-2">
              {squad.members.map((member) => (
                <Card key={member.player.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {member.player.displayName}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {member.player.division ?? "Arbitre"} · note{" "}
                      {member.player.rating}
                    </p>
                  </div>
                  {member.role !== "member" && (
                    <Badge tone={member.role === "founder" ? "accent" : "primary"}>
                      {SQUAD_ROLE_LABELS[member.role]}
                    </Badge>
                  )}
                </Card>
              ))}
            </div>
          </section>

          <Button
            variant="secondary"
            fullWidth
            onClick={() => {
              void tapFeedback();
              navigate(`/squad/${squad.id}/gerer`);
            }}
          >
            <Users className="size-4" aria-hidden />
            Gérer le SQUAD
          </Button>
        </div>
      )}
    </Async>
  );
}

/** Une demande en attente, à trancher d'un geste. */
function JoinRequestRow({
  request,
  squadId,
}: {
  request: { id: number; player: { displayName: string }; message: string | null };
  squadId: number;
}) {
  const utils = trpc.useUtils();
  const decide = trpc.squads.decideRequest.useMutation();

  async function run(accept: boolean) {
    void tapFeedback();
    await decide.mutateAsync({ requestId: request.id, accept });
    await utils.squads.detail.invalidate({ squadId });
    await utils.squads.mine.invalidate();
  }

  return (
    <Card className="space-y-2">
      <p className="text-sm font-medium">{request.player.displayName}</p>
      {request.message && (
        <p className="text-xs leading-relaxed text-muted">{request.message}</p>
      )}
      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          loading={decide.isPending}
          onClick={() => void run(false)}
        >
          Refuser
        </Button>
        <Button
          variant="accent"
          className="flex-1"
          loading={decide.isPending}
          onClick={() => void run(true)}
        >
          Accepter
        </Button>
      </div>
    </Card>
  );
}

/** Ce que voit un joueur sans club : fonder, ou rejoindre. */
function NoSquad() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const squads = trpc.squads.list.useQuery({
    limit: 30,
    ...(query.trim().length >= 2 ? { query: query.trim() } : {}),
  });
  const mine = trpc.squads.mine.useQuery();

  return (
    <div className="space-y-5">
      <Card className="flex items-start gap-3">
        <Shield className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
        <p className="text-xs leading-relaxed text-muted">
          Un SQUAD est une équipe permanente : elle garde ses joueurs, sa cote
          et sa trésorerie d'un défi à l'autre. Rejoignez-en un, ou fondez le
          vôtre.
        </p>
      </Card>

      <Button
        variant="accent"
        fullWidth
        onClick={() => {
          void tapFeedback();
          navigate("/squad/nouveau");
        }}
      >
        <Plus className="size-4" aria-hidden />
        Fonder un SQUAD
      </Button>

      {(mine.data?.pendingRequests.length ?? 0) > 0 && (
        <section>
          <SectionTitle>Vos demandes en attente</SectionTitle>
          <div className="space-y-2">
            {mine.data?.pendingRequests.map((request) => (
              <SquadRow key={request.squad.id} squad={request.squad} pending />
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle>Les SQUADs de la ligue</SectionTitle>
        <div className="mb-3">
          <Input
            placeholder="Rechercher un SQUAD"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <Async query={squads}>
          {(list) =>
            list.length === 0 ? (
              <EmptyState
                title="Aucun SQUAD"
                description="Soyez le premier à en fonder un."
                icon={<Shield className="size-6" aria-hidden />}
              />
            ) : (
              <div className="space-y-2">
                {list.map((squad) => (
                  <SquadRow key={squad.id} squad={squad} />
                ))}
              </div>
            )
          }
        </Async>
      </section>
    </div>
  );
}

/** Une ligne d'annuaire : cote, effectif, bilan. */
function SquadRow({ squad, pending }: { squad: SquadView; pending?: boolean }) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => {
        void tapFeedback();
        navigate(`/squad/${squad.slug}`);
      }}
      className="flex w-full items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 text-left transition-colors hover:bg-surface-raised active:opacity-70"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{squad.name}</p>
        <p className="mt-0.5 text-xs text-muted">
          {squad.memberCount} membre{squad.memberCount > 1 ? "s" : ""}
          {squad.matchesPlayed > 0 &&
            ` · ${squad.wins}V ${squad.draws}N ${squad.losses}D`}
        </p>
      </div>
      {pending ? (
        <Badge tone="neutral">En attente</Badge>
      ) : (
        <span className="shrink-0 text-sm font-bold tabular-nums text-accent">
          {squad.rating}
        </span>
      )}
    </button>
  );
}

/** Bandeau d'identité d'un club : nom, cote, bilan. */
export function SquadHeader({ squad }: { squad: SquadView }) {
  return (
    <Card className="space-y-3 bg-gradient-to-br from-primary via-primary/80 to-surface">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold">{squad.name}</h2>
          {squad.description && (
            <p className="mt-1 text-xs leading-relaxed text-blue-100/80">
              {squad.description}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-black tabular-nums">{squad.rating}</p>
          <p className="text-[10px] font-medium uppercase text-blue-200/80">cote</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 border-t border-white/10 pt-3 text-center">
        <Stat label="Matchs" value={String(squad.matchesPlayed)} />
        <Stat label="Victoires" value={String(squad.wins)} />
        <Stat
          label="Réussite"
          value={squad.winRate === null ? "—" : `${squad.winRate} %`}
        />
        <Stat
          label="Série"
          value={squad.streak === 0 ? "—" : `${squad.streak > 0 ? "+" : ""}${squad.streak}`}
          tone={squad.streak > 0 ? "up" : squad.streak < 0 ? "down" : "flat"}
        />
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone = "flat",
}: {
  label: string;
  value: string;
  tone?: "up" | "down" | "flat";
}) {
  return (
    <div>
      <p
        className={cn(
          "text-sm font-bold tabular-nums",
          tone === "up" && "text-success",
          tone === "down" && "text-red-300",
        )}
      >
        {value}
      </p>
      <p className="text-[10px] text-blue-200/70">{label}</p>
    </div>
  );
}
