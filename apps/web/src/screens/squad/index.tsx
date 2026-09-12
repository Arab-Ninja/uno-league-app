import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRightLeft, Coins, Plus, Shield, Swords, Users } from "lucide-react";
import { SQUAD_ROLE_LABELS, type SquadView } from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { cn } from "@/lib/cn.js";
import { tapFeedback } from "@/lib/native.js";
import { Screen } from "@/components/layout/index.js";
import { SquadChat } from "@/components/squad/chat.js";
import { MySquadOffers } from "@/components/squad/my-offers.js";
import { Async } from "@/components/ui/async.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
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

          {/* Une offre a un délai : une décision qu'on ne voit pas est une
              décision qu'on ne prend pas. Elle passe donc avant le reste. */}
          <MySquadOffers />

          {squad.treasury && (
            <Treasury squadId={squad.id} treasury={squad.treasury} />
          )}

          {/*
            La section reste affichée même vide, pour qui peut trancher : sans
            repère, on cherche le bouton ailleurs dans l'application, et c'est
            précisément ce qui s'est produit à l'essai.
          */}
          {squad.viewer.role !== null && squad.viewer.role !== "member" && (
            <section>
              <SectionTitle>
                Demandes d'adhésion
                {squad.pendingRequests.length > 0
                  ? ` (${squad.pendingRequests.length})`
                  : ""}
              </SectionTitle>
              {squad.pendingRequests.length === 0 ? (
                <Card>
                  <p className="text-center text-xs text-muted">
                    Aucune demande en attente. Elles apparaîtront ici, et vous
                    recevrez une notification.
                  </p>
                </Card>
              ) : (
                <div className="space-y-2">
                  {squad.pendingRequests.map((request) => (
                    <JoinRequestRow
                      key={request.id}
                      request={request}
                      squadId={squadId}
                    />
                  ))}
                </div>
              )}
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

          <SquadChat
            thread={{ scope: "squad", squadId: squad.id }}
            title="Chat du SQUAD"
            emptyLabel="Aucun message. Lancez la conversation."
          />

          <div className="flex gap-2">
            <Button
              variant="accent"
              className="flex-1"
              onClick={() => {
                void tapFeedback();
                navigate(`/squad/${squad.id}/defis`);
              }}
            >
              <Swords className="size-4" aria-hidden />
              Défis
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                void tapFeedback();
                navigate(`/squad/${squad.id}/transferts`);
              }}
            >
              <ArrowRightLeft className="size-4" aria-hidden />
              Transferts
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                void tapFeedback();
                navigate(`/squad/${squad.id}/gerer`);
              }}
            >
              <Users className="size-4" aria-hidden />
              Gérer
            </Button>
          </div>
        </div>
      )}
    </Async>
  );
}

/**
 * Caisse du club : ce qu'elle contient, et de quoi l'alimenter (AC03).
 *
 * La contribution est **à sens unique**, et l'écran le dit avant le geste :
 * un membre verse, il ne reprend pas. Sans cette règle, aucune mise de défi
 * ne serait garantie — l'argent promis pourrait disparaître entre
 * l'acceptation et le coup d'envoi.
 */
function Treasury({
  squadId,
  treasury,
}: {
  squadId: number;
  treasury: { available: number; locked: number; total: number };
}) {
  const utils = trpc.useUtils();
  const profile = trpc.players.me.useQuery();
  const contribute = trpc.squads.contribute.useMutation();
  const entries = trpc.squads.treasury.useQuery(
    { squadId, limit: 10 },
    { enabled: false },
  );

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [history, setHistory] = useState(false);

  const wallet = profile.data?.unoPoints ?? 0;
  const value = Number(amount) || 0;

  async function submit() {
    void tapFeedback();
    setFailure(null);
    try {
      await contribute.mutateAsync({ squadId, amount: value });
      await utils.squads.detail.invalidate({ squadId });
      await utils.squads.mine.invalidate();
      await utils.players.me.invalidate();
      await utils.wallet.invalidate();
      setAmount("");
      setOpen(false);
    } catch (caught) {
      setFailure(describeError(caught).message);
    }
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted">Trésorerie</p>
          <p className="text-2xl font-black tabular-nums text-accent">
            {treasury.available}
            <span className="ml-1 text-sm font-medium text-muted">UNO</span>
          </p>
        </div>
        {treasury.locked > 0 && (
          <div className="text-right">
            <p className="text-xs text-muted">Engagés</p>
            <p className="text-sm font-semibold tabular-nums">
              {treasury.locked} UNO
            </p>
          </div>
        )}
      </div>

      {failure && <ErrorBanner message={failure} />}

      {open ? (
        <div className="space-y-2 border-t border-border/40 pt-3">
          <p className="text-xs leading-relaxed text-muted">
            Ce que vous versez appartient au SQUAD : vous ne pourrez pas le
            reprendre. C'est ce qui permet de garantir les mises des défis.
          </p>
          <Field label="Montant" htmlFor="contribution">
            <Input
              id="contribution"
              type="number"
              inputMode="numeric"
              min={1}
              max={wallet}
              placeholder={`Jusqu'à ${wallet} UNO`}
              value={amount}
              onChange={(event) =>
                setAmount(event.target.value.replace(/\D/g, ""))
              }
            />
          </Field>
          <p className="text-[11px] text-muted">
            Votre portefeuille : {wallet} UNO
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setOpen(false);
                setFailure(null);
              }}
            >
              Annuler
            </Button>
            <Button
              variant="accent"
              className="flex-1"
              loading={contribute.isPending}
              disabled={value < 1 || value > wallet}
              onClick={() => void submit()}
            >
              Verser
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="secondary"
          fullWidth
          onClick={() => {
            void tapFeedback();
            setOpen(true);
          }}
        >
          <Coins className="size-4" aria-hidden />
          Alimenter la caisse
        </Button>
      )}

      <button
        type="button"
        onClick={() => {
          void tapFeedback();
          setHistory((current) => !current);
          if (!history) void entries.refetch();
        }}
        className="w-full text-center text-[11px] text-muted underline-offset-2 hover:underline"
      >
        {history ? "Masquer les mouvements" : "Voir les mouvements"}
      </button>

      {history && (
        <div className="space-y-1 border-t border-border/40 pt-3">
          {(entries.data ?? []).length === 0 ? (
            <p className="text-center text-xs text-muted">Aucun mouvement.</p>
          ) : (
            entries.data?.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="min-w-0 flex-1 truncate text-muted">
                  {entry.playerName ?? entry.description}
                </span>
                <span
                  className={cn(
                    "shrink-0 font-semibold tabular-nums",
                    entry.amount >= 0 ? "text-success" : "text-red-300",
                  )}
                >
                  {entry.amount >= 0 ? "+" : ""}
                  {entry.amount}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </Card>
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
