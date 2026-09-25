import { useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Check, X } from "lucide-react";
import {
  ACCOUNT_TYPES,
  MIN_SIGNUP_AGE,
  checkPassword,
  signupFormSchema,
  type AccountType,
} from "@uno/shared";
import { useAuth } from "@/lib/auth.js";
import { useT, erreursDuFormulaire } from "@/lib/i18n.js";
import { SignupPhotoStep } from "./signup-photo.js";
import { countries } from "@/lib/countries.js";
import { describeError, trpc } from "@/lib/trpc.js";
import { GradientBackdrop } from "@/components/layout/index.js";
import { peekReturnTo } from "@/lib/return-to.js";
import {
  Button,
  Field,
  Input,
  LoadingState,
  Select,
} from "@/components/ui/index.js";

/** Écran d'inscription (CDC §6.2, AUTH-001). */
export function SignupScreen() {
  const t = useT();
  const { signup, isAuthenticated, isLoading } = useAuth();
  /**
   * Interrogé seulement une fois la session ouverte : c'est ce qui distingue
   * « inscription qui vient de se terminer » de « compte déjà complet ».
   */
  const profile = trpc.players.me.useQuery(undefined, {
    enabled: isAuthenticated,
  });
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
      { cle: "password.rule8", ok: form.password.length >= 8 },
      { cle: "password.ruleUpper", ok: /[A-ZÀ-Þ]/.test(form.password) },
      { cle: "password.ruleDigit", ok: /\d/.test(form.password) },
    ] as const;
    return { rules, valid: checkPassword(form.password).valid };
  }, [form.password]);

  /**
   * Dernier jour de naissance acceptable : celui d'une personne qui atteint
   * tout juste l'âge minimum aujourd'hui. Le sélecteur de date bloque donc
   * au-delà, ce qui vaut mieux qu'un refus après coup — mais c'est le serveur
   * qui décide (AUTH-010), ce champ n'étant qu'une politesse d'interface.
   */
  const latestBirthDate = (() => {
    const limit = new Date();
    limit.setFullYear(limit.getFullYear() - MIN_SIGNUP_AGE);
    return limit.toISOString().slice(0, 10);
  })();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setErrors({});

    const parsed = signupFormSchema.safeParse({
      ...form,
      profilePhotoUrl: null,
    });
    if (!parsed.success) {
      const fieldErrors = erreursDuFormulaire(parsed.error);
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      const { confirmPassword: _confirm, ...payload } = parsed.data;
      await signup({ ...payload, accountType });
      /**
       * Aucune navigation : la session vient de s'ouvrir, et l'écran bascule
       * de lui-même sur la prise de photo (voir plus bas). Naviguer ici
       * entrait en course avec la redirection « déjà connecté », qui gagnait
       * une fois sur deux et emportait l'étape photo avec elle.
       */
    } catch (error) {
      const info = describeError(error);
      setFormError(info.message);
      setErrors(info.fields);
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Le compte existe : l'inscription n'est pas finie pour autant.
   *
   * Reste la photo du joueur, qui a besoin d'une session pour être envoyée —
   * d'où cette seconde étape sur la même adresse. Un compte qui en a déjà une
   * n'a rien à faire ici : il repart vers l'accueil.
   */
  if (isAuthenticated && !isLoading) {
    if (profile.isPending)
      return <LoadingState label={t("signup.oneMoment")} />;
    return profile.data?.profilePhotoUrl ? (
      <Navigate to={peekReturnTo() ?? "/"} replace />
    ) : (
      <SignupPhotoStep />
    );
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
        <h1 className="text-2xl font-bold tracking-tight">
          {t("signup.title")}
        </h1>
        <p className="mt-1 text-sm text-muted">{t("signup.division")}</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          {formError && (
            <div
              role="alert"
              className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-red-200"
            >
              {formError}
            </div>
          )}

          {/* ROLE-003 : deux parcours distincts dès l'inscription */}
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">
              {t("signup.asWhat")}
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
                    {t(`accountType.${type}`)}
                  </span>
                </button>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-muted">
              {t(`accountType.${accountType}Help`)}
            </p>
          </fieldset>

          {/* Le choix du type de compte tient sur toute la largeur : glissé
              dans la grille des noms, il poussait « Prénom » à sa droite. */}
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={t("signup.firstName")}
              error={errors["firstName"]}
              htmlFor="firstName"
            >
              <Input
                id="firstName"
                autoComplete="given-name"
                value={form.firstName}
                invalid={Boolean(errors["firstName"])}
                onChange={(event) => set("firstName")(event.target.value)}
              />
            </Field>
            <Field
              label={t("signup.lastName")}
              error={errors["lastName"]}
              htmlFor="lastName"
            >
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
            label={t("signup.birthDate")}
            error={errors["dateOfBirth"]}
            htmlFor="dateOfBirth"
            hint={t("signup.birthHint", { age: MIN_SIGNUP_AGE })}
          >
            <Input
              id="dateOfBirth"
              type="date"
              max={latestBirthDate}
              value={form.dateOfBirth}
              invalid={Boolean(errors["dateOfBirth"])}
              onChange={(event) => set("dateOfBirth")(event.target.value)}
            />
          </Field>

          <Field
            label={t("signup.nationality")}
            error={errors["nationality"]}
            htmlFor="nationality"
          >
            <Select
              id="nationality"
              value={form.nationality}
              onChange={(event) => set("nationality")(event.target.value)}
            >
              {countries().map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={t("auth.email")}
            error={errors["email"]}
            htmlFor="signupEmail"
          >
            <Input
              id="signupEmail"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              placeholder={t("auth.emailPlaceholder")}
              value={form.email}
              invalid={Boolean(errors["email"])}
              onChange={(event) => set("email")(event.target.value)}
            />
          </Field>

          <Field
            label={t("auth.password")}
            error={errors["password"]}
            htmlFor="signupPassword"
          >
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
                    key={rule.cle}
                    className={`flex items-center gap-1.5 text-xs ${
                      rule.ok ? "text-success" : "text-muted"
                    }`}
                  >
                    {rule.ok ? (
                      <Check className="size-3.5" aria-hidden />
                    ) : (
                      <X className="size-3.5" aria-hidden />
                    )}
                    {t(rule.cle)}
                  </li>
                ))}
              </ul>
            )}
          </Field>

          <Field
            label={t("signup.confirmPassword")}
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
            {t("signup.submit")}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          {t("signup.already")}{" "}
          <Link
            to="/connexion"
            className="font-semibold text-accent underline-offset-4 hover:underline"
          >
            {t("auth.signIn")}
          </Link>
        </p>
      </div>
    </GradientBackdrop>
  );
}
