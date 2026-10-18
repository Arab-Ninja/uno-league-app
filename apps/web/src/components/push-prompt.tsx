import { useState } from "react";
import { BellRing } from "lucide-react";
import type { PushPromptStage } from "@uno/shared";
import { trpc } from "@/lib/trpc.js";
import { useT } from "@/lib/i18n.js";
import { tapFeedback } from "@/lib/native.js";
import { Button } from "@/components/ui/index.js";
import { usePushActivation } from "@/components/push-settings.js";

/**
 * La proposition d'activer le push (NOTIF-003).
 *
 * Deux moments, que le serveur tient : la première fois — juste après
 * l'inscription, ou au premier lancement pour un compte existant —, puis une
 * relance unique quand le joueur rejoint sa première séance, là où l'intérêt
 * est le plus évident.
 *
 * Elle ne s'affiche que si elle peut aboutir : un appareil capable de
 * recevoir le push, et aucun appareil du compte déjà abonné. Sinon, rien —
 * et rien n'est marqué : la proposition attend un appareil où elle a du sens.
 * Quoi que réponde le joueur, elle est marquée vue : on ne la lui repose pas.
 */
export function PushPrompt({ stage }: { stage: PushPromptStage }) {
  const t = useT();
  const utils = trpc.useUtils();
  const prompt = trpc.players.pushPrompt.useQuery();
  const mark = trpc.players.markPushPrompt.useMutation();
  const push = usePushActivation();
  const [closed, setClosed] = useState(false);

  const visible =
    !closed &&
    prompt.data?.stage === stage &&
    push.ready &&
    push.state === "ready" &&
    !push.active &&
    push.devices === 0;
  if (!visible) return null;

  async function answer(activate: boolean) {
    void tapFeedback();
    // Un refus de l'appareil reste une réponse : on ne redemandera pas, le
    // système s'en souvient de toute façon.
    if (activate) await push.enable();
    await mark.mutateAsync({ stage }).catch(() => undefined);
    await utils.players.pushPrompt.invalidate();
    setClosed(true);
  }

  const first = stage === "first";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 backdrop-blur-sm sm:items-center"
      style={{
        paddingTop: "calc(var(--safe-top) + 1rem)",
        paddingBottom: "calc(var(--safe-bottom) + 1rem)",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="push-prompt-title"
    >
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        <div className="flex size-12 items-center justify-center rounded-xl bg-accent/15">
          <BellRing className="size-6 text-accent" aria-hidden />
        </div>
        <div>
          <h2 id="push-prompt-title" className="text-lg font-bold">
            {first ? t("push.promptTitleFirst") : t("push.promptTitleJoin")}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            {first ? t("push.promptBodyFirst") : t("push.promptBodyJoin")}
          </p>
        </div>
        {push.error && (
          <p role="alert" className="text-xs text-red-300">
            {push.error}
          </p>
        )}
        <div className="space-y-2">
          <Button
            variant="accent"
            fullWidth
            loading={push.busy}
            onClick={() => void answer(true)}
          >
            {t("push.promptEnable")}
          </Button>
          <Button
            variant="ghost"
            fullWidth
            disabled={push.busy}
            onClick={() => void answer(false)}
          >
            {t("push.promptLater")}
          </Button>
        </div>
      </div>
    </div>
  );
}
