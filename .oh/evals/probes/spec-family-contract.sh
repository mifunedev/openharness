#!/usr/bin/env bash
# tier: A
# source: issue #265; spec-simplification issue #816; workflow authority issue #854;
#         repo-knowledge-loop issue #926
# desc: /spec owns the workflow — plan, execute, and a retro wrapper, with an approved
#       plan path as the default entry — and execute.md carries the complete build.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILLS="$ROOT/.claude/skills"
SPEC="$SKILLS/spec"
AGENTS="$ROOT/AGENTS.md"

subs=(plan execute retro)
# `ship` owned no mechanics of its own; the approved-plan path replaced it (#926).
retired_subs=(critique ship)

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
  if [ "$f" != "$SPEC/SKILL.md" ]; then
    grep -qF '.oh/skills/spec/SKILL.md' "$f" || missing+=("$rel: does not cite the /spec skill as authority")
  fi
  grep -qE '^## Handoff' "$f" && missing+=("$rel: carries a loop-style ## Handoff section (must use ## Pipeline position)")
done

[ -e "$SKILLS/ship-spec" ] && missing+=("ship-spec: the all-in-one composer must be absorbed and deleted, not left beside /spec")
# retro is a wrapper, not a second engine: it must own no retro mechanics.
RETRO="$SPEC/references/retro.md"
if [ -f "$RETRO" ]; then
  grep -qF '/retro --task' "$RETRO" \
    || missing+=("references/retro.md does not delegate to the task-scoped /retro form")
  grep -qE '^## Hypotheses|^\| ID \| Subsystem' "$RETRO" \
    && missing+=("references/retro.md carries a second retro ontology instead of delegating")
fi
# The dispatcher must route an unrecognized first token to the approved-plan path.
grep -qF 'plan|execute|retro)' "$SPEC/SKILL.md" \
  || missing+=("SKILL.md dispatch case does not name all three nodes")
grep -qE 'DEFAULT: an approved plan path' "$SPEC/SKILL.md" \
  || missing+=("SKILL.md no longer routes an unrecognized first token to the approved-plan path (a plan path would print usage)")
EXEC="$SPEC/references/execute.md"
if [ -f "$EXEC" ]; then
  grep -qF 'reuses those by reference' "$EXEC" && missing+=("execute.md still defers its build mechanics by reference instead of holding them")
  grep -qF 'single source of build literals' "$EXEC" && missing+=("execute.md still names another skill as the single source of build literals")
  for literal in 'gh pr create' 'gh pr ready' 'gh issue' 'git push' '/delegate' '/audit pr' '/eval'; do
    grep -qF "$literal" "$EXEC" || missing+=("execute.md does not carry the build literal '$literal'")
  done
fi

for s in "${subs[@]}"; do
  pattern=$(printf '| `%s` |' "$s")
  grep -qF "$pattern" "$SPEC/SKILL.md" || missing+=("/spec skill does not name the '$s' subcommand")
done
for s in "${retired_subs[@]}"; do
  pattern=$(printf '| `%s` |' "$s")
  grep -qF "$pattern" "$SPEC/SKILL.md" && missing+=("/spec skill still names the retired '$s' node")
done
if [ -f "$AGENTS" ]; then
  grep -qE '^## The Workflow$' "$AGENTS" && missing+=("AGENTS.md still duplicates the /spec workflow")
  grep -qE '^## Skills($| )' "$AGENTS" && missing+=("AGENTS.md still duplicates the skill catalog")
fi

if [ "${#missing[@]}" -gt 0 ]; then
  printf 'REGRESSION: /spec dispatcher contract broken:\n' >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "PASS: /spec owns the workflow, dispatches plan/execute/retro with an approved plan path as the default, carries no loop ## Handoff, keeps retired surfaces absent, and holds the build literals" >&2
exit 0
