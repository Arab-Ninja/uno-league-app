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
