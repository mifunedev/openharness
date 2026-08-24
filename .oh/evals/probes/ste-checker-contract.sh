#!/usr/bin/env bash
# tier: A
# source: issue #750 PR audit — the /ste checker had four fail-open paths (unclosed
#         fence, unterminated frontmatter, mismatched fence markers, an unknown
#         --blocks tag), each of which exited 0 while scanning nothing. A linter
#         that passes by scanning nothing is worse than no linter, because the
#         green exit is read as proof. Nothing in CI executed the script, so every
#         guarantee in .oh/tasks/ste-controlled-language/verify.sh was hand-run only.
# desc: the /ste checker rejects as well as accepts — it exits 1 on the committed
#       before-fixture with all six detector classes, exits 0 on its own corpus,
#       and refuses to pass vacuously on any of the four known fail-open shapes
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILL="$ROOT/.oh/skills/ste"
CHECK="$SKILL/scripts/ste-check.sh"

fail() { echo "REGRESSION: $*" >&2; exit 1; }

[ -f "$CHECK" ] || fail "the /ste checker is missing at .oh/skills/ste/scripts/ste-check.sh"
[ -x "$CHECK" ] || fail "the /ste checker is not executable"
bash -n "$CHECK" || fail "the /ste checker has a syntax error"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

rc_of() { # rc_of <expected> <label> <args...>
  local want="$1" label="$2"; shift 2
  local got=0
  bash "$CHECK" "$@" >/dev/null 2>&1 || got=$?
  [ "$got" -eq "$want" ] || fail "$label: exit $got, expected $want"
}

# ---------------------------------------------------------------------------
# 1. The corpus accepts. A checker its own standard cannot satisfy is unshippable.
# ---------------------------------------------------------------------------
for f in "$SKILL/SKILL.md" "$SKILL"/references/*.md; do
  rc_of 0 "clean scan of ${f#"$ROOT"/}" "$f"
done

# ---------------------------------------------------------------------------
# 2. The committed fixture rejects. Exit 0 everywhere proves nothing.
# ---------------------------------------------------------------------------
EX="$SKILL/references/examples.md"
rc_of 0 "--blocks after on the after-specimens" --blocks after "$EX"
rc_of 1 "--blocks before on the before-fixture" --blocks before "$EX"

# The checker exits 1 here by design, so shield the assignment from set -e.
FOUND="$( { bash "$CHECK" --blocks before "$EX" 2>/dev/null || true; } | awk '{print $2}' | sort -u)"
for cls in HEDGE VAGUE PASSIVE LONG COMPOUND WORD; do
  printf '%s\n' "$FOUND" | grep -qx "$cls" \
    || fail "detector $cls never fires on the committed before-fixture"
done

# ---------------------------------------------------------------------------
# 3. The four fail-open shapes the PR audit found. Each one exited 0 before the
#    fix while scanning little or nothing.
# ---------------------------------------------------------------------------
printf 'Intro.\n\n```bash\ncode\nThe runner basically utilizes things.\n' > "$TMP/unclosed.md"
rc_of 1 "unclosed fence must not exempt the rest of the file" "$TMP/unclosed.md"
{ bash "$CHECK" "$TMP/unclosed.md" 2>/dev/null || true; } | grep -q ' FENCE ' \
  || fail "unclosed fence is not reported as a FENCE finding"

printf -- '---\nThe runner basically utilizes things.\nMore prose that basically utilizes things.\n' > "$TMP/rule.md"
rc_of 1 "a leading horizontal rule must not read as unterminated frontmatter" "$TMP/rule.md"

printf -- '---\nname: x\ndescription: The thing is basically processed\n---\n\nRun the command.\n' > "$TMP/front.md"
rc_of 0 "real frontmatter is still skipped" "$TMP/front.md"

printf '~~~text\ncode\n```\nThe runner basically utilizes things.\n~~~\n' > "$TMP/mixed.md"
rc_of 0 "a backtick line must not close a tilde fence" "$TMP/mixed.md"

rc_of 2 "an unknown --blocks tag must not pass vacuously" --blocks nosuchtag "$EX"
rc_of 2 "an empty --blocks tag is a usage error" --blocks '' "$EX"

# ---------------------------------------------------------------------------
# 4. Argument handling stays a usage error, never a silent pass.
# ---------------------------------------------------------------------------
rc_of 2 "no arguments"
rc_of 2 "a missing file" "$TMP/does-not-exist.md"
rc_of 2 "a directory argument" "$TMP"
rc_of 2 "an unknown option" --nope "$EX"
rc_of 2 "a non-numeric --max-words" --max-words abc "$EX"

# ---------------------------------------------------------------------------
# 5. Detectors fire standalone, and the known false positives stay silent.
# ---------------------------------------------------------------------------
printf 'The data is processed by the worker.\n' > "$TMP/passive.md"
rc_of 1 "PASSIVE fires on a real passive clause" "$TMP/passive.md"

printf 'The measured value is indeed correct.\nThe disk is speed limited.\n' > "$TMP/nonverb.md"
rc_of 0 "PASSIVE stays silent on non-participles ending in ed" "$TMP/nonverb.md"

# ---------------------------------------------------------------------------
# 6. The checker reads. It never writes the file it scans.
# ---------------------------------------------------------------------------
BEFORE="$(md5sum "$EX" | cut -d' ' -f1)"
bash "$CHECK" --blocks before "$EX" >/dev/null 2>&1 || true
[ "$(md5sum "$EX" | cut -d' ' -f1)" = "$BEFORE" ] || fail "the checker modified the file it scanned"

# ---------------------------------------------------------------------------
# 7. A clean exit names the two defects it cannot see.
#
#    Measured 2026-08-13, first production use of the skill: ste-check.sh exited
#    0 with zero findings on a document carrying BOTH defects, and the hand-run
#    10-question check then caught them. Neither is worth a detector — a
#    question-4 detector fires on approved `after` specimens and turns
#    --blocks after red, and a question-7 detector cannot separate a bare
#    pronoun from one whose antecedent sits in the previous sentence, because
#    the checker reads one line at a time.
#
#    So the exit-0 line carries the residual instead. Without this, a green run
#    reads as approval of prose the detectors never examined.
# ---------------------------------------------------------------------------
printf 'The operator runs the migration.\n' > "$TMP/clean-residual.md"
clean_err="$(bash "$CHECK" "$TMP/clean-residual.md" 2>&1 >/dev/null || true)"
case "$clean_err" in
  *'no findings'*) ;;
  *) fail "the clean exit no longer reports 'no findings'" ;;
esac
printf '%s' "$clean_err" | grep -Fq 'condition' \
  || fail "the clean exit does not name the trailing-condition escape (10-question rule 4)"
printf '%s' "$clean_err" | grep -Fq 'antecedent' \
  || fail "the clean exit does not name the bare-pronoun escape (10-question rule 7)"

echo 'PASS: the /ste checker rejects, accepts, and refuses to pass vacuously' >&2
