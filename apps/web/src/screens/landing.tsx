import { useNavigate } from "react-router-dom";
import { CalendarDays, ShoppingBag, Trophy } from "lucide-react";
import { Button } from "@/components/ui/index.js";
import { GradientBackdrop } from "@/components/layout/index.js";
import { useT } from "@/lib/i18n.js";

const ATOUTS = [
  { icon: CalendarDays, cle: "landing.sessions" },
  { icon: Trophy, cle: "landing.ranking" },
  { icon: ShoppingBag, cle: "landing.shop" },
] as const;

/** Écran public d'accueil : accroche et accès connexion/inscription. */
export function LandingScreen() {
  const navigate = useNavigate();
  const t = useT();

  return (
    <GradientBackdrop>
      <div
        className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col px-6"
        style={{
          paddingTop: "calc(var(--safe-top) + 3rem)",
          paddingBottom: "calc(var(--safe-bottom) + 2rem)",
        }}
      >
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          {/* L'écusson de la ligue. Une image plutôt qu'un tracé inline :
              il a été fourni en PNG, et `fetchPriority` lui évite d'arriver
              après le premier écran. */}
          <img
            src="/mark.png"
            alt="UNO League"
            width={96}
            height={96}
            fetchPriority="high"
            className="mb-6 size-24"
          />

          <h1 className="text-4xl font-black tracking-tight">UNO League</h1>
          <p className="mt-2 text-sm font-medium uppercase tracking-[0.2em] text-accent">
            {t("auth.tagline")}
          </p>
          <p className="mt-6 max-w-xs text-sm leading-relaxed text-muted">
            {t("landing.pitch")}
          </p>

          <ul className="mt-10 grid w-full grid-cols-3 gap-3">
            {ATOUTS.map((feature) => (
              <li
                key={feature.cle}
                className="rounded-2xl border border-border/60 bg-surface/70 px-2 py-4"
              >
                <feature.icon
                  className="mx-auto size-5 text-accent"
                  aria-hidden
                />
                <p className="mt-2 text-[11px] font-medium text-muted">
                  {t(feature.cle)}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          <Button
            fullWidth
            variant="accent"
            onClick={() => navigate("/inscription")}
          >
            {t("auth.createAccount")}
          </Button>
          <Button
            fullWidth
            variant="secondary"
            onClick={() => navigate("/connexion")}
          >
            {t("auth.haveAccount")}
          </Button>
        </div>
      </div>
    </GradientBackdrop>
  );
}
