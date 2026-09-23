import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { requestPasswordResetSchema } from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { useT, erreursDuFormulaire } from "@/lib/i18n.js";
import { GradientBackdrop } from "@/components/layout/index.js";
import { Button, Field, Input } from "@/components/ui/index.js";

/**
 * Demande de réinitialisation (AUTH-009).
 *
 * **L'écran ne dit jamais si l'adresse a un compte.** Quoi qu'on saisisse, il
 * affiche le même message : « si un compte existe, un lien vient de partir ».
 * Répondre « adresse inconnue » ferait de ce formulaire un annuaire, où l'on
 * vérifie une à une quelles adresses sont inscrites — et le serveur applique
 * déjà la même règle, ce qui n'est pas une raison pour la contredire ici.
 *
 * La contrepartie est un message qui peut désorienter celui qui s'est trompé
 * d'adresse : il attend un courrier qui ne viendra pas. Le texte le dit donc
 * explicitement plutôt que de le laisser deviner.
 */
export function ForgotPasswordScreen() {
  const t = useT();
  const demande = trpc.auth.requestPasswordReset.useMutation();

  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [envoye, setEnvoye] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setErrors({});

    const parsed = requestPasswordResetSchema.safeParse({ email });
    if (!parsed.success) {
      const fieldErrors = erreursDuFormulaire(parsed.error);
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      await demande.mutateAsync(parsed.data);
      setEnvoye(true);
    } catch (error) {
      // Seule une panne réelle arrive ici : une adresse inconnue est un
      // succès côté serveur, par construction.
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
          <h1 className="text-2xl font-bold tracking-tight">
            {t("auth.forgotTitle")}
          </h1>
          <p className="mt-2 text-sm text-muted">{t("auth.forgotIntro")}</p>
        </div>

        {envoye ? (
          <div className="space-y-5">
            <div
              role="status"
              className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-4 text-sm"
            >
              <p className="font-semibold text-accent">
                {t("auth.forgotSent")}
              </p>
              <p className="mt-2 text-muted">{t("auth.forgotSentDetail")}</p>
              <p className="mt-2 text-muted">
                {t("auth.forgotSentOther", { email })}
              </p>
            </div>

            <Button
              type="button"
              variant="ghost"
              fullWidth
              onClick={() => {
                setEnvoye(false);
              }}
            >
              {t("auth.forgotTryAnother")}
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {formError && (
              <div
                role="alert"
                className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-red-200"
              >
                {formError}
              </div>
            )}

            <Field
              label={t("auth.email")}
              error={errors["email"]}
              htmlFor="email"
            >
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                placeholder={t("auth.emailPlaceholder")}
                value={email}
                invalid={Boolean(errors["email"])}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
              />
            </Field>

            <Button
              type="submit"
              variant="accent"
              fullWidth
              loading={submitting}
            >
              {t("auth.forgotSend")}
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-muted">
          <Link
            to="/connexion"
            className="font-semibold text-accent underline-offset-4 hover:underline"
          >
            {t("auth.backToLogin")}
          </Link>
        </p>
      </div>
    </GradientBackdrop>
  );
}
