#!/usr/bin/env bash
# tier: A
# source: ADR #929 — durable decisions reuse the existing RFC/ADR issue convention
# desc: /architect points durable decisions at docs/rfcs/, invents no second decision store,
#       and the RFC/ADR index records this ADR
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

SKILL=".oh/skills/architect/SKILL.md"
INDEX="docs/rfcs/README.md"

fail() { echo "REGRESSION: $*" >&2; exit 1; }

[ -f "$SKILL" ] || fail "$SKILL is missing"
[ -f "$INDEX" ] || fail "$INDEX is missing — the RFC/ADR convention is the only decision store"

grep -qF 'docs/rfcs/README.md' "$SKILL" || fail "/architect does not point durable decisions at the RFC/ADR index"
grep -qF 'ADR: <title>' "$SKILL" || fail "/architect does not name the ADR issue-title convention"
grep -qF 'Superseded' "$SKILL" || fail "/architect omits the Draft/Accepted/Superseded lifecycle"
grep -qF 'Do not invent an architecture database' "$SKILL" \
  || fail "/architect does not forbid a second decision store"
grep -qF 'NONE | UPDATE' "$SKILL" || fail "/architect brief omits the Decision Record field"

for store in .oh/decisions .oh/architecture .oh/adr docs/decisions docs/adr .oh/skills/architect/decisions; do
  [ ! -e "$store" ] || fail "a second architecture decision store was created: $store"
done

grep -qF 'Draft' "$INDEX" || fail "$INDEX lost the lifecycle states"
grep -qF 'issues/929' "$INDEX" || fail "$INDEX does not record ADR #929"

echo "PASS: /architect reuses the RFC/ADR issue convention and no second decision store exists" >&2
