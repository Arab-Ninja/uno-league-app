/**
 * Service worker : réception des notifications push (ANN-004).
 *
 * Ce fichier tourne hors de la page, dans un contexte séparé que le navigateur
 * réveille même quand l'application est fermée. Il ne contient donc **aucune
 * logique métier** : il affiche ce que le serveur envoie, et ouvre le lien au
 * clic. Toute règle mise ici serait invisible depuis l'application et
 * impossible à tester avec elle.
 *
 * Il n'intercepte délibérément aucune requête réseau. Un cache hors ligne mal
 * réglé sert des données périmées — un solde, une place, un classement — ce
 * qui est pire que pas de cache du tout. L'application affiche déjà ses états
 * de chargement et son bandeau hors ligne.
 */

self.addEventListener("install", () => {
  // La nouvelle version prend la main sans attendre la fermeture des onglets.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "UNO League", body: event.data.text() };
  }

  const title = payload.title || "UNO League";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    // Une seconde notification de même étiquette remplace la première : un
    // rappel de paiement répété ne remplit pas le centre de notifications.
    tag: payload.tag || undefined,
    data: { url: payload.url || "/" },
    // Vibration courte : perceptible sans être agressive.
    vibrate: [80, 40, 80],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Si l'application est déjà ouverte, on la remet au premier plan et on
      // la navigue : ouvrir un second onglet perdrait l'état en cours.
      for (const client of windows) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      }

      await self.clients.openWindow(target);
    })(),
  );
});
