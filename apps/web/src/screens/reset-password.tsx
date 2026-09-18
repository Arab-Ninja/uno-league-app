import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PASSWORD_RULE_MESSAGE, resetPasswordFormSchema } from "@uno/shared";
import { describeError, trpc } from "@/lib/trpc.js";
import { GradientBackdrop } from "@/components/layout/index.js";
import { Button, Field, Input } from "@/components/ui/index.js";

/**
 * Pose du nouveau mot de passe, jeton en main (AUTH-009).
 *
 * **Le jeton est dans le chemin, pas dans la requête.** `/mot-de-passe/<jeton>`
 * plutôt que `?token=<jeton>` : les paramètres de requête voyagent dans les
 * en-têtes `Referer` vers tout ce que la page charge, et finissent dans les
 * journaux des mandataires. Un chemin le fait aussi, mais l'application ne
 * charge rien de tiers sur cet écran, et la valeur est consommée dès la
 * soumission.
 *
 * **Le succès ne connecte pas.** Toutes les sessions viennent d'être révoquées
 * — c'est le but de la manœuvre —, et l'on renvoie vers la connexion. Se
 * reconnecter est le meilleur moyen de vérifier qu'on a bien noté ce qu'on
 * vient de choisir.
 */
export function ResetPasswordScreen() {
  const { token = "" } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const reinitialiser = trpc.auth.resetPassword.useMutation();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fait, setFait] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setErrors({});

    const parsed = resetPasswordFormSchema.safeParse({
      token,
      newPassword,
      confirmPassword,
    });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "");
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      // Un jeton invalide n'a pas de champ où s'afficher : le message doit
      // alors remonter en tête de formulaire, sinon rien ne se passe à l'écran.
      if (fieldErrors["token"]) {
        setFormError(
          "Ce lien est incomplet. Ouvrez-le depuis le courrier reçu, ou demandez-en un nouveau.",
        );
      }
      return;
    }

    setSubmitting(true);
    try {
      await reinitialiser.mutateAsync({
        token: parsed.data.token,
        newPassword: parsed.data.newPassword,
      });
      setFait(true);
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
          <h1 className="text-2xl font-bold tracking-tight">Nouveau mot de passe</h1>
          {!fait && (
            <p className="mt-2 text-sm text-muted">{PASSWORD_RULE_MESSAGE}</p>
          )}
        </div>

        {fait ? (
          <div className="space-y-5">
            <div
              role="status"
              className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-4 text-sm"
            >
              <p className="font-semibold text-accent">Votre mot de passe est changé.</p>
              <p className="mt-2 text-muted">
                Toutes les sessions ouvertes ont été fermées, sur tous vos
                appareils. Reconnectez-vous avec le nouveau.
              </p>
            </div>

            <Button
              type="button"
              variant="accent"
              fullWidth
              onClick={() => {
                navigate("/connexion", { replace: true });
              }}
            >
              Se connecter
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {formError && (
              <div
                role="alert"
                className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-red-200"
              >
                <p>{formError}</p>
                <Link
                  to="/mot-de-passe-oublie"
                  className="mt-2 inline-block font-semibold text-accent underline-offset-4 hover:underline"
                >
                  Demander un nouveau lien
                </Link>
              </div>
            )}

            <Field
              label="Nouveau mot de passe"
              error={errors["newPassword"]}
              htmlFor="newPassword"
            >
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={newPassword}
                invalid={Boolean(errors["newPassword"])}
                onChange={(event) => {
                  setNewPassword(event.target.value);
                }}
              />
            </Field>

            <Field
              label="Confirmer"
              error={errors["confirmPassword"]}
              htmlFor="confirmPassword"
            >
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={confirmPassword}
                invalid={Boolean(errors["confirmPassword"])}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                }}
              />
            </Field>

            <Button type="submit" variant="accent" fullWidth loading={submitting}>
              Enregistrer
            </Button>
          </form>
        )}
      </div>
    </GradientBackdrop>
  );
}
