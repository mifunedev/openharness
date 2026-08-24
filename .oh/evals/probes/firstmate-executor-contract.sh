#!/usr/bin/env bash
# tier: A
# source: .oh/tasks/spec-simplification/ (issue #816, US-002) — one build executor, no toggle
# desc: .oh/scripts/firstmate.sh exists and is executable; the whole-line `STATUS: COMPLETE`
#       sentinel survives on the executor surface; NO executor toggle exists anywhere
#       (--executor / SHIP_SPEC_EXECUTOR / AUTOPILOT_EXECUTOR are removed, not reduced to a
#       single accepted value); the session-prompt template's ordered anchor keywords keep the
#       advisor prompt pack's relative step order while .oh/prompts/ stays zero-diff; and
#       CLAUDE.md is still a symlink to AGENTS.md.
#
# The `| tee` launch pipe is deliberately NOT asserted here — it was REMOVED in US-002
# because it takes the child's TTY away and an interactive agent session cannot run
# without a terminal. Asserting its survival would pin that defect in place. Its absence
# is asserted by `executor-launch-interactive.sh` instead.
#
# The single-quoted grep patterns below are pinned LITERALS — the dollar signs are part of
# the text being searched for, not expansions this file wants performed.
# shellcheck disable=SC2016
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
FIRSTMATE="$ROOT/.oh/scripts/firstmate.sh"
RUNNER="$ROOT/.oh/scripts/lib/session-runner.sh"
TEMPLATE="$ROOT/.oh/skills/firstmate/templates/session-prompt.md"
SHIP="$ROOT/.claude/skills/ship-spec/SKILL.md"
AUTOPILOT="$ROOT/.claude/skills/autopilot/SKILL.md"

# No SKIPPED path: this probe ships in the same commit as the executor it pins, so a missing
# artifact is a REGRESSION rather than a not-applicable run.
missing=()

# --- (1) the executor entrypoint exists and is executable -------------------
if [ ! -f "$FIRSTMATE" ]; then
  missing+=(".oh/scripts/firstmate.sh absent (the build-executor entrypoint is gone)")
elif [ ! -x "$FIRSTMATE" ]; then
  missing+=(".oh/scripts/firstmate.sh is not executable")
fi

# --- (2) the invariant terminal interface -----------------------------------
# The build terminates on the WHOLE LINE `STATUS: COMPLETE` in progress.txt.
if [ -f "$FIRSTMATE" ]; then
  grep -Fq 'STATUS: COMPLETE' "$FIRSTMATE" \
    || missing+=("firstmate.sh does not name the STATUS: COMPLETE sentinel")
fi
if [ -f "$RUNNER" ]; then
  grep -Fq '^STATUS: COMPLETE$' "$RUNNER" \
    || missing+=("session-runner.sh: the whole-line sentinel match ^STATUS: COMPLETE\$ is gone (a substring match would fire on prose)")
fi

# The entrypoint must actually reach the shared ladder, or the assertions above pin
# files that no longer form one surface.
if [ -f "$FIRSTMATE" ]; then
  grep -Fq 'lib/session-runner.sh' "$FIRSTMATE" \
    || missing+=("firstmate.sh no longer sources .oh/scripts/lib/session-runner.sh (the executor and the ladder have diverged)")
fi

# --- (3) NO executor toggle survives, anywhere ------------------------------
# US-002 removed the toggles rather than reducing them to one accepted value: a
# single-value toggle is still a selection surface a reader must resolve. Full-line
# comments are excluded so a file may DOCUMENT the removal without failing this check.
# `--executor` is matched with a leading `--` guard so words like "executor" in prose
# stay legal; the point is that no *flag* or env var selects a build arm.
for pair in "ship-spec:$SHIP" "autopilot:$AUTOPILOT"; do
  name="${pair%%:*}"
  file="${pair#*:}"
  if [ ! -f "$file" ]; then
    missing+=("$name SKILL.md absent — cannot verify the toggle is gone")
    continue
  fi
  code="$(grep -v '^[[:space:]]*#' "$file")"
  printf '%s\n' "$code" | grep -Fq -- '--executor=' \
    && missing+=("$name still carries an --executor= flag arm (the toggle must be removed, not reduced to one value)")
  printf '%s\n' "$code" | grep -Fq 'SHIP_SPEC_EXECUTOR' \
    && missing+=("$name still references SHIP_SPEC_EXECUTOR")
  printf '%s\n' "$code" | grep -Fq 'AUTOPILOT_EXECUTOR' \
    && missing+=("$name still references AUTOPILOT_EXECUTOR")
done

# The build arms the toggle used to select must be gone from the repo, not merely
# unreferenced by the two skills above.
[ -e "$ROOT/.oh/scripts/ralph.sh" ] \
  && missing+=(".oh/scripts/ralph.sh still exists — the second executor arm must be deleted, not left dormant")

# --- (4) step-order equivalence, asserted MECHANICALLY ----------------------
# The ordered anchor-keyword list below was derived at authoring time from
# .oh/prompts/advisor/implement.yml and .oh/prompts/advisor/pr.yml and is recorded verbatim
# in the session-prompt template's own contract header. "Equivalence" means exactly this:
# these anchors appear in the template BODY in the same relative order, compared by first
# occurrence. Nothing fuzzy, no markdown-vs-YAML similarity judgement.
#
# ORDERING SCOPE IS BODY-ONLY. The header records the list in the asserted order, so
# including it would make this check vacuous; the template ends its header with the literal
# `END CONTRACT HEADER -->` marker for exactly this reason.
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
  missing+=(".oh/skills/firstmate/templates/session-prompt.md absent (the session prompt the executor renders is gone)")
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

# --- (5) .oh/prompts/ is untouched — the template is a derivative, not an edit
if git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  git -C "$ROOT" diff --quiet -- .oh/prompts/ \
    || missing+=(".oh/prompts/ has uncommitted changes — the session-prompt template must derive from the advisor pack, never edit it")
else
  missing+=("not a git repository at $ROOT — cannot verify .oh/prompts/ is zero-diff")
fi

# --- (6) CLAUDE.md is still a symlink to AGENTS.md -------------------------
# A severed alias (an independently written CLAUDE.md) must surface as a REGRESSION rather
# than silently passing a diff that happens to be empty at write time.
link="$(readlink "$ROOT/CLAUDE.md" 2>/dev/null)" || link=""
[ "$link" = "AGENTS.md" ] \
  || missing+=("CLAUDE.md is not a symlink to AGENTS.md (readlink printed '${link:-<not a symlink>}')")

if [ "${#missing[@]}" -gt 0 ]; then
  printf 'REGRESSION: build-executor contract broken:\n' >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "PASS: firstmate.sh executable + sentinel intact, no executor toggle anywhere, second arm deleted, session-prompt anchors in advisor-pack order, .oh/prompts/ zero-diff, CLAUDE.md->AGENTS.md" >&2
exit 0
