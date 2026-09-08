import { useEffect, useState } from "react";
import { Bell, BellOff, Share } from "lucide-react";
import { describeError, trpc } from "@/lib/trpc.js";
import {
  currentEndpoint,
  pushAvailability,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push.js";
import { Button, Card } from "@/components/ui/index.js";

/**
 * Réglage des notifications push (ANN-004).
 *
 * L'abonnement est propre à **cet appareil** : un joueur qui l'active sur son
 * téléphone ne l'a pas activé sur son ordinateur. Le compteur d'appareils le
 * dit explicitement, plutôt que de laisser croire à un réglage de compte.
 *
 * Chaque situation où le push ne peut pas fonctionner reçoit son explication.
 * Un bouton grisé sans raison est une impasse ; sur iPhone en particulier, la
 * seule chose à faire est d'ajouter l'application à l'écran d'accueil, et
 * l'utilisateur ne peut pas le deviner.
 */
export function PushSettings() {
  const utils = trpc.useUtils();
  const config = trpc.players.pushConfig.useQuery();
  const subscribe = trpc.players.subscribePush.useMutation();
  const unsubscribe = trpc.players.unsubscribePush.useMutation();

  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void currentEndpoint().then(setEndpoint);
  }, []);

  const publicKey = config.data?.publicKey ?? null;
  const devices = config.data?.devices ?? 0;
  const state = pushAvailability(publicKey);
  const active = endpoint !== null;

  async function enable() {
    if (!publicKey) return;
    setError(null);
    setBusy(true);
    try {
      const payload = await subscribeToPush(publicKey);
      if (!payload) {
        setError(
          "Les notifications ont été refusées. Vous pouvez les réautoriser dans les réglages de votre navigateur.",
        );
        return;
      }
      await subscribe.mutateAsync(payload);
      setEndpoint(payload.endpoint);
      await utils.players.pushConfig.invalidate();
    } catch (caught) {
      setError(describeError(caught).message);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setError(null);
    setBusy(true);
    try {
      const removed = await unsubscribeFromPush();
      if (removed) await unsubscribe.mutateAsync({ endpoint: removed });
      setEndpoint(null);
      await utils.players.pushConfig.invalidate();
    } catch (caught) {
      setError(describeError(caught).message);
    } finally {
      setBusy(false);
    }
  }

  // Push non configuré sur ce serveur : inutile d'en parler au joueur.
  if (state === "not-configured") return null;

  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-raised">
          {active ? (
            <Bell className="size-4 text-accent" aria-hidden />
          ) : (
            <BellOff className="size-4 text-muted" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Notifications</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            {active
              ? "Cet appareil reçoit les rappels de paiement, les confirmations de session et les récompenses."
              : "Soyez prévenu d'un paiement à régler, d'une session confirmée ou d'une récompense reçue."}
          </p>
        </div>
      </div>

      {state === "needs-install" && (
        <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-surface-raised px-3 py-2.5">
          <Share className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <p className="text-xs leading-relaxed text-muted">
            Sur iPhone, les notifications exigent que l'application soit
            ajoutée à l'écran d'accueil. Touchez <strong>Partager</strong>, puis{" "}
            <strong>Sur l'écran d'accueil</strong>, et rouvrez l'application
            depuis là.
          </p>
        </div>
      )}

      {state === "unsupported" && (
        <p className="text-xs leading-relaxed text-muted">
          Ce navigateur ne prend pas en charge les notifications. Vous
          retrouvez tout dans l'application.
        </p>
      )}

      {state === "denied" && (
        <p className="text-xs leading-relaxed text-warning">
          Les notifications ont été bloquées pour ce site. Réautorisez-les dans
          les réglages de votre navigateur, puis revenez ici.
        </p>
      )}

      {state === "ready" && (
        <>
          <Button
            variant={active ? "secondary" : "accent"}
            fullWidth
            loading={busy}
            onClick={() => void (active ? disable() : enable())}
          >
            {active ? "Désactiver sur cet appareil" : "Activer sur cet appareil"}
          </Button>

          {devices > 0 && (
            <p className="text-center text-[11px] text-muted">
              {devices} appareil{devices > 1 ? "s" : ""} abonné
              {devices > 1 ? "s" : ""} à votre compte.
            </p>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}
    </Card>
  );
}
