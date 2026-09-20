import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { describeError, trpc } from "@/lib/trpc.js";
import { notificationFeedback, tapFeedback } from "@/lib/native.js";
import { uploadImage } from "@/lib/upload.js";
import { useT } from "@/lib/i18n.js";
import { Screen } from "@/components/layout/index.js";
import { PortraitCapture } from "@/components/photo/portrait-capture.js";
import { Card, ErrorBanner } from "@/components/ui/index.js";

/**
 * Photo de joueur, seconde étape de l'inscription (PHOTO-001).
 *
 * L'étape vient **après** la création du compte, et non pendant : envoyer une
 * image demande une session, et faire dépendre la création d'un compte d'une
 * permission caméra reviendrait à perdre le joueur au premier refus.
 *
 * Elle peut être remise à plus tard. Une carte sans photo reste une carte, et
 * bloquer l'entrée dans l'application sur un téléphone dont la caméra est
 * capricieuse coûterait plus qu'elle ne rapporte — le profil garde le même
 * écran de prise de vue, disponible à tout moment.
 */
export function SignupPhotoStep() {
  const t = useT();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const updateProfile = trpc.players.updateProfile.useMutation();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function keep(file: File) {
    setBusy(true);
    setError(null);
    try {
      const { url } = await uploadImage(file, "avatars");
      await updateProfile.mutateAsync({ profilePhotoUrl: url });
      await utils.players.me.invalidate();
      await utils.players.dashboard.invalidate();
      await notificationFeedback();
      navigate("/", { replace: true });
    } catch (caught) {
      setError(describeError(caught).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={t("signup.photoTitle")} withTabBar={false}>
      <div className="space-y-4">
        <Card className="flex items-start gap-3">
          <ShieldCheck
            className="mt-0.5 size-4 shrink-0 text-accent"
            aria-hidden
          />
          <p className="text-xs leading-relaxed text-muted">
            {t("signup.photoPrivacy")}
          </p>
        </Card>

        {error && <ErrorBanner message={error} />}

        <PortraitCapture
          onAccepted={keep}
          busy={busy}
          acceptLabel={t("signup.photoAccept")}
        />

        <button
          type="button"
          onClick={() => {
            void tapFeedback();
            navigate("/", { replace: true });
          }}
          className="mx-auto block text-xs font-medium text-muted hover:text-foreground"
        >
          {t("signup.photoLater")}
        </button>
      </div>
    </Screen>
  );
}
