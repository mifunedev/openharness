// Bundle packages/oh/src/cli.ts → dist/oh.js with package.json version inlined.
// `__OH_VERSION__` is replaced at build time so the runtime VERSION constant
// can never drift from what npm/git tags say the package version is.

import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8"));

await build({
  entryPoints: [resolve(__dirname, "src/cli.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: resolve(__dirname, "dist/oh.js"),
  banner: { js: "#!/usr/bin/env node" },
  define: {
    __OH_VERSION__: JSON.stringify(pkg.version),
  },
  logLevel: "info",
});
