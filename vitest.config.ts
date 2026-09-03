import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const ASSET_PREFIX = "oh-asset:";
const repoRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    {
      name: "oh-bundled-text-assets",
      enforce: "pre",
      resolveId(id: string) {
        return id.startsWith(ASSET_PREFIX) ? id : null;
      },
      load(id: string) {
        if (!id.startsWith(ASSET_PREFIX)) return null;
        const assetRoot = process.env.OH_ASSET_ROOT ?? repoRoot;
        const file = resolve(assetRoot, id.slice(ASSET_PREFIX.length));
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
