#!/usr/bin/env bash
set -euo pipefail

REPORT=${1:-}
if [[ -z "$REPORT" || ! -f "$REPORT" ]]; then
  echo "Usage: validate-retro-report.sh <report.md>" >&2
  exit 64
fi

required_literals=(
  '## Session signals'
  '## Hypotheses'
  '| ID | Subsystem | Hypothesis | Evidence for | Evidence against | Verdict | Confidence | Promotion |'
  '## Promotion candidates'
  '## Summary'
  'STATUS: RETRO-DONE'
)
for literal in "${required_literals[@]}"; do
  if ! grep -Fq -- "$literal" "$REPORT"; then
    echo "REGRESSION: retro report missing required literal: $literal" >&2
    exit 1
  fi
done

last_line=$(awk 'NF { line=$0 } END { print line }' "$REPORT")
if [[ "$last_line" != 'STATUS: RETRO-DONE' ]]; then
  echo "REGRESSION: final non-empty line must be STATUS: RETRO-DONE" >&2
  exit 1
fi

# Validate table rows enough to catch skipped evidence/verdict/confidence fields.
awk -F'|' '
  /^\|[[:space:]]*[A-Z0-9-]+[[:space:]]*\|/ {
    id=$2; gsub(/^[[:space:]]+|[[:space:]]+$/, "", id)
    if (id == "ID" || id ~ /^-+$/) next
    verdict=$7; confidence=$8; against=$6; promotion=$9
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", verdict)
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", confidence)
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", against)
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", promotion)
    if (against == "") { print "REGRESSION: missing Evidence against" > "/dev/stderr"; exit 1 }
    if (verdict !~ /^(supported|refuted|inconclusive)$/) { print "REGRESSION: bad verdict: " verdict > "/dev/stderr"; exit 1 }
    if (confidence !~ /^(low|medium|high)$/) { print "REGRESSION: bad confidence: " confidence > "/dev/stderr"; exit 1 }
    if (promotion !~ /^(report-only|IDENTITY|discarded)$/) { print "REGRESSION: bad promotion: " promotion > "/dev/stderr"; exit 1 }
    rows++
  }
  END { if (rows < 1) { print "REGRESSION: no hypothesis rows" > "/dev/stderr"; exit 1 } }
' "$REPORT"

# Every IDENTITY promotion candidate must carry a triage tag and a probe id.
if grep -q '^Proposed IDENTITY.md addition(s):' "$REPORT"; then
  while IFS= read -r cand; do
    [[ "$cand" == "- none" ]] && continue
    if ! grep -Eq '\[[^]]+ · (low|medium|high) · (harden|proceduralize|eval)\] — probe: ' <<<"$cand"; then
      echo "REGRESSION: IDENTITY candidate missing triage tag or probe id: $cand" >&2
      exit 1
    fi
  done < <(awk '/^Proposed IDENTITY\.md addition\(s\):/{f=1;next} f&&/^## /{f=0} f&&/^- /{print}' "$REPORT")
fi

echo "PASS: retro report satisfies deterministic schema" >&2
