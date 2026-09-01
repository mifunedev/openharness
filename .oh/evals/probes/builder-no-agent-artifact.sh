#!/usr/bin/env bash
# tier: A
# source: ADR #929 — /builder agent is retired; a reusable role is authored as a skill
# desc: /builder exposes only skill, command, and rule; the agent artifact type and its
#       authoring reference are gone from the canonical builder surface
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILL="$ROOT/.oh/skills/builder/SKILL.md"
REFS="$ROOT/.oh/skills/builder/references"

fail() { echo "REGRESSION: $*" >&2; exit 1; }

[ -f "$SKILL" ] || fail "builder SKILL.md is missing"
[ ! -e "$REFS/agent.md" ] || fail "the retired agent authoring reference is back: references/agent.md"

frontmatter="$(awk '
  NR == 1 && $0 == "---" { inside=1; next }
  inside && $0 == "---" { exit }
  inside { print }
' "$SKILL")"
grep -qxF 'argument-hint: "skill|command|rule <name-or-request>"' <<<"$frontmatter" \
  || fail "builder argument-hint does not advertise exactly skill|command|rule"

grep -qF '| `agent` |' "$SKILL" && fail "builder dispatcher still routes the agent type"
grep -qF 'references/agent.md' "$SKILL" && fail "builder still points at the retired agent reference"
grep -qF 'Usage: /builder <skill|command|rule> <name-or-request>' "$SKILL" \
  || fail "builder usage line still offers the agent type"
grep -qF '`agent` is not an artifact type' "$SKILL" \
  || fail "builder does not state that agent is not an artifact type"

for ref in "$REFS"/*.md; do
  grep -nE '\.(oh|claude|codex|pi)/agents/' "$ref" >/dev/null \
    && fail "builder reference still writes to a project-agent directory: ${ref#"$ROOT/"}"
done

echo "PASS: /builder agent and its authoring reference are retired; only skill|command|rule remain" >&2
