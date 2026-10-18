import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MailCheck, MailX } from "lucide-react";
import { describeError, trpc } from "@/lib/trpc.js";
import { useT } from "@/lib/i18n.js";
import { GradientBackdrop } from "@/components/layout/index.js";
import { Button, Card, ErrorBanner } from "@/components/ui/index.js";

/**
 * Le lien « Ne plus recevoir ces e-mails » d'un courrier (NOTIF-002).
 *
 * Un clic suffit, sans se connecter : la page coupe les e-mails dès qu'elle
 * s'ouvre, et le dit. Elle permet de revenir en arrière d'un geste — un
 * clic malheureux ne doit pas coûter un message important — et mène aux
 * réglages fins pour qui voudrait n'en couper que certains.
 */
export function UnsubscribeScreen() {
  const t = useT();
  const [params] = useSearchParams();
  const token = params.get("jeton") ?? "";
  const unsubscribe = trpc.players.emailUnsubscribe.useMutation();
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  async function apply(subscribe: boolean) {
    setError(null);
    try {
      const result = await unsubscribe.mutateAsync({ token, subscribe });
      setSubscribed(result.subscribed);
    } catch (caught) {
      setError(describeError(caught).message);
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setError(t("unsubscribe.invalid"));
      return;
    }
    void apply(false);
    // Une seule fois, à l'ouverture de la page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <GradientBackdrop>
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
        <Card className="space-y-4">
          {subscribed === false && (
            <>
              <MailX className="size-8 text-accent" aria-hidden />
              <h1 className="text-lg font-bold">
                {t("unsubscribe.doneTitle")}
              </h1>
              <p className="text-sm leading-relaxed text-muted">
                {t("unsubscribe.doneBody")}
              </p>
              <Button
                variant="secondary"
                fullWidth
                loading={unsubscribe.isPending}
                onClick={() => void apply(true)}
              >
                {t("unsubscribe.resubscribe")}
              </Button>
            </>
          )}
          {subscribed === true && (
            <>
              <MailCheck className="size-8 text-success" aria-hidden />
              <h1 className="text-lg font-bold">
                {t("unsubscribe.backTitle")}
              </h1>
              <p className="text-sm leading-relaxed text-muted">
                {t("unsubscribe.backBody")}
              </p>
            </>
          )}
          {subscribed === null && !error && (
            <p className="text-sm text-muted">{t("unsubscribe.working")}</p>
          )}
          {error && <ErrorBanner message={error} />}
          <Link
            to="/profil/notifications"
            className="block text-center text-sm font-medium text-accent"
          >
            {t("unsubscribe.settings")}
          </Link>
        </Card>
      </div>
    </GradientBackdrop>
  );
}
