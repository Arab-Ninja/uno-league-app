import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { AlertTriangle, Inbox, Loader2, WifiOff } from "lucide-react";
import { cn } from "@/lib/cn.js";
import { tapFeedback } from "@/lib/native.js";

/**
 * Briques d'interface communes.
 *
 * Deux invariants portés ici plutôt que répétés dans chaque écran :
 *  - toute cible tactile principale fait au moins 44 px (UX §16) ;
 *  - un retour visuel et haptique accompagne chaque pression.
 */

// ---------------------------------------------------------------------------
// Bouton
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "accent" | "danger" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-primary-bright text-foreground hover:bg-primary active:bg-primary shadow-lg shadow-primary/25",
  secondary:
    "bg-surface-raised text-foreground border border-border hover:bg-surface",
  accent:
    "bg-accent text-background font-semibold hover:brightness-110 shadow-lg shadow-accent/25",
  danger: "bg-error text-foreground hover:brightness-110",
  ghost: "bg-transparent text-muted hover:text-foreground",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = "primary", loading, fullWidth, icon, className, children, disabled, onClick, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        onClick={(event) => {
          void tapFeedback();
          onClick?.(event);
        }}
        className={cn(
          "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-5 py-3",
          "text-[15px] font-medium transition-all duration-200",
          "active:scale-[0.98] active:opacity-70",
          "disabled:pointer-events-none disabled:opacity-40",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          VARIANTS[variant],
          fullWidth && "w-full",
          className,
        )}
        {...props}
      >
        {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
        {children}
      </button>
    );
  },
);

// ---------------------------------------------------------------------------
// Carte
// ---------------------------------------------------------------------------

export function Card({
  className,
  children,
  ...props
}: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-card border border-border/60 bg-surface p-4 shadow-sm",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function PressableCard({
  className,
  children,
  onClick,
  label,
}: {
  className?: string;
  children: ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        void tapFeedback();
        onClick();
      }}
      className={cn(
        "w-full rounded-card border border-border/60 bg-surface p-4 text-left",
        "transition-all duration-200 active:scale-[0.99] active:opacity-70",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        className,
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

type BadgeTone = "neutral" | "primary" | "accent" | "success" | "warning" | "error";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-surface-raised text-muted border-border",
  primary: "bg-primary/25 text-blue-200 border-primary/40",
  accent: "bg-accent/15 text-accent border-accent/40",
  success: "bg-success/15 text-success border-success/40",
  warning: "bg-warning/15 text-warning border-warning/40",
  error: "bg-error/15 text-red-300 border-error/40",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5",
        "text-[11px] font-semibold uppercase tracking-wide",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Champs de formulaire
// ---------------------------------------------------------------------------

interface FieldProps {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  children: ReactNode;
  htmlFor?: string;
}

/**
 * Un champ n'est jamais signalé en erreur par la seule couleur : le message
 * texte est toujours présent et rattaché au champ (UX-002).
 */
export function Field({ label, error, hint, children, htmlFor }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-muted">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-xs text-red-300">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          "min-h-[48px] w-full rounded-xl border bg-surface px-4 py-3",
          "text-foreground placeholder:text-muted/60",
          "transition-colors focus:outline-none focus:ring-2 focus:ring-accent/70",
          invalid ? "border-error" : "border-border",
          className,
        )}
        {...props}
      />
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          "min-h-[48px] w-full appearance-none rounded-xl border border-border bg-surface px-4 py-3",
          "text-foreground focus:outline-none focus:ring-2 focus:ring-accent/70",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  },
);

// ---------------------------------------------------------------------------
// États d'écran : chargement, vide, erreur, hors ligne (§16)
// ---------------------------------------------------------------------------

export function LoadingState({ label = "Chargement..." }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-3 py-16 text-muted"
    >
      <Loader2 className="size-7 animate-spin text-accent" aria-hidden />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="rounded-full bg-surface-raised p-4 text-muted">
        {icon ?? <Inbox className="size-6" aria-hidden />}
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="max-w-xs text-sm text-muted">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center"
    >
      <div className="rounded-full bg-error/15 p-4 text-red-300">
        <AlertTriangle className="size-6" aria-hidden />
      </div>
      <p className="max-w-xs text-sm text-muted">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Réessayer
        </Button>
      )}
    </div>
  );
}

export function OfflineBanner() {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-warning/15 px-4 py-2 text-xs text-warning"
    >
      <WifiOff className="size-3.5" aria-hidden />
      Hors ligne — les données affichées peuvent être obsolètes.
    </div>
  );
}

// ---------------------------------------------------------------------------
// Divers
// ---------------------------------------------------------------------------

export function ProgressBar({
  value,
  max,
  tone = "accent",
  label,
}: {
  value: number;
  max: number;
  tone?: "accent" | "success" | "primary";
  label?: string;
}) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const colors = {
    accent: "bg-accent",
    success: "bg-success",
    primary: "bg-primary-bright",
  };

  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className="h-2 w-full overflow-hidden rounded-full bg-surface-raised"
    >
      <div
        className={cn("h-full rounded-full transition-all duration-500", colors[tone])}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function SectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-base font-semibold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-lg bg-surface-raised", className)}
      aria-hidden
    />
  );
}
