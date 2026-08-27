#!/usr/bin/env bash
# tier: A
# source: issue #854 — T3-style root identity, glossary, and skill-owned procedures
# desc: AGENTS.md owns product identity and terminology without duplicating workflows or skill catalogs.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
AGENTS="$ROOT/AGENTS.md"

[[ -f "$AGENTS" ]] || { echo "REGRESSION: missing AGENTS.md" >&2; exit 1; }

missing=()
grep -qF '## What Open Harness is' "$AGENTS" || missing+=("product identity section")
grep -qF '## A small glossary' "$AGENTS" || missing+=("glossary section")
grep -qF '**coding harness** means' "$AGENTS" || missing+=("coding harness term")
grep -qF '**agent session** means' "$AGENTS" || missing+=("agent session term")
grep -qF '**control plane** means only the portable `.oh/` machinery' "$AGENTS" || missing+=("control-plane boundary")
grep -qF '### 5. Code is the source of truth' "$AGENTS" || missing+=("code-source-of-truth rule")
grep -qF 'Do not add explanatory comments to tracked code.' "$AGENTS" || missing+=("explanatory-comment prohibition")
grep -qF 'mifunedev/openharness-web' "$AGENTS" || missing+=("public documentation surface")
grep -qE '^## The Workflow$' "$AGENTS" && missing+=("no workflow section")
grep -qE '^## Skills($| )' "$AGENTS" && missing+=("no skills section")
grep -qE '`/[a-z][a-z0-9-]*' "$AGENTS" && missing+=("no direct slash-skill mentions")

if (( ${#missing[@]} )); then
  printf 'REGRESSION: AGENTS identity contract broken: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: AGENTS.md owns product identity, glossary, code truth, and public-doc surfaces without procedure catalogs"
