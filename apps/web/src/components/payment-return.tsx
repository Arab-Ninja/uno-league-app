import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc.js";
import { useT } from "@/lib/i18n.js";
import { Button, Card } from "@/components/ui/index.js";

/**
 * Retour d'un paiement externe (CAL-010).
 *
 * Après un paiement par carte, Bancontact ou Apple Pay, le prestataire
 * renvoie l'utilisateur sur cette page avec l'issue en paramètre. Sans cet
 * écran, il atterrissait sur le calendrier sans un mot : rien ne lui disait
 * si son argent était parti.
 *
 * Nuance importante : **le paramètre d'URL n'est pas une preuve de
 * paiement.** Il vient du navigateur, que n'importe qui peut manipuler. Seul
 * le webhook signé du prestataire fait foi, et il arrive de façon
 * asynchrone. L'écran affiche donc l'état réel de la session, relu au
 * serveur, et se contente d'expliquer ce qui vient de se passer.
 */
export function PaymentReturn() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  const outcome = params.get("paiement");
  const sessionId = Number(params.get("session"));
  const hasSession = Number.isFinite(sessionId) && sessionId > 0;

  const [checks, setChecks] = useState(0);

  const proposal = trpc.proposals.get.useQuery(
    { proposalId: sessionId },
    { enabled: outcome !== null && hasSession },
  );

  const confirmed = proposal.data?.viewer?.hasPaid ?? false;

  // Le webhook peut arriver après le navigateur. Plutôt que d'annoncer un
  // échec à tort, on relit quelques fois l'état de la session avant de
  // conclure — en s'arrêtant dès qu'il est confirmé.
  useEffect(() => {
    if (outcome !== "succes" || !hasSession || confirmed || checks >= 5) return;

    const timer = setTimeout(() => {
      void utils.proposals.get.invalidate({ proposalId: sessionId });
      setChecks((count) => count + 1);
    }, 2000);

    return () => clearTimeout(timer);
  }, [outcome, hasSession, confirmed, checks, sessionId, utils]);

  if (outcome === null) return null;

  function dismiss() {
    const next = new URLSearchParams(params);
    next.delete("paiement");
    next.delete("session");
    setParams(next, { replace: true });
  }

  if (outcome === "annule") {
    return (
      <Card className="mb-4 flex items-start gap-3 border-warning/40 bg-warning/10">
        <XCircle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-warning">
            {t("paymentReturn.cancelled")}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            {t("paymentReturn.cancelledBody")}
          </p>
          <button
            type="button"
            onClick={dismiss}
            className="mt-2 text-xs font-medium text-accent"
          >
            {t("paymentReturn.close")}
          </button>
        </div>
      </Card>
    );
  }

  const pending = !confirmed && checks < 5;

  return (
    <Card
      className={
        confirmed
          ? "mb-4 flex items-start gap-3 border-success/40 bg-success/10"
          : "mb-4 flex items-start gap-3"
      }
    >
      {confirmed ? (
        <CheckCircle2
          className="mt-0.5 size-5 shrink-0 text-success"
          aria-hidden
        />
      ) : (
        <Clock className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
      )}

      <div className="min-w-0 flex-1">
        <p
          className={
            confirmed
              ? "text-sm font-medium text-success"
              : "text-sm font-medium"
          }
        >
          {confirmed
            ? t("paymentReturn.confirmed")
            : pending
              ? t("paymentReturn.confirming")
              : t("paymentReturn.notYet")}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">
          {confirmed
            ? t("paymentReturn.confirmedBody")
            : pending
              ? t("paymentReturn.confirmingBody")
              : t("paymentReturn.notYetBody")}
        </p>

        <div className="mt-2 flex gap-3">
          {hasSession && (
            <button
              type="button"
              onClick={() => {
                dismiss();
                navigate(`/sessions/${sessionId}`);
              }}
              className="text-xs font-medium text-accent"
            >
              {t("paymentReturn.seeSession")}
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="text-xs font-medium text-muted"
          >
            {t("paymentReturn.close")}
          </button>
        </div>
      </div>
    </Card>
  );
}

/** Bouton d'appoint, pour les écrans qui n'affichent pas la carte complète. */
export function PaymentReturnLink({ sessionId }: { sessionId: number }) {
  const t = useT();
  const navigate = useNavigate();
  return (
    <Button
      variant="secondary"
      onClick={() => navigate(`/sessions/${sessionId}`)}
    >
      {t("paymentReturn.seeSession")}
    </Button>
  );
}
