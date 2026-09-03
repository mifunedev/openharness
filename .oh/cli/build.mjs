import { build } from "esbuild";
import { readFileSync, chmodSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8"));
const outfile = resolve(__dirname, "dist/oh.js");
const assetRoot = process.env.OH_ASSET_ROOT ?? resolve(__dirname, "../..");

const ohAssetPlugin = {
  name: "oh-asset",
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^oh-asset:/ }, (args) => ({
      path: resolve(assetRoot, args.path.slice("oh-asset:".length)),
      namespace: "oh-asset",
    }));
    pluginBuild.onLoad({ filter: /.*/, namespace: "oh-asset" }, (args) => {
      if (!existsSync(args.path)) {
        throw new Error(
          `bundled asset not found: ${args.path} (asset root ${assetRoot}; set OH_ASSET_ROOT to a directory that mirrors the repository layout)`,
        );
      }
      return { contents: readFileSync(args.path, "utf8"), loader: "text" };
    });
  },
};

await build({
  entryPoints: [resolve(__dirname, "src/cli.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile,
  banner: { js: "#!/usr/bin/env node" },
  plugins: [ohAssetPlugin],
  define: {
    __OH_VERSION__: JSON.stringify(pkg.version),
  },
  logLevel: "info",
});

chmodSync(outfile, 0o755);
