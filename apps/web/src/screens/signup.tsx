import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, X } from "lucide-react";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_DESCRIPTIONS,
  ACCOUNT_TYPE_LABELS,
  checkPassword,
  signupFormSchema,
  type AccountType,
} from "@uno/shared";
import { useAuth } from "@/lib/auth.js";
import { COUNTRIES } from "@/lib/countries.js";
import { describeError } from "@/lib/trpc.js";
import { GradientBackdrop } from "@/components/layout/index.js";
import { Button, Field, Input, Select } from "@/components/ui/index.js";

/** Écran d'inscription (CDC §6.2, AUTH-001). */
export function SignupScreen() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    email: "",
    nationality: "BE",
    password: "",
    confirmPassword: "",
  });
  // Joueur ou arbitre (ROLE-003) : le choix se fait une fois, à l'inscription.
  const [accountType, setAccountType] = useState<AccountType>("player");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  // Retour immédiat sur la politique de mot de passe (AUTH-002).
  const passwordRules = useMemo(() => {
    const rules = [
      { label: "Au moins 8 caractères", ok: form.password.length >= 8 },
      { label: "Une majuscule", ok: /[A-ZÀ-Þ]/.test(form.password) },
      { label: "Un chiffre", ok: /\d/.test(form.password) },
    ];
    return { rules, valid: checkPassword(form.password).valid };
  }, [form.password]);

  const today = new Date().toISOString().slice(0, 10);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setErrors({});

    const parsed = signupFormSchema.safeParse({ ...form, profilePhotoUrl: null });
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
      const { confirmPassword: _confirm, ...payload } = parsed.data;
      await signup({ ...payload, accountType });
      navigate("/", { replace: true });
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
        className="mx-auto w-full max-w-[520px] px-6"
        style={{
          paddingTop: "calc(var(--safe-top) + 2rem)",
          paddingBottom: "calc(var(--safe-bottom) + 2rem)",
        }}
      >
        <h1 className="text-2xl font-bold tracking-tight">Créer un compte</h1>
        <p className="mt-1 text-sm text-muted">
          Vous démarrez en Division 3 avec 1 000 UNO offerts.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          {formError && (
            <div
              role="alert"
              className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-red-200"
            >
              {formError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
          {/* ROLE-003 : deux parcours distincts dès l'inscription */}
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">
              Vous vous inscrivez comme
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {ACCOUNT_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={accountType === type}
                  onClick={() => setAccountType(type)}
                  className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                    accountType === type
                      ? "border-accent bg-accent/10"
                      : "border-border/60 hover:border-border"
                  }`}
                >
                  <span
                    className={`block text-sm font-semibold ${
                      accountType === type ? "text-accent" : ""
                    }`}
                  >
                    {ACCOUNT_TYPE_LABELS[type]}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-muted">
              {ACCOUNT_TYPE_DESCRIPTIONS[accountType]}
            </p>
          </fieldset>

            <Field label="Prénom" error={errors["firstName"]} htmlFor="firstName">
              <Input
                id="firstName"
                autoComplete="given-name"
                value={form.firstName}
                invalid={Boolean(errors["firstName"])}
                onChange={(event) => set("firstName")(event.target.value)}
              />
            </Field>
            <Field label="Nom" error={errors["lastName"]} htmlFor="lastName">
              <Input
                id="lastName"
                autoComplete="family-name"
                value={form.lastName}
                invalid={Boolean(errors["lastName"])}
                onChange={(event) => set("lastName")(event.target.value)}
              />
            </Field>
          </div>

          <Field
            label="Date de naissance"
            error={errors["dateOfBirth"]}
            htmlFor="dateOfBirth"
          >
            <Input
              id="dateOfBirth"
              type="date"
              max={today}
              value={form.dateOfBirth}
              invalid={Boolean(errors["dateOfBirth"])}
              onChange={(event) => set("dateOfBirth")(event.target.value)}
            />
          </Field>

          <Field label="Nationalité" error={errors["nationality"]} htmlFor="nationality">
            <Select
              id="nationality"
              value={form.nationality}
              onChange={(event) => set("nationality")(event.target.value)}
            >
              {COUNTRIES.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Email" error={errors["email"]} htmlFor="signupEmail">
            <Input
              id="signupEmail"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              placeholder="vous@exemple.com"
              value={form.email}
              invalid={Boolean(errors["email"])}
              onChange={(event) => set("email")(event.target.value)}
            />
          </Field>

          <Field label="Mot de passe" error={errors["password"]} htmlFor="signupPassword">
            <Input
              id="signupPassword"
              type="password"
              autoComplete="new-password"
              value={form.password}
              invalid={Boolean(errors["password"])}
              onChange={(event) => set("password")(event.target.value)}
            />
            {form.password.length > 0 && (
              <ul className="mt-2 space-y-1">
                {passwordRules.rules.map((rule) => (
                  <li
                    key={rule.label}
                    className={`flex items-center gap-1.5 text-xs ${
                      rule.ok ? "text-success" : "text-muted"
                    }`}
                  >
                    {rule.ok ? (
                      <Check className="size-3.5" aria-hidden />
                    ) : (
                      <X className="size-3.5" aria-hidden />
                    )}
                    {rule.label}
                  </li>
                ))}
              </ul>
            )}
          </Field>

          <Field
            label="Confirmer le mot de passe"
            error={errors["confirmPassword"]}
            htmlFor="confirmPassword"
          >
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={form.confirmPassword}
              invalid={Boolean(errors["confirmPassword"])}
              onChange={(event) => set("confirmPassword")(event.target.value)}
            />
          </Field>

          <Button type="submit" variant="accent" fullWidth loading={submitting}>
            Créer mon compte
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          Déjà inscrit ?{" "}
          <Link to="/connexion" className="font-semibold text-accent underline-offset-4 hover:underline">
            Se connecter
          </Link>
        </p>
      </div>
    </GradientBackdrop>
  );
}
