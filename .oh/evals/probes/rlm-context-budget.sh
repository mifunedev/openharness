#!/usr/bin/env bash
# tier: A
# source: .oh/tasks/rlm-weighted-trajectories/prd.json US-006
# desc: /rlm recursion-budget.md declares depth/children/step ceilings AND query-context.mjs enforces a max-bytes guard (whole-file slice <= cap, truncated when input exceeds cap)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

QC="$ROOT/.mifune/skills/rlm/scripts/query-context.mjs"
BUDGET="$ROOT/.mifune/skills/rlm/references/recursion-budget.md"
FIXTURE="$ROOT/.mifune/skills/rlm/scripts/__tests__/fixtures/big-sample.txt"

# --- Assertion 1: prerequisites absent => SKIPPED (not a regression) ----------
if ! command -v node >/dev/null 2>&1; then
  echo "SKIPPED: node not on PATH" >&2
  exit 2
fi
if [[ ! -f "$QC" ]]; then
  echo "SKIPPED: query-context primitive absent: $QC" >&2
  exit 2
fi
# recursion-budget.md is authored by a sibling US-005 story; until it lands the
# budget-ceiling half of this contract has nothing to assert against -> SKIP.
if [[ ! -f "$BUDGET" ]]; then
  echo "SKIPPED: recursion-budget reference absent (sibling US-005): $BUDGET" >&2
  exit 2
fi

# --- Assertion 2: recursion-budget.md declares depth/children/step ceilings ----
for term in depth children step; do
  if ! grep -qi "$term" "$BUDGET"; then
    echo "REGRESSION: recursion-budget.md missing '$term' ceiling declaration" >&2
    exit 1
  fi
done

# --- Assertion 3: query-context.mjs enforces a max-bytes guard -----------------
# 3a. structural: the byte-cap constant exists in the source.
if ! grep -q 'MAX_SLICE_BYTES' "$QC"; then
  echo "REGRESSION: byte-cap constant (MAX_SLICE_BYTES) absent from query-context.mjs" >&2
  exit 1
fi

# 3b. runtime needs the large fixture; absent => SKIP (no input to bound).
if [[ ! -f "$FIXTURE" ]]; then
  echo "SKIPPED: max-bytes fixture absent: $FIXTURE" >&2
  exit 2
fi

# 3c. runtime: a whole-file slice of a large input is bounded by the cap and is
#     flagged truncated when the input exceeds it. Parse the JSON via node (a
#     declared prerequisite of this probe) rather than a fragile shell grep.
set +e
verdict="$(node "$QC" "$FIXTURE" 2>/dev/null | node -e '
  let raw = "";
  process.stdin.on("data", (d) => { raw += d; });
  process.stdin.on("end", () => {
    let j;
    try { j = JSON.parse(raw); }
    catch (e) { console.log("query-context output is not valid JSON: " + e.message); process.exit(1); }
    const cap = j.maxSliceBytes;
    const s = j.slice;
    if (typeof cap !== "number") { console.log("no numeric maxSliceBytes in output"); process.exit(1); }
    if (!s || typeof s.returnedBytes !== "number") { console.log("no slice.returnedBytes in output"); process.exit(1); }
    if (s.returnedBytes > cap) { console.log("whole-file slice returnedBytes " + s.returnedBytes + " exceeds cap " + cap); process.exit(1); }
    if (j.totalBytes > cap && s.truncated !== true) {
      console.log("input " + j.totalBytes + "B > cap " + cap + "B but truncated flag not set"); process.exit(1);
    }
    console.log("OK");
  });
')"
rc=$?
set -e
if [[ $rc -ne 0 || "$verdict" != "OK" ]]; then
  echo "REGRESSION: ${verdict:-query-context max-bytes runtime guard failed (rc=$rc)}" >&2
  exit 1
fi

echo "PASS: recursion-budget declares depth/children/step ceilings; query-context max-bytes guard bounds the whole-file slice" >&2
exit 0
