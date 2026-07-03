#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage: render-log-entry.sh --result OP|DRY-RUN|SKIPPED-TRIVIAL \
  --subsystems TEXT --hypotheses N --supported N --refuted N --inconclusive N \
  --memory N --identity N --observation TEXT [--time HH:MM]

Renders the standard /retro log entry to stdout. It does not write files.
USAGE
}

RESULT=""; SUBSYSTEMS=""; HYPOTHESES=""; SUPPORTED=""; REFUTED=""; INCONCLUSIVE=""; MEMORY=""; IDENTITY=""; OBSERVATION=""; TIME=""
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
    -h|--help) usage; exit 0 ;;
    *) echo "unknown arg: $1" >&2; usage; exit 64 ;;
  esac
done

case "$RESULT" in OP|DRY-RUN|SKIPPED-TRIVIAL) ;; *) echo "--result must be OP, DRY-RUN, or SKIPPED-TRIVIAL" >&2; exit 64 ;; esac
for name in SUBSYSTEMS HYPOTHESES SUPPORTED REFUTED INCONCLUSIVE MEMORY IDENTITY OBSERVATION; do
  if [[ -z "${!name}" ]]; then echo "missing --${name,,}" >&2; exit 64; fi
done
for value in "$HYPOTHESES" "$SUPPORTED" "$REFUTED" "$INCONCLUSIVE" "$MEMORY" "$IDENTITY"; do
  [[ "$value" =~ ^[0-9]+$ ]] || { echo "counts must be non-negative integers" >&2; exit 64; }
done
if [[ -z "$TIME" ]]; then TIME=$(date -u +%H:%M); fi
[[ "$TIME" =~ ^[0-2][0-9]:[0-5][0-9]$ ]] || { echo "--time must be HH:MM" >&2; exit 64; }

cat <<ENTRY
## Retro -- $TIME UTC
- **Result**: $RESULT
- **Subsystems**: $SUBSYSTEMS
- **Hypotheses**: $HYPOTHESES (supported $SUPPORTED / refuted $REFUTED / inconclusive $INCONCLUSIVE)
- **Promoted**: $MEMORY to MEMORY.md, $IDENTITY to IDENTITY.md
- **Observation**: $OBSERVATION
ENTRY
