import { type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  Home,
  Trophy,
  User,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/cn.js";
import { tapFeedback } from "@/lib/native.js";
import { useFeatures } from "@/lib/features.js";
import { useT, type Cle } from "@/lib/i18n.js";
import { useOnline } from "@/lib/use-online.js";
import { OfflineBanner } from "@/components/ui/index.js";

/**
 * Ossature d'écran.
 *
 * Les marges de sécurité (encoche en haut, barre d'accueil en bas) sont
 * appliquées ici une fois pour toutes, de sorte qu'aucun écran n'ait à s'en
 * préoccuper (§16). Sur grand écran, le contenu reste centré dans une colonne
 * de largeur mobile : l'application est conçue pour le portrait.
 */

export function Screen({
  title,
  children,
  action,
  back,
  backTo = "/",
  withTabBar = true,
  scrollable = true,
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  back?: boolean;
  /**
   * Destination de repli quand il n'y a nulle part où revenir.
   * Voir `goBack` : un `navigate(-1)` sans historique sort de l'application.
   */
  backTo?: string;
  withTabBar?: boolean;
  scrollable?: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const online = useOnline();
  const t = useT();

  /**
   * Revenir en arrière **sans jamais quitter l'application**.
   *
   * `navigate(-1)` remonte l'historique du navigateur, pas celui de
   * l'application : sur un écran ouvert directement — lien partagé, page
   * rafraîchie, notification, retour depuis le tunnel de paiement — il n'y a
   * aucune entrée précédente et le bouton renvoyait sur la page vide de
   * l'onglet. L'utilisateur se retrouvait dehors, ou bloqué si l'écran
   * masquait la barre d'onglets.
   *
   * React Router marque la première entrée d'une session de navigation d'une
   * clé « default » : c'est le signal qu'il n'y a rien derrière.
   */
  function goBack() {
    void tapFeedback();
    if (location.key === "default") navigate(backTo, { replace: true });
    else navigate(-1);
  }

  return (
    /*
     * Hauteur fixe, et non minimale : c'est ce qui fait défiler le `main`
     * plutôt que le document (BUG-001).
     *
     * En `min-h-full`, l'enveloppe grandissait avec son contenu, le `main`
     * grandissait avec elle, et son `overflow-y-auto` ne servait à rien : le
     * document défilait. Sur iOS, un document qui défile replie la barre
     * d'outils du navigateur, ce qui redimensionne la fenêtre visible — et
     * Safari repositionne mal les éléments `fixed` pendant cette animation.
     * La barre d'onglets, en `fixed bottom-0`, se retrouvait au milieu de
     * l'écran.
     *
     * En `h-full`, le document ne défile plus du tout : la barre d'outils ne
     * se replie pas, et la barre d'onglets ne bouge plus.
     */
    <div className="relative mx-auto flex h-full w-full max-w-[520px] flex-col overflow-hidden bg-background">
      <FloodlightHalo />
      {title && (
        <header
          className="sticky top-0 z-20 border-b border-border/50 bg-background/75 backdrop-blur-md"
          style={{ paddingTop: "var(--safe-top)" }}
        >
          <div className="flex min-h-[60px] items-center gap-2 px-4">
            {back && (
              <button
                type="button"
                aria-label={t("common.back")}
                onClick={goBack}
                className="-ml-2 flex size-11 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground active:opacity-70"
              >
                <ArrowLeft className="size-5" aria-hidden />
              </button>
            )}
            <h1 className="flex-1 truncate font-display text-[26px] font-extrabold uppercase italic leading-none tracking-[0.01em]">
              {title}
            </h1>
            {action}
          </div>
        </header>
      )}

      {!online && <OfflineBanner />}

      <main
        className={cn(
          "relative z-[1] flex-1 animate-fade px-4 pt-4",
          scrollable ? "overflow-y-auto" : "overflow-hidden",
        )}
        style={{
          paddingBottom: withTabBar
            ? "calc(var(--tab-bar-height) + var(--safe-bottom) + 1.5rem)"
            : "calc(var(--safe-bottom) + 1.5rem)",
          ...(title ? {} : { paddingTop: "calc(var(--safe-top) + 1rem)" }),
        }}
      >
        {children}
      </main>
    </div>
  );
}

/**
 * Le halo d'un projecteur, en haut de chaque écran.
 *
 * Un seul par écran, et toujours au même endroit : c'est la lumière du stade
 * de nuit, pas une décoration qu'on sème. Il reste derrière le contenu et
 * n'intercepte aucune pression.
 */
export function FloodlightHalo() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-[-230px] z-0 h-[480px] w-[560px] -translate-x-1/2"
      style={{
        background:
          "radial-gradient(ellipse at 50% 45%, rgb(186 210 255 / 0.17) 0%, rgb(120 150 230 / 0.06) 38%, transparent 68%)",
      }}
    />
  );
}

interface Tab {
  to: string;
  cle: Cle;
  icon: typeof Home;
  /** Les chemins qui allument l'onglet, en plus du sien. */
  matches: (pathname: string) => boolean;
}

const HOME_TAB: Tab = {
  to: "/",
  cle: "nav.home",
  icon: Home,
  matches: (pathname) => pathname === "/",
};
const CALENDAR_TAB: Tab = {
  to: "/calendrier",
  cle: "nav.calendar",
  icon: CalendarDays,
  matches: (pathname) => pathname.startsWith("/calendrier"),
};
/** L'onglet du mode club, présent seulement quand le mode est ouvert. */
const CLUB_TAB: Tab = {
  to: "/squad",
  cle: "nav.club",
  icon: Shield,
  matches: (pathname) => pathname.startsWith("/squad"),
};
/** Le classement et les tournois : tout ce qui se gagne. */
const COMPETITIONS_TAB: Tab = {
  to: "/classement",
  cle: "nav.competitions",
  icon: Trophy,
  matches: (pathname) =>
    pathname.startsWith("/classement") || pathname.startsWith("/tournois"),
};
/** Le profil porte aussi le portefeuille : c'est l'argent du joueur. */
const PROFILE_TAB: Tab = {
  to: "/profil",
  cle: "nav.profile",
  icon: User,
  matches: (pathname) =>
    pathname.startsWith("/profil") || pathname.startsWith("/wallet"),
};

/**
 * Barre d'onglets principale (§16).
 *
 * Cinq onglets quand le mode club est ouvert, quatre sinon. L'onglet du club
 * vient du **serveur** et non du build : le mode s'active en changeant une
 * variable d'environnement, sans recompiler l'application web.
 *
 * Le portefeuille n'a plus d'onglet : le solde s'affiche en tête de
 * l'accueil, d'où il s'ouvre, et sur le profil.
 */
export function TabBar() {
  const { squad } = useFeatures();
  const t = useT();
  const { pathname } = useLocation();

  const tabs: Tab[] = squad
    ? [HOME_TAB, CALENDAR_TAB, CLUB_TAB, COMPETITIONS_TAB, PROFILE_TAB]
    : [HOME_TAB, CALENDAR_TAB, COMPETITIONS_TAB, PROFILE_TAB];

  return (
    <nav
      aria-label={t("common.mainNav")}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/90 backdrop-blur-md"
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      <ul className="mx-auto flex h-[var(--tab-bar-height)] w-full max-w-[520px] items-stretch">
        {tabs.map((tab) => {
          const active = tab.matches(pathname);
          return (
            <li key={tab.to} className="flex-1">
              <Link
                to={tab.to}
                aria-current={active ? "page" : undefined}
                onClick={() => void tapFeedback()}
                className={cn(
                  "relative flex h-full flex-col items-center justify-center gap-1 transition-colors",
                  active ? "text-accent" : "text-muted hover:text-foreground",
                )}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute top-0 h-[3px] w-7 rounded-b-full bg-accent"
                  />
                )}
                <tab.icon
                  className={cn(
                    "size-[22px] transition-transform",
                    active && "scale-105",
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    "text-[11px] tracking-wide",
                    active ? "font-bold" : "font-semibold",
                  )}
                >
                  {t(tab.cle)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Fond des écrans publics (accueil, connexion) : la nuit et son projecteur. */
export function GradientBackdrop({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-full overflow-hidden bg-background">
      <FloodlightHalo />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 top-40 size-64 rounded-full bg-accent/15 blur-3xl"
      />
      <div className="relative">{children}</div>
    </div>
  );
}
