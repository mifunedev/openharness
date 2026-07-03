#!/usr/bin/env bash
# tier: A
# source: issue #583 (repair-registry-artifact-contract) 2026-07-03
# desc: /audit Gate 1 sub-check (b) — the artifact-contract enforcement — must FAIL
#       (non-zero exit + a "FAIL gate1: required_artifact missing" diagnostic) when a
#       declared artifact_contract.required_artifacts path is absent on disk, and PASS
#       (exit 0) when every declared artifact is present. This probe extracts the REAL
#       jq/while block from .oh/skills/audit/SKILL.md (the ```bash fence that reads
#       .artifact_contract.required_artifacts) and runs it against the tracked fixture
#       (.oh/skills/audit/references/artifact-contract-fixture.prd.json, which declares one
#       present + one deliberately-missing artifact) and an all-present variant. Extracting
#       and executing the actual SKILL.md block — not a reimplementation — makes this a
#       genuine guard: removing or breaking the gating sub-check regresses this probe.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILL="$ROOT/.oh/skills/audit/SKILL.md"
FIX="$ROOT/.oh/skills/audit/references/artifact-contract-fixture.prd.json"

# --- dependency / input guards: a missing tool or fixture is SKIPPED, never a regression -
if ! command -v jq >/dev/null 2>&1; then
  echo "SKIPPED: jq unavailable — cannot exercise the artifact-contract Gate 1 sub-check" >&2
  exit 2
fi
if [[ ! -f "$SKILL" ]]; then
  echo "SKIPPED: audit skill absent: $SKILL" >&2
  exit 2
fi
if [[ ! -f "$FIX" ]]; then
  echo "SKIPPED: artifact-contract fixture absent: $FIX" >&2
  exit 2
fi

tmpblock="$(mktemp)"; tmp_pass="$(mktemp)"
trap 'rm -f "$tmpblock" "$tmp_pass"' EXIT

# --- extract the REAL Gate 1 sub-check (b) block from SKILL.md ------------------------
# Walk the ```bash ... ``` fences; emit the single fenced block whose body references
# `.artifact_contract.required_artifacts` (sub-check (b)). Sub-check (a) references
# `.userStories`, and the prose mentions live outside any bash fence, so this is
# unambiguous. Empty output ⇒ the gating sub-check was removed ⇒ REGRESSION.
BLOCK="$(awk '
  /^```bash/ && !infence { infence=1; buf=""; mark=0; next }
  /^```[[:space:]]*$/ && infence { if (mark) { printf "%s", buf; exit } infence=0; next }
  infence { buf = buf $0 "\n"; if (index($0, "artifact_contract.required_artifacts")) mark=1 }
' "$SKILL")"

if [[ -z "$BLOCK" ]]; then
  echo "REGRESSION: no bash code fence reading .artifact_contract.required_artifacts found in audit/SKILL.md — the gating Gate 1 sub-check (b) is missing" >&2
  exit 1
fi
printf '%s\n' "$BLOCK" > "$tmpblock"

# The extracted block resolves each required_artifact with `[ -e ]` relative to CWD, and
# the fixture declares repo-relative paths — so run from the repo root, exactly as /audit does.
cd "$ROOT"

# --- FAIL case: fixture as-is (declares MISSING-ON-PURPOSE.md) → block must FAIL ------
set +e
out_fail="$(PRD="$FIX" bash "$tmpblock" 2>&1)"; rc_fail=$?
set -e
if [[ "$rc_fail" -eq 0 ]]; then
  echo "REGRESSION: Gate 1 artifact-contract block returned 0 on the missing-artifact fixture — a declared-but-absent required_artifact was NOT gated" >&2
  exit 1
fi
if ! grep -qi 'FAIL' <<<"$out_fail"; then
  echo "REGRESSION: Gate 1 block exited non-zero but printed no FAIL diagnostic (got: ${out_fail:-<empty>})" >&2
  exit 1
fi

# --- PASS case: synthesize an all-present variant (drop declared artifacts that don't
#     exist) and assert the block passes with a real, present required_artifact --------
# Collect the declared artifacts that currently exist. Use an array + `if` over process
# substitution (NOT a `jq | while [ -e ] | jq` pipeline): under `set -e`/`pipefail` a
# short-circuited `[ -e ]` on an absent path makes the pipeline non-zero and aborts.
present=()
while IFS= read -r a; do
  if [ -n "$a" ] && [ -e "$a" ]; then present+=("$a"); fi
done < <(jq -r '.artifact_contract.required_artifacts[]?' "$FIX")
present_count="${#present[@]}"
if [[ "$present_count" -lt 1 ]]; then
  echo "REGRESSION: fixture declares no present required_artifact — cannot build a PASS case (self-entry missing?)" >&2
  exit 1
fi
present_json="$(printf '%s\n' "${present[@]}" | jq -R . | jq -s .)"
jq --argjson keep "$present_json" '.artifact_contract.required_artifacts = $keep' "$FIX" > "$tmp_pass"

set +e
out_pass="$(PRD="$tmp_pass" bash "$tmpblock" 2>&1)"; rc_pass=$?
set -e
if [[ "$rc_pass" -ne 0 ]]; then
  echo "REGRESSION: Gate 1 block FAILed (exit $rc_pass) on an all-present artifact_contract — false positive (got: ${out_pass:-<empty>})" >&2
  exit 1
fi

echo "PASS: /audit Gate 1 artifact-contract sub-check (real block from audit/SKILL.md) FAILs on the missing-artifact fixture (exit $rc_fail) and PASSes on the $present_count-present variant (exit 0)" >&2
exit 0
