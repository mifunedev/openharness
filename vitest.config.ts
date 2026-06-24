import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "scripts/__tests__/**/*.test.ts",
      ".pi/**/__tests__/**/*.test.ts",
      ".oh/cli/**/__tests__/**/*.test.ts",
    ],
    globals: true,
  },
});
