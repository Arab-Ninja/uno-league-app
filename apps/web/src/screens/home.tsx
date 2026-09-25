import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  Coins,
  MapPin,
} from "lucide-react";
import {
  DONATION_CATEGORY,
  HOME_UPCOMING_SESSIONS,
  UNO_PER_EUR,
  getGameMode,
  levelProgress,
  xpToNextLevel,
  type ProposalSummary,
} from "@uno/shared";
import { trpc, describeError } from "@/lib/trpc.js";
import { useLibelles, useT } from "@/lib/i18n.js";
import {
  bcp47,
  daysUntil,
  formatDayNumber,
  formatDeadline,
  formatLongDate,
  formatUno,
  formatWeekdayShort,
  todayIso,
} from "@/lib/format.js";
import { cn } from "@/lib/cn.js";
import { imageSrc } from "@/lib/images.js";
import { tapFeedback } from "@/lib/native.js";
import { Screen } from "@/components/layout/index.js";
import { SlotsBar, viewerStage } from "@/components/domain/session-ticket.js";
import {
  AnnouncementRow,
  DivisionBadge,
  UnreadBell,
} from "@/components/domain/index.js";
import {
  Badge,
  EmptyState,
  ErrorState,
  ProgressBar,
  SectionTitle,
  Skeleton,
} from "@/components/ui/index.js";

/**
 * Tableau de bord (CDC §7), version « Stade de nuit ».
 *
 * L'écran se lit de haut en bas comme une soirée de match : le prochain match
 * en affiche, puis la forme du joueur, puis ce qui se joue ensuite. Le solde
 * UNO, qui avait son onglet, vit désormais dans l'en-tête — d'un geste on
 * ouvre le portefeuille.
 */
export function HomeScreen() {
  const t = useT();
  const navigate = useNavigate();
  const dashboard = trpc.players.dashboard.useQuery();

  if (dashboard.isError) {
    return (
      <Screen>
        <ErrorState
          message={describeError(dashboard.error).message}
          detail={describeError(dashboard.error).devCause}
          onRetry={() => void dashboard.refetch()}
        />
      </Screen>
    );
  }

  if (dashboard.isLoading || !dashboard.data) {
    return (
      <Screen>
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-24 w-2/3" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Screen>
    );
  }

  const {
    profile,
    upcoming,
    joinable,
    announcements,
    unreadAnnouncements,
    rankingPosition,
  } = dashboard.data;

  // Le match en affiche : le prochain du joueur, sinon le prochain qu'il
  // peut rejoindre. Les suivants forment « À l'affiche ».
  const mine = upcoming.length > 0;
  const headline = mine ? upcoming[0] : joinable[0];
  const others = [...upcoming, ...joinable]
    .filter((session) => session.id !== headline?.id)
    .filter(
      (session, index, list) =>
        list.findIndex((other) => other.id === session.id) === index,
    )
    .slice(0, HOME_UPCOMING_SESSIONS);

  const open = (id: number) => {
    void tapFeedback();
    navigate(`/sessions/${id}`);
  };

  return (
    <Screen>
      {/* En-tête : l'écusson, le solde, les annonces */}
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img src="/mark.svg" alt="" className="size-9 object-contain" />
          <p className="font-display text-[19px] font-extrabold leading-none tracking-[0.08em]">
            UNO
            <span className="block text-[10px] font-bold tracking-[0.42em] text-muted">
              LEAGUE
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            aria-label={t("home.balanceLabel", {
              amount: formatUno(profile.unoPoints),
            })}
            onClick={() => {
              void tapFeedback();
              navigate("/wallet");
            }}
            className="flex h-10 items-center gap-2 rounded-full border border-accent/35 bg-accent/10 px-3.5 font-display text-[18px] font-bold tabular-nums text-orange-100 transition-colors active:opacity-70"
          >
            <Coins className="size-4 text-accent" aria-hidden />
            {new Intl.NumberFormat(bcp47()).format(profile.unoPoints)}
          </button>
          <button
            type="button"
            aria-label={t("home.announcements")}
            onClick={() => navigate("/annonces")}
            className="flex size-11 items-center justify-center rounded-xl border border-border bg-surface text-foreground transition-colors active:opacity-70"
          >
            <UnreadBell count={unreadAnnouncements} />
          </button>
        </div>
      </header>

      {/* Salutation */}
      <section className="mb-5">
        <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-muted">
          {formatLongDate(todayIso())}
        </p>
        <h1 className="mt-1 font-display text-[32px] font-extrabold uppercase italic leading-[0.98]">
          {t("home.hello", { name: profile.firstName })}
          <span className="block text-accent">{t("home.letsPlay")}</span>
        </h1>
      </section>

      {/* Le match en affiche */}
      {headline ? (
        <NextMatchTicket
          session={headline}
          mine={mine}
          onOpen={() => open(headline.id)}
        />
      ) : (
        <div className="rounded-[22px] border border-border bg-surface">
          <EmptyState
            title={t("home.nothingOpenTitle")}
            description={t("home.nothingOpenBody")}
            icon={<CalendarDays className="size-6" aria-hidden />}
          />
        </div>
      )}

      {/* La forme du joueur */}
      <section className="mt-3 grid grid-cols-3 gap-2">
        <StatTile
          label={t("home.rating")}
          value={profile.division ? String(profile.rating) : "—"}
          caption={
            profile.division
              ? `${profile.position} · ${profile.division}`
              : t("accountType.referee")
          }
          onClick={() => navigate("/profil")}
        />
        <StatTile
          label={t("home.levelTile")}
          value={String(profile.level)}
          onClick={() => navigate("/profil")}
          caption={t("home.xpLeft", { xp: xpToNextLevel(profile.xp) })}
        >
          <div className="mt-2">
            <ProgressBar
              value={Math.round(levelProgress(profile.xp) * 100)}
              max={100}
              tone="primary"
              label={t("home.levelProgress")}
            />
          </div>
        </StatTile>
        <StatTile
          label={t("home.rankTile")}
          value={
            rankingPosition
              ? t("home.rankValue", { position: rankingPosition })
              : "—"
          }
          caption={
            profile.division
              ? t("home.divisionName", { n: profile.division.slice(1) })
              : ""
          }
          onClick={() => navigate("/classement")}
        />
      </section>

      {/* À l'affiche */}
      <section className="mt-7">
        <SectionTitle
          action={
            <button
              type="button"
              onClick={() => navigate("/calendrier")}
              className="flex items-center gap-0.5 text-[13px] font-semibold text-accent"
            >
              {t("nav.calendar")}
              <ChevronRight className="size-3.5" aria-hidden />
            </button>
          }
        >
          {t("home.onBill")}
        </SectionTitle>

        {!mine && joinable.length > 0 && (
          /*
           * L'accueil d'un inscrit qui n'a encore rien réservé affichait
           * « Aucune session à venir ». C'était vrai de son point de vue, et
           * trompeur du point de vue de la ligue : on lui dit donc comment
           * rejoindre ce qui est ouvert.
           */
          <p className="mb-3 text-[13px] leading-relaxed text-muted">
            {t("home.noneYetLead")}{" "}
            <strong className="text-foreground">
              {t("home.noneYetPayment")}
            </strong>
            {t("home.noneYetEarn")}
          </p>
        )}

        {others.length > 0 ? (
          <div className="space-y-2">
            {others.map((session) => (
              <FixtureRow
                key={session.id}
                session={session}
                onOpen={() => open(session.id)}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-card border border-dashed border-border px-4 py-5 text-center text-[13px] text-muted">
            {t("home.nothingElse")}
          </p>
        )}
      </section>

      {/* Annonces */}
      <section className="mt-7">
        <SectionTitle
          action={
            <button
              type="button"
              onClick={() => navigate("/annonces")}
              className="flex items-center gap-0.5 text-[13px] font-semibold text-accent"
            >
              {t("home.seeAll")}
              <ChevronRight className="size-3.5" aria-hidden />
            </button>
          }
        >
          {t("home.announcements")}
        </SectionTitle>

        {announcements.length === 0 ? (
          <EmptyState title={t("home.noAnnouncements")} />
        ) : (
          <div className="space-y-2">
            {announcements.map((announcement) => (
              <AnnouncementRow
                key={announcement.id}
                announcement={announcement}
                onOpen={() => navigate("/annonces")}
              />
            ))}
          </div>
        )}
      </section>

      {/* La boutique, en vitrine : des articles plutôt qu'un bouton */}
      <ShopWindow onOpenShop={() => navigate("/boutique")} />

      <p className="mt-6 text-center text-[11px] text-muted">
        {formatUno(UNO_PER_EUR)} = 1,00 €
      </p>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// La vitrine de la boutique
// ---------------------------------------------------------------------------

/**
 * Quelques articles de la boutique, photo et prix, à faire défiler.
 *
 * Une ligne « Boutique » grise en bas d'écran ne donnait envie de rien : ce
 * qui fait entrer dans une boutique, c'est ce qu'il y a en vitrine. Les
 * articles sans photo n'y figurent pas, et la vitrine disparaît plutôt que
 * de s'afficher vide — la boutique reste ouverte depuis le profil.
 */
function ShopWindow({ onOpenShop }: { onOpenShop: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const items = trpc.shop.items.useQuery({ category: "all" });

  const shown = (items.data ?? [])
    // Les dons ne sont pas des articles : ils ont leur propre catégorie.
    .filter(
      (item) =>
        item.available &&
        item.images.length > 0 &&
        item.category !== DONATION_CATEGORY,
    )
    .slice(0, 6);
  if (shown.length === 0) return null;

  return (
    <section className="mt-7">
      <SectionTitle
        action={
          <button
            type="button"
            onClick={() => {
              void tapFeedback();
              onOpenShop();
            }}
            className="flex items-center gap-0.5 text-[13px] font-semibold text-accent"
          >
            {t("home.seeShop")}
            <ChevronRight className="size-3.5" aria-hidden />
          </button>
        }
      >
        {t("shop.title")}
      </SectionTitle>

      <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
        {shown.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              void tapFeedback();
              navigate(`/boutique/${item.id}`);
            }}
            className="w-[136px] shrink-0 snap-start overflow-hidden rounded-2xl border border-border bg-surface text-left transition-all active:scale-[0.98] active:opacity-80"
          >
            <span className="block aspect-square w-full overflow-hidden bg-white">
              <img
                src={imageSrc(item.images[0])}
                alt=""
                className="size-full object-cover"
                loading="lazy"
              />
            </span>
            <span className="block px-3 pb-3 pt-2.5">
              <span className="block truncate text-[13px] font-semibold">
                {item.name}
              </span>
              <span className="mt-0.5 block font-display text-[17px] font-extrabold italic leading-none tabular-nums text-orange-400">
                {formatUno(item.priceUno)}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Le billet du prochain match
// ---------------------------------------------------------------------------

function NextMatchTicket({
  session,
  mine,
  onOpen,
}: {
  session: ProposalSummary;
  mine: boolean;
  onOpen: () => void;
}) {
  const t = useT();
  const L = useLibelles();
  const mode = getGameMode(session.modeId);
  const modeName = mode ? L.gameMode[mode.id] : session.modeId;
  const days = daysUntil(session.localDate);
  const countdown =
    days <= 0
      ? t("home.today")
      : days === 1
        ? t("home.tomorrow")
        : t("home.inDays", { count: days });
  const stage = viewerStage(session);
  const missing = session.minParticipants - session.participantCount;

  return (
    <section className="relative overflow-hidden rounded-[22px] border border-flood/15 bg-[linear-gradient(160deg,#13203f_0%,#0b1122_55%,#080c18_100%)]">
      {/* Lignes de terrain en filigrane */}
      <svg
        aria-hidden
        viewBox="0 0 358 260"
        className="pointer-events-none absolute -right-10 -top-2 h-[260px] w-[358px] opacity-60"
        fill="none"
        stroke="rgb(214 226 255 / 0.16)"
        strokeWidth="1.5"
      >
        <circle cx="250" cy="130" r="62" />
        <line x1="250" y1="0" x2="250" y2="260" />
        <circle cx="250" cy="130" r="3" fill="rgb(214 226 255 / 0.3)" />
      </svg>
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-accent to-transparent"
      />

      <div className="relative p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 text-[11px] font-bold uppercase tracking-[0.14em] text-orange-300">
            {mine ? t("home.nextMine") : t("home.nextOpen")} · {countdown}
          </p>
          <DivisionBadge division={session.division} />
        </div>

        <h2 className="mt-2.5 font-display text-[38px] font-extrabold uppercase italic leading-none">
          {modeName}
        </h2>

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[14px] text-slate-300">
          <span className="flex items-center gap-1.5">
            <Clock className="size-[15px] text-muted" aria-hidden />
            {formatWeekdayShort(session.localDate)}{" "}
            {formatDayNumber(session.localDate)} · {session.localTimeLabel}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin className="size-[15px] text-muted" aria-hidden />
            {session.venueName}
          </span>
        </div>

        <div className="mt-5 flex items-end justify-between">
          <p className="font-display text-[22px] font-extrabold leading-none tabular-nums">
            {Math.min(session.participantCount, session.minParticipants)}
            <span className="text-muted/70">/{session.minParticipants}</span>
          </p>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            {t("home.players")}
          </p>
        </div>
        <div className="mt-2.5">
          <SlotsBar
            filled={session.participantCount}
            total={session.minParticipants}
            label={t("session.progress")}
          />
        </div>

        {/*
          L'appel suit l'étape du joueur (voir `viewerStage`) : on ne propose
          de payer qu'une réservation confirmée — une proposition qui cherche
          encore ses joueurs n'a rien à régler.
        */}
        {stage === "open" || stage === "toPay" ? (
          <>
            <div className="mt-5 flex items-stretch gap-2.5">
              <button
                type="button"
                onClick={onOpen}
                className="flex h-[52px] flex-1 items-center justify-center rounded-[14px] bg-accent font-display text-[19px] font-extrabold uppercase tracking-[0.06em] text-background shadow-[0_10px_30px_-10px_rgb(255_107_26/0.7)] transition-all active:scale-[0.98]"
              >
                {stage === "toPay" ? t("home.pay") : t("home.book")}
              </button>
              <div className="flex w-[86px] flex-col items-center justify-center rounded-[14px] border border-flood/15">
                <span className="font-display text-[20px] font-extrabold leading-none tabular-nums">
                  {session.priceUno}
                </span>
                <span className="mt-0.5 text-[10px] tracking-[0.14em] text-muted">
                  UNO
                </span>
              </div>
            </div>
            {stage === "toPay" && session.paymentDeadline && (
              <p className="mt-2.5 text-center text-[12px] text-orange-200">
                {t("home.payBefore", {
                  date: formatDeadline(session.paymentDeadline),
                })}
              </p>
            )}
          </>
        ) : (
          <div className="mt-5 flex items-center gap-2.5">
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              {stage === "playing" ? (
                <Badge tone="success" className="self-start">
                  <CheckCircle2 className="size-3.5" aria-hidden />
                  {t("home.playing")}
                </Badge>
              ) : stage === "registered" ? (
                <>
                  <Badge tone="primary" className="self-start">
                    <CheckCircle2 className="size-3.5" aria-hidden />
                    {t("home.registered")}
                  </Badge>
                  {missing > 0 && (
                    <span className="text-[12px] leading-snug text-muted">
                      {t(missing > 1 ? "home.missingMany" : "home.missingOne", {
                        count: missing,
                      })}
                    </span>
                  )}
                </>
              ) : null}
            </span>
            <button
              type="button"
              onClick={onOpen}
              className="flex h-[52px] shrink-0 items-center justify-center rounded-[14px] border border-border px-5 text-[15px] font-semibold transition-colors active:opacity-70"
            >
              {t("home.open")}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Tuiles et lignes
// ---------------------------------------------------------------------------

function StatTile({
  label,
  value,
  caption,
  onClick,
  children,
}: {
  label: string;
  value: string;
  caption: string;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        void tapFeedback();
        onClick();
      }}
      className="min-w-0 rounded-2xl border border-border bg-surface px-3 py-3.5 text-left transition-all active:scale-[0.98] active:opacity-70"
    >
      <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
        {label}
      </span>
      <span className="mt-1 block font-display text-[34px] font-extrabold italic leading-none tabular-nums">
        {value}
      </span>
      {children}
      <span className="mt-1.5 block truncate text-[12px] text-slate-300">
        {caption}
      </span>
    </button>
  );
}

function FixtureRow({
  session,
  onOpen,
}: {
  session: ProposalSummary;
  onOpen: () => void;
}) {
  const t = useT();
  const L = useLibelles();
  const mode = getGameMode(session.modeId);
  const modeName = mode ? L.gameMode[mode.id] : session.modeId;
  const stage = viewerStage(session);
  const left = session.minParticipants - session.participantCount;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t("session.label", {
        mode: modeName,
        date: session.localDate,
      })}
      className="flex w-full items-stretch overflow-hidden rounded-2xl border border-border bg-surface text-left transition-all active:scale-[0.99] active:opacity-70"
    >
      <span className="flex w-16 shrink-0 flex-col items-center justify-center border-r border-dashed border-flood/20 bg-surface-raised/60">
        <span className="text-[11px] font-bold tracking-[0.14em] text-muted">
          {formatWeekdayShort(session.localDate)}
        </span>
        <span className="font-display text-[28px] font-extrabold leading-none">
          {formatDayNumber(session.localDate)}
        </span>
      </span>
      <span className="min-w-0 flex-1 px-3.5 py-3">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-[15px] font-semibold">{modeName}</span>
          <span
            className={cn(
              "shrink-0 text-[11px] font-bold uppercase tracking-[0.1em]",
              stage === "playing" || stage === "registered"
                ? "text-success"
                : stage === "toPay"
                  ? "text-warning"
                  : left <= 0
                    ? "text-flood"
                    : "text-orange-300",
            )}
          >
            {stage === "playing"
              ? t("home.playing")
              : stage === "registered"
                ? t("home.registered")
                : stage === "toPay"
                  ? t("calendar.toPay")
                  : left <= 0
                    ? t("home.full")
                    : left === 1
                      ? t("home.placeLeft")
                      : t("home.placesLeft", { count: left })}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-muted">
          {session.localTimeLabel} · {session.venueName} ·{" "}
          {Math.min(session.participantCount, session.minParticipants)}/
          {session.minParticipants}
        </span>
      </span>
    </button>
  );
}
