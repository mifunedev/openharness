#!/usr/bin/env bash
# /eval runner — discover evals/probes/*.sh, run each against real state, and
# write the evals/RESULTS.md benchmark scoreboard (overwrite-row-per-probe).
# Exit-code oracle per probe: 0=PASS 1=REGRESSION 2=SKIPPED 124=TIMEOUT other=ERROR.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"     # .claude/skills/eval -> repo root
PROBES_DIR="$ROOT/evals/probes"
RESULTS="$ROOT/evals/RESULTS.md"
TIMEOUT_SECS=30

FILTER_PROBE=""
FILTER_TIER=""
while [ $# -gt 0 ]; do
  case "$1" in
    --probe) FILTER_PROBE="${2:-}"; shift 2 ;;
    --tier)  FILTER_TIER="${2:-}"; shift 2 ;;
    -h|--help) echo "usage: run.sh [--probe <id>] [--tier A|ablation]"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 64 ;;
  esac
done

# --- M-2: recover orphaned ablation backups from a crashed prior run ---
# scripts/ablate.sh records in-flight "<target>\t<bak>" lines in this sentinel;
# if a prior ablation was SIGKILLed before its trap fired, restore here.
SENTINEL="$ROOT/evals/.ablation-active"
if [ -f "$SENTINEL" ]; then
  while IFS=$'\t' read -r target bak; do
    if [ -n "${bak:-}" ] && [ -f "$bak" ]; then
      mv -f "$bak" "$target" && echo "recovered orphaned ablation backup -> $target" >&2
    fi
  done < "$SENTINEL"
  rm -f "$SENTINEL"
fi

hdr() { grep -E "^# $1:" "$2" 2>/dev/null | head -1 | sed "s/^# $1:[[:space:]]*//" || true; }
prior_row() {
  [ -f "$RESULTS" ] || return 0
  grep -E "^\| ${1} \|" "$RESULTS" 2>/dev/null | head -1 || true
}
prior_status() { prior_row "$1" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/,"",$5); print $5}'; }

now="$(date -u +'%Y-%m-%d %H:%M')"
declare -A NEWROW
regressions=()
ran=0

shopt -s nullglob
for probe in "$PROBES_DIR"/*.sh; do
  id="$(basename "$probe" .sh)"
  tier="$(hdr tier "$probe")";  tier="${tier:-?}"
  src="$(hdr source "$probe")"; src="${src:-?}"
  [ -n "$FILTER_PROBE" ] && [ "$id" != "$FILTER_PROBE" ] && continue
  [ -n "$FILTER_TIER"  ] && [ "$tier" != "$FILTER_TIER" ] && continue

  set +e
  reason="$(timeout "$TIMEOUT_SECS" bash "$probe" 2>&1 1>/dev/null)"
  code=$?
  set -e
  case "$code" in
    0) status="PASS" ;;
    1) status="REGRESSION" ;;
    2) status="SKIPPED" ;;
    124) status="TIMEOUT" ;;
    *) status="ERROR" ;;
  esac
  reason="${reason%%$'\n'*}"   # first stderr line only

  prior="$(prior_status "$id")"
  if [ -z "$prior" ]; then
    if [ "$status" = "PASS" ]; then delta="new-pass"; else delta="new-fail"; fi
  elif [ "$prior" = "$status" ]; then
    delta="unchanged"
  else
    delta="${prior}->${status}"
  fi
  # green->red is the recurrence signal; first run has no prior, so never fires
  if [ "$prior" = "PASS" ] && [ "$status" != "PASS" ] && [ "$status" != "SKIPPED" ]; then
    regressions+=("$id ($src): was PASS, now $status — ${reason:-no reason}")
  fi

  NEWROW[$id]="| $id | $tier | $now | $status | $src |"
  printf '%-32s %-11s %s\n' "$id" "$status" "$delta" >&2
  ran=$((ran + 1))
done

# --- rewrite RESULTS.md: new rows for probes run; carry prior rows for the rest ---
cat > "$RESULTS" <<'HDR'
# Probe results — benchmark scoreboard

Current status per probe id, written by `/eval`. Policy: **overwrite the row per
probe id; git history is the time series.** Schema and exit-code semantics are in
[`evals/README.md`](README.md). `SKIPPED` does not count toward pass-rate.

| probe | tier | last-run (UTC) | status | source |
|-------|------|----------------|--------|--------|
HDR
for probe in "$PROBES_DIR"/*.sh; do
  id="$(basename "$probe" .sh)"
  if [ -n "${NEWROW[$id]+x}" ]; then
    printf '%s\n' "${NEWROW[$id]}" >> "$RESULTS"
  else
    pr="$(prior_row "$id")"
    if [ -n "$pr" ]; then
      printf '%s\n' "$pr" >> "$RESULTS"
    else
      printf '| %s | %s | — | (not run) | %s |\n' "$id" "$(hdr tier "$probe")" "$(hdr source "$probe")" >> "$RESULTS"
    fi
  fi
done
printf '\n<!-- benchmark: pass-rate = PASS / (PASS + REGRESSION + TIMEOUT); SKIPPED excluded -->\n' >> "$RESULTS"

# --- summary to stdout: regressions first ---
if [ "${#regressions[@]}" -gt 0 ]; then
  echo "REGRESSIONS (${#regressions[@]}):"
  for r in "${regressions[@]}"; do echo "  - $r"; done
fi
echo "ran $ran probe(s); wrote $RESULTS"
