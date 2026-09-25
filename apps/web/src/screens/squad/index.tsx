import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRightLeft,
  ChevronRight,
  Coins,
  Flame,
  HandCoins,
  Plus,
  Settings,
  Shield,
  Swords,
} from "lucide-react";
import {
  LINEUP_TEAM_SIZE,
  formationFor,
  resolveLineup,
  type LineupPick,
  type PublicPlayer,
  type SquadDetailView,
  type SquadMemberView,
  type SquadView,
} from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { cn } from "@/lib/cn.js";
import { useT } from "@/lib/i18n.js";
import { useNomDePlace } from "@/lib/pitch.js";
import { imageSrc } from "@/lib/images.js";
import { initials } from "@/lib/format.js";
import { tapFeedback } from "@/lib/native.js";
import { Screen } from "@/components/layout/index.js";
import { SquadChat } from "@/components/squad/chat.js";
import { MySquadOffers } from "@/components/squad/my-offers.js";
import { ClubCrest } from "@/components/squad/crest.js";
import { TournamentCard } from "@/screens/tournaments/index.js";
import { Async } from "@/components/ui/async.js";
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
  const navigate = useNavigate();
  const mine = trpc.squads.mine.useQuery();
  const squadId = mine.data?.squad?.id;

  return (
    <Screen
      title={t("club.title")}
      action={
        squadId !== undefined ? (
          <button
            type="button"
            aria-label={t("club.manage")}
            onClick={() => {
              void tapFeedback();
              navigate(`/squad/${squadId}/gerer`);
            }}
            className="flex size-11 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground active:opacity-70"
          >
            <Settings className="size-5" aria-hidden />
          </button>
        ) : undefined
      }
    >
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
 * Le cinq type, sur un terrain (CLUB-001, CLUB-002).
 *
 * La liste complète occupait tout l'écran : cinq cartes pleine largeur, et
 * tout le reste du club — la caisse, les défis, les tournois — repoussé sous
 * la ligne de flottaison. Or on ne vient pas sur cette page pour lire son
 * effectif par cœur ; on vient voir où en est son club.
 *
 * Un terrain dit l'équipe mieux qu'une liste : chacun à son poste, le
 * capitaine marqué. Des pastilles plutôt que des cartes : cinq cartes FUT
 * sur un téléphone ne tiennent qu'en timbres-poste, et la carte complète
 * s'ouvre d'une pression sur le joueur.
 */
function RosterSummary({
  squad,
  onOpen,
}: {
  squad: SquadDetailView;
  onOpen: (player: PublicPlayer) => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  /*
   * La composition choisie par le club l'emporte ici aussi (CLUB-002) : le
   * sommaire et le terrain doivent raconter la même équipe, sans quoi on
   * découvre en ouvrant l'effectif que les titulaires ont changé.
   */
  const stored = trpc.squads.lineup.useQuery({ squadId: squad.id });
  const formation = stored.data?.formation;
  const lineup = resolveLineup(
    squad.members.map((member) => member.player),
    stored.data?.assignments ?? [],
    formation,
  );
  const bySlot = new Map(lineup.map((pick) => [pick.slot, pick]));
  // Du haut vers le bas : la pointe d'abord, le but en dernier.
  const rows = formationFor(LINEUP_TEAM_SIZE, formation);
  const captains = new Set(
    squad.members
      .filter((member) => member.role === "captain")
      .map((member) => member.player.id),
  );

  const averageRating =
    squad.members.length === 0
      ? 0
      : Math.round(
          squad.members.reduce((total, m) => total + m.player.rating, 0) /
            squad.members.length,
        );

  function openRoster() {
    void tapFeedback();
    navigate(`/squad/${squad.id}/effectif`);
  }

  return (
    <section>
      <SectionTitle
        action={
          <button
            type="button"
            onClick={openRoster}
            className="text-[13px] font-semibold text-accent"
          >
            {t("club.seeWholeSquad")}
          </button>
        }
      >
        {t("club.bestFive")}
      </SectionTitle>

      <div className="relative overflow-hidden rounded-[20px] border border-success/25 bg-[repeating-linear-gradient(180deg,#123a22_0px,#123a22_33px,#0f331e_33px,#0f331e_66px)] px-2 pb-4 pt-6">
        <MiniPitchLines />
        {averageRating > 0 && (
          <span className="absolute left-3 top-3 rounded-md bg-background/60 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-flood">
            {t("club.averageRating")}{" "}
            <span className="font-display text-[13px] text-foreground">
              {averageRating}
            </span>
          </span>
        )}

        <div className="relative flex flex-col gap-3">
          {rows.map((row) => (
            <div
              key={row.map((slot) => slot.id).join("-")}
              className={cn(
                "flex justify-center",
                row.length >= 3 ? "gap-2" : "gap-16",
              )}
            >
              {row.map((slot) => {
                const pick = bySlot.get(slot.id);
                return pick ? (
                  <PitchToken
                    key={slot.id}
                    pick={pick}
                    formation={formation}
                    captain={
                      pick.player !== null && captains.has(pick.player.id)
                    }
                    onOpen={onOpen}
                  />
                ) : null;
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Les tracés du terrain miniature : surfaces et rond central, sans plus. */
function MiniPitchLines() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div className="absolute inset-3 rounded-[4px] border-[1.5px] border-white/25" />
      <div className="absolute left-1/2 top-3 h-10 w-24 -translate-x-1/2 rounded-b-full border-x-[1.5px] border-b-[1.5px] border-white/25" />
      <div className="absolute bottom-3 left-1/2 h-14 w-32 -translate-x-1/2 rounded-t-full border-x-[1.5px] border-t-[1.5px] border-white/25" />
    </div>
  );
}

/**
 * Un joueur à son poste : sa photo (ou ses initiales), son nom, sa place.
 *
 * L'anneau dit la ligne — orange à la pointe, vert au but, clair ailleurs —
 * comme sur les feuilles de match qu'on dessine au tableau.
 */
function PitchToken({
  pick,
  formation,
  captain,
  onOpen,
}: {
  pick: LineupPick<PublicPlayer>;
  formation?: string | null;
  captain: boolean;
  onOpen: (player: PublicPlayer) => void;
}) {
  const t = useT();
  const nomDePlace = useNomDePlace();
  const place = nomDePlace(LINEUP_TEAM_SIZE, pick.slot, formation);
  const player = pick.player;
  const ring =
    pick.role === "ATT"
      ? "border-accent"
      : pick.role === "GB"
        ? "border-success"
        : "border-flood";
  const placeTone = pick.role === "ATT" ? "text-orange-300" : "text-flood";

  if (!player) {
    return (
      <div className="flex w-[76px] flex-col items-center gap-1">
        <span className="flex size-12 items-center justify-center rounded-full border-2 border-dashed border-white/30" />
        <span className="text-[11px] text-white/50">{t("club.nobodyYet")}</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/40">
          {place}
        </span>
      </div>
    );
  }

  const photo = imageSrc(player.profilePhotoUrl);
  const surname = player.displayName.trim().split(/\s+/).slice(-1)[0];

  return (
    <button
      type="button"
      onClick={() => {
        void tapFeedback();
        onOpen(player);
      }}
      aria-label={t("a11y.seeCardOf", { name: player.displayName })}
      className="flex w-[76px] flex-col items-center gap-1 transition-transform active:scale-95"
    >
      <span
        className={cn(
          "relative flex size-12 items-center justify-center rounded-full border-2 bg-[#0b1122] font-display text-[17px] font-extrabold",
          ring,
        )}
      >
        {photo ? (
          <img
            src={photo}
            alt=""
            className="size-full rounded-full object-cover"
            loading="lazy"
          />
        ) : (
          <span aria-hidden>{initials(player.displayName)}</span>
        )}
        {captain && (
          <span
            aria-hidden
            className="absolute -right-1.5 -top-1.5 flex size-[18px] items-center justify-center rounded-full bg-accent font-display text-[11px] font-extrabold not-italic text-background"
          >
            C
          </span>
        )}
      </span>
      <span className="max-w-full truncate text-[12px] font-bold [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]">
        {surname}
      </span>
      <span
        className={cn(
          "text-[10px] font-bold uppercase tracking-[0.12em]",
          placeTone,
        )}
      >
        {place}
      </span>
    </button>
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
          <div className="space-y-3">
            <SquadHeader squad={squad} eyebrow={t("club.myClub")} />
            <SquadActions squad={squad} />
          </div>

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

          <RosterSummary squad={squad} onOpen={setZoomed} />

          <SquadChat
            thread={{ scope: "squad", squadId: squad.id }}
            title={t("club.chat")}
            emptyLabel={t("club.chatEmpty")}
          />

          {zoomed && (
            <PlayerCardDialog player={zoomed} onClose={() => setZoomed(null)} />
          )}
        </div>
      )}
    </Async>
  );
}

/**
 * Ce qu'un club fait : défier et recruter. S'administrer passe par la roue
 * dentée de l'en-tête — on y va rarement, elle n'a pas à prendre la place.
 *
 * En tête de page, juste sous le bandeau : c'est pour cela qu'on ouvre
 * l'onglet, et le chat ou la caisse ne doivent pas le repousser en bas.
 * Le libellé suit le rôle — seuls le fondateur et les capitaines lancent un
 * défi ; les autres membres y suivent ceux de leur club.
 */
function SquadActions({ squad }: { squad: SquadDetailView }) {
  const t = useT();
  const navigate = useNavigate();
  const leads =
    squad.viewer.role === "founder" || squad.viewer.role === "captain";

  function go(path: string) {
    void tapFeedback();
    navigate(path);
  }

  return (
    <div className="flex gap-2">
      <Button
        variant="accent"
        className="flex-1 whitespace-nowrap px-3"
        onClick={() => go(`/squad/${squad.id}/defis`)}
      >
        <Swords className="size-[18px]" aria-hidden />
        {leads ? t("club.startChallenge") : t("club.challenges")}
      </Button>
      <Button
        variant="secondary"
        className="px-3.5"
        onClick={() => go(`/squad/${squad.id}/transferts`)}
        aria-label={t("club.transfers")}
      >
        <ArrowRightLeft className="size-[18px]" aria-hidden />
        <span className="max-[359px]:hidden">{t("club.transfers")}</span>
      </Button>
    </div>
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
    <Card className="space-y-3 border-accent/30">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
            {t("club.treasury")}
          </p>
          <p className="mt-1 font-display text-[30px] font-extrabold italic leading-none tabular-nums text-orange-400">
            {treasury.available}
            <span className="ml-1 text-[15px] not-italic">UNO</span>
          </p>
          <p className="mt-1 text-[12px] text-muted">{t("club.available")}</p>
        </div>
        {treasury.locked > 0 && (
          <div className="text-right">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
              {t("club.committed")}
            </p>
            <p className="mt-1 font-display text-[20px] font-extrabold italic leading-none tabular-nums">
              {treasury.locked}
              <span className="ml-1 text-[12px] not-italic">UNO</span>
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

/**
 * Bandeau d'identité d'un club : écusson, nom, cote, bilan.
 *
 * Le stade de nuit en petit : un projecteur en haut, le rond central
 * dessous. Quand le club a une photo de couverture, elle passe derrière,
 * voilée — on ne maîtrise pas l'image qu'un fondateur choisira, et un nom
 * blanc sur une photo claire deviendrait illisible.
 */
export function SquadHeader({
  squad,
  eyebrow,
}: {
  squad: SquadView;
  /** La mention en tête du bandeau : « Mon club » sur le sien. */
  eyebrow?: string;
}) {
  const t = useT();
  const cover = imageSrc(squad.coverUrl);

  return (
    <section className="relative overflow-hidden rounded-[22px] border border-electric/25 bg-[linear-gradient(170deg,#1a2b57_0%,#0b1122_70%,#05070d_100%)]">
      {cover && (
        <>
          <img
            src={cover}
            alt=""
            className="absolute inset-0 size-full object-cover opacity-50"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/75 to-background/95" />
        </>
      )}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-44 left-1/2 h-[420px] w-[470px] -translate-x-1/2"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, rgb(186 210 255 / 0.2) 0%, transparent 65%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-[46px] border-t-[1.5px] border-flood/10"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-34px] left-1/2 size-40 -translate-x-1/2 rounded-full border-[1.5px] border-flood/10"
      />

      <div className="relative p-4">
        <div className="flex min-h-[18px] items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
            {eyebrow ?? t("club.title")}
          </span>
          {squad.streak >= 2 && (
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-orange-300">
              <Flame className="size-3.5 text-accent" aria-hidden />
              {squad.streak} {t("club.winStreak")}
            </span>
          )}
        </div>

        <div className="mt-4 flex items-center gap-4">
          <ClubCrest name={squad.name} url={squad.avatarUrl} size={72} />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[34px] font-extrabold uppercase italic leading-[0.95] [overflow-wrap:anywhere]">
              {squad.name}
            </h2>
            <p className="mt-1.5 text-[13px] text-slate-300">
              {squad.memberCount}{" "}
              {squad.memberCount > 1 ? t("club.players") : t("club.onePlayer")}
              {squad.winRate !== null &&
                ` · ${t("club.winRate")} ${squad.winRate} %`}
            </p>
          </div>
        </div>

        {squad.description && (
          <p className="mt-3 text-[13px] leading-relaxed text-slate-300/90">
            {squad.description}
          </p>
        )}

        <dl className="mt-4 grid grid-cols-4 rounded-2xl border border-flood/10 bg-background/75 backdrop-blur-sm">
          <Stat label={t("club.ratingShort")} value={squad.rating} highlight />
          <Stat label={t("club.wins")} value={squad.wins} />
          <Stat label={t("club.draws")} value={squad.draws} />
          <Stat label={t("club.losses")} value={squad.losses} last />
        </dl>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  highlight = false,
  last = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse items-center py-2.5 text-center",
        !last && "border-r border-flood/10",
      )}
    >
      <dt className="mt-1 max-w-full truncate px-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
        {label}
      </dt>
      <dd
        className={cn(
          "font-display text-[26px] font-extrabold italic leading-none tabular-nums",
          highlight && "text-orange-400",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
