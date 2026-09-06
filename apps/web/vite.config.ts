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
    // L'API tourne sur un autre port en développement ; le proxy évite d'avoir
    // à gérer CORS et les cookies inter-origines en local.
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
