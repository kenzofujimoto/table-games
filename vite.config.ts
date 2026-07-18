import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: [
        "api/**",
        "src/**/*.tsx",
        "src/app/**",
        "src/multiplayer/repository-factory.ts",
        "server/blob-snapshot-archive.ts",
        "server/redis-online-store.ts",
        "server/*-factory.ts",
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 80,
        statements: 90,
        "src/game/application/**": {
          lines: 95,
          functions: 95,
          branches: 75,
          statements: 90,
        },
        "src/game/domain/**": {
          lines: 95,
          functions: 94,
          branches: 85,
          statements: 95,
        },
        "server/**": {
          lines: 90,
          functions: 90,
          branches: 65,
          statements: 85,
        },
        "src/multiplayer/**": {
          lines: 88,
          functions: 85,
          branches: 70,
          statements: 85,
        },
      },
    },
  },
});
