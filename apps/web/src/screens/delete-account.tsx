import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth.js";
import { describeError, trpc } from "@/lib/trpc.js";
import { useT } from "@/lib/i18n.js";
import { Screen } from "@/components/layout/index.js";
import { Button, Card, Field, Input } from "@/components/ui/index.js";

/**
 * Supprimer son compte depuis l'application (ACC-002).
 *
 * Les stores l'exigent : une application qui permet de créer un compte doit
 * permettre de le supprimer sans en sortir — écrire à une adresse ne suffit
 * pas (App Store Review Guidelines 5.1.1(v)). La page publique reste
 * accessible d'ici : elle détaille ce qui est conservé, et pourquoi.
 *
 * Le mot de passe est redemandé, et la case à cocher n'est pas décorative :
 * le geste est définitif, et le solde UNO restant est perdu.
 */
export function DeleteAccountScreen() {
  const t = useT();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const remove = trpc.auth.deleteMyAccount.useMutation();

  const [password, setPassword] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();

  async function submit() {
    setFailure(null);
    setFieldError(undefined);
    try {
      await remove.mutateAsync({ password });
      // Les sessions sont déjà révoquées : on nettoie l'état local et l'on
      // quitte l'espace connecté.
      await logout().catch(() => undefined);
      navigate("/bienvenue", { replace: true });
    } catch (caught) {
      const info = describeError(caught);
      setFailure(info.message);
      setFieldError(info.fields["password"]);
    }
  }

  return (
    <Screen
      title={t("deleteAccount.title")}
      back
      backTo="/profil"
      withTabBar={false}
    >
      <div className="space-y-4">
        <Card className="space-y-2 text-sm leading-relaxed">
          <p>{t("deleteAccount.intro")}</p>
          <p className="text-muted">{t("deleteAccount.kept")}</p>
          <p className="font-semibold text-red-300">
            {t("deleteAccount.balanceLost")}
          </p>
          <a
            href="https://unoleague.be/suppression-compte.html"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs font-medium text-accent underline underline-offset-2"
          >
            {t("deleteAccount.more")}
          </a>
        </Card>

        {failure && (
          <div
            role="alert"
            className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-red-200"
          >
            {failure}
          </div>
        )}

        <Field
          label={t("deleteAccount.password")}
          error={fieldError}
          htmlFor="deletePassword"
        >
          <Input
            id="deletePassword"
            type="password"
            autoComplete="current-password"
            value={password}
            invalid={Boolean(fieldError)}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={understood}
            onChange={(event) => setUnderstood(event.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-[rgb(255_107_26)]"
          />
          <span>{t("deleteAccount.understand")}</span>
        </label>

        <Button
          variant="danger"
          fullWidth
          disabled={!understood || password.length === 0}
          loading={remove.isPending}
          onClick={() => void submit()}
        >
          {t("deleteAccount.submit")}
        </Button>
      </div>
    </Screen>
  );
}
