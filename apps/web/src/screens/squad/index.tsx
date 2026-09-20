import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRightLeft,
  ChevronRight,
  Coins,
  HandCoins,
  Plus,
  Shield,
  Swords,
  Trophy,
  Users,
} from "lucide-react";
import {
  SQUAD_ROLE_LABELS,
  resolveLineup,
  type PublicPlayer,
  type SquadDetailView,
  type SquadMemberView,
  type SquadView,
} from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { cn } from "@/lib/cn.js";
import { useLibelles, useT } from "@/lib/i18n.js";
import { imageSrc } from "@/lib/images.js";
import { tapFeedback } from "@/lib/native.js";
import { Screen } from "@/components/layout/index.js";
import { SquadChat } from "@/components/squad/chat.js";
import { MySquadOffers } from "@/components/squad/my-offers.js";
import { TournamentCard } from "@/screens/tournaments/index.js";
import { Async } from "@/components/ui/async.js";
import { Avatar } from "@/components/domain/index.js";
import { FutCard } from "@/components/fut-card/fut-card.js";
import { PlayerChip } from "@/components/fut-card/player-chip.js";
import { PlayerCardDialog } from "@/components/fut-card/player-card-dialog.js";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  SectionTitle,
  Select,
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
  const t = useT();
  const mine = trpc.squads.mine.useQuery();

  return (
    <Screen title={t("club.title")}>
      <Async query={mine}>
        {(data) =>
          data.squad ? <MySquad squadId={data.squad.id} /> : <NoSquad />
        }
      </Async>
    </Screen>
  );
}

/**
 * Les tournois, dans l'onglet Club (TOUR-004, TOUR-006).
 *
 * Ils vivent ici plutôt que dans le calendrier des joueurs : un tournoi n'est
 * pas une séance à laquelle on s'inscrit joueur par joueur, c'est un
 * engagement de club. C'est donc là où l'on gère son club qu'on le voit
 * passer — et là où l'annoncer a une chance d'être lu par qui peut décider.
 *
 * Un aperçu, et rien de plus : les deux propositions les plus proches, puis un
 * lien vers le calendrier. Le tout — les mois suivants, le filtre par format,
 * le palmarès, la pose d'une date — est là-bas, où il ne pousse pas le reste
 * du club sous la ligne de flottaison.
 *
 * Le lien est montré même quand il n'y a rien à apercevoir. C'est la seule
 * porte vers le calendrier des tournois : la cacher faute de propositions
 * aurait empêché de poser la première.
 */
function Tournaments() {
  const t = useT();
  const navigate = useNavigate();
  const list = trpc.tournaments.list.useQuery({ mineOnly: false });

  // Les plus proches d'abord : ce qui se décide cette semaine passe devant ce
  // qui se décidera le mois prochain. Le serveur, lui, rend les tournois du
  // plus récent au plus ancien — c'est l'ordre du palmarès, pas celui d'un
  // aperçu.
  const live = (list.data ?? [])
    .filter((row) => row.status === "open" || row.status === "drawn")
    .sort((a, b) => a.startsAtUtc.localeCompare(b.startsAtUtc));

  function openCalendar() {
    void tapFeedback();
    navigate("/tournois");
  }

  return (
    <section>
      <SectionTitle
        action={
          <button
            type="button"
            onClick={openCalendar}
            className="text-xs font-medium text-accent"
          >
            {t("club.seeAllTournaments")}
          </button>
        }
      >
        {t("club.tournaments")}
      </SectionTitle>

      {live.length === 0 ? (
        <button
          type="button"
          onClick={openCalendar}
          className="w-full rounded-card border border-dashed border-border/70 px-4 py-5 text-center transition-colors hover:border-border active:opacity-80"
        >
          <p className="text-sm font-medium">{t("club.noProposal")}</p>
          <p className="mt-1 text-xs text-muted">{t("club.noProposalBody")}</p>
        </button>
      ) : (
        <>
          <div className="space-y-2">
            {live.slice(0, 2).map((tournament) => (
              <TournamentCard key={tournament.id} tournament={tournament} />
            ))}
          </div>
          {live.length > 2 && (
            <button
              type="button"
              onClick={openCalendar}
              className="mt-2 w-full text-center text-xs font-medium text-accent"
            >
              {live.length - 2 > 1
                ? t("club.moreProposals", { count: live.length - 2 })
                : t("club.oneMoreProposal")}
            </button>
          )}
        </>
      )}
    </section>
  );
}

/**
 * L'effectif en une carte (CLUB-001).
 *
 * La liste complète occupait tout l'écran : cinq cartes pleine largeur, et
 * tout le reste du club — la caisse, les défis, les tournois — repoussé sous
 * la ligne de flottaison. Or on ne vient pas sur cette page pour lire son
 * effectif par cœur ; on vient voir où en est son club.
 *
 * Le sommaire garde ce qui se lit d'un coup d'œil — l'effectif, la note
 * moyenne, les quatre têtes d'affiche — et renvoie au détail ceux qui le
 * cherchent.
 */
function RosterSummary({ squad }: { squad: SquadDetailView }) {
  const t = useT();
  const L = useLibelles();
  const navigate = useNavigate();
  /*
   * Le sommaire montre **quatre** têtes d'affiche, là où le terrain en aligne
   * cinq : une par statistique. La seconde aile partage son titre avec la
   * première — « deuxième passeur du club » n'ajoute rien à un résumé — et
   * cinq vignettes débordaient de la carte sur un téléphone étroit, les cartes
   * ayant une largeur fixe.
   */
  /*
   * La composition choisie par le club l'emporte ici aussi (CLUB-002) : le
   * sommaire et le terrain doivent raconter la même équipe, sans quoi on
   * découvre en ouvrant l'effectif que les têtes d'affiche ont changé.
   */
  const stored = trpc.squads.lineup.useQuery({ squadId: squad.id });
  const lineup = resolveLineup(
    squad.members.map((member) => member.player),
    stored.data ?? [],
  );
  const featured = lineup.filter(
    (pick) => pick.player !== null && pick.slot !== "AILE_D",
  );

  const averageRating =
    squad.members.length === 0
      ? 0
      : Math.round(
          squad.members.reduce((total, m) => total + m.player.rating, 0) /
            squad.members.length,
        );

  return (
    <section>
      <SectionTitle>{t("club.squadTitle")}</SectionTitle>
      <Card
        className="cursor-pointer space-y-3 transition-transform active:scale-[0.99]"
        role="button"
        tabIndex={0}
        onClick={() => {
          void tapFeedback();
          navigate(`/squad/${squad.id}/effectif`);
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold tabular-nums">
              {squad.memberCount}
            </span>
            <span className="text-xs text-muted">
              {squad.memberCount > 1 ? t("club.players") : t("club.onePlayer")}
            </span>
          </div>
          {averageRating > 0 && (
            <div className="text-right">
              <p className="text-[10px] uppercase text-muted">
                {t("club.averageRating")}
              </p>
              <p className="text-sm font-semibold text-accent tabular-nums">
                {averageRating}
              </p>
            </div>
          )}
        </div>

        {/* Les têtes d'affiche, en vignettes : c'est le résumé le plus court
            d'un effectif, et il donne envie d'ouvrir le terrain. */}
        {featured.length > 0 && (
          <div className="flex items-center gap-2 border-t border-border/40 pt-3">
            {featured.map((pick) => (
              <div
                key={pick.slot}
                className="flex min-w-0 flex-1 flex-col items-center gap-0.5"
              >
                <FutCard player={pick.player!} size="xs" animated={false} />
                <span className="text-[9px] uppercase tracking-wide text-muted">
                  {L.lineupSlot[pick.slot]}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-center gap-1 text-xs font-medium text-accent">
          {t("club.seeWholeSquad")}
          <ChevronRight className="size-3.5" aria-hidden />
        </div>
      </Card>
    </section>
  );
}

/** Tableau de bord d'un club dont on est membre. */
function MySquad({ squadId }: { squadId: number }) {
  const t = useT();
  const navigate = useNavigate();
  const detail = trpc.squads.detail.useQuery({ squadId });
  // La carte s'ouvre par-dessus l'écran, comme au classement.
  const [zoomed, setZoomed] = useState<PublicPlayer | null>(null);

  return (
    <Async query={detail}>
      {(squad) => (
        <div className="space-y-5">
          <SquadHeader squad={squad} />

          {/* Une offre a un délai : une décision qu'on ne voit pas est une
              décision qu'on ne prend pas. Elle passe donc avant le reste. */}
          <MySquadOffers />

          {squad.treasury && (
            <Treasury
              squadId={squad.id}
              treasury={squad.treasury}
              members={squad.members}
              isFounder={squad.viewer.role === "founder"}
            />
          )}

          {/*
            La section reste affichée même vide, pour qui peut trancher : sans
            repère, on cherche le bouton ailleurs dans l'application, et c'est
            précisément ce qui s'est produit à l'essai.
          */}
          {squad.viewer.role !== null && squad.viewer.role !== "member" && (
            <section>
              <SectionTitle>
                {t("club.joinRequests")}
                {squad.pendingRequests.length > 0
                  ? ` (${squad.pendingRequests.length})`
                  : ""}
              </SectionTitle>
              {squad.pendingRequests.length === 0 ? (
                <Card>
                  <p className="text-center text-xs text-muted">
                    {t("club.noRequest")}
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

          {/*
            Les tournois avant l'effectif : un plateau qui se remplit appelle
            une décision, et une décision ne se prend pas en bas de page.
            L'effectif, lui, ne change pas d'une minute à l'autre.
          */}
          <Tournaments />

          <RosterSummary squad={squad} />

          <SquadChat
            thread={{ scope: "squad", squadId: squad.id }}
            title={t("club.chat")}
            emptyLabel={t("club.chatEmpty")}
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
              {t("club.challenges")}
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
              {t("club.transfers")}
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
              {t("club.manage")}
            </Button>
          </div>

          <Button
            variant="secondary"
            fullWidth
            onClick={() => {
              void tapFeedback();
              navigate("/tournois");
            }}
          >
            <Trophy className="size-4" aria-hidden />
            {t("club.allTournaments")}
          </Button>

          {zoomed && (
            <PlayerCardDialog player={zoomed} onClose={() => setZoomed(null)} />
          )}
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
/**
 * Le fondateur reverse une part de la caisse (CLUB-002).
 *
 * Le bénéficiaire se choisit dans l'effectif, le fondateur compris : celui
 * qui a avancé l'argent d'une salle a le droit d'être remboursé, et l'obliger
 * à passer par un tiers n'aurait protégé personne.
 *
 * Le plafond affiché est le **disponible**, jamais le total : ce qui est
 * engagé dans un défi est promis à quelqu'un d'autre. Le serveur le refuse de
 * toute façon — l'écran le dit avant, plutôt que de laisser essayer.
 */
function Distribute({
  squadId,
  available,
  members,
  onDone,
}: {
  squadId: number;
  available: number;
  members: SquadMemberView[];
  onDone: () => void;
}) {
  const t = useT();
  const utils = trpc.useUtils();
  const distribute = trpc.squads.distribute.useMutation();

  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [amount, setAmount] = useState("");
  const [failure, setFailure] = useState<string | null>(null);

  const value = Number(amount) || 0;
  const playerId = Number(target) || 0;

  async function submit() {
    setFailure(null);
    try {
      await distribute.mutateAsync({ squadId, playerId, amount: value });
      setOpen(false);
      setAmount("");
      setTarget("");
      await utils.squads.detail.invalidate({ squadId });
      await utils.players.me.invalidate();
      await utils.wallet.summary.invalidate();
      onDone();
    } catch (error) {
      setFailure(describeError(error).message);
    }
  }

  if (!open) {
    return (
      <Button
        variant="ghost"
        fullWidth
        className="min-h-[36px] py-1.5 text-xs"
        disabled={available < 1}
        onClick={() => {
          void tapFeedback();
          setOpen(true);
        }}
      >
        <HandCoins className="size-3.5" aria-hidden />
        {t("club.payBack")}
      </Button>
    );
  }

  return (
    <div className="space-y-2 border-t border-border/40 pt-3">
      <Field label={t("club.beneficiary")} htmlFor="distribute-target">
        <Select
          id="distribute-target"
          value={target}
          onChange={(event) => setTarget(event.target.value)}
        >
          <option value="">{t("club.choosePlayer")}</option>
          {members.map((member) => (
            <option key={member.player.id} value={member.player.id}>
              {member.player.displayName}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label={t("club.amountUno")}
        error={failure ?? undefined}
        htmlFor="distribute-amount"
      >
        <Input
          id="distribute-amount"
          type="number"
          min={1}
          max={available}
          inputMode="numeric"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </Field>
      <p className="text-[11px] text-muted">
        {t("club.availableNote", { amount: available })}
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
          {t("common.cancel")}
        </Button>
        <Button
          variant="accent"
          className="flex-1"
          loading={distribute.isPending}
          disabled={playerId < 1 || value < 1 || value > available}
          onClick={() => void submit()}
        >
          {t("club.payBackShort")}
        </Button>
      </div>
    </div>
  );
}

function Treasury({
  squadId,
  treasury,
  members,
  isFounder,
}: {
  squadId: number;
  treasury: { available: number; locked: number; total: number };
  members: SquadMemberView[];
  isFounder: boolean;
}) {
  const t = useT();
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
          <p className="text-xs text-muted">{t("club.treasury")}</p>
          <p className="text-2xl font-black tabular-nums text-accent">
            {treasury.available}
            <span className="ml-1 text-sm font-medium text-muted">UNO</span>
          </p>
        </div>
        {treasury.locked > 0 && (
          <div className="text-right">
            <p className="text-xs text-muted">{t("club.committed")}</p>
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
            {t("club.oneWayNote")}
          </p>
          <Field label={t("club.amount")} htmlFor="contribution">
            <Input
              id="contribution"
              type="number"
              inputMode="numeric"
              min={1}
              max={wallet}
              placeholder={t("club.upTo", { amount: wallet })}
              value={amount}
              onChange={(event) =>
                setAmount(event.target.value.replace(/\D/g, ""))
              }
            />
          </Field>
          <p className="text-[11px] text-muted">
            {t("club.yourWallet", { amount: wallet })}
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
              {t("common.cancel")}
            </Button>
            <Button
              variant="accent"
              className="flex-1"
              loading={contribute.isPending}
              disabled={value < 1 || value > wallet}
              onClick={() => void submit()}
            >
              {t("club.payIn")}
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
          {t("club.topUp")}
        </Button>
      )}

      {/*
        CLUB-002 : la caisse est à sens unique pour les membres — on y verse,
        on n'y puise pas. Cette porte-ci n'est ouverte qu'au fondateur, et
        seulement sur le disponible : les mises engagées restent couvertes.
      */}
      {isFounder && !open && (
        <Distribute
          squadId={squadId}
          available={treasury.available}
          members={members}
          onDone={() => void entries.refetch()}
        />
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
        {history ? t("club.hideEntries") : t("club.showEntries")}
      </button>

      {history && (
        <div className="space-y-1 border-t border-border/40 pt-3">
          {(entries.data ?? []).length === 0 ? (
            <p className="text-center text-xs text-muted">
              {t("club.noEntry")}
            </p>
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
  request: {
    id: number;
    player: { displayName: string };
    message: string | null;
  };
  squadId: number;
}) {
  const t = useT();
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
          {t("club.refuse")}
        </Button>
        <Button
          variant="accent"
          className="flex-1"
          loading={decide.isPending}
          onClick={() => void run(true)}
        >
          {t("club.accept")}
        </Button>
      </div>
    </Card>
  );
}

/** Ce que voit un joueur sans club : fonder, ou rejoindre. */
function NoSquad() {
  const t = useT();
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
          {t("club.whatIsAClub")}
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
        {t("club.found")}
      </Button>

      {(mine.data?.pendingRequests.length ?? 0) > 0 && (
        <section>
          <SectionTitle>{t("club.yourRequests")}</SectionTitle>
          <div className="space-y-2">
            {mine.data?.pendingRequests.map((request) => (
              <SquadRow key={request.squad.id} squad={request.squad} pending />
            ))}
          </div>
        </section>
      )}

      <Tournaments />

      <section>
        <SectionTitle>{t("club.leagueClubs")}</SectionTitle>
        <div className="mb-3">
          <Input
            placeholder={t("club.search")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <Async query={squads}>
          {(list) =>
            list.length === 0 ? (
              <EmptyState
                title={t("club.emptyTitle")}
                description={t("club.beFirst")}
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
  const t = useT();
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
          {squad.memberCount > 1
            ? t("club.members", { count: squad.memberCount })
            : t("club.oneMember", { count: squad.memberCount })}
          {squad.matchesPlayed > 0 &&
            ` · ${t("club.record", {
              wins: squad.wins,
              draws: squad.draws,
              losses: squad.losses,
            })}`}
        </p>
      </div>
      {pending ? (
        <Badge tone="neutral">{t("club.waiting")}</Badge>
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
  const t = useT();
  return (
    <Card className="space-y-3 overflow-hidden bg-gradient-to-br from-primary via-primary/80 to-surface p-0">
      {/*
        Le bandeau, quand le club en a un. Un dégradé sombre le recouvre : une
        photo claire rendrait autrement le nom illisible, et on ne maîtrise
        pas l'image qu'un fondateur choisira.
      */}
      {squad.coverUrl && (
        <div className="relative -mb-3 h-28 w-full">
          <img
            src={imageSrc(squad.coverUrl)}
            alt=""
            className="size-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-primary/90 to-transparent" />
        </div>
      )}

      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <Avatar name={squad.name} url={squad.avatarUrl} size="md" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold">{squad.name}</h2>
            {squad.description && (
              <p className="mt-1 text-xs leading-relaxed text-blue-100/80">
                {squad.description}
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-2xl font-black tabular-nums">{squad.rating}</p>
            <p className="text-[10px] font-medium uppercase text-blue-200/80">
              {t("club.ratingShort")}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 border-t border-white/10 pt-3 text-center">
          <Stat label={t("club.matches")} value={String(squad.matchesPlayed)} />
          <Stat label={t("club.wins")} value={String(squad.wins)} />
          <Stat
            label={t("club.winRate")}
            value={squad.winRate === null ? "—" : `${squad.winRate} %`}
          />
          <Stat
            label={t("club.streak")}
            value={
              squad.streak === 0
                ? "—"
                : `${squad.streak > 0 ? "+" : ""}${squad.streak}`
            }
            tone={squad.streak > 0 ? "up" : squad.streak < 0 ? "down" : "flat"}
          />
        </div>
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
