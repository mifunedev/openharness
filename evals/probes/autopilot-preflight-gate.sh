#!/usr/bin/env bash
# tier: A
# source: issue #194 (deterministic autopilot caps preflight gate) 2026-06-15
# desc: the autopilot caps are enforced by a deterministic preflight gate that runs
#       BEFORE any worktree/tmux/agent — the cron runtime carries a generic
#       `preflight:` field (runPreflight + SKIPPED_PREFLIGHT/PREFLIGHT_ERROR), the
#       runtime fails closed when a configured preflight cannot be evaluated, the
#       autopilot cron wires `preflight: .mifune/skills/autopilot/autopilot-caps.sh`,
#       and the script exists, is executable, defaults its caps from harness.yaml,
#       and emits the SKIPPED-CAP-* / PROCEED contract (verified hermetically with a gh stub).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME="$ROOT/.oh/scripts/cron-runtime.ts"
CRON="$ROOT/crons/autopilot.md"
SCRIPT="$ROOT/.mifune/skills/autopilot/autopilot-caps.sh"
SKILL="$ROOT/.claude/skills/autopilot/SKILL.md"
YAML="$ROOT/harness.yaml"
TESTS="$ROOT/.oh/scripts/__tests__/autopilot-caps.test.ts"

for f in "$RUNTIME" "$CRON" "$SCRIPT" "$SKILL" "$YAML"; do
  [[ -f "$f" ]] || { echo "SKIPPED: missing $f" >&2; exit 2; }
done

missing=()

# 1. cron runtime carries the generic preflight gate seam.
grep -Fq 'preflight?: string;' "$RUNTIME" || missing+=("CronEntry carries optional preflight")
grep -Fq 'preflight: fm.preflight || undefined' "$RUNTIME" || missing+=("parseCronFile reads the preflight frontmatter key")
grep -Fq 'export function runPreflight(' "$RUNTIME" || missing+=("cron runtime defines runPreflight")
grep -Fq '"SKIPPED_PREFLIGHT"' "$RUNTIME" || missing+=("fire() logs SKIPPED_PREFLIGHT on a non-zero gate")
grep -Fq '"PREFLIGHT_ERROR"' "$RUNTIME" || missing+=("runPreflight logs PREFLIGHT_ERROR when the gate cannot be evaluated")
grep -Fq 'preflight-error: exec-error' "$RUNTIME" || missing+=("runPreflight fails closed with a non-zero exec-error status")
grep -Fq 'preflight-error: invalid-path' "$RUNTIME" || missing+=("runPreflight fails closed with a non-zero invalid-path status")
if grep -Fq 'reason: "exec-error"' "$RUNTIME" || grep -Fq 'reason: "invalid-path"' "$RUNTIME"; then
  missing+=("runPreflight appears to retain the old fail-open reason contract")
fi
# The gate must short-circuit fire() BEFORE the tmux branch (no worktree/session on skip).
grep -Eq 'if \((entry|liveEntry)\.preflight\) \{' "$RUNTIME" || missing+=("fire() runs the preflight gate before spawning")

# 2. the autopilot cron wires the gate.
grep -Eq '^preflight:[[:space:]]*\.mifune/skills/autopilot/autopilot-caps\.sh[[:space:]]*$' "$CRON" \
  || missing+=("crons/autopilot.md wires preflight: .mifune/skills/autopilot/autopilot-caps.sh")
grep -Eq '^repo:[[:space:]]*mifunedev/openharness[[:space:]]*$' "$CRON" \
  || missing+=("crons/autopilot.md targets repo: mifunedev/openharness")

# 3. the canonical gate script: executable + the STATUS contract + harness.yaml caps.
[[ -x "$SCRIPT" ]] || missing+=(".mifune/skills/autopilot/autopilot-caps.sh is executable")
grep -Fq 'SKIPPED-CAP-TOTAL' "$SCRIPT" || missing+=("gate emits SKIPPED-CAP-TOTAL")
grep -Fq 'SKIPPED-CAP-DAILY' "$SCRIPT" || missing+=("gate emits SKIPPED-CAP-DAILY")
grep -Fq 'PROCEED-GH-ERROR' "$SCRIPT" || missing+=("gate fails open with PROCEED-GH-ERROR")
grep -Fq 'harness_cfg autopilot.total_cap' "$SCRIPT" || missing+=("gate defaults total cap from harness.yaml")
grep -Fq 'harness_cfg autopilot.daily_cap' "$SCRIPT" || missing+=("gate defaults daily cap from harness.yaml")
grep -Fq 'pr list --repo "$REPO"' "$SCRIPT" || missing+=("gate scopes gh PR counts with --repo")
grep -Fq 'AUTOPILOT_REPO:-mifunedev/openharness' "$SCRIPT" || missing+=("gate defaults to canonical mifunedev/openharness repo")

# 4. harness.yaml documents the configurable cap defaults (even while commented).
grep -Eq '^[[:space:]]*#?[[:space:]]*total_cap:' "$YAML" || missing+=("harness.yaml documents autopilot.total_cap")
grep -Eq '^[[:space:]]*#?[[:space:]]*daily_cap:' "$YAML" || missing+=("harness.yaml documents autopilot.daily_cap")

# 5. the autopilot skill §1 defers to the canonical script (no duplicate cap shell).
grep -Fq '.mifune/skills/autopilot/autopilot-caps.sh' "$SKILL" || missing+=("autopilot SKILL §1 defers to .mifune/skills/autopilot/autopilot-caps.sh")

# 6. tests exist for the gate contract.
[[ -f "$TESTS" ]] || missing+=(".oh/scripts/__tests__/autopilot-caps.test.ts exists")

# 7. HERMETIC behavioral check — run the gate with a gh stub (no network/auth).
#    Fail-open: a gh failure → PROCEED-GH-ERROR, exit 0.
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
set +e
out_err=$(AUTOPILOT_LOG_ROOT="$tmpdir" GH_BIN=false bash "$SCRIPT" 2>/dev/null); rc_err=$?
# Cap trip: a stub gh reporting 10 open → SKIPPED-CAP-TOTAL, exit 11.
stub="$tmpdir/gh"; printf '#!/usr/bin/env bash\necho 10\n' > "$stub"; chmod +x "$stub"
out_cap=$(AUTOPILOT_LOG_ROOT="$tmpdir" GH_BIN="$stub" bash "$SCRIPT" 2>/dev/null); rc_cap=$?
set -e
[[ "$rc_err" -eq 0 && "$out_err" == *"PROCEED-GH-ERROR" ]] \
  || missing+=("gate fails open (PROCEED-GH-ERROR, exit 0) on a gh error; got rc=$rc_err last='${out_err##*$'\n'}'")
[[ "$rc_cap" -eq 11 && "$out_cap" == *"SKIPPED-CAP-TOTAL" ]] \
  || missing+=("gate exits 11 + SKIPPED-CAP-TOTAL when total>=cap; got rc=$rc_cap last='${out_cap##*$'\n'}'")

if (( ${#missing[@]} )); then
  printf 'REGRESSION: autopilot preflight gate missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: autopilot caps enforced by a deterministic preflight gate (cron preflight: field + fail-closed runPreflight/SKIPPED_PREFLIGHT, harness.yaml-configurable caps, SKIPPED-CAP-*/PROCEED contract verified hermetically)" >&2
exit 0
