#!/usr/bin/env bash
# tier: A
# source: .oh/tasks/firstmate-executor/ (issue #746) — the opt-in firstmate build executor is additive to ralph and shares its terminal interface
# desc: .oh/scripts/firstmate.sh exists and is executable; the whole-line `STATUS: COMPLETE`
#       sentinel and the `| tee` launch pipe survive on the executor surface; BOTH executor
#       toggles (SHIP_SPEC_EXECUTOR and AUTOPILOT_EXECUTOR) carry a firstmate arm AND a ralph
#       arm with ralph still the ship-spec default; the session-prompt template's ordered
#       anchor keywords keep the advisor prompt pack's relative step order while .oh/prompts/
#       stays zero-diff; CLAUDE.md is still a symlink to AGENTS.md; and .oh/scripts/ralph.sh
#       still exists — the default executor is retained indefinitely, never replaced.
#
# The single-quoted grep patterns below are pinned LITERALS — the dollar signs are part of
# the text being searched for, not expansions this file wants performed.
# shellcheck disable=SC2016
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
FIRSTMATE="$ROOT/.oh/scripts/firstmate.sh"
RUNNER="$ROOT/.oh/scripts/lib/session-runner.sh"
RALPH="$ROOT/.oh/scripts/ralph.sh"
TEMPLATE="$ROOT/.oh/skills/firstmate/templates/session-prompt.md"
SHIP="$ROOT/.claude/skills/ship-spec/SKILL.md"
AUTOPILOT="$ROOT/.claude/skills/autopilot/SKILL.md"

# No SKIPPED path: this probe ships in the same commit as the executor it pins, so a missing
# artifact is a REGRESSION rather than a not-applicable run. That is the point of assertion (7).
missing=()

# --- (1) the executor entrypoint exists and is executable -------------------
if [ ! -f "$FIRSTMATE" ]; then
  missing+=(".oh/scripts/firstmate.sh absent (the firstmate executor entrypoint is gone)")
elif [ ! -x "$FIRSTMATE" ]; then
  missing+=(".oh/scripts/firstmate.sh is not executable")
fi

# --- (2) the invariant terminal interface + the logging pipe ----------------
# All three executors terminate on the same sentinel: the WHOLE LINE
# `STATUS: COMPLETE` in .oh/tasks/<slug>/progress.txt.
if [ -f "$FIRSTMATE" ]; then
  grep -Fq 'STATUS: COMPLETE' "$FIRSTMATE" \
    || missing+=("firstmate.sh does not name the STATUS: COMPLETE sentinel")
fi
if [ -f "$RUNNER" ]; then
  grep -Fq '^STATUS: COMPLETE$' "$RUNNER" \
    || missing+=("session-runner.sh: the whole-line sentinel match ^STATUS: COMPLETE\$ is gone (a substring match would fire on prose)")
fi

# The `| tee` pipe lives in the shared session-runner library that firstmate.sh sources —
# every launch branch pipes 2>&1 into the per-slug log. Accept it anywhere on the executor
# surface (entrypoint OR library) so a future refactor that moves the launch is not a
# false regression, but require it on at least one of the two.
#
# Full-line comments are excluded: both files DOCUMENT the pipe in their headers, so a
# whole-file grep would stay green after the actual pipe was deleted.
tee_found=0
for f in "$FIRSTMATE" "$RUNNER"; do
  [ -f "$f" ] || continue
  grep -v '^[[:space:]]*#' "$f" | grep -Fq '| tee' && tee_found=1
done
[ "$tee_found" -eq 1 ] \
  || missing+=("the | tee launch pipe is absent from both firstmate.sh and lib/session-runner.sh (sessions would run unlogged)")

# The entrypoint must actually reach the shared ladder, or the two assertions above pin
# files that no longer form one surface.
if [ -f "$FIRSTMATE" ]; then
  grep -Fq 'lib/session-runner.sh' "$FIRSTMATE" \
    || missing+=("firstmate.sh no longer sources .oh/scripts/lib/session-runner.sh (the executor and the ladder have diverged)")
fi

# --- (3) BOTH executor toggles carry a firstmate arm AND a ralph arm --------
if [ ! -f "$SHIP" ]; then
  missing+=(".claude/skills/ship-spec/SKILL.md absent — cannot verify the SHIP_SPEC_EXECUTOR toggle")
else
  grep -Fq '*--executor=firstmate*) SHIP_SPEC_EXECUTOR=firstmate' "$SHIP" \
    || missing+=("ship-spec: no *--executor=firstmate*) SHIP_SPEC_EXECUTOR=firstmate case arm")
  grep -Fq '*--executor=ralph*) SHIP_SPEC_EXECUTOR=ralph' "$SHIP" \
    || missing+=("ship-spec: the *--executor=ralph*) SHIP_SPEC_EXECUTOR=ralph case arm is gone")
  # ralph stays the DEFAULT — the firstmate arm is opt-in, never a flip.
  grep -Fxq 'SHIP_SPEC_EXECUTOR="${SHIP_SPEC_EXECUTOR:-ralph}"' "$SHIP" \
    || missing+=("ship-spec: the ralph default line SHIP_SPEC_EXECUTOR=\${SHIP_SPEC_EXECUTOR:-ralph} is not byte-identical")
  ship_case="$(grep -F 'case "$SHIP_SPEC_EXECUTOR" in' "$SHIP" | head -1)"
  for arm in ralph firstmate; do
    printf '%s\n' "$ship_case" | grep -Fq "$arm" \
      || missing+=("ship-spec: the SHIP_SPEC_EXECUTOR validation list does not accept '$arm'")
  done
fi

if [ ! -f "$AUTOPILOT" ]; then
  missing+=(".claude/skills/autopilot/SKILL.md absent — cannot verify the AUTOPILOT_EXECUTOR toggle")
else
  grep -Fq '*--executor=firstmate*) EXECUTOR=firstmate' "$AUTOPILOT" \
    || missing+=("autopilot: no *--executor=firstmate*) EXECUTOR=firstmate case arm")
  grep -Fq '*--executor=ralph*) EXECUTOR=ralph' "$AUTOPILOT" \
    || missing+=("autopilot: the *--executor=ralph*) EXECUTOR=ralph case arm is gone")
  ap_case="$(grep -F 'case "$EXECUTOR" in' "$AUTOPILOT" | head -1)"
  for arm in ralph firstmate; do
    printf '%s\n' "$ap_case" | grep -Fq "$arm" \
      || missing+=("autopilot: the AUTOPILOT_EXECUTOR validation list does not accept '$arm' (EXECUTOR=$arm would fail hard)")
  done
fi

# --- (4) step-order equivalence, asserted MECHANICALLY ----------------------
# The ordered anchor-keyword list below was derived at authoring time from
# .oh/prompts/advisor/implement.yml and .oh/prompts/advisor/pr.yml and is recorded verbatim
# in the session-prompt template's own contract header (US-002). "Equivalence" means exactly
# this: these anchors appear in the template BODY in the same relative order, compared by
# first occurrence. Nothing fuzzy, no markdown-vs-YAML similarity judgement.
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

# --- (7) ralph.sh still exists — the regression tripwire -------------------
# firstmate is an ADDITIVE third executor. If ralph.sh is ever deleted this probe must go
# red rather than quietly reporting a green firstmate contract over a broken default.
[ -f "$RALPH" ] \
  || missing+=(".oh/scripts/ralph.sh absent — ralph is the DEFAULT executor and is retained indefinitely")

if [ "${#missing[@]}" -gt 0 ]; then
  printf 'REGRESSION: firstmate executor contract broken:\n' >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "PASS: firstmate.sh executable + sentinel/tee intact, both executor toggles carry firstmate+ralph arms, session-prompt anchors in advisor-pack order, .oh/prompts/ zero-diff, CLAUDE.md->AGENTS.md, ralph.sh retained" >&2
exit 0
