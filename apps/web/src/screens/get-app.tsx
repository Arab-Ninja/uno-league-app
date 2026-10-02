import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { LoadingState } from "@/components/ui/index.js";
import { StoreButtons } from "@/components/domain/store-buttons.js";
import { GradientBackdrop } from "@/components/layout/index.js";
import { useT } from "@/lib/i18n.js";
import { isNative } from "@/lib/native.js";
import { detectPlatform, storeUrlFor } from "@/lib/stores.js";

/**
 * `unoleague.be/app` : le lien unique à partager.
 *
 * Mis en bio Instagram ou TikTok, il envoie chacun vers son store — Android
 * vers Google Play, iPhone vers l'App Store une fois l'application publiée.
 * Sans store pour l'appareil (ordinateur, iPhone pour l'instant), le
 * visiteur arrive sur la page d'accueil, qui porte les boutons des stores et
 * l'accès à l'application web.
 */
export function GetAppScreen() {
  const t = useT();
  const url = isNative ? null : storeUrlFor(detectPlatform());

  useEffect(() => {
    // `replace` : le retour arrière ne ramène pas sur cette page de passage,
    // qui renverrait aussitôt vers le store.
    if (url) window.location.replace(url);
  }, [url]);

  if (!url) return <Navigate to="/" replace />;

  return (
    <GradientBackdrop>
      <div className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col items-center justify-center px-6">
        <LoadingState label={t("stores.redirecting")} />
        {/* Au cas où le navigateur intégré d'un réseau social bloquerait la
            redirection : le lien reste là, à toucher. */}
        <StoreButtons />
      </div>
    </GradientBackdrop>
  );
}
