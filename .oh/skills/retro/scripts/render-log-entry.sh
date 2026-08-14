#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage: render-log-entry.sh --result OP|DRY-RUN|SKIPPED-TRIVIAL|GATE-PENDING \
  --subsystems TEXT --hypotheses N --supported N --refuted N --inconclusive N \
  --memory N|pending --identity N|pending --observation TEXT \
  [--time HH:MM] [--resolves HH:MM]

Renders the standard /retro log entry to stdout. It does not write files.

--result GATE-PENDING records a run whose propose-then-confirm gate is still
open. It requires --memory pending --identity pending, because the promotion
counts are not knowable until the operator answers. The literal `pending` is
valid for those two flags only, and only under GATE-PENDING; the other four
counts are always integers.

--resolves HH:MM marks an entry as the resolution of an earlier GATE-PENDING
entry. It is valid only with --result OP and integer counts.
USAGE
}

RESULT=""; SUBSYSTEMS=""; HYPOTHESES=""; SUPPORTED=""; REFUTED=""; INCONCLUSIVE=""; MEMORY=""; IDENTITY=""; OBSERVATION=""; TIME=""; RESOLVES=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --result) RESULT=${2:-}; shift 2 ;;
    --subsystems) SUBSYSTEMS=${2:-}; shift 2 ;;
    --hypotheses) HYPOTHESES=${2:-}; shift 2 ;;
    --supported) SUPPORTED=${2:-}; shift 2 ;;
    --refuted) REFUTED=${2:-}; shift 2 ;;
    --inconclusive) INCONCLUSIVE=${2:-}; shift 2 ;;
    --memory) MEMORY=${2:-}; shift 2 ;;
    --identity) IDENTITY=${2:-}; shift 2 ;;
    --observation) OBSERVATION=${2:-}; shift 2 ;;
    --time) TIME=${2:-}; shift 2 ;;
    --resolves) RESOLVES=${2:-}; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown arg: $1" >&2; usage; exit 64 ;;
  esac
done

case "$RESULT" in OP|DRY-RUN|SKIPPED-TRIVIAL|GATE-PENDING) ;; *) echo "--result must be OP, DRY-RUN, SKIPPED-TRIVIAL, or GATE-PENDING" >&2; exit 64 ;; esac
for name in SUBSYSTEMS HYPOTHESES SUPPORTED REFUTED INCONCLUSIVE MEMORY IDENTITY OBSERVATION; do
  if [[ -z "${!name}" ]]; then echo "missing --${name,,}" >&2; exit 64; fi
done
# The four hypothesis counts are always integers. --memory and --identity are
# validated separately below because they alone may carry the `pending`
# sentinel; widening this regex instead would silently legalize
# `--hypotheses pending`.
for value in "$HYPOTHESES" "$SUPPORTED" "$REFUTED" "$INCONCLUSIVE"; do
  [[ "$value" =~ ^[0-9]+$ ]] || { echo "counts must be non-negative integers" >&2; exit 64; }
done
if [[ "$RESULT" == "GATE-PENDING" ]]; then
  if [[ "$MEMORY" != "pending" || "$IDENTITY" != "pending" ]]; then
    echo "--result GATE-PENDING requires --memory pending --identity pending: the counts are not knowable while the gate is open" >&2
    exit 64
  fi
else
  for value in "$MEMORY" "$IDENTITY"; do
    [[ "$value" =~ ^[0-9]+$ ]] || { echo "--memory and --identity must be non-negative integers; 'pending' is valid only with --result GATE-PENDING" >&2; exit 64; }
  done
fi
if [[ -n "$RESOLVES" ]]; then
  [[ "$RESULT" == "OP" ]] || { echo "--resolves is valid only with --result OP" >&2; exit 64; }
  [[ "$RESOLVES" =~ ^[0-2][0-9]:[0-5][0-9]$ ]] || { echo "--resolves must be HH:MM" >&2; exit 64; }
fi
if [[ -z "$TIME" ]]; then TIME=$(date -u +%H:%M); fi
[[ "$TIME" =~ ^[0-2][0-9]:[0-5][0-9]$ ]] || { echo "--time must be HH:MM" >&2; exit 64; }

if [[ "$RESULT" == "GATE-PENDING" ]]; then
  PROMOTED_LINE="- **Promoted**: pending gate resolution"
else
  PROMOTED_LINE="- **Promoted**: $MEMORY to MEMORY.md, $IDENTITY to IDENTITY.md"
fi

cat <<ENTRY
## Retro -- $TIME UTC
- **Result**: $RESULT
- **Subsystems**: $SUBSYSTEMS
- **Hypotheses**: $HYPOTHESES (supported $SUPPORTED / refuted $REFUTED / inconclusive $INCONCLUSIVE)
$PROMOTED_LINE
ENTRY
if [[ -n "$RESOLVES" ]]; then
  echo "- **Resolves**: the GATE-PENDING entry from $RESOLVES UTC"
fi
cat <<ENTRY
- **Observation**: $OBSERVATION
ENTRY
