#!/usr/bin/env bash
# tier: A
# source: tasks/rlm-weighted-trajectories/prd.json US-003 (2026-06-27)
# desc: /weigh scorer frozen-weights + hard-floor STRUCTURAL contract (3-state oracle; asserts the .mjs source, not SKILL.md prose)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCORER="${SCORER:-$ROOT/.mifune/skills/weigh/scripts/score-trajectories.mjs}"
FIXTURE="${FIXTURE:-$ROOT/.mifune/skills/weigh/scripts/__tests__/fixtures/cohort-sample.json}"

# 1) Prerequisites — SKIPPED only when node/scorer/fixture are ABSENT.
if ! command -v node >/dev/null 2>&1; then
  echo "SKIPPED: node not on PATH" >&2
  exit 2
fi
if [[ ! -f "$SCORER" ]]; then
  echo "SKIPPED: scorer absent: $SCORER" >&2
  exit 2
fi
if [[ ! -f "$FIXTURE" ]]; then
  echo "SKIPPED: fixture absent: $FIXTURE" >&2
  exit 2
fi

# 2) + 3) Frozen DEFAULT_WEIGHTS (exact keys + sum 100) AND the required exports,
# asserted by importing the module (absolute file:// URL → works through the
# .claude/skills → .mifune/skills symlink). A node import/runtime error here is a
# REAL regression, not a skip.
if ! err="$(node -e '
  // argv[1] is a guard-neutral placeholder so the scorer module does NOT auto-run
  // main() on import (its CLI guard fires when process.argv[1] ends with
  // score-trajectories.mjs); the real scorer path is argv[2].
  const url = "file://" + process.argv[2];
  import(url).then((m) => {
    const expected = ["consistency", "evalPass", "auditPass", "cost", "judge"];
    const dw = m.DEFAULT_WEIGHTS;
    if (!dw || typeof dw !== "object") throw new Error("DEFAULT_WEIGHTS missing or not an object");
    const keys = Object.keys(dw);
    const keysOk = keys.length === expected.length && expected.every((k) => keys.includes(k));
    if (!keysOk) throw new Error("DEFAULT_WEIGHTS keys mismatch: got {" + keys.join(",") + "}, expected {" + expected.join(",") + "}");
    const sum = expected.reduce((a, k) => a + dw[k], 0);
    if (sum !== 100) throw new Error("DEFAULT_WEIGHTS sum != 100: got " + sum);
    const required = ["validateWeights", "weight", "select", "clamp", "DEFAULT_WEIGHTS", "TRAJECTORY_SCHEMA"];
    const missing = required.filter((x) => !(x in m));
    if (missing.length) throw new Error("missing exports: " + missing.join(","));
  }).then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });
' "probe-import-guard-neutral" "$SCORER" 2>&1 >/dev/null)"; then
  echo "REGRESSION: weigh scorer weights/exports contract failed: ${err}" >&2
  exit 1
fi

# 4) The four selection method names appear in the .mjs source.
for method in best-of-n vote softmax synthesis; do
  if ! grep -q "$method" "$SCORER"; then
    echo "REGRESSION: selection method name '$method' not found in scorer source" >&2
    exit 1
  fi
done

# 5) Run the scorer on the fixture (deterministic --now) and assert the evalRc:1
# floor-breaker is NEVER selected. The scorer is executed (CLI), its JSON output is
# parsed, and the floor-breaker id is derived from the fixture (no hard-coded id). A
# scorer runtime/parse error is a REAL regression (exit 1), never a skip.
if ! err="$(node -e '
  const { execFileSync } = require("node:child_process");
  const fs = require("node:fs");
  const scorer = process.argv[1];
  const fixture = process.argv[2];
  try {
    let raw;
    try {
      raw = execFileSync(process.execPath, [scorer, "--cohort", fixture, "--now", "1750000000"], { encoding: "utf8" });
    } catch (e) {
      throw new Error("scorer exited non-zero on fixture: " + String(e.stderr || e.message).split("\n")[0]);
    }
    let result;
    try { result = JSON.parse(raw); } catch (e) { throw new Error("scorer output is not valid JSON: " + e.message); }
    const fx = JSON.parse(fs.readFileSync(fixture, "utf8"));
    const list = Array.isArray(fx) ? fx : fx.trajectories;
    const floorBreaker = list.find((t) => t && t.evalRc === 1);
    if (!floorBreaker) throw new Error("fixture lacks an evalRc:1 floor-breaker trajectory");
    const sel = result.selected;
    if (sel === null || sel === undefined) {
      throw new Error("scorer returned no selection (" + (result.reason || "?") + ") on a cohort with eligible trajectories");
    }
    const selIds = Array.isArray(sel) ? sel : [sel];
    if (selIds.includes(floorBreaker.id)) {
      throw new Error("floor-breaker " + floorBreaker.id + " (evalRc:1) was selected — the hard floor must exclude it");
    }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
' "$SCORER" "$FIXTURE" 2>&1 >/dev/null)"; then
  echo "REGRESSION: weigh scorer hard-floor selection contract failed: ${err}" >&2
  exit 1
fi

echo "PASS: weigh scorer frozen-weights (sum 100), exports, four methods, and hard-floor exclusion all hold" >&2
exit 0
