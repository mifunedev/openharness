#!/usr/bin/env bash
# tier: A
# desc: `oh init --yes` provisions headlessly — zero prompts, a default oh.json, a root .env.example byte-identical to the tracked template, and no secrets dotenv
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

CLI_DIR="$ROOT/.oh/cli"
TEMPLATE="$ROOT/.oh/templates/.env.example"

if [[ ! -d "$CLI_DIR" || ! -f "$TEMPLATE" ]]; then
  echo "SKIPPED: oh CLI not present (.oh/cli and/or .oh/templates/.env.example absent)" >&2
  exit 2
fi
if ! command -v node >/dev/null 2>&1; then
  echo "SKIPPED: node not on PATH — cannot exercise oh init" >&2
  exit 2
fi
if [[ ! -f "$CLI_DIR/dist/oh.js" ]]; then
  echo "SKIPPED: .oh/cli/dist/oh.js not built — run 'cd .oh/cli && node build.mjs'" >&2
  exit 2
fi

fails=()

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

set +e
out="$(cd "$work" && node "$CLI_DIR/dist/oh.js" init --yes </dev/null 2>&1)"
rc=$?
set -e

if (( rc != 0 )); then
  fails+=("oh init --yes exited $rc (headless provisioning must succeed): ${out%%$'\n'*}")
else
  if grep -qiE 'Configure your harness|\[y/N\]|\[Y/n\]|blank to skip' <<<"$out"; then
    fails+=("oh init --yes emitted a wizard prompt (must be non-interactive)")
  fi

  if [[ ! -f "$work/oh.json" ]]; then
    fails+=("oh init --yes did not write oh.json (every non-secret setting lives there)")
  elif command -v node >/dev/null 2>&1; then
    node -e '
      const fs = require("node:fs");
      const c = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      if (c.version !== 1) { console.error("oh.json version is not 1"); process.exit(1); }
      for (const k of ["name", "timezone", "install", "access", "image"]) {
        if (c[k] === undefined) { console.error(`oh.json is missing the ${k} section`); process.exit(1); }
      }
    ' "$work/oh.json" 2>"$work/jsonerr" \
      || fails+=("oh init --yes wrote an oh.json that is not a valid default config: $(grep -m1 -E "oh\.json|SyntaxError" "$work/jsonerr" || head -1 "$work/jsonerr")")
  fi

  if [[ ! -f "$work/.env.example" ]]; then
    fails+=("oh init --yes did not seed the root .env.example")
  elif ! cmp -s "$work/.env.example" "$TEMPLATE"; then
    fails+=("oh init --yes wrote a .env.example that differs from .oh/templates/.env.example (the --yes path must not edit keys)")
  fi

  if [[ -f "$work/.env" ]]; then
    fails+=("oh init --yes wrote a root .env (the --yes path has no secrets to record)")
  fi

  if [[ -e "$work/.devcontainer/.example.env" ]]; then
    fails+=("oh init --yes seeded the retired .devcontainer/.example.env")
  fi

  if [[ -e "$work/.devcontainer/.env" && ! -L "$work/.devcontainer/.env" ]]; then
    fails+=(".devcontainer/.env must be a symlink to ../.env, not a real file")
  fi
fi

if (( ${#fails[@]} > 0 )); then
  echo "REGRESSION: oh init headless config contract broken:" >&2
  printf '  - %s\n' "${fails[@]}" >&2
  exit 1
fi

echo "PASS: oh init headless config — --yes prompts zero times, writes a default oh.json, seeds a root .env.example byte-identical to the template, and creates no secrets dotenv" >&2
exit 0
