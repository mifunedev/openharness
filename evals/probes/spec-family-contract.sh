#!/usr/bin/env bash
# tier: A
# source: conversation 2026-06-19 (spec-* family split, issue #265); consolidated into /spec dispatcher 2026-06-23 (one skill, args)
# desc: the canonical decomposed workflow is the single /spec dispatcher
#       (.claude/skills/spec/SKILL.md) routing plan|critique|execute|retro to
#       references/{plan,critique,execute,retro}.md; the legacy split spec-* skill dirs are
#       gone; each procedure (and the dispatcher) is pointed at the tasks/<slug>/ folder
#       interface, names AGENTS.md § The Workflow as its authority, and carries NO loop-style
#       ## Handoff section (a vestige of the executable-loop framework removed in #263; the
#       /spec nodes declare their place with ## Pipeline position); AGENTS.md § The Workflow
#       names each /spec <sub> invocation; the all-in-one /ship-spec composer remains present.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SKILLS="$ROOT/.claude/skills"
SPEC="$SKILLS/spec"
AGENTS="$ROOT/AGENTS.md"

subs=(plan critique execute retro)

# Not applicable when the /spec dispatcher is absent (cold runner / pre-merge main).
if [ ! -f "$SPEC/SKILL.md" ]; then
  echo "SKIPPED: /spec dispatcher absent (no .claude/skills/spec/SKILL.md)" >&2
  exit 2
fi

missing=()

# (0) the legacy split skills must be gone (consolidation invariant — one surface, not two).
for s in spec-plan spec-critique spec-execute spec-retro; do
  [ -e "$SKILLS/$s" ] && missing+=("$s: legacy split skill still present (must be consolidated into /spec)")
done

# (1) all four subcommand procedures must exist under references/ (a partial family is a bug).
for s in "${subs[@]}"; do
  [ -f "$SPEC/references/$s.md" ] || missing+=("references/$s.md absent (partial /spec family)")
done

# (2) per-surface contract: folder interface + AGENTS authority + no loop ## Handoff.
for f in "$SPEC/SKILL.md" "$SPEC/references"/plan.md "$SPEC/references"/critique.md \
         "$SPEC/references"/execute.md "$SPEC/references"/retro.md; do
  [ -f "$f" ] || continue
  rel="${f#"$ROOT"/}"
  grep -qF 'tasks/<slug>/' "$f" || missing+=("$rel: does not name the tasks/<slug>/ folder interface")
  grep -qF 'AGENTS.md § The Workflow' "$f" || missing+=("$rel: does not cite AGENTS.md § The Workflow as authority")
  # The /spec dispatcher is the canonical workflow. A loop-style '## Handoff' section is a
  # vestige of the executable-loop framework (removed in #263); /spec declares its place with
  # '## Pipeline position' instead.
  grep -qE '^## Handoff' "$f" && missing+=("$rel: carries a loop-style ## Handoff section (must use ## Pipeline position)")
done

# (3) the all-in-one composer the family decomposes must still exist (protected monolith).
[ -f "$SKILLS/ship-spec/SKILL.md" ] || missing+=("ship-spec: the all-in-one composer must remain present")

# (4) AGENTS.md § The Workflow must name each /spec <sub> invocation so an operator can find it.
if [ -f "$AGENTS" ]; then
  section="$(awk '/^## The Workflow/{f=1; print; next} f && /^## /{f=0} f{print}' "$AGENTS")"
  for s in "${subs[@]}"; do
    grep -qF "/spec $s" <<<"$section" || missing+=("AGENTS.md § The Workflow does not name /spec $s")
  done
else
  missing+=("AGENTS.md absent — cannot verify § The Workflow names the family")
fi

if [ "${#missing[@]}" -gt 0 ]; then
  printf 'REGRESSION: /spec dispatcher contract broken:\n' >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "PASS: /spec dispatcher present, four procedures folder-pointed + AGENTS-authored, no loop ## Handoff, legacy split gone, ship-spec intact" >&2
exit 0
