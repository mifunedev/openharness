#!/usr/bin/env bash
# tier: A
# source: conversation 2026-06-19 (spec-* family split, issue #265); consolidated into /spec dispatcher 2026-06-23 (one skill, args);
#         critique/approve gate removed 2026-08-23 (spec-simplification US-001)
# desc: the canonical decomposed workflow is the single /spec dispatcher
#       (.claude/skills/spec/SKILL.md) routing plan|execute|retro to
#       references/{plan,execute,retro}.md; the legacy split spec-* skill dirs are
#       gone, and so are the retired critique/approve surfaces (the fourth
#       reference-doc must NOT come back); each procedure (and the dispatcher) is
#       pointed at the .oh/tasks/<slug>/ folder interface, names AGENTS.md § The
#       Workflow as its authority, and carries NO loop-style ## Handoff section (a
#       vestige of the executable-loop framework removed in #263; the /spec nodes
#       declare their place with ## Pipeline position); AGENTS.md § The Workflow
#       names each /spec <sub> invocation; and there is NO all-in-one composer beside the
#       dispatcher — /ship-spec was absorbed into references/execute.md and deleted
#       (spec-simplification US-003), so execute.md must carry the build mechanics itself.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILLS="$ROOT/.claude/skills"
SPEC="$SKILLS/spec"
AGENTS="$ROOT/AGENTS.md"

subs=(plan execute retro)
retired_subs=(critique)

if [ ! -f "$SPEC/SKILL.md" ]; then
  echo "SKIPPED: /spec dispatcher absent (no .claude/skills/spec/SKILL.md)" >&2
  exit 2
fi

missing=()

for s in spec-plan spec-critique spec-execute spec-retro; do
  [ -e "$SKILLS/$s" ] && missing+=("$s: legacy split skill still present (must be consolidated into /spec)")
done

for s in "${subs[@]}"; do
  [ -f "$SPEC/references/$s.md" ] || missing+=("references/$s.md absent (partial /spec family)")
done

for s in "${retired_subs[@]}"; do
  [ -e "$SPEC/references/$s.md" ] && missing+=("references/$s.md present (the $s node was retired — /spec dispatches exactly ${#subs[@]} subcommands)")
  [ -e "$SKILLS/$s" ] && missing+=("$s: retired skill directory still present (.claude/skills/$s)")
  grep -qE "^\s*plan\|.*\b$s\b|\b$s\|" "$SPEC/SKILL.md" && missing+=("SKILL.md still dispatches the retired '$s' subcommand")
done
[ -e "$SKILLS/approve" ] && missing+=("approve: retired skill directory still present (.claude/skills/approve)")

for f in "$SPEC/SKILL.md" "$SPEC/references"/plan.md \
         "$SPEC/references"/execute.md "$SPEC/references"/retro.md; do
  [ -f "$f" ] || continue
  rel="${f#"$ROOT"/}"
  grep -qF '.oh/tasks/<slug>/' "$f" || missing+=("$rel: does not name the .oh/tasks/<slug>/ folder interface")
  grep -qF 'AGENTS.md § The Workflow' "$f" || missing+=("$rel: does not cite AGENTS.md § The Workflow as authority")
  grep -qE '^## Handoff' "$f" && missing+=("$rel: carries a loop-style ## Handoff section (must use ## Pipeline position)")
done

[ -e "$SKILLS/ship-spec" ] && missing+=("ship-spec: the all-in-one composer must be absorbed and deleted, not left beside /spec")
EXEC="$SPEC/references/execute.md"
if [ -f "$EXEC" ]; then
  grep -qF 'reuses those by reference' "$EXEC" && missing+=("execute.md still defers its build mechanics by reference instead of holding them")
  grep -qF 'single source of build literals' "$EXEC" && missing+=("execute.md still names another skill as the single source of build literals")
  for literal in 'gh pr create' 'gh pr ready' 'gh issue' 'git push' 'spec-build.sh' '/audit pr' '/eval'; do
    grep -qF "$literal" "$EXEC" || missing+=("execute.md does not carry the build literal '$literal'")
  done
fi

if [ -f "$AGENTS" ]; then
  section="$(awk '/^## The Workflow/{f=1; print; next} f && /^## /{f=0} f{print}' "$AGENTS")"
  for s in "${subs[@]}"; do
    grep -qF "/spec $s" <<<"$section" || missing+=("AGENTS.md § The Workflow does not name /spec $s")
  done
  for s in "${retired_subs[@]}"; do
    grep -qF "/spec $s" <<<"$section" && missing+=("AGENTS.md § The Workflow still names the retired /spec $s node")
  done
else
  missing+=("AGENTS.md absent — cannot verify § The Workflow names the family")
fi

if [ "${#missing[@]}" -gt 0 ]; then
  printf 'REGRESSION: /spec dispatcher contract broken:\n' >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "PASS: /spec dispatcher present, three procedures folder-pointed + AGENTS-authored, no loop ## Handoff, legacy split gone, retired critique/approve gate absent, no all-in-one composer beside it, execute.md carries the build literals" >&2
exit 0
