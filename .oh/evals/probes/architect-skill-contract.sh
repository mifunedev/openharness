#!/usr/bin/env bash
# tier: A
# source: ADR #929 — skills are the role primitive; /architect is a skill, not an agent
# desc: /architect exists as an inline skill with the significance/grounding/brief contract,
#       runs in the active session, and requires no separate agent process or definition file
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILL="$ROOT/.oh/skills/architect/SKILL.md"

fail() { echo "REGRESSION: $*" >&2; exit 1; }

[ -f "$SKILL" ] || fail "/architect is not a skill: .oh/skills/architect/SKILL.md is missing"
[ -f "$ROOT/.claude/skills/architect/SKILL.md" ] || fail "/architect does not resolve through the Claude provider surface"

frontmatter="$(awk '
  NR == 1 && $0 == "---" { inside=1; next }
  inside && $0 == "---" { exit }
  inside { print }
' "$SKILL")"
[ -n "$frontmatter" ] || fail "architect SKILL.md lacks YAML frontmatter"
grep -qxF 'name: architect' <<<"$frontmatter" || fail "architect frontmatter name is not exact"
grep -qF 'TRIGGER when:' <<<"$frontmatter" || fail "architect description omits TRIGGER guidance"

grep -qE '^context:' <<<"$frontmatter" && fail "/architect must run inline — no context: fork in frontmatter"
grep -qE '^allowed-tools:' <<<"$frontmatter" || fail "architect omits an allowed-tools boundary"
grep -qE '^allowed-tools:.*\b(Write|Edit)\b' <<<"$frontmatter" \
  && fail "/architect is read-oriented and must not claim Write/Edit — it does not implement"

for marker in \
  'Run **inline in the active coding-agent session**' \
  'Do not fork the context' \
  'Do not create an `architect` agent definition' ; do
  grep -qF "$marker" "$SKILL" || fail "architect execution model omits: $marker"
done

for section in \
  '## 1. Classify' \
  '## 2. Ground the decision' \
  '## 3. Decide' \
  '## 4. Record durable decisions' \
  '## 5. Output' ; do
  grep -qxF "$section" "$SKILL" || fail "architect contract omits section: $section"
done

grep -qF 'ARCHITECTURAL | NOT-ARCHITECTURAL' "$SKILL" || fail "architect omits the significance classification"
grep -qF 'NOT-ARCHITECTURAL' "$SKILL" || fail "architect omits the non-architectural bypass"
grep -qF '/spec plan' "$SKILL" || fail "architect does not route ordinary work to /spec plan"
grep -qF 'AGENTS.md' "$SKILL" || fail "architect grounding omits applicable repository instructions"
grep -qF 'docs/rfcs/README.md' "$SKILL" || fail "architect grounding omits the RFC/ADR index"

for field in \
  '## Architecture Brief' \
  '### Classification' \
  '### Current State' \
  '### Decision Drivers' \
  '### Invariants' \
  '### Options Considered' \
  '### Recommendation' \
  '### Tradeoffs / Consequences' \
  '### Retirement / Consolidation' \
  '### Migration / Sequencing' \
  '### Validation' \
  '### Non-Goals' \
  '### Decision Record' ; do
  grep -qF "$field" "$SKILL" || fail "Architecture Brief template omits: $field"
done

for stray in "$ROOT/.oh/agents/architect.md" "$ROOT/.claude/agents/architect.md" "$ROOT/.codex/agents/architect.md"; do
  [ ! -e "$stray" ] || fail "/architect was reintroduced as a project agent: ${stray#"$ROOT/"}"
done

echo "PASS: /architect is an inline skill with the classification, grounding, and Architecture Brief contract" >&2
