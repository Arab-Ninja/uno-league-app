import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/cn.js";
import { useT } from "@/lib/i18n.js";
import { tapFeedback } from "@/lib/native.js";

/**
 * Le sélecteur de l'onglet « Compétitions » : le classement des joueurs d'un
 * côté, les tournois de clubs de l'autre.
 *
 * Deux adresses plutôt qu'un état local : un lien partagé, une notification
 * de tournoi ou le bouton retour retombent sur la bonne moitié.
 */
export function CompetitionsSwitch() {
  const t = useT();
  const { pathname } = useLocation();
  const onTournaments = pathname.startsWith("/tournois");

  const item = (active: boolean) =>
    cn(
      "flex min-h-[40px] items-center justify-center rounded-[10px] font-display text-[16px] uppercase tracking-[0.08em] transition-colors",
      active
        ? "bg-surface-raised font-extrabold text-foreground"
        : "font-bold text-muted hover:text-foreground",
    );

  return (
    <nav
      aria-label={t("nav.competitions")}
      className="mb-4 grid grid-cols-2 gap-1 rounded-[14px] border border-border bg-surface p-1"
    >
      <Link
        to="/tournois"
        replace
        aria-current={onTournaments ? "page" : undefined}
        onClick={() => void tapFeedback()}
        className={item(onTournaments)}
      >
        {t("tournament.listTitle")}
      </Link>
      <Link
        to="/classement"
        replace
        aria-current={onTournaments ? undefined : "page"}
        onClick={() => void tapFeedback()}
        className={item(!onTournaments)}
      >
        {t("ranking.title")}
      </Link>
    </nav>
  );
}
