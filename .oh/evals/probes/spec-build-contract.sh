#!/usr/bin/env bash
# tier: A
# source: .oh/tasks/spec-simplification/ (issue #816, US-002) — one build executor, no toggle
# desc: .oh/scripts/spec-build.sh exists and is executable; the whole-line `STATUS: COMPLETE`
#       sentinel survives on the executor surface; NO executor toggle exists anywhere
#       (--executor / SPEC_EXECUTOR / AUTOPILOT_EXECUTOR are removed, not reduced to a
#       single accepted value); the session-prompt template's ordered anchor keywords appear in
#       its body in the order its own contract header records — the template OWNS that order
#       now, since the advisor prompt pack it was derived from was deleted in US-004; and
#       CLAUDE.md is still a symlink to AGENTS.md.
# shellcheck disable=SC2016
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SPEC_BUILD="$ROOT/.oh/scripts/spec-build.sh"
RUNNER="$ROOT/.oh/scripts/lib/session-runner.sh"
TEMPLATE="$ROOT/.oh/skills/spec/templates/session-prompt.md"
SPEC="$ROOT/.claude/skills/spec/references/execute.md"

missing=()

if [ ! -f "$SPEC_BUILD" ]; then
  missing+=(".oh/scripts/spec-build.sh absent (the build-executor entrypoint is gone)")
elif [ ! -x "$SPEC_BUILD" ]; then
  missing+=(".oh/scripts/spec-build.sh is not executable")
fi

if [ -f "$SPEC_BUILD" ]; then
  grep -Fq 'STATUS: COMPLETE' "$SPEC_BUILD" \
    || missing+=("spec-build.sh does not name the STATUS: COMPLETE sentinel")
fi
if [ -f "$RUNNER" ]; then
  grep -Fq '^STATUS: COMPLETE$' "$RUNNER" \
    || missing+=("session-runner.sh: the whole-line sentinel match ^STATUS: COMPLETE\$ is gone (a substring match would fire on prose)")
fi

if [ -f "$SPEC_BUILD" ]; then
  grep -Fq 'lib/session-runner.sh' "$SPEC_BUILD" \
    || missing+=("spec-build.sh no longer sources .oh/scripts/lib/session-runner.sh (the executor and the ladder have diverged)")
fi

for pair in "spec-execute:$SPEC"; do
  name="${pair%%:*}"
  file="${pair#*:}"
  if [ ! -f "$file" ]; then
    missing+=("$name procedure absent — cannot verify the toggle is gone")
    continue
  fi
  code="$(grep -v '^[[:space:]]*#' "$file")"
  printf '%s\n' "$code" | grep -Fq -- '--executor=' \
    && missing+=("$name still carries an --executor= flag arm (the toggle must be removed, not reduced to one value)")
  printf '%s\n' "$code" | grep -Fq 'SPEC_EXECUTOR' \
    && missing+=("$name still references a SPEC_EXECUTOR toggle")
  printf '%s\n' "$code" | grep -Fq 'AUTOPILOT_EXECUTOR' \
    && missing+=("$name still references AUTOPILOT_EXECUTOR")
done

[ -e "$ROOT/.oh/scripts/ralph.sh" ] \
  && missing+=(".oh/scripts/ralph.sh still exists — the second executor arm must be deleted, not left dormant")

ANCHORS=(
  'dependency graph'
  '/compact'
  'acceptanceCriteria'
  'passes: true'
  '/audit implementation'
  'evidence.md'
  '/retro'
  'Ready PR'
)
if [ ! -f "$TEMPLATE" ]; then
  missing+=(".oh/skills/spec/templates/session-prompt.md absent (the session prompt the executor renders is gone)")
else
  body="$(awk '/END CONTRACT HEADER -->/{f=1; next} f' "$TEMPLATE")"
  if [ -z "$body" ]; then
    missing+=("session-prompt.md: no 'END CONTRACT HEADER -->' marker — the body/header ordering scope cannot be resolved")
  else
    prev_off=-1
    prev_anchor=""
    for a in "${ANCHORS[@]}"; do
      off="$(printf '%s\n' "$body" | grep -Fbo -m1 -e "$a" | head -1 | cut -d: -f1)"
      if [ -z "$off" ]; then
        missing+=("session-prompt.md body: step-order anchor '$a' absent")
        continue
      fi
      if [ "$off" -le "$prev_off" ]; then
        missing+=("session-prompt.md body: step-order anchor '$a' precedes '$prev_anchor' (advisor pack order broken)")
      fi
      prev_off="$off"
      prev_anchor="$a"
    done
  fi
fi

[ -e "$ROOT/.oh/prompts/advisor" ] \
  && missing+=(".oh/prompts/advisor/ is back — the second implementation path was deleted in US-004 and must stay deleted")
[ -e "$ROOT/.pi/prompts/advisor" ] \
  && missing+=(".pi/prompts/advisor/ is back — the Pi mirror of the deleted pack must stay deleted")
if [ -f "$TEMPLATE" ]; then
  grep -Fq 'THIS FILE IS THE SOURCE' "$TEMPLATE" \
    || missing+=("session-prompt.md no longer claims ownership of the step order (it is the source now, not a mirror)")
fi

link="$(readlink "$ROOT/CLAUDE.md" 2>/dev/null)" || link=""
[ "$link" = "AGENTS.md" ] \
  || missing+=("CLAUDE.md is not a symlink to AGENTS.md (readlink printed '${link:-<not a symlink>}')")

if [ "${#missing[@]}" -gt 0 ]; then
  printf 'REGRESSION: build-executor contract broken:\n' >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "PASS: spec-build.sh executable + sentinel intact, no executor toggle anywhere, second arm deleted, session-prompt owns its anchor order, the deleted prompt pack + charter stay deleted, CLAUDE.md->AGENTS.md" >&2
exit 0
