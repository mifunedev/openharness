#!/usr/bin/env bash
# Install the pinned pi-langfuse fork with the patched OpenTelemetry dependency.
set -euo pipefail

PI_LANGFUSE_VERSION="1.5.9"
PI_LANGFUSE_COMMIT="51a59c854859bbb08a43baad98f0b9eb4a94588c"
PI_LANGFUSE_SOURCE="git+https://github.com/ryaneggz/pi-langfuse.git#${PI_LANGFUSE_COMMIT}"
OTEL_SDK_NODE_VERSION="0.220.0"
PI_AGENT_DIR="${PI_AGENT_DIR:-${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}}"
NPM_ROOT="$PI_AGENT_DIR/npm"
PACKAGE_JSON="$NPM_ROOT/package.json"
PI_LANGFUSE_PACKAGE_ROOT="$NPM_ROOT/node_modules/pi-langfuse"

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

remove_previous_registry_package() {
  local output
  if output=$(PI_CODING_AGENT_DIR="$PI_AGENT_DIR" pi remove "npm:pi-langfuse@$PI_LANGFUSE_VERSION" 2>&1); then
    printf '%s\n' "$output"
    return
  fi

  if [[ "$output" == *"No matching package found"* ]]; then
    printf 'No previous registry pi-langfuse package registration found.\n'
    return
  fi

  printf '%s\n' "$output" >&2
  exit 1
}

printf 'Removing any previous registry pi-langfuse registration...\n'
remove_previous_registry_package

printf 'Configuring pi-langfuse fork %s at %s...\n' "$PI_LANGFUSE_VERSION" "$PI_LANGFUSE_COMMIT"
node - "$PACKAGE_JSON" "$PI_LANGFUSE_SOURCE" "$OTEL_SDK_NODE_VERSION" <<'NODE'
const { readFileSync, renameSync, writeFileSync } = require("node:fs");

const [packageJsonPath, langfuseSource, otelVersion] = process.argv.slice(2);
const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const dependencies = manifest.dependencies && typeof manifest.dependencies === "object"
  ? manifest.dependencies
  : {};
const overrides = manifest.overrides && typeof manifest.overrides === "object"
  ? manifest.overrides
  : {};
const langfuseOverrides = overrides["pi-langfuse"] && typeof overrides["pi-langfuse"] === "object"
  ? overrides["pi-langfuse"]
  : {};

manifest.dependencies = {
  ...dependencies,
  "pi-langfuse": langfuseSource,
};
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

npm install --prefix "$NPM_ROOT" --omit=dev --legacy-peer-deps
node - "$NPM_ROOT/package-lock.json" "$PI_LANGFUSE_PACKAGE_ROOT/package.json" "$PI_LANGFUSE_COMMIT" "$PI_LANGFUSE_VERSION" <<'NODE'
const { readFileSync } = require("node:fs");

const [lockfilePath, packageJsonPath, expectedCommit, expectedVersion] = process.argv.slice(2);
const lockfile = JSON.parse(readFileSync(lockfilePath, "utf8"));
const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const resolved = lockfile.packages?.["node_modules/pi-langfuse"]?.resolved;

if (manifest.name !== "pi-langfuse" || manifest.version !== expectedVersion) {
  throw new Error(`expected pi-langfuse@${expectedVersion}, found ${manifest.name ?? "unknown"}@${manifest.version ?? "unknown"}`);
}
if (typeof resolved !== "string" || !resolved.endsWith(`#${expectedCommit}`)) {
  throw new Error(`npm lockfile does not resolve the reviewed pi-langfuse fork commit ${expectedCommit}`);
}
NODE

PI_CODING_AGENT_DIR="$PI_AGENT_DIR" pi install "$PI_LANGFUSE_PACKAGE_ROOT"
npm audit --prefix "$NPM_ROOT" --audit-level=low

printf 'pi-langfuse@%s from the maintained fork was installed at %s with a clean npm audit.\n' "$PI_LANGFUSE_VERSION" "$PI_LANGFUSE_COMMIT"
