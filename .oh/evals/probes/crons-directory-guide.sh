#!/usr/bin/env bash
# tier: A
# source: issue #874
# desc: crons/ carries its operating contract as AGENTS.md, because a cron body
#       is an agent prompt executed unattended rather than prose a human reads.
#       The guide must be present, must document the frontmatter contract and
#       the reload rules that decide when an edit takes effect, and must itself
#       be inert — the runtime's predicate must never schedule it as a cron.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
GUIDE="$ROOT/crons/AGENTS.md"

if [[ ! -f "$GUIDE" ]]; then
  echo "REGRESSION: crons/ has no AGENTS.md operating contract" >&2
  exit 1
fi

if [[ -f "$ROOT/crons/README.md" ]]; then
  echo "REGRESSION: crons/README.md is back — the contract must live in exactly one file" >&2
  exit 1
fi

ALIAS="$ROOT/crons/CLAUDE.md"
if [[ ! -L "$ALIAS" ]]; then
  echo "REGRESSION: crons/CLAUDE.md must be a provider-compatibility symlink, not a copy" >&2
  exit 1
fi
if [[ "$(readlink "$ALIAS")" != "AGENTS.md" ]]; then
  echo "REGRESSION: crons/CLAUDE.md must point at the sibling AGENTS.md, got: $(readlink "$ALIAS")" >&2
  exit 1
fi

if [[ "$(head -c 3 "$GUIDE")" == "---" ]]; then
  echo "REGRESSION: crons/AGENTS.md opens with frontmatter; the runtime would try to schedule the guide" >&2
  exit 1
fi

for token in "## Editing a cron" "SIGHUP" "BODY_RELOADED" "enabled: false" "CRONS_DIR"; do
  if ! grep -Fq "$token" "$GUIDE"; then
    echo "REGRESSION: crons/AGENTS.md does not document: $token" >&2
    exit 1
  fi
done

if ! grep -Fq '`.oh/scripts/cron-runtime.ts`' "$GUIDE"; then
  echo "REGRESSION: crons/AGENTS.md does not point at the runtime implementation" >&2
  exit 1
fi

echo "PASS: crons/AGENTS.md is the single cron operating contract, carries its CLAUDE.md symlink, documents the reload rules, and is inert to the scheduler" >&2
exit 0
