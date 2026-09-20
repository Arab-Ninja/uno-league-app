import { useNavigate } from "react-router-dom";
import { CalendarDays, ShoppingBag, Trophy } from "lucide-react";
import { Button } from "@/components/ui/index.js";
import { GradientBackdrop } from "@/components/layout/index.js";
import { UnoMark } from "@/components/brand/uno-mark.js";

/** Écran public d'accueil : accroche et accès connexion/inscription. */
export function LandingScreen() {
  const navigate = useNavigate();

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
          {/* L'écusson, et non plus le chiffre qui en tenait lieu : c'est le
              premier écran que voit quelqu'un qui ne connaît pas la ligue. */}
          <UnoMark className="mb-6 size-24" />

          <h1 className="text-4xl font-black tracking-tight">UNO League</h1>
          <p className="mt-2 text-sm font-medium uppercase tracking-[0.2em] text-accent">
            The Ultimate Number One
          </p>
          <p className="mt-6 max-w-xs text-sm leading-relaxed text-muted">
            La ligue amateur de futsal : organisez vos sessions, grimpez au
            classement et transformez vos performances en récompenses.
          </p>

          <ul className="mt-10 grid w-full grid-cols-3 gap-3">
            {[
              { icon: CalendarDays, label: "Sessions" },
              { icon: Trophy, label: "Classement" },
              { icon: ShoppingBag, label: "Boutique" },
            ].map((feature) => (
              <li
                key={feature.label}
                className="rounded-2xl border border-border/60 bg-surface/70 px-2 py-4"
              >
                <feature.icon className="mx-auto size-5 text-accent" aria-hidden />
                <p className="mt-2 text-[11px] font-medium text-muted">{feature.label}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          <Button fullWidth variant="accent" onClick={() => navigate("/inscription")}>
            Créer un compte
          </Button>
          <Button fullWidth variant="secondary" onClick={() => navigate("/connexion")}>
            J'ai déjà un compte
          </Button>
        </div>
      </div>
    </GradientBackdrop>
  );
}
