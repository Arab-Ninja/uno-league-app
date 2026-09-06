import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, X } from "lucide-react";
import { changePasswordFormSchema, checkPassword } from "@uno/shared";
import { useAuth } from "@/lib/auth.js";
import { describeError, trpc } from "@/lib/trpc.js";
import { Screen } from "@/components/layout/index.js";
import { Button, Field, Input } from "@/components/ui/index.js";

/**
 * Changement de mot de passe (AUTH-008).
 * Toutes les sessions étant révoquées côté serveur, l'utilisateur est
 * reconduit vers l'écran de connexion.
 */
export function ChangePasswordScreen() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const change = trpc.auth.changePassword.useMutation();

  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const rules = useMemo(
    () => [
      { label: "Au moins 8 caractères", ok: form.newPassword.length >= 8 },
      { label: "Une majuscule", ok: /[A-ZÀ-Þ]/.test(form.newPassword) },
      { label: "Un chiffre", ok: /\d/.test(form.newPassword) },
    ],
    [form.newPassword],
  );

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function submit() {
    setFormError(null);
    setErrors({});

    const parsed = changePasswordFormSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "");
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    try {
      await change.mutateAsync({
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
      });
      setDone(true);
      // La session courante a été invalidée côté serveur.
      setTimeout(() => void logout().then(() => navigate("/connexion")), 1500);
    } catch (error) {
      const info = describeError(error);
      setFormError(info.message);
      setErrors(info.fields);
    }
  }

  return (
    <Screen title="Mot de passe" back withTabBar={false}>
      <div className="space-y-4">
        {formError && (
          <div
            role="alert"
            className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-red-200"
          >
            {formError}
          </div>
        )}
        {done && (
          <div
            role="status"
            className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
          >
            Mot de passe modifié. Reconnectez-vous avec le nouveau mot de passe.
          </div>
        )}

        <Field
          label="Mot de passe actuel"
          error={errors["currentPassword"]}
          htmlFor="currentPassword"
        >
          <Input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            value={form.currentPassword}
            invalid={Boolean(errors["currentPassword"])}
            onChange={(event) => set("currentPassword")(event.target.value)}
          />
        </Field>

        <Field
          label="Nouveau mot de passe"
          error={errors["newPassword"]}
          htmlFor="newPassword"
        >
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            value={form.newPassword}
            invalid={Boolean(errors["newPassword"])}
            onChange={(event) => set("newPassword")(event.target.value)}
          />
          {form.newPassword.length > 0 && (
            <ul className="mt-2 space-y-1">
              {rules.map((rule) => (
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
          label="Confirmer le nouveau mot de passe"
          error={errors["confirmPassword"]}
          htmlFor="confirmNewPassword"
        >
          <Input
            id="confirmNewPassword"
            type="password"
            autoComplete="new-password"
            value={form.confirmPassword}
            invalid={Boolean(errors["confirmPassword"])}
            onChange={(event) => set("confirmPassword")(event.target.value)}
          />
        </Field>

        <Button
          variant="accent"
          fullWidth
          disabled={!checkPassword(form.newPassword).valid || done}
          loading={change.isPending}
          onClick={() => void submit()}
        >
          Modifier le mot de passe
        </Button>
      </div>
    </Screen>
  );
}
