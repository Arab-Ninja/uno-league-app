import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Empaquetage iOS / Android (App Store et Google Play).
 *
 * L'application web est chargée depuis les fichiers embarqués dans le binaire
 * (`webDir`), pas depuis une URL distante : Apple refuse les applications qui
 * ne sont qu'une coquille autour d'un site web.
 *
 * Le serveur d'API est joint via HTTPS ; `androidScheme: "https"` évite que
 * les requêtes soient traitées comme non sécurisées par le WebView Android.
 */
const config: CapacitorConfig = {
  appId: "app.unoleague.mobile",
  appName: "UNO League",
  webDir: "dist",
  android: {
    backgroundColor: "#0F172A",
  },
  ios: {
    backgroundColor: "#0F172A",
    contentInset: "always",
  },
  server: {
    androidScheme: "https",
  },
  plugins: {
    /**
     * Mises à jour à chaud (Capgo).
     *
     * Le contenu web est embarqué dans le binaire ; sans ce mécanisme, la
     * moindre correction de texte imposerait une republication et une revue
     * Apple de un à trois jours. Le plugin télécharge la nouvelle version au
     * lancement et l'applique au suivant.
     *
     * Ce que cela **ne** couvre pas : tout ce qui est natif — nouveau plugin,
     * icône, permissions, version minimale d'OS. Ces changements-là passent
     * toujours par les stores.
     *
     * Apple et Google l'autorisent explicitement tant que l'application ne
     * change pas de nature ni de fonction principale (App Store Review
     * Guidelines 3.3.2, Google Play Device and Network Abuse).
     *
     * L'application s'identifie auprès de Capgo par son `appId` — celui de
     * `CapacitorConfig` ci-dessus. Aucune clé n'est embarquée dans le
     * binaire : la clé d'API ne sert qu'à *téléverser* les bundles depuis un
     * poste de travail (`docs/DEPLOIEMENT.md`, section Capgo).
     */
    CapacitorUpdater: {
      autoUpdate: true,
      // Le canal que suit une installation qui n'en a pas choisi d'autre.
      // Il doit exister chez Capgo, sinon le plugin cherche une mise à jour
      // sur un canal vide et n'en trouve jamais.
      defaultChannel: "production",
      // La version installée sert de repère au serveur de mise à jour.
      version: process.env["npm_package_version"] ?? "1.0.0",
      // L'utilisateur ne perd jamais une session en cours : la nouvelle
      // version s'applique au prochain démarrage, pas en plein écran.
      directUpdate: false,
      // Si la nouvelle version plante au démarrage, le plugin revient
      // automatiquement à la précédente. Sans ce garde-fou, une mise à jour
      // ratée rendrait l'application inutilisable jusqu'à une republication.
      resetWhenUpdate: true,
      appReadyTimeout: 10_000,
    },
    SplashScreen: {
      backgroundColor: "#0F172A",
      showSpinner: false,
      launchAutoHide: true,
    },
    Keyboard: {
      resize: "native",
    },
  },
};

export default config;
