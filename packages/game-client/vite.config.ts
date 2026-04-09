import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@project-god/shared": path.resolve(__dirname, "../shared/src"),
      "@project-god/core-sim": path.resolve(__dirname, "../core-sim/src"),
      "@project-god/agent-runtime": path.resolve(__dirname, "../agent-runtime/src"),
      "@project-god/narrative-runtime": path.resolve(__dirname, "../narrative-runtime/src"),
    },
  },
  root: ".",
  build: { outDir: "dist" },
  server: {
    proxy: {
      "/minimax-api": {
        target: "https://api.minimaxi.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/minimax-api/, ""),
      },
    },
  },
});
