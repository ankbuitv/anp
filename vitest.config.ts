import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "packages/**/*.test.ts", "worker/**/*.test.ts"],
    globals: false,
  },
  resolve: {
    alias: {
      "@anp/shared": path.resolve(__dirname, "packages/shared/src/index.ts"),
      "@anp/validation": path.resolve(__dirname, "packages/validation/src/index.ts"),
      "@anp/api-types": path.resolve(__dirname, "packages/api-types/src/index.ts"),
    },
  },
});
