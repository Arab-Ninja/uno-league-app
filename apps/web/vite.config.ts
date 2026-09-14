import { fileURLToPath, URL } from "node:url";
import basicSsl from "@vitejs/plugin-basic-ssl";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * HTTPS en développement, à la demande (DEV-002).
 *
 * La caméra — comme la géolocalisation ou les notifications — n'est offerte
 * par les navigateurs que dans un **contexte sécurisé**. `localhost` en est
 * un ; `http://192.168.1.42:5173`, non. Sans TLS, l'écran de photo est donc
 * inutilisable depuis un téléphone du réseau local, alors que c'est
 * précisément là qu'on veut l'essayer.
 *
 * Le certificat est auto-signé : le téléphone affiche un avertissement qu'il
 * faut accepter une fois. C'est le prix d'un HTTPS sans autorité de
 * certification, et cela reste préférable à une fonctionnalité qu'on ne peut
 * pas tester avant la mise en ligne.
 */
const httpsDev = process.env["VITE_DEV_HTTPS"] === "1";

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(httpsDev ? [basicSsl()] : [])],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@uno/shared": fileURLToPath(
        new URL("../../packages/shared/src/index.ts", import.meta.url),
      ),
    },
  },
  server: {
    port: Number(process.env["WEB_PORT"] ?? 5173),
    /**
     * En mode téléphone, le port ne doit pas glisser.
     *
     * Vite prend le port suivant quand le sien est occupé — commodité qui
     * devient un piège ici : l'adresse annoncée au téléphone et l'adresse
     * publique des photos envoyées sont calculées d'avance. Un décalage
     * silencieux donne une page qui ne charge pas et des images cassées.
     * Mieux vaut refuser de démarrer et le dire.
     */
    strictPort: httpsDev,
    /**
     * Hôtes autorisés à joindre le serveur de développement (DEV-001).
     *
     * Vite refuse par défaut une requête dont l'en-tête `Host` est un nom de
     * domaine inconnu — une protection contre la reliaison DNS. Les adresses
     * IP restent acceptées, si bien qu'un téléphone du même Wi-Fi passe sans
     * réglage. Un tunnel HTTPS, lui, arrive sous un nom : d'où cette
     * variable, à renseigner seulement pour ce cas.
     *
     *     VITE_ALLOWED_HOSTS=.trycloudflare.com pnpm dev:mobile
     */
    allowedHosts: (process.env["VITE_ALLOWED_HOSTS"] ?? "")
      .split(",")
      .map((host) => host.trim())
      .filter(Boolean),
    /**
     * L'API tourne sur un autre port en développement ; le proxy évite d'avoir
     * à gérer CORS et les cookies inter-origines en local. Depuis un
     * téléphone, c'est lui qui relaie : le navigateur ne joint que Vite.
     *
     * En HTTPS, ce relais devient indispensable pour une seconde raison : une
     * page servie en HTTPS ne peut pas appeler une API en HTTP. Le navigateur
     * bloque le mélange, sans message lisible.
     */
    proxy: {
      "/trpc": { target: "http://localhost:4000", changeOrigin: true },
      "/uploads": { target: "http://localhost:4000", changeOrigin: true },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        // Le socle React et la couche de données changent rarement : les
        // isoler garde leur cache valide entre deux déploiements applicatifs.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/node_modules\/(react|react-dom|react-router|scheduler)\//.test(id)) {
            return "react";
          }
          if (/node_modules\/(@trpc|@tanstack|superjson)\//.test(id)) {
            return "data";
          }
          return undefined;
        },
      },
    },
  },
});
