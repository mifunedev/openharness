#!/usr/bin/env bash
# Install the reviewed pi-langfuse release with its patched OpenTelemetry dependency.
set -euo pipefail

PI_LANGFUSE_VERSION="1.5.7"
OTEL_SDK_NODE_VERSION="0.220.0"
PI_AGENT_DIR="${PI_AGENT_DIR:-$HOME/.pi/agent}"
NPM_ROOT="$PI_AGENT_DIR/npm"
PACKAGE_JSON="$NPM_ROOT/package.json"

for command_name in pi npm node; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "ERROR: required command not found: $command_name" >&2
    exit 1
  fi
done

mkdir -p "$NPM_ROOT"
if [ ! -f "$PACKAGE_JSON" ]; then
  printf '{\n  "name": "pi-extensions",\n  "private": true\n}\n' > "$PACKAGE_JSON"
  chmod 600 "$PACKAGE_JSON"
fi

printf 'Preloading @opentelemetry/sdk-node@%s override...\n' "$OTEL_SDK_NODE_VERSION"
node - "$PACKAGE_JSON" "$OTEL_SDK_NODE_VERSION" <<'NODE'
const { readFileSync, renameSync, writeFileSync } = require("node:fs");

const [packageJsonPath, otelVersion] = process.argv.slice(2);
const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const overrides = manifest.overrides && typeof manifest.overrides === "object"
  ? manifest.overrides
  : {};
const langfuseOverrides = overrides["pi-langfuse"] && typeof overrides["pi-langfuse"] === "object"
  ? overrides["pi-langfuse"]
  : {};

manifest.overrides = {
  ...overrides,
  "pi-langfuse": {
    ...langfuseOverrides,
    "@opentelemetry/sdk-node": otelVersion,
  },
};

const temporaryPath = `${packageJsonPath}.tmp`;
writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
renameSync(temporaryPath, packageJsonPath);
NODE

printf 'Installing pi-langfuse@%s in user scope...\n' "$PI_LANGFUSE_VERSION"
pi install "npm:pi-langfuse@$PI_LANGFUSE_VERSION"

npm install --prefix "$NPM_ROOT" --omit=dev --legacy-peer-deps
npm audit --prefix "$NPM_ROOT" --audit-level=low

printf 'pi-langfuse@%s installed with a clean npm audit.\n' "$PI_LANGFUSE_VERSION"
