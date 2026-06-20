#!/usr/bin/env bash
# tier: A
# source: conversation 2026-06-19 (spec-* family split, issue #265)
# desc: the spec-* family (/spec-plan,-critique,-execute,-retro) exists, each is pointed at
#       the tasks/<slug>/ folder interface, names AGENTS.md § The Workflow as its authority,
#       and carries NO loop-style ## Handoff section (a vestige of the executable-loop
#       framework removed in #263; spec-* declares its place with ## Pipeline position)
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SKILLS="$ROOT/.claude/skills"
AGENTS="$ROOT/AGENTS.md"

family=(spec-plan spec-critique spec-execute spec-retro)

# Not applicable when the family is entirely absent (cold runner / pre-merge main).
present=0
for s in "${family[@]}"; do [ -f "$SKILLS/$s/SKILL.md" ] && present=$((present+1)); done
if [ "$present" -eq 0 ]; then
  echo "SKIPPED: spec-* family absent (no .claude/skills/spec-*/SKILL.md)" >&2
  exit 2
fi

missing=()

# (1) all four members must be present once any is (a partial family is a bug).
for s in "${family[@]}"; do
  [ -f "$SKILLS/$s/SKILL.md" ] || missing+=("$s: SKILL.md absent (partial family)")
done

# (2) per-skill contract: folder interface + AGENTS authority + no loop ## Handoff.
for s in "${family[@]}"; do
  f="$SKILLS/$s/SKILL.md"
  [ -f "$f" ] || continue
  grep -qF 'tasks/<slug>/' "$f" || missing+=("$s: does not name the tasks/<slug>/ folder interface")
  grep -qF 'AGENTS.md § The Workflow' "$f" || missing+=("$s: does not cite AGENTS.md § The Workflow as authority")
  # The spec-* family is the canonical workflow. A loop-style '## Handoff' section is a
  # vestige of the executable-loop framework (removed in #263); spec-* skills declare
  # their place with '## Pipeline position' instead.
  grep -qE '^## Handoff' "$f" && missing+=("$s: carries a loop-style ## Handoff section (must use ## Pipeline position)")
done

# (3) the all-in-one composer the family decomposes must still exist (protected monolith).
[ -f "$SKILLS/ship-spec/SKILL.md" ] || missing+=("ship-spec: the all-in-one composer must remain present")

# (4) AGENTS.md § The Workflow must name all four members so an operator can find them.
if [ -f "$AGENTS" ]; then
  section="$(awk '/^## The Workflow/{f=1; print; next} f && /^## /{f=0} f{print}' "$AGENTS")"
  for s in "${family[@]}"; do
    grep -qF "/$s" <<<"$section" || missing+=("AGENTS.md § The Workflow does not name /$s")
  done
else
  missing+=("AGENTS.md absent — cannot verify § The Workflow names the family")
fi

if [ "${#missing[@]}" -gt 0 ]; then
  printf 'REGRESSION: spec-* family contract broken:\n' >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "PASS: spec-* family present, folder-pointed, AGENTS-authored, and free of loop-style ## Handoff sections" >&2
exit 0
