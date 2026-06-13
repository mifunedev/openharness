#!/usr/bin/env bash
# tier: A
# source: issue #83 (eval-results-atomic-write)
# desc: STATIC-pattern probe — asserts /eval run.sh writes RESULTS.md atomically (build into a temp sibling, then mv -f), never via bare `cat > "$RESULTS"` truncation, and that prior_row() carry-forward reads the snapshot not the live file. Coupled to run.sh implementation tokens: a deliberate refactor of the scoreboard-write path MUST update this probe.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_SH="${RUN_SH:-$ROOT/.claude/skills/eval/run.sh}"

if [[ ! -f "$RUN_SH" ]]; then
  echo "SKIPPED: eval runner absent: $RUN_SH" >&2
  exit 2
fi

fail() { echo "REGRESSION: $1" >&2; exit 1; }

content="$(cat "$RUN_SH")"

# (a) No bare `cat > "$RESULTS"` truncation — the header/rows must be built into the
#     temp sibling, never streamed straight onto the live scoreboard.
if grep -qE 'cat[[:space:]]+>[[:space:]]*"\$RESULTS"' <<<"$content"; then
  fail "non-atomic write reintroduced: bare \`cat > \"\$RESULTS\"\` truncation present (build into \$tmp, then mv -f)"
fi

# (b) Final replacement via `mv -f ... "$RESULTS"`.
if ! grep -qE 'mv[[:space:]]+-f[[:space:]]+.*"\$RESULTS"' <<<"$content"; then
  fail "atomic replacement missing: no \`mv -f ... \"\$RESULTS\"\` found for the final scoreboard swap"
fi

# (c) EXIT trap referencing the temp-file handle, so a crash mid-write removes the sibling temp.
if ! grep -qE 'trap[[:space:]].*\$tmp.*EXIT' <<<"$content"; then
  fail "temp-file cleanup trap missing: no \`trap ... \$tmp ... EXIT\` found"
fi

# (d) prior_row() body must resolve carry-forward from the \$RESULTS_ORIG snapshot,
#     never via a live \`grep ... "\$RESULTS"\` read of the file being rewritten.
prior_row_body="$(awk '/^prior_row\(\)/{f=1} f{print} f&&/^}/{exit}' <<<"$content")"
if [[ -z "$prior_row_body" ]]; then
  fail "prior_row() function not found in run.sh"
fi
if grep -qE 'grep[[:space:]].*"\$RESULTS"' <<<"$prior_row_body"; then
  fail "prior_row() reads the live \$RESULTS (carry-forward must read the \$RESULTS_ORIG snapshot)"
fi

echo "PASS: run.sh writes RESULTS.md atomically (no \`cat>\` truncation; mv -f replace; temp-cleanup trap; prior_row reads snapshot)" >&2
exit 0
