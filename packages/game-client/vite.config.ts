import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@project-god/shared": path.resolve(__dirname, "../shared/src"),
      "@project-god/core-sim": path.resolve(__dirname, "../core-sim/src"),
    },
  },
  root: ".",
  build: { outDir: "dist" },
});
