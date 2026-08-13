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
  'Bypassing the schema/scripts' \
  'argument-hint: "[--dry-run] [--focus <subsystem>] [auto-approve]"' \
  ' --memory pending --identity pending' \
  'Reporting resolved counts before resolution.'
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

# --- issue #767: the gate-open contract --------------------------------------
# The promotion counts are unknowable while the propose-then-confirm gate is
# open, because the agent's turn ends at the gate. The helper must therefore
# refuse to render a count under GATE-PENDING, and SKILL.md must order the
# gate-open append AHEAD of the proposal block that ends the turn.
# Every assertion below carries a unique `767-<id>` tag so a failure is
# attributable to one assertion by message alone.
HELPER="$PI_DIR/scripts/render-log-entry.sh"
gate_args=(--subsystems 'memory scaffolding' --hypotheses 1 --supported 1 --refuted 0 --inconclusive 0 --observation 'gate contract' --time 12:34)

reject_767() { # $1 = assertion id, $2 = what it guards, rest = helper args
  local id="$1" guards="$2"; shift 2
  if "$HELPER" "$@" >/dev/null 2>&1; then
    echo "REGRESSION: $id helper accepted an invocation it must reject ($guards)" >&2
    exit 1
  fi
}

# (767-a) GATE-PENDING is accepted and renders the pending promotion line.
pending_output=$("$HELPER" --result GATE-PENDING "${gate_args[@]}" --memory pending --identity pending) \
  || { echo "REGRESSION: 767-a helper rejected a valid GATE-PENDING entry" >&2; exit 1; }
grep -Fq -- '- **Promoted**: pending gate resolution' <<<"$pending_output" \
  || { echo "REGRESSION: 767-a GATE-PENDING entry omitted the pending promotion line" >&2; exit 1; }

# (767-b) A count under GATE-PENDING is the defect itself — it must be refused.
reject_767 '767-b' 'an integer promotion count while the gate is open' \
  --result GATE-PENDING "${gate_args[@]}" --memory 0 --identity pending
reject_767 '767-b2' 'an integer identity count while the gate is open' \
  --result GATE-PENDING "${gate_args[@]}" --memory pending --identity 0

# (767-c) `pending` must not leak into a resolved entry.
reject_767 '767-c' 'a pending count on a non-GATE-PENDING result' \
  --result OP "${gate_args[@]}" --memory pending --identity 0

# (767-d) `pending` is valid for the two promotion fields ONLY. This catches the
# minimal-diff fix of widening the shared integer regex for all six counts.
reject_767 '767-d' 'pending on a hypothesis count, not a promotion count' \
  --result OP --subsystems s --hypotheses pending --supported 1 --refuted 0 \
  --inconclusive 0 --observation o --time 12:34 --memory 0 --identity 0

# (767-e) --resolves joins a resolution back to its gate, and only under OP.
resolves_output=$("$HELPER" --result OP "${gate_args[@]}" --memory 1 --identity 0 --resolves 06:02) \
  || { echo "REGRESSION: 767-e helper rejected a valid --resolves entry" >&2; exit 1; }
grep -Fq -- '- **Resolves**: the GATE-PENDING entry from 06:02 UTC' <<<"$resolves_output" \
  || { echo "REGRESSION: 767-e resolving entry omitted the Resolves join line" >&2; exit 1; }
reject_767 '767-e2' '--resolves on a result that never opens a gate' \
  --result DRY-RUN "${gate_args[@]}" --memory 0 --identity 0 --resolves 06:02

# (767-f) SKILL.md step order. The chain is anchored at BOTH ends: asserting
# only "gate-append precedes §7" would pass on a tree that moved the append into
# §1, and asserting only an upper bound would pass on one that moved it after
# the proposal block — which is the exact position that reintroduces the defect.
order_ids=('767-f1' '767-f2' '767-f3' '767-f4' '767-f5')
order_anchors=(
  '### 6. Propose-then-confirm gate'
  '--result GATE-PENDING'
  'Type APPROVE to write'
  '### 7. Write approved changes'
  '--resolves '
)
order_lines=()
for i in "${!order_anchors[@]}"; do
  # `|| line=""` is load-bearing: grep exits 1 on no match, and under
  # `set -o pipefail` that would abort the probe here with an EMPTY message,
  # leaving the failure unattributable and the guard below dead code.
  line=$(grep -nF -- "${order_anchors[$i]}" "$PI_DIR/SKILL.md" | head -1 | cut -d: -f1) || line=""
  # A deleted anchor yields the empty string, and `(( "" < 100 ))` is TRUE in
  # bash — so an unguarded numeric compare would PASS on a file whose anchor was
  # removed outright. Reject non-numeric before comparing anything.
  if [[ -z "$line" || ! "$line" =~ ^[0-9]+$ ]]; then
    echo "REGRESSION: ${order_ids[$i]} SKILL.md step-order anchor is missing: ${order_anchors[$i]}" >&2
    exit 1
  fi
  order_lines+=("$line")
done
for i in 1 2 3 4; do
  prev=$(( i - 1 ))
  if (( order_lines[i] <= order_lines[prev] )); then
    echo "REGRESSION: 767-f SKILL.md step order broken: '${order_anchors[$prev]}' (line ${order_lines[$prev]}) must precede '${order_anchors[$i]}' (line ${order_lines[$i]})" >&2
    exit 1
  fi
done

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
