import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@project-god/shared": path.resolve(__dirname, "../shared/src"),
    },
  },
  test: {
    include: ["__tests__/**/*.test.ts"],
  },
});
