import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@anp/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
      "@anp/validation": path.resolve(__dirname, "../../packages/validation/src/index.ts"),
      "@anp/api-types": path.resolve(__dirname, "../../packages/api-types/src/index.ts"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    emptyOutDir: true,
  },
});
