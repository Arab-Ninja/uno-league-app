import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@uno/shared": fileURLToPath(
        new URL("../../packages/shared/src/index.ts", import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
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
    // L'API tourne sur un autre port en développement ; le proxy évite d'avoir
    // à gérer CORS et les cookies inter-origines en local. Depuis un
    // téléphone, c'est lui qui relaie : le navigateur ne joint que Vite.
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
