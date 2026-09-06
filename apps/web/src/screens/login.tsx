import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { loginSchema } from "@uno/shared";
import { useAuth } from "@/lib/auth.js";
import { describeError } from "@/lib/trpc.js";
import { GradientBackdrop } from "@/components/layout/index.js";
import { Button, Field, Input } from "@/components/ui/index.js";

/** Écran de connexion (CDC §6.1). */
export function LoginScreen() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setErrors({});

    // L'email est nettoyé à la soumission ; le serveur revalide de toute façon.
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "");
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      await login(parsed.data);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? "/", { replace: true });
    } catch (error) {
      const info = describeError(error);
      setFormError(info.message);
      setErrors(info.fields);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <GradientBackdrop>
      <div
        className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col justify-center px-6"
        style={{
          paddingTop: "calc(var(--safe-top) + 2rem)",
          paddingBottom: "calc(var(--safe-bottom) + 2rem)",
        }}
      >
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-accent/15 ring-1 ring-accent/30">
            <span className="text-3xl font-black text-accent">1</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">UNO League</h1>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.2em] text-accent">
            The Ultimate Number One
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {formError && (
            <div
              role="alert"
              className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-red-200"
            >
              {formError}
            </div>
          )}

          <Field label="Email" error={errors["email"]} htmlFor="email">
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              placeholder="vous@exemple.com"
              value={email}
              invalid={Boolean(errors["email"])}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>

          <Field label="Mot de passe" error={errors["password"]} htmlFor="password">
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              invalid={Boolean(errors["password"])}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>

          <Button type="submit" variant="accent" fullWidth loading={submitting}>
            Se connecter
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          Pas encore de compte ?{" "}
          <Link to="/inscription" className="font-semibold text-accent underline-offset-4 hover:underline">
            S'inscrire
          </Link>
        </p>
      </div>
    </GradientBackdrop>
  );
}
