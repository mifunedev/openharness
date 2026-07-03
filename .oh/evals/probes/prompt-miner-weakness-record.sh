#!/usr/bin/env bash
# tier: A
# source: issue #580 — prompt-miner weakness-record (WH-xxx) cluster output
# desc: the prompt-miner engine must emit a metadata-only weaknesses[] array of
#       WH-<NNN> harness-weakness records with all seven fields from the committed
#       dual-schema (Claude + Pi) fixtures. Runs mine-traces.mjs --dry-run --no-git
#       against the fixtures (no network, no git, no real data) and asserts >= 1 WH
#       record whose first entry has all 7 non-empty fields (weakness_id matching
#       /^WH-\d{3}$/, frequency matching /^\d+\/\d+$/) and carries NO promptText key.
#       A regression that drops the array to empty, loses a field, or leaks prompt
#       text flips REGRESSION.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILL_DIR="$ROOT/.oh/skills/prompt-miner"
ENGINE="$SKILL_DIR/scripts/mine-traces.mjs"
FIXTURES="$SKILL_DIR/scripts/__tests__/fixtures"

# --- SKIPPED: hard prerequisites genuinely absent --------------------------
if [[ ! -d "$SKILL_DIR" ]]; then
  echo "SKIPPED: prompt-miner skill dir absent: $SKILL_DIR" >&2
  exit 2
fi
if [[ ! -f "$ENGINE" ]]; then
  echo "SKIPPED: engine absent: $ENGINE" >&2
  exit 2
fi
if [[ ! -d "$FIXTURES" ]]; then
  echo "SKIPPED: fixtures dir absent: $FIXTURES" >&2
  exit 2
fi
if ! command -v node >/dev/null 2>&1; then
  echo "SKIPPED: node unavailable" >&2
  exit 2
fi

# --- Run the engine hermetically (no git, no network, fixtures only) -------
set +e
out="$(node "$ENGINE" --dry-run --no-git --fixtures-dir "$FIXTURES" 2>/dev/null)"
rc=$?
set -e

if [[ "$rc" -ne 0 || -z "$out" ]]; then
  echo "REGRESSION: mine-traces.mjs --dry-run --no-git exited $rc with no parseable dataset" >&2
  exit 1
fi

# --- Assert: >= 1 WH record with all 7 non-empty fields, no promptText ------
# Parse the dry-run JSON with node (the dataset is printed to stdout).
verdict="$(
  printf '%s' "$out" | node -e '
    let d = "";
    process.stdin.on("data", c => d += c).on("end", () => {
      try {
        const j = JSON.parse(d);
        const w = j.weaknesses;
        if (!Array.isArray(w)) return void process.stdout.write("NO_WEAKNESSES_KEY");
        if (w.length < 1) return void process.stdout.write("EMPTY");
        // Privacy invariant: a weakness record NEVER carries prompt text, in any mode.
        if (JSON.stringify(w).includes("promptText")) return void process.stdout.write("PROMPTTEXT_LEAK");
        const REQUIRED = ["weakness_id","summary","frequency","affected_agents","likely_harness_layer","supporting_traces","recommended_repair_surface"];
        const rec = w[0];
        const isEmpty = (v) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
        const missing = REQUIRED.filter((k) => isEmpty(rec[k]));
        if (missing.length) return void process.stdout.write("MISSING:" + missing.join(","));
        if (!/^WH-\d{3}$/.test(rec.weakness_id)) return void process.stdout.write("BAD_ID:" + rec.weakness_id);
        if (!/^\d+\/\d+$/.test(rec.frequency)) return void process.stdout.write("BAD_FREQ:" + rec.frequency);
        process.stdout.write("OK " + w.length + " " + rec.weakness_id + " " + rec.frequency);
      } catch (err) {
        process.stdout.write("PARSE_FAIL");
      }
    });
  '
)" || true

case "$verdict" in
  OK\ *)
    echo "PASS: prompt-miner weakness-record ($verdict; all 7 fields present, no promptText)" >&2
    exit 0
    ;;
  PARSE_FAIL)
    echo "REGRESSION: mine-traces.mjs --dry-run output was not valid JSON" >&2
    exit 1
    ;;
  NO_WEAKNESSES_KEY)
    echo "REGRESSION: dataset missing the additive weaknesses[] key" >&2
    exit 1
    ;;
  EMPTY)
    echo "REGRESSION: weaknesses[] is empty — no WH record clustered from fixtures (the tool_error signal should fire in 2/3)" >&2
    exit 1
    ;;
  PROMPTTEXT_LEAK)
    echo "REGRESSION: weakness record leaked a promptText key — privacy invariant broken" >&2
    exit 1
    ;;
  MISSING:*)
    echo "REGRESSION: WH record has missing/empty field(s): ${verdict#MISSING:}" >&2
    exit 1
    ;;
  BAD_ID:*)
    echo "REGRESSION: weakness_id not /^WH-\\d{3}\$/: ${verdict#BAD_ID:}" >&2
    exit 1
    ;;
  BAD_FREQ:*)
    echo "REGRESSION: frequency not n/total: ${verdict#BAD_FREQ:}" >&2
    exit 1
    ;;
  *)
    echo "REGRESSION: prompt-miner weakness-record probe: unexpected verdict '$verdict'" >&2
    exit 1
    ;;
esac
