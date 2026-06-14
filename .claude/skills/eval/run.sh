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
ABLATE_TARGET=""
while [ $# -gt 0 ]; do
  case "$1" in
    --probe)  FILTER_PROBE="${2:-}"; shift 2 ;;
    --tier)   FILTER_TIER="${2:-}"; shift 2 ;;
    --ablate) ABLATE_TARGET="${2:-}"; shift 2 ;;
    -h|--help) echo "usage: run.sh [--probe <id>] [--tier A|ablation] [--ablate <file> --probe <id>]"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 64 ;;
  esac
done

# Temp-file handle for the atomic scoreboard write (assigned at the write block).
# Initialized empty BEFORE the --ablate guard so the guarded EXIT trap is harmless
# on the ablation exec path (the exec at run.sh:~49 replaces this shell entirely).
tmp=""
trap '[ -n "$tmp" ] && rm -f "$tmp"' EXIT

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

# --- ablation mode (M-1): run one probe with/without a target file via the shared
#     swap/restore/trap mechanics in scripts/ablate.sh; reports LOAD-BEARING|PRUNABLE ---
if [ -n "$ABLATE_TARGET" ]; then
  [ -n "$FILTER_PROBE" ] || { echo "--ablate requires --probe <id>" >&2; exit 64; }
  ABL_PROBE="$PROBES_DIR/$FILTER_PROBE.sh"
  [ -f "$ABL_PROBE" ] || { echo "no such probe: $FILTER_PROBE" >&2; exit 64; }
  case "$ABLATE_TARGET" in
    /*) ABL_TGT="$ABLATE_TARGET" ;;                 # absolute — use as-is
    *)  ABL_TGT="$ROOT/$ABLATE_TARGET" ;;           # relative — resolve against eval repo root, NOT cwd
  esac
  exec bash "$ROOT/scripts/ablate.sh" "$ABL_TGT" "$ABL_PROBE"
fi

hdr() { grep -E "^# $1:" "$2" 2>/dev/null | head -1 | sed "s/^# $1:[[:space:]]*//" || true; }
prior_row() {
  grep -E "^\| ${1} \|" <<<"$RESULTS_ORIG" 2>/dev/null | head -1 || true
}
prior_status() { prior_row "$1" | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/,"",$5); print $5}'; }

# Capture the pre-write scoreboard ONCE. Carry-forward (prior_row) reads this
# snapshot, never the live $RESULTS — so a filtered run can't erase untouched
# rows, and a crash mid-write leaves the original file intact (atomic mv below).
# set -e-safe: the [ -f ] short-circuits the cat so a missing file can't abort.
RESULTS_ORIG=""
[ -f "$RESULTS" ] && RESULTS_ORIG="$(cat "$RESULTS")"

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

# --- rewrite RESULTS.md: build the full scoreboard into a temp sibling file, then
#     replace the live file in ONE atomic mv -f. New rows for probes run this
#     invocation; carry prior rows (from the RESULTS_ORIG snapshot) for the rest.
#     The temp path is a SIBLING of $RESULTS (same filesystem) so mv -f is atomic. ---
tmp="$RESULTS.tmp.$$"
cat > "$tmp" <<'HDR'
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

# --- summary to stdout: regressions first ---
if [ "${#regressions[@]}" -gt 0 ]; then
  echo "REGRESSIONS (${#regressions[@]}):"
  for r in "${regressions[@]}"; do echo "  - $r"; done
fi
echo "ran $ran probe(s); wrote $RESULTS"
if [ "${#regressions[@]}" -gt 0 ]; then exit 1; fi
exit 0
