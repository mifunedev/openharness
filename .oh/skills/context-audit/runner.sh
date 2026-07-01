#!/usr/bin/env bash
# context-audit runner — Tier-2 ablation harness
# Usage:
#   ./runner.sh --ablate <relative-path>   # e.g. .oh/context/IDENTITY.md
#   ./runner.sh --baseline                 # record baseline probe outputs only
#
# Must be run from the harness root (/home/sandbox/harness).

set -euo pipefail

HARNESS="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
SKILL_DIR="$HARNESS/.claude/skills/context-audit"
PROBE_DIR="$SKILL_DIR/probes"
TODAY=$(date -u +%Y-%m-%d)
RESULTS="/tmp/context-audit-$(date +%s)"
mkdir -p "$RESULTS"

# ── helpers ──────────────────────────────────────────────────────────────────

extract_body() {
  # Strip YAML frontmatter; print body (everything after closing ---)
  awk '/^---/{n++; if(n==2){p=1;next}} p{print}' "$1"
}

extract_markers() {
  # Print one marker per line from probe frontmatter markers: list
  awk '/^markers:/{f=1;next} f && /^  - /{print substr($0,5)} f && /^[a-z]/{exit}' "$1"
}

run_probes() {
  local label="$1"
  for probe in "$PROBE_DIR"/*.md; do
    pname=$(basename "$probe" .md)
    printf "  %-30s → %s/%s-%s.txt\n" "$pname" "$RESULTS" "$label" "$pname"
    claude -p "$(extract_body "$probe")" --output-format text \
      > "$RESULTS/${label}-${pname}.txt" 2>&1
  done
}

evaluate() {
  local target_base="$1"
  echo ""
  echo "## Ablation: $target_base — $(date -u '+%Y-%m-%d %H:%M') UTC"
  echo ""
  printf "%-30s  %9s  %9s  %7s  %4s  %s\n" \
    "Probe" "Baseline" "Ablation" "Markers" "Drop" "Severity"
  printf "%-30s  %9s  %9s  %7s  %4s  %s\n" \
    "-----" "--------" "--------" "-------" "----" "--------"

  any_high=0
  for probe in "$PROBE_DIR"/*.md; do
    pname=$(basename "$probe" .md)
    baseline_hits=0; ablation_hits=0; total=0
    while IFS= read -r marker; do
      [ -z "$marker" ] && continue
      total=$((total + 1))
      grep -qi "$marker" "$RESULTS/baseline-${pname}.txt" 2>/dev/null \
        && baseline_hits=$((baseline_hits + 1)) || true
      grep -qi "$marker" "$RESULTS/ablation-${pname}.txt" 2>/dev/null \
        && ablation_hits=$((ablation_hits + 1)) || true
    done < <(extract_markers "$probe")

    drop=$((baseline_hits - ablation_hits))
    if [ "$drop" -le 0 ]; then severity="none"
    elif [ "$drop" -eq 1 ]; then severity="LOW"
    else severity="HIGH"; any_high=1
    fi

    printf "%-30s  %4d/%-4d  %4d/%-4d  %7d  %4d  %s\n" \
      "$pname" "$baseline_hits" "$total" "$ablation_hits" "$total" \
      "$total" "$drop" "$severity"
  done

  echo ""
  if [ "$any_high" -eq 0 ]; then
    echo "### Verdict: SAFE TO CUT — all probes degraded ≤ 1 marker"
  else
    echo "### Verdict: SIGNAL DETECTED — probe(s) dropped >1 marker; file earns its slot"
  fi
}

# ── main ─────────────────────────────────────────────────────────────────────

MODE="${1:-}"
if [ -z "$MODE" ]; then
  echo "Usage: $0 --baseline | --ablate <relative-path>"
  exit 1
fi

if [ "$MODE" = "--baseline" ]; then
  echo "=== Baseline probe run ==="
  run_probes "baseline"
  # Persist to memory for durable comparison (resolver honors paths.memory / MEMORY_DIR)
  MEM_DIR="$(sh "$HARNESS/.oh/scripts/oh-path" memory 2>/dev/null || printf '%s' "$HARNESS/.oh/memory")"
  mkdir -p "$MEM_DIR/$TODAY/context-audit-baseline"
  cp "$RESULTS"/baseline-*.txt "$MEM_DIR/$TODAY/context-audit-baseline/"
  echo ""
  echo "Baseline saved → $MEM_DIR/$TODAY/context-audit-baseline/"
  exit 0
fi

if [ "$MODE" = "--ablate" ]; then
  TARGET_REL="${2:-}"
  if [ -z "$TARGET_REL" ]; then
    echo "Error: --ablate requires a file argument (relative to harness root)"
    exit 1
  fi
  TARGET="$HARNESS/$TARGET_REL"
  if [ ! -f "$TARGET" ]; then
    echo "Error: file not found: $TARGET"
    exit 1
  fi
  TARGET_BASE=$(basename "$TARGET_REL")

  # Safety: don't ablate CLAUDE.md (removes orchestrator identity)
  if [ "$TARGET_BASE" = "CLAUDE.md" ]; then
    echo "Error: CLAUDE.md cannot be ablated — results would be meaningless"
    exit 1
  fi

  echo "=== Baseline probe run (full context) ==="
  run_probes "baseline"

  echo ""
  echo "=== Ablation: temporarily removing $TARGET_REL ==="
  # Restore on any exit
  trap 'if [ -f "${TARGET}.bak" ]; then mv "${TARGET}.bak" "$TARGET"; echo "Restored $TARGET_REL"; fi' EXIT
  mv "$TARGET" "${TARGET}.bak"

  run_probes "ablation"

  # Restore now (trap also fires but idempotent)
  mv "${TARGET}.bak" "$TARGET"

  evaluate "$TARGET_BASE"
  exit 0
fi

echo "Unknown argument: $MODE"
echo "Usage: $0 --baseline | --ablate <relative-path>"
exit 1
