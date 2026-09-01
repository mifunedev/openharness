#!/usr/bin/env bash
# tier: A
# source: retro lesson 2026-09-01 (issue #926) — evidence.md recorded an acceptance criterion
#         as satisfied by an openharness-web follow-up that had not been filed; every internal
#         gate passed and external verification caught it
# desc: the reviewer evidence contract requires a follow-up to be CITED, not named, and every
#       tracked evidence.md that leans on a follow-up carries a resolvable issue/PR URL in the
#       same bullet. No gate inside this repository can see an artifact in another one, so the
#       citation is the only thing separating "deferred" from "done".
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CONTRACT="$ROOT/.oh/skills/audit/references/reviewer-evidence-doc.md"

[[ -f "$CONTRACT" ]] || { echo "SKIPPED: reviewer evidence contract absent: $CONTRACT" >&2; exit 2; }

failures=()

# --- the rule is stated where an author will meet it ----------------------
grep -qF 'Follow-ups are cited, not named' "$CONTRACT" \
  || failures+=("reviewer-evidence-doc.md no longer carries the follow-up citation rule")
grep -qF 'Naming a follow-up in prose is a plan' "$CONTRACT" \
  || failures+=("reviewer-evidence-doc.md no longer says why naming a follow-up is not satisfying it")

# --- every tracked evidence.md that leans on a follow-up cites one --------
# Trigger only on a bullet that ties a follow-up to a criterion being satisfied;
# "filed as a follow-up" prose elsewhere in a doc is not a claim of completion.
url='https://github\.com/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+/(issues|pull)/[0-9]+'
checked=0
while IFS= read -r rel; do
  [[ -n "$rel" ]] || continue
  abs="$ROOT/$rel"
  [[ -f "$abs" ]] || continue
  checked=$((checked + 1))
  # Read bullet-wise: a claim and its citation belong to the same bullet.
  while IFS= read -r bullet; do
    [[ -n "$bullet" ]] || continue
    grep -qiE 'follow-up|follow up|separate (issue|pr)|mirrored to' <<<"$bullet" || continue
    grep -qiE 'criterion|acceptance|\bmet\b|satisfie' <<<"$bullet" || continue
    grep -qE "$url" <<<"$bullet" \
      || failures+=("$rel: a bullet ties an acceptance criterion to a follow-up but cites no issue/PR URL: $(cut -c1-90 <<<"$bullet")")
  done < <(awk '
    /^[[:space:]]*[-*][[:space:]]/ { if (b != "") print b; b = $0; next }
    /^[[:space:]]*$/               { if (b != "") { print b; b = "" } next }
    b != ""                        { b = b " " $0 }
    END                            { if (b != "") print b }
  ' "$abs")
done < <(git -C "$ROOT" ls-files -- '.oh/tasks/*/evidence.md')

if (( checked == 0 )); then
  echo "SKIPPED: no tracked evidence.md to check" >&2
  exit 2
fi

if ((${#failures[@]})); then
  printf 'REGRESSION: a follow-up is named without being cited:\n' >&2
  printf '  - %s\n' "${failures[@]}" >&2
  exit 1
fi

echo "PASS: the evidence contract requires follow-ups to be cited, and every tracked evidence.md that leans on one carries its URL" >&2
exit 0
