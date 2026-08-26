#!/usr/bin/env bash
# tier: A
# desc: `oh init --yes` provisions headlessly — zero prompts, and a harness.yaml byte-identical to the tracked template
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

CLI_DIR="$ROOT/.oh/cli"
TEMPLATE="$ROOT/.oh/templates/harness.yaml"

# SKIPPED (exit 2): the CLI or its build output is not present on this branch.
if [[ ! -d "$CLI_DIR" || ! -f "$TEMPLATE" ]]; then
  echo "SKIPPED: oh CLI not present (.oh/cli and/or .oh/templates/harness.yaml absent)" >&2
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

# CI provisioning and cron runs have no TTY and must never block on a prompt.
# `--yes` is the contract: the wizard is skipped entirely, so the seeded
# harness.yaml is the untouched template. A future wizard expansion that leaks a
# prompt into the --yes path, or that writes a key before the user answers, is a
# provisioning outage — this probe is the tripwire.
set +e
out="$(cd "$work" && node "$CLI_DIR/dist/oh.js" init --yes </dev/null 2>&1)"
rc=$?
set -e

if (( rc != 0 )); then
  fails+=("oh init --yes exited $rc (headless provisioning must succeed): ${out%%$'\n'*}")
else
  # Any wizard prompt reaching stdout/stderr under --yes is a regression.
  if grep -qiE 'Configure your harness|\[y/N\]|\[Y/n\]|blank to skip' <<<"$out"; then
    fails+=("oh init --yes emitted a wizard prompt (must be non-interactive)")
  fi

  if [[ ! -f "$work/harness.yaml" ]]; then
    fails+=("oh init --yes did not seed harness.yaml")
  elif ! cmp -s "$work/harness.yaml" "$TEMPLATE"; then
    fails+=("oh init --yes wrote a harness.yaml that differs from .oh/templates/harness.yaml (the --yes path must not edit keys)")
  fi
fi

if (( ${#fails[@]} > 0 )); then
  echo "REGRESSION: oh init headless config contract broken:" >&2
  printf '  - %s\n' "${fails[@]}" >&2
  exit 1
fi

echo "PASS: oh init headless config — --yes prompts zero times and seeds a harness.yaml byte-identical to the template" >&2
exit 0
