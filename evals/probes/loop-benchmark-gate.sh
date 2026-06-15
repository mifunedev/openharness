#!/usr/bin/env bash
# tier: A
# source: issue #179 — wire the executable-loop `benchmark` node (close the cycle)
# desc: PINS the `benchmark` node wiring — the progress-ceiling verdict gate. loop.md § 2 must give benchmark's row BOTH `BENEFICIAL` → repeat and `NOT-BENEFICIAL` → repeat routes, § 7 must mark benchmark ☑ (wired, not ☐), and .claude/skills/benchmark/SKILL.md must be the node driver (name: benchmark, a `## Handoff` emitting both tokens). A revert to the `/eval`-machinery placeholder row, a ☐ regression, or a missing/renamed driver flips this REGRESSION (eval-probe literal-coupling discipline).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOOP="$ROOT/context/rules/loop.md"
SKILL="$ROOT/.claude/skills/benchmark/SKILL.md"

# Not applicable when the manifest is absent (cold runner / pre-merge main).
[ -f "$LOOP" ] || { echo "SKIPPED: loop.md manifest absent: $LOOP" >&2; exit 2; }

missing=()

# --- § 2: benchmark's decision-tree row carries BOTH BENEFICIAL → repeat and NOT-BENEFICIAL → repeat ---
# Scope strictly to the § 2 table so § 1/§ 7 prose cannot satisfy the check.
section2="$(awk '/^## 2\./{f=1} /^## 3\./{f=0} f' "$LOOP")"
bench_row="$(printf '%s\n' "$section2" | grep -E '^\| \*\*benchmark\*\*' || true)"
if [ -z "$bench_row" ]; then
  missing+=("loop.md § 2: no | **benchmark** | decision-tree row found")
else
  printf '%s\n' "$bench_row" | grep -qE '`BENEFICIAL`[[:space:]]*→[[:space:]]*repeat' \
    || missing+=("loop.md § 2 benchmark row missing the \`BENEFICIAL\` → repeat route")
  printf '%s\n' "$bench_row" | grep -qE '`NOT-BENEFICIAL`[[:space:]]*→[[:space:]]*repeat' \
    || missing+=("loop.md § 2 benchmark row missing the \`NOT-BENEFICIAL\` → repeat route")
fi

# --- § 7: benchmark is marked wired (☑), not ☐ ---
section7="$(awk '/^## 7\./{f=1} /^## See Also/{f=0} f' "$LOOP")"
bench7="$(printf '%s\n' "$section7" | grep -E '^\| benchmark \|' || true)"
if [ -z "$bench7" ]; then
  missing+=("loop.md § 7: no | benchmark | build-state row found")
else
  printf '%s\n' "$bench7" | grep -qF '☑' || missing+=("loop.md § 7 benchmark row not marked wired (☑)")
  if printf '%s\n' "$bench7" | grep -qF '☐'; then
    missing+=("loop.md § 7 benchmark row still marked unwired (☐)")
  fi
fi

# --- /benchmark SKILL: the node driver exists with both tokens and a Handoff ---
if [ -f "$SKILL" ]; then
  grep -qE '^name: benchmark[[:space:]]*$' "$SKILL" || missing+=("/benchmark SKILL missing 'name: benchmark' frontmatter")
  grep -qF 'BENEFICIAL' "$SKILL" || missing+=("/benchmark SKILL missing the BENEFICIAL token")
  grep -qF 'NOT-BENEFICIAL' "$SKILL" || missing+=("/benchmark SKILL missing the NOT-BENEFICIAL token")
  grep -qE '^## Handoff' "$SKILL" || missing+=("/benchmark SKILL missing a '## Handoff' section")
else
  missing+=("/benchmark SKILL absent: $SKILL")
fi

if [ ${#missing[@]} -gt 0 ]; then
  echo "REGRESSION: benchmark-node wiring drift:" >&2
  for m in "${missing[@]}"; do echo "  - $m" >&2; done
  exit 1
fi

echo "PASS: benchmark node wired — BENEFICIAL/NOT-BENEFICIAL → repeat (§ 2), ☑ (§ 7), /benchmark driver with ## Handoff" >&2
exit 0
