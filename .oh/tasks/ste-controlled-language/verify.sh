#!/usr/bin/env bash
# verify.sh — assert every acceptance criterion for issue #750.
#
# Every checker assertion compares the exit code and fails this script on a
# mismatch. Nothing here prints an exit code without acting on it.
#
# Exit 0 when every check passes. Exit 1 when any check fails.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT" || exit 1

SKILL=.oh/skills/ste
CHECK="$SKILL/scripts/ste-check.sh"
FAILURES=0

pass() { printf '  PASS  %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1" >&2; FAILURES=$((FAILURES + 1)); }
head2() { printf '\n== %s\n' "$1"; }

expect_eq() { # label actual expected
  if [ "$2" = "$3" ]; then pass "$1 = $2"; else fail "$1 = $2, expected $3"; fi
}
expect_ge() { # label actual minimum
  if [ "$2" -ge "$3" ] 2>/dev/null; then pass "$1 = $2 (min $3)"; else fail "$1 = $2, expected at least $3"; fi
}
expect_rc() { # label expected-rc command...
  local label="$1" want="$2"; shift 2
  "$@" >/dev/null 2>&1
  local got=$?
  if [ "$got" -eq "$want" ]; then pass "$label -> rc=$got"; else fail "$label -> rc=$got, expected $want"; fi
}

# --------------------------------------------------------------------------
head2 "US-004  checker script"
[ -f "$CHECK" ] && pass "$CHECK exists" || fail "$CHECK missing"
[ -x "$CHECK" ] && pass "$CHECK is executable" || fail "$CHECK is not executable"
expect_rc "bash -n $CHECK" 0 bash -n "$CHECK"
command grep -q '^set -euo pipefail$' "$CHECK" && pass "sets -euo pipefail" || fail "missing set -euo pipefail"
command grep -q 'BASH_SOURCE\[0\]' "$CHECK" && pass "self-locating" || fail "not self-locating"
if command grep -q 'CLAUDE_SKILL_DIR' "$CHECK"; then fail "reads CLAUDE_SKILL_DIR"; else pass "no CLAUDE_SKILL_DIR"; fi
expect_rc "no arguments" 2 bash "$CHECK"
expect_rc "unknown option" 2 bash "$CHECK" --nope README.md
expect_rc "missing file" 2 bash "$CHECK" /nonexistent/ste-fixture.md
expect_rc "directory argument" 2 bash "$CHECK" "$SKILL"
expect_rc "bad --max-words" 2 bash "$CHECK" --max-words abc "$SKILL/SKILL.md"

# The four fail-open shapes the PR audit on #751 found. Each exited 0 while
# scanning little or nothing. A linter that passes by reading nothing is worse
# than no linter, because the green exit is read as proof.
FIX=$(mktemp -d); trap 'rm -rf "$FIX"' EXIT
printf 'Intro.\n\n```bash\ncode\nThe runner basically utilizes things.\n' > "$FIX/unclosed.md"
expect_rc "unclosed fence must not exempt the rest of the file" 1 bash "$CHECK" "$FIX/unclosed.md"
# The checker exits 1 here by design; pipefail would otherwise mask the grep.
{ bash "$CHECK" "$FIX/unclosed.md" 2>/dev/null || true; } | command grep -q ' FENCE ' \
  && pass "unclosed fence reports a FENCE finding" || fail "unclosed fence is not reported"
printf -- '---\nThe runner basically utilizes things.\nMore prose that basically utilizes things.\n' > "$FIX/rule.md"
expect_rc "a leading horizontal rule is not frontmatter" 1 bash "$CHECK" "$FIX/rule.md"
printf -- '---\nname: x\ndescription: The thing is basically processed\n---\n\nRun the command.\n' > "$FIX/front.md"
expect_rc "real frontmatter is still skipped" 0 bash "$CHECK" "$FIX/front.md"
printf '~~~text\ncode\n```\nThe runner basically utilizes things.\n~~~\n' > "$FIX/mixed.md"
expect_rc "a backtick line must not close a tilde fence" 0 bash "$CHECK" "$FIX/mixed.md"
expect_rc "an unknown --blocks tag must not pass vacuously" 2 bash "$CHECK" --blocks nosuchtag "$SKILL/references/examples.md"
expect_rc "an empty --blocks tag is a usage error" 2 bash "$CHECK" --blocks '' "$SKILL/references/examples.md"
printf 'The data is processed by the worker.\n' > "$FIX/passive.md"
expect_rc "PASSIVE fires on a real passive clause" 1 bash "$CHECK" "$FIX/passive.md"
printf 'The measured value is indeed correct.\nThe disk is speed limited.\n' > "$FIX/nonverb.md"
expect_rc "PASSIVE stays silent on non-participles ending in ed" 0 bash "$CHECK" "$FIX/nonverb.md"
printf 'Read the guide at www.example.com/things/various for more.\n' > "$FIX/url.md"
expect_rc "a bare hostname is stripped before matching" 0 bash "$CHECK" "$FIX/url.md"

# The probe that keeps every assertion above enforced after merge.
PROBE=.oh/evals/probes/ste-checker-contract.sh
[ -x "$PROBE" ] && pass "$PROBE is executable" || fail "$PROBE missing or not executable"
expect_rc "the checker-contract probe passes" 0 bash "$PROBE"

# The checker must not write to the file it scans.
BEFORE_SUM=$(md5sum "$SKILL/references/examples.md" | cut -d' ' -f1)
bash "$CHECK" --blocks before "$SKILL/references/examples.md" >/dev/null 2>&1
AFTER_SUM=$(md5sum "$SKILL/references/examples.md" | cut -d' ' -f1)
expect_eq "examples.md unchanged by a scan" "$AFTER_SUM" "$BEFORE_SUM"

# --------------------------------------------------------------------------
head2 "US-001  references/rules.md"
expect_eq "rules.md '## ' headings" "$(command grep -c '^## ' "$SKILL/references/rules.md")" 10
expect_eq "rules.md '### ' rules"    "$(command grep -c '^### ' "$SKILL/references/rules.md")" 53
expect_rc "checker on rules.md" 0 bash "$CHECK" "$SKILL/references/rules.md"

head2 "US-002  references/dictionary.md"
expect_ge "dictionary.md entry rows" "$(command grep -c '^| `' "$SKILL/references/dictionary.md")" 150
for claim in 'Not the ASD-STE100 controlled dictionary' \
             'Software documentation only' \
             'Authored from software-documentation practice' \
             'no ASD-STE100 certification'; do
  command grep -qiF "$claim" "$SKILL/references/dictionary.md" \
    && pass "dictionary states: $claim" || fail "dictionary omits: $claim"
done
# Every word in both mapped columns must be backticked. That is what lets the
# file name a banned word and still pass its own checker.
BADROW=$(command grep -n '^| ' "$SKILL/references/dictionary.md" \
  | command grep -vE '^[0-9]+:\| (Do not use|-+)' \
  | command grep -vE '^[0-9]+:\|---' \
  | command grep -vE '^[0-9]+:\| `[^`]+` \| `[^`]+`' | head -5)
if [ -z "$BADROW" ]; then pass "every entry row backticks both word columns"; else fail "unbackticked rows: $BADROW"; fi
expect_rc "checker on dictionary.md" 0 bash "$CHECK" "$SKILL/references/dictionary.md"

head2 "US-003  references/examples.md"
BEF=$(command grep -c '^```text before$' "$SKILL/references/examples.md")
AFT=$(command grep -c '^```text after$'  "$SKILL/references/examples.md")
expect_ge "before fences" "$BEF" 20
expect_eq "after fences match before" "$AFT" "$BEF"
expect_ge "distinct **Domain:** labels" \
  "$(command grep -o '^\*\*Domain:\*\* .*' "$SKILL/references/examples.md" | sort -u | wc -l)" 13
command grep -q '^\*\*Condition:\*\*' "$SKILL/references/examples.md" \
  && pass "pronoun-conditional pair states its condition" || fail "no **Condition:** line"
command grep -q '^\*\*Placeholder:\*\*' "$SKILL/references/examples.md" \
  && pass "preserved-ambiguity pair states its placeholder" || fail "no **Placeholder:** line"
command grep -q '<duration>' "$SKILL/references/examples.md" \
  && pass "placeholder <duration> present, not an invented value" || fail "no <duration> placeholder"

expect_rc "checker on examples.md (narrative)"  0 bash "$CHECK" "$SKILL/references/examples.md"
expect_rc "checker --blocks after (must pass)"  0 bash "$CHECK" --blocks after  "$SKILL/references/examples.md"
expect_rc "checker --blocks before (must FAIL)" 1 bash "$CHECK" --blocks before "$SKILL/references/examples.md"

# The before blocks are the regression fixture: every detector class must fire.
FOUND=$(bash "$CHECK" --blocks before "$SKILL/references/examples.md" 2>/dev/null | awk '{print $2}' | sort -u)
for cls in HEDGE VAGUE PASSIVE LONG COMPOUND WORD; do
  printf '%s\n' "$FOUND" | command grep -qx "$cls" \
    && pass "detector $cls fires on the fixture" || fail "detector $cls never fires"
done

# --------------------------------------------------------------------------
head2 "US-005  SKILL.md"
LINES=$(wc -l < "$SKILL/SKILL.md")
if [ "$LINES" -lt 500 ]; then pass "SKILL.md = $LINES lines (< 500)"; else fail "SKILL.md = $LINES lines, cap 500"; fi
command grep -q '^## Memory Protocol$' "$SKILL/SKILL.md" \
  && pass "'## Memory Protocol' heading" || fail "no '## Memory Protocol' heading"
command grep -qE '^## (Guidelines|Important Notes|Reference)$' "$SKILL/SKILL.md" \
  && pass "'## Reference' class heading" || fail "no Guidelines/Important Notes/Reference heading"
for claim in 'no ASD-STE100 certification' 'no complete standards' 'asd-ste100.org'; do
  command grep -qiF "$claim" "$SKILL/SKILL.md" && pass "SKILL.md states: $claim" || fail "SKILL.md omits: $claim"
done
for frag in 'CONDITION → ACTOR → ACTION → OBJECT → EXPECTED RESULT' \
            'Precedence over' 'Rewrite mode' 'Authoring mode' 'Never invent a missing value'; do
  command grep -qF "$frag" "$SKILL/SKILL.md" && pass "SKILL.md states: $frag" || fail "SKILL.md omits: $frag"
done
for link in 'references/rules.md' 'references/dictionary.md' 'references/examples.md' 'scripts/ste-check.sh'; do
  command grep -qF "$link" "$SKILL/SKILL.md" && pass "SKILL.md links $link" || fail "SKILL.md omits $link"
done
# Frontmatter allow-list: name, description, allowed-tools, compatibility, license, metadata.
BADKEYS=$(awk 'NR==1&&$0=="---"{f=1;next} f&&$0=="---"{exit} f&&/^[a-zA-Z][a-zA-Z0-9_-]*:/{sub(/:.*/,"");print}' "$SKILL/SKILL.md" \
  | command grep -vE '^(name|description|allowed-tools|compatibility|license|metadata)$')
if [ -z "$BADKEYS" ]; then pass "frontmatter keys inside the allow-list"; else fail "frontmatter keys outside allow-list: $BADKEYS"; fi
expect_rc "checker on SKILL.md (self-application)" 0 bash "$CHECK" "$SKILL/SKILL.md"

# --------------------------------------------------------------------------
head2 "authoring conventions"
for f in "$SKILL"/references/*.md; do
  n=$(wc -l < "$f")
  if [ "$n" -le 100 ] || command grep -q '^## Contents$' "$f"; then
    pass "$(basename "$f") ($n lines) has '## Contents' or is short"
  else
    fail "$(basename "$f") ($n lines) lacks '## Contents'"
  fi
done
XLINK=$(command grep -nE '(rules|dictionary|examples)\.md' "$SKILL"/references/*.md \
  | awk -F: -v OFS=: '{ base=$1; sub(/.*\//,"",base); if (index($0, base)==0 || $0 !~ base) print }' \
  | command grep -vE '^[^:]*/(rules|dictionary|examples)\.md:[0-9]+:.*') || true
if [ -z "$XLINK" ]; then pass "no reference-to-reference cross-links"; else fail "cross-links found: $XLINK"; fi

# --------------------------------------------------------------------------
head2 "legacy reference tokens"
# Read the pattern from the probe itself so this check never drifts from it,
# and so the literal tokens never appear in this file.
PAT=$(sed -n "s/^pat='\(.*\)'$/\1/p" .oh/evals/probes/audit-stale-references.sh | head -1)
if [ -z "$PAT" ]; then
  fail "could not read the legacy-token pattern from the probe"
else
  HITS=$(git grep -nE "$PAT" -- .oh/skills/ste .oh/tasks/ste-controlled-language 2>/dev/null)
  if [ -z "$HITS" ]; then pass "no legacy tokens in the new files"; else fail "legacy tokens: $HITS"; fi
fi

# --------------------------------------------------------------------------
head2 "US-006  wiring"
command grep -q '^| `/ste` |' AGENTS.md && pass "AGENTS.md holds the /ste row" || fail "AGENTS.md has no /ste row"
expect_eq "AGENTS.md /ste rows" "$(command grep -c '^| `/ste` |' AGENTS.md)" 1
awk '/^## \[Unreleased\]/{u=1} u&&/^### Added/{a=1;next} a&&/^## \[/{exit} a&&/openharness\/issues\/750/{found=1} END{exit !found}' CHANGELOG.md \
  && pass "CHANGELOG '### Added' links issue 750" || fail "CHANGELOG '### Added' does not link issue 750"

# --------------------------------------------------------------------------
head2 "US-007  remote routing guard"
if git rev-parse --verify -q upstream/development >/dev/null 2>&1; then
  BASE=upstream/development
elif git rev-parse --verify -q FETCH_HEAD >/dev/null 2>&1; then
  BASE=FETCH_HEAD
else
  BASE=""
fi
if [ -n "$BASE" ]; then
  DIFF=$(git diff --name-only "$BASE...HEAD" 2>/dev/null)
  if printf '%s\n' "$DIFF" | command grep -q '^\.oh/memory/'; then
    fail "branch diff carries .oh/memory/ paths"
  else
    pass "branch diff carries no .oh/memory/ path"
  fi
  if printf '%s\n' "$DIFF" | command grep -q '^\.oh/evals/RESULTS\.md$'; then
    fail "branch diff carries .oh/evals/RESULTS.md"
  else
    pass "branch diff carries no .oh/evals/RESULTS.md"
  fi
else
  fail "no base ref to diff against"
fi

# --------------------------------------------------------------------------
printf '\n'
if [ "$FAILURES" -eq 0 ]; then
  printf 'VERIFY: all checks passed\n'
  exit 0
fi
printf 'VERIFY: %d check(s) failed\n' "$FAILURES" >&2
exit 1
