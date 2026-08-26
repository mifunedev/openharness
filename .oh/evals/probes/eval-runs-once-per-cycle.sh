#!/usr/bin/env bash
# tier: A
# source: .oh/tasks/spec-simplification/ (issue #816, US-006) — /eval ran 3x per cycle on the
#         same commit: 318 probe executions to learn one thing.
# desc: the probe suite runs ONCE per cycle. /spec execute runs it and publishes
#       .oh/tasks/<slug>/eval-result.json keyed to the commit it ran against; /audit
#       implementation Gate 2 and /benchmark Signal 1 READ that record instead of re-running.
#       Both readers must compare `commit` against HEAD before reusing it — inheriting a
#       record from an earlier HEAD would report a floor that was never measured — and
#       neither may treat a missing record as a pass.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
EXEC="$ROOT/.claude/skills/spec/references/execute.md"
IMPL="$ROOT/.oh/skills/audit/references/implementation.md"
BENCH="$ROOT/.oh/skills/benchmark/SKILL.md"

for f in "$EXEC" "$IMPL" "$BENCH"; do
  if [[ ! -f "$f" ]]; then
    echo "SKIPPED: required file absent: $f" >&2
    exit 2
  fi
done

missing=()

EXEC_GATE="$(awk '/^\*\*The `\/eval` gate/{f=1} f && /^### [0-9]+\./{if (seen++) exit} f' "$EXEC")"
IMPL_GATE="$(awk '/^### Gate 2 /{f=1} f{print} f && /^### Gate 3 /{exit}' "$IMPL")"
BENCH_GATE="$(awk '/^### Signal 1 /{f=1} f{print} f && /^### Signal 2 /{exit}' "$BENCH")"

for pair in "spec-execute:$EXEC_GATE" "audit-implementation:$IMPL_GATE" "benchmark:$BENCH_GATE"; do
  if [ -z "${pair#*:}" ]; then
    echo "REGRESSION: ${pair%%:*} no longer has the /eval gate section this probe reads" >&2
    exit 1
  fi
done

grep -Fq 'eval-result.json' <<<"$EXEC_GATE" || missing+=("/spec execute does not publish eval-result.json in its /eval gate section")
grep -Fq 'run ONCE per cycle' <<<"$EXEC_GATE" || missing+=("/spec execute no longer states that the suite runs once per cycle")
grep -Fq 'git rev-parse HEAD' <<<"$EXEC_GATE" || missing+=("/spec execute's eval-result.json records no commit key (downstream reuse could not be validated)")
grep -Fq "git add -f \".oh/tasks/<slug>/eval-result.json\"" <<<"$EXEC_GATE" \
  || missing+=("/spec execute does not 'git add -f' eval-result.json (.oh/tasks/ is gitignored, so it would not travel)")

for pair in "audit-implementation:$IMPL_GATE" "benchmark:$BENCH_GATE"; do
  name="${pair%%:*}"
  file="${pair#*:}"
  if ! grep -Fq 'eval-result.json' <<<"$file"; then
    missing+=("$name does not read eval-result.json — it re-runs the suite the cycle already ran")
    continue
  fi
  grep -Fq 'jq -r .commit' <<<"$file" \
    || missing+=("$name reads eval-result.json without comparing its .commit to HEAD (it would inherit a stale green)")
  grep -Fq 'git rev-parse HEAD' <<<"$file" \
    || missing+=("$name does not resolve HEAD to validate the record's freshness")
  grep -Fq 'jq -r .runnerExit' <<<"$file" \
    || missing+=("$name does not read the recorded runner exit code")
  grep -Fq 'run.sh' <<<"$file" \
    || missing+=("$name has no fallback that actually runs the suite when the record is stale or absent")
done

if (( ${#missing[@]} )); then
  printf 'REGRESSION: the once-per-cycle /eval contract is broken:\n' >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "PASS: /spec execute runs the suite once and publishes a commit-keyed eval-result.json; /audit implementation and /benchmark read it, validate its commit against HEAD, and fall back to a real run when it is stale or absent" >&2
exit 0
