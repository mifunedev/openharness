#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -n "${AUDIT_ROOT:-}" ]; then
  ROOT="$(cd "$AUDIT_ROOT" && pwd -P)"
else
  ROOT="$SCRIPT_DIR"
  while [ "$ROOT" != "/" ] && [ ! -d "$ROOT/.oh/evals/probes" ]; do
    ROOT="$(dirname "$ROOT")"
  done
fi
[ -d "$ROOT/.oh/evals/probes" ] || { echo "could not locate repo root from $SCRIPT_DIR" >&2; exit 1; }
PROBES_DIR="$ROOT/.oh/evals/probes"
RESULTS="$ROOT/.oh/evals/RESULTS.md"
TIMEOUT_SECS=30

FILTER_PROBE=""
FILTER_TIER=""
while [ $# -gt 0 ]; do
  case "$1" in
    --probe)  FILTER_PROBE="${2:-}"; shift 2 ;;
    --tier)   FILTER_TIER="${2:-}"; shift 2 ;;
    -h|--help) echo "usage: run.sh [--probe <id>] [--tier A]"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 64 ;;
  esac
done

tmp=""
trap '[ -n "$tmp" ] && rm -f "$tmp"' EXIT

hdr() { grep -E "^# $1:" "$2" 2>/dev/null | head -1 | sed "s/^# $1:[[:space:]]*//" || true; }
prior_row() {
  grep -E "^\| ${1} \|" <<<"$RESULTS_ORIG" 2>/dev/null | head -1 || true
}
prior_status() { prior_row "$1" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/,"",$5); print $5}'; }

RESULTS_ORIG=""
[ -f "$RESULTS" ] && RESULTS_ORIG="$(cat "$RESULTS")"

now="$(date -u +'%Y-%m-%d %H:%M')"
declare -A NEWROW
regressions=()
stuck=()
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
  reason="${reason%%$'\n'*}"

  prior="$(prior_status "$id")"
  if [ -z "$prior" ]; then
    if [ "$status" = "PASS" ]; then delta="new-pass"; else delta="new-fail"; fi
  elif [ "$prior" = "$status" ]; then
    delta="unchanged"
  else
    delta="${prior}->${status}"
  fi
  if [ "$prior" = "PASS" ] && [ "$status" != "PASS" ] && [ "$status" != "SKIPPED" ]; then
    regressions+=("$id ($src): was PASS, now $status — ${reason:-no reason}")
  fi
  if [ "$status" != "PASS" ] && [ "$status" != "SKIPPED" ] && [ "$prior" != "PASS" ]; then
    stuck+=("$id ($src): $status, delta=$delta — ${reason:-no reason}")
  fi

  NEWROW[$id]="| $id | $tier | $now | $status | $src |"
  printf '%-32s %-11s %s\n' "$id" "$status" "$delta" >&2
  ran=$((ran + 1))
done

tmp="$RESULTS.tmp.$$"
cat > "$tmp" <<'HDR'
# Probe results — benchmark scoreboard

Current status per probe id, written by `/eval`. Policy: **overwrite the row per
probe id; git history is the time series.** Schema and exit-code semantics are in
[`.oh/evals/README.md`](README.md). `SKIPPED` does not count toward pass-rate.

| probe | tier | last-run (UTC) | status | source |
|-------|------|----------------|--------|--------|
HDR
for probe in "$PROBES_DIR"/*.sh; do
  id="$(basename "$probe" .sh)"
  if [ -n "${NEWROW[$id]+x}" ]; then
    printf '%s\n' "${NEWROW[$id]}" >> "$tmp"
  else
    pr="$(prior_row "$id")"
    if [ -n "$pr" ]; then
      printf '%s\n' "$pr" >> "$tmp"
    else
      printf '| %s | %s | — | (not run) | %s |\n' "$id" "$(hdr tier "$probe")" "$(hdr source "$probe")" >> "$tmp"
    fi
  fi
done
printf '\n<!-- benchmark: pass-rate = PASS / (PASS + REGRESSION + TIMEOUT); SKIPPED excluded -->\n' >> "$tmp"
mv -f "$tmp" "$RESULTS"
tmp=""

if [ "${#regressions[@]}" -gt 0 ]; then
  echo "REGRESSIONS (${#regressions[@]}):"
  for r in "${regressions[@]}"; do echo "  - $r"; done
fi
if [ "${#stuck[@]}" -gt 0 ]; then
  echo "PERSISTENT RED (${#stuck[@]}) — not gating, no green->red delta:"
  for r in "${stuck[@]}"; do echo "  - $r"; done
fi
echo "ran $ran probe(s); wrote $RESULTS"
if [ "${#regressions[@]}" -gt 0 ]; then exit 1; fi
exit 0
