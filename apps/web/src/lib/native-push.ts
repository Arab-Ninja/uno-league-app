import { useEffect, useRef } from "react";
import { useNavigate, type NavigateFunction } from "react-router-dom";
import { PushNotifications } from "@capacitor/push-notifications";
import type { PluginListenerHandle } from "@capacitor/core";
import { trpc } from "./trpc.js";
import { isNative, notificationFeedback } from "./native.js";
import { devicePlatform, rememberFcmToken, storedFcmToken } from "./push.js";

/**
 * Ce que l'application empaquetée fait des notifications qu'elle reçoit
 * (ANN-006).
 *
 * S'abonner ne suffit pas : une fois le message arrivé, trois choses doivent
 * se produire, et aucune ne se produisait.
 *
 * **1. Au premier plan, rien ne s'affichait.** Android ne dépose pas dans la
 * barre d'état un message reçu pendant que l'application est ouverte : il le
 * remet à l'application, qui décide. Sans personne pour l'écouter, la
 * notification disparaissait — le joueur devant l'écran était le seul à ne
 * rien apprendre. On rafraîchit donc les données affichées, ce qui est la
 * forme utile de l'information quand l'écran est déjà sous les yeux.
 *
 * **2. Un appui n'emmenait nulle part.** Le message porte l'adresse à ouvrir
 * — `/sessions/12`, `/admin` —, mais l'application s'ouvrait sur l'écran
 * qu'on avait quitté. Une notification de paiement qui n'ouvre pas la page de
 * paiement rate sa cible ; c'est le plus dommageable des trois.
 *
 * **3. Un jeton renouvelé n'était jamais transmis.** Google en change
 * périodiquement, et à chaque fois le serveur gardait l'ancien : l'appareil
 * cessait de recevoir, sans que rien ne le signale, ni au joueur ni à la
 * ligue. C'est le défaut qui se manifeste des semaines plus tard, par un
 * « je ne reçois plus rien » impossible à relier à quoi que ce soit.
 */

/** Un chemin interne, et rien d'autre : une notification ne navigue pas ailleurs. */
function internalPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // `//ailleurs.test` est une URL protocol-relative : elle sortirait de
  // l'application tout en ressemblant à un chemin.
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

export function useNativePush(): void {
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  /*
   * Les écouteurs se posent **une seule fois**, à l'ouverture. Les rattacher à
   * chaque rendu les ferait manquer un message arrivé entre-temps, et poser
   * deux fois le même ferait naviguer deux fois sur un seul appui. Les
   * fonctions dont ils ont besoin passent donc par des références, dont la
   * valeur suit les rendus sans relancer l'effet.
   */
  const navigateRef = useRef<NavigateFunction>(navigate);
  const utilsRef = useRef(utils);
  navigateRef.current = navigate;
  utilsRef.current = utils;

  useEffect(() => {
    if (!isNative) return;

    let cancelled = false;
    const handles: PluginListenerHandle[] = [];

    /**
     * Un jeton vient d'arriver.
     *
     * Deux cas seulement méritent une écriture : c'est le même qu'avant, on ne
     * fait rien ; il n'y en avait aucun, c'est un premier abonnement et
     * l'écran de réglage s'en charge — lui seul sait que le joueur vient de
     * l'accorder. Reste le renouvellement, qui est la raison d'être de cette
     * fonction.
     *
     * Le nouveau jeton est enregistré **avant** que l'ancien ne soit retiré :
     * dans l'autre sens, une panne de réseau entre les deux laisserait
     * l'appareil injoignable.
     */
    async function onToken(value: string): Promise<void> {
      const previous = await storedFcmToken();
      if (!previous || previous === value) return;

      await utilsRef.current.client.players.subscribePush.mutate({
        transport: "fcm",
        token: value,
        platform: devicePlatform(),
      });
      await rememberFcmToken(value);
      await utilsRef.current.client.players.unsubscribePush.mutate({
        handle: previous,
      });
    }

    void (async () => {
      handles.push(
        await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          (action) => {
            const path = internalPath(action.notification.data?.["url"]);
            if (path) navigateRef.current(path);
          },
        ),
      );

      handles.push(
        await PushNotifications.addListener("pushNotificationReceived", () => {
          void notificationFeedback();
          // L'écran ouvert montre peut-être exactement ce qui vient de
          // changer : une séance qui bascule, une place à régler, un solde.
          void utilsRef.current.invalidate();
        }),
      );

      handles.push(
        await PushNotifications.addListener("registration", (token) => {
          void onToken(token.value).catch(() => {
            /*
             * Sans session ouverte, l'appel est refusé — c'est attendu, et le
             * prochain démarrage réessaiera. Une erreur ici ne doit pas
             * remonter : personne n'a rien demandé.
             */
          });
        }),
      );

      /*
       * Et l'on redemande un enregistrement **uniquement** si cet appareil
       * était déjà abonné. Sans jeton retenu, `register()` déclencherait la
       * demande de permission système au premier lancement, avant que le
       * joueur n'ait rien demandé : la manière la plus sûre de se la faire
       * refuser pour de bon.
       */
      const known = await storedFcmToken();
      if (known && !cancelled) await PushNotifications.register();
    })();

    return () => {
      cancelled = true;
      for (const handle of handles) void handle.remove();
    };
  }, []);
}
