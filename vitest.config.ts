import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/api/tests/**/*.test.ts"],
    environment: "node",
    setupFiles: ["./apps/api/tests/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Les tests d'intégration partagent une base : ils s'exécutent en série
    // pour que les vérifications de concurrence restent maîtrisées.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@uno/shared": new URL("./packages/shared/src/index.ts", import.meta.url)
        .pathname,
    },
  },
});
