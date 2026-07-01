#!/usr/bin/env bash
# tier: A
# source: issue #443 — /retro deterministic output and self-contained helper contract
# desc: /retro requires schema-backed hypothesis output, self-contained helper scripts, and synchronized skill copies.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PI_DIR="$ROOT/.pi/skills/retro"
CLAUDE_DIR="$ROOT/.claude/skills/retro"

for dir in "$PI_DIR" "$CLAUDE_DIR"; do
  [[ -f "$dir/SKILL.md" ]] || { echo "REGRESSION: missing $dir/SKILL.md" >&2; exit 1; }
  [[ -f "$dir/references/report-schema.md" ]] || { echo "REGRESSION: missing $dir/references/report-schema.md" >&2; exit 1; }
  for script in render-log-entry.sh validate-retro-report.sh check-memory-duplicates.sh; do
    [[ -x "$dir/scripts/$script" ]] || { echo "REGRESSION: missing executable $dir/scripts/$script" >&2; exit 1; }
  done
done

if ! diff -qr "$PI_DIR" "$CLAUDE_DIR" >/tmp/retro-skill-diff.$$; then
  echo "REGRESSION: .pi and .claude retro skill copies drifted:" >&2
  cat /tmp/retro-skill-diff.$$ >&2
  rm -f /tmp/retro-skill-diff.$$
  exit 1
fi
rm -f /tmp/retro-skill-diff.$$

missing=()
for literal in \
  'allowed-tools: Read, Grep, Bash, Edit' \
  '${CLAUDE_SKILL_DIR}/references/report-schema.md' \
  '${CLAUDE_SKILL_DIR}/scripts/validate-retro-report.sh' \
  '${CLAUDE_SKILL_DIR}/scripts/render-log-entry.sh' \
  '${CLAUDE_SKILL_DIR}/scripts/check-memory-duplicates.sh' \
  '| ID | Subsystem | Hypothesis | Evidence for | Evidence against | Verdict | Confidence | Promotion |' \
  'write only the required `.oh/memory/<UTC-date>/log.md` entry with `Result: DRY-RUN`' \
  '[<subsystem> · <confidence> · harden|proceduralize|eval] — probe: <id> | basis:' \
  'Bypassing the schema/scripts'
do
  if ! grep -Fq "$literal" "$PI_DIR/SKILL.md"; then
    missing+=("$literal")
  fi
done
if (( ${#missing[@]} > 0 )); then
  echo "REGRESSION: retro deterministic contract missing literals:" >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

log_output=$("$PI_DIR/scripts/render-log-entry.sh" \
  --result DRY-RUN \
  --subsystems 'memory scaffolding' \
  --hypotheses 1 --supported 1 --refuted 0 --inconclusive 0 \
  --memory 0 --identity 0 \
  --observation 'deterministic helper smoke test' \
  --time 12:34)
grep -Fq '## Retro -- 12:34 UTC' <<<"$log_output" || { echo "REGRESSION: log helper omitted timestamp" >&2; exit 1; }
grep -Fq '**Result**: DRY-RUN' <<<"$log_output" || { echo "REGRESSION: log helper omitted dry-run result" >&2; exit 1; }

report=$(mktemp)
cat > "$report" <<'REPORT'
## Session signals
- signal

## Hypotheses
| ID | Subsystem | Hypothesis | Evidence for | Evidence against | Verdict | Confidence | Promotion |
|----|-----------|------------|--------------|------------------|---------|------------|-----------|
| H1 | memory scaffolding | Retro deterministic helpers can be validated. | helper scripts exist | none found in-session | supported | medium | MEMORY |

## Promotion candidates
Proposed MEMORY.md addition(s):
- 2026-06-18: Retro deterministic helpers can be validated. [memory scaffolding · medium · proceduralize] — probe: memory-scaffolding-20260618 | basis: helper scripts exist

Proposed IDENTITY.md addition(s):
- none

## Log entry
- rendered log

STATUS: RETRO-DONE
REPORT
"$PI_DIR/scripts/validate-retro-report.sh" "$report" >/dev/null
rm -f "$report"

echo "PASS: retro deterministic schema and self-contained helper contract are present" >&2
exit 0
