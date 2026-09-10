import { type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  Home,
  Trophy,
  User,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/cn.js";
import { tapFeedback } from "@/lib/native.js";
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
    <div className="mx-auto flex min-h-full w-full max-w-[520px] flex-col bg-background">
      {title && (
        <header
          className="sticky top-0 z-20 border-b border-border/60 bg-background/95 backdrop-blur"
          style={{ paddingTop: "var(--safe-top)" }}
        >
          <div className="flex min-h-[56px] items-center gap-2 px-4">
            {back && (
              <button
                type="button"
                aria-label="Retour"
                onClick={goBack}
                className="-ml-2 flex size-11 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground active:opacity-70"
              >
                <ArrowLeft className="size-5" aria-hidden />
              </button>
            )}
            <h1 className="flex-1 truncate text-lg font-semibold tracking-tight">
              {title}
            </h1>
            {action}
          </div>
        </header>
      )}

      {!online && <OfflineBanner />}

      <main
        className={cn(
          "flex-1 animate-fade px-4 pt-4",
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

const TABS = [
  { to: "/", label: "Accueil", icon: Home, end: true },
  { to: "/calendrier", label: "Calendrier", icon: CalendarDays, end: false },
  { to: "/classement", label: "Classement", icon: Trophy, end: false },
  { to: "/wallet", label: "Wallet", icon: Wallet, end: false },
  { to: "/profil", label: "Profil", icon: User, end: false },
] as const;

/** Barre d'onglets principale : 5 onglets (§16). */
export function TabBar() {
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-surface/95 backdrop-blur"
      style={{ paddingBottom: "var(--safe-bottom)" }}
    >
      <ul className="mx-auto flex h-[var(--tab-bar-height)] w-full max-w-[520px] items-stretch">
        {TABS.map((tab) => (
          <li key={tab.to} className="flex-1">
            <NavLink
              to={tab.to}
              end={tab.end}
              onClick={() => void tapFeedback()}
              className={({ isActive }) =>
                cn(
                  "flex h-full flex-col items-center justify-center gap-1 transition-colors",
                  isActive ? "text-accent" : "text-muted hover:text-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <tab.icon
                    className={cn("size-5 transition-transform", isActive && "scale-110")}
                    aria-hidden
                  />
                  <span className="text-[10px] font-medium">{tab.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Fond dégradé utilisé par les écrans publics (accueil, connexion). */
export function GradientBackdrop({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-full overflow-hidden bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-gradient-to-b from-primary/45 via-primary/10 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 top-32 size-64 rounded-full bg-accent/20 blur-3xl"
      />
      <div className="relative">{children}</div>
    </div>
  );
}
