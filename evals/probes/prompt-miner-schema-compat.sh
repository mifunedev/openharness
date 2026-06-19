#!/usr/bin/env bash
# tier: A
# source: issue #253 — prompt-miner JSONL schema-drift guard
# desc: the prompt-miner engine must still parse the dual-schema (Claude + Pi)
#       JSONL fixtures and count sessions + nested tool-errors. Runs
#       mine-traces.mjs --dry-run --no-git against the committed synthetic
#       fixtures (no network, no git, no real data) and asserts a non-zero
#       session count AND a non-zero tool-error count. A schema regression in
#       either adapter (e.g. the nested Claude is_error path or the Pi
#       toolResult.isError path) drops one of those to zero and flips REGRESSION.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SKILL_DIR="$ROOT/.claude/skills/prompt-miner"
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

# --- Assert: non-zero sessions AND non-zero tool-errors --------------------
# Parse the dry-run JSON with node (the dataset is printed to stdout).
read -r sessions tool_errors < <(
  printf '%s' "$out" | node -e '
    let d = "";
    process.stdin.on("data", c => d += c).on("end", () => {
      try {
        const j = JSON.parse(d);
        const s = (j.manifest && j.manifest.sessionsScanned) || 0;
        const e = (j.manifest && j.manifest.toolErrorsTotal) || 0;
        process.stdout.write(s + " " + e + "\n");
      } catch (err) {
        process.stdout.write("PARSE_FAIL 0\n");
      }
    });
  '
) || true

if [[ "$sessions" == "PARSE_FAIL" ]]; then
  echo "REGRESSION: mine-traces.mjs --dry-run output was not valid JSON" >&2
  exit 1
fi

missing=()
[[ "$sessions" =~ ^[0-9]+$ && "$sessions" -gt 0 ]] \
  || missing+=("sessionsScanned must be > 0 (got '$sessions') — Claude/Pi enumeration or parse broke")
[[ "$tool_errors" =~ ^[0-9]+$ && "$tool_errors" -gt 0 ]] \
  || missing+=("toolErrorsTotal must be > 0 (got '$tool_errors') — nested Claude is_error / Pi toolResult.isError counting broke")

if (( ${#missing[@]} )); then
  printf 'REGRESSION: prompt-miner schema-compat: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: prompt-miner engine parses fixtures (sessionsScanned=$sessions, toolErrorsTotal=$tool_errors)" >&2
exit 0
