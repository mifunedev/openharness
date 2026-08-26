#!/usr/bin/env bash
# tier: A
# desc: `oh init --yes` provisions headlessly — zero prompts, and a .devcontainer/.example.env byte-identical to the tracked template
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

CLI_DIR="$ROOT/.oh/cli"
TEMPLATE="$ROOT/.oh/templates/.devcontainer/.example.env"

if [[ ! -d "$CLI_DIR" || ! -f "$TEMPLATE" ]]; then
  echo "SKIPPED: oh CLI not present (.oh/cli and/or .oh/templates/.devcontainer/.example.env absent)" >&2
  exit 2
fi
if ! command -v node >/dev/null 2>&1; then
  echo "SKIPPED: node not on PATH — cannot exercise oh init" >&2
  exit 2
fi
if [[ ! -f "$CLI_DIR/dist/oh.js" ]]; then
  echo "SKIPPED: .oh/cli/dist/oh.js not built — run 'cd .oh/cli && npm run build'" >&2
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

  if [[ ! -f "$work/.devcontainer/.example.env" ]]; then
    fails+=("oh init --yes did not seed .devcontainer/.example.env")
  elif ! cmp -s "$work/.devcontainer/.example.env" "$TEMPLATE"; then
    fails+=("oh init --yes wrote a .devcontainer/.example.env that differs from .oh/templates/.devcontainer/.example.env (the --yes path must not edit keys)")
  fi

  if [[ -f "$work/.devcontainer/.env" ]]; then
    fails+=("oh init --yes wrote a .devcontainer/.env (the --yes path has no answers to record)")
  fi
fi

if (( ${#fails[@]} > 0 )); then
  echo "REGRESSION: oh init headless config contract broken:" >&2
  printf '  - %s\n' "${fails[@]}" >&2
  exit 1
fi

echo "PASS: oh init headless config — --yes prompts zero times, seeds a .devcontainer/.example.env byte-identical to the template, and writes no .env" >&2
exit 0
