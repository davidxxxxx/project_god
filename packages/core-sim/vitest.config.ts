import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@project-god/shared": path.resolve(__dirname, "../shared/src"),
      "@project-god/agent-runtime": path.resolve(__dirname, "../agent-runtime/src"),
    },
  },
  test: {
    include: ["__tests__/**/*.test.ts"],
  },
});
