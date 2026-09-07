import { useNavigate } from "react-router-dom";
import { CalendarDays, ChevronRight, ShoppingBag, Wallet } from "lucide-react";
import {
  HOME_UPCOMING_SESSIONS,
  UNO_PER_EUR,
  levelProgress,
  xpToNextLevel,
} from "@uno/shared";
import { trpc, describeError } from "@/lib/trpc.js";
import { formatEur, formatUno } from "@/lib/format.js";
import { Screen } from "@/components/layout/index.js";
import {
  AnnouncementRow,
  Avatar,
  DivisionBadge,
  SessionCard,
  UnreadBell,
} from "@/components/domain/index.js";
import {
  Card,
  EmptyState,
  ErrorState,
  ProgressBar,
  SectionTitle,
  Skeleton,
} from "@/components/ui/index.js";

/** Tableau de bord (CDC §7). */
export function HomeScreen() {
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
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </Screen>
    );
  }

  const { profile, upcoming, announcements, unreadAnnouncements } = dashboard.data;
  const progress = levelProgress(profile.xp);

  return (
    <Screen>
      {/* En-tête : salutation, profil compact et solde */}
      <header className="mb-5 flex items-center gap-3">
        <Avatar
          name={profile.displayName}
          url={profile.profilePhotoUrl}
          division={profile.division}
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">Bonjour</p>
          <p className="truncate text-base font-semibold">{profile.firstName}</p>
        </div>
        <button
          type="button"
          aria-label="Annonces"
          onClick={() => navigate("/annonces")}
          className="flex size-11 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground active:opacity-70"
        >
          <UnreadBell count={unreadAnnouncements} />
        </button>
      </header>

      {/* Carte joueur */}
      <Card className="mb-5 overflow-hidden bg-gradient-to-br from-primary via-primary/80 to-surface p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-blue-100">{profile.displayName}</p>
            <div className="mt-1.5">
              <DivisionBadge division={profile.division} />
            </div>
          </div>
          <div className="text-right">
            <p className="text-3xl font-black tabular-nums">{profile.unoPoints}</p>
            <p className="text-xs font-medium text-blue-100">UNO</p>
            {/* Équivalent EUR calculé au ratio officiel (HOME-002) */}
            <p className="mt-0.5 text-xs text-blue-200/80">
              {formatEur(profile.unoPoints)}
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-blue-100">
            <span className="font-semibold">Niveau {profile.level}</span>
            <span>{xpToNextLevel(profile.xp)} XP avant le niveau suivant</span>
          </div>
          <ProgressBar
            value={Math.round(progress * 100)}
            max={100}
            tone="accent"
            label="Progression du niveau"
          />
        </div>
      </Card>

      {/* Actions rapides */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        {[
          { icon: CalendarDays, label: "Calendrier", to: "/calendrier" },
          { icon: ShoppingBag, label: "Boutique", to: "/boutique" },
          { icon: Wallet, label: "Wallet", to: "/wallet" },
        ].map((action) => (
          <button
            key={action.to}
            type="button"
            onClick={() => navigate(action.to)}
            className="flex min-h-[80px] flex-col items-center justify-center gap-2 rounded-card border border-border/60 bg-surface transition-all active:scale-[0.98] active:opacity-70"
          >
            <action.icon className="size-5 text-accent" aria-hidden />
            <span className="text-xs font-medium">{action.label}</span>
          </button>
        ))}
      </div>

      {/* Prochains matchs (HOME-001) */}
      <section className="mb-6">
        <SectionTitle
          action={
            <button
              type="button"
              onClick={() => navigate("/calendrier")}
              className="flex items-center gap-0.5 text-xs font-medium text-accent"
            >
              Tout voir
              <ChevronRight className="size-3.5" aria-hidden />
            </button>
          }
        >
          Prochains matchs
        </SectionTitle>

        {upcoming.length === 0 ? (
          <EmptyState
            title="Aucune session à venir"
            description="Créez une proposition ou rejoignez-en une depuis le calendrier."
            icon={<CalendarDays className="size-6" aria-hidden />}
          />
        ) : (
          <div className="space-y-3">
            {upcoming.slice(0, HOME_UPCOMING_SESSIONS).map((session) => (
              <SessionCard
                key={session.id}
                proposal={session}
                onOpen={() => navigate(`/sessions/${session.id}`)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Annonces */}
      <section>
        <SectionTitle
          action={
            <button
              type="button"
              onClick={() => navigate("/annonces")}
              className="flex items-center gap-0.5 text-xs font-medium text-accent"
            >
              Tout voir
              <ChevronRight className="size-3.5" aria-hidden />
            </button>
          }
        >
          Annonces
        </SectionTitle>

        {announcements.length === 0 ? (
          <EmptyState title="Aucune annonce pour le moment" />
        ) : (
          <div className="space-y-3">
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

      <p className="mt-6 text-center text-[11px] text-muted">
        {formatUno(UNO_PER_EUR)} = 1,00 €
      </p>
    </Screen>
  );
}
