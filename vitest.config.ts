import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const TEXT_ASSET = /\.(ya?ml|sh)$/;

export default defineConfig({
  plugins: [
    {
      name: "oh-bundled-text-assets",
      enforce: "pre",
      load(id: string) {
        const file = id.split("?")[0];
        if (!TEXT_ASSET.test(file)) return null;
        return `export default ${JSON.stringify(readFileSync(file, "utf8"))};`;
      },
    },
  ],
  test: {
    include: [
      ".oh/scripts/__tests__/**/*.test.ts",
      ".pi/**/__tests__/**/*.test.ts",
      ".oh/cli/**/__tests__/**/*.test.ts",
    ],
    globals: true,
    env: {
      OH_EXECUTION_TARGET: "docker-compose",
    },
  },
});
