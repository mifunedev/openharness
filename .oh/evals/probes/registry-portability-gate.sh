#!/usr/bin/env bash
# tier: A
# source: issue #758
# desc: the registry portability gate stays armed — linter present and fail-closed, exception list parseable, invocation site still cites it
set -euo pipefail

# Companion to registry-portability.sh. That probe scans the published registry
# and therefore SKIPS whenever no checkout is supplied, which is every run in
# CI. This probe carries the half of the contract that lives in THIS repository,
# so it is always armed and can never skip: it asserts the gate is still wired
# and still fails closed. A gate nobody calls, or one that exits 0 on a scan it
# could not perform, is disarmed without anything going red.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
LINTER="$ROOT/.oh/scripts/registry-portability.sh"
CONTRACT="$ROOT/.oh/scripts/registry-portability.md"
CALLER="$ROOT/.oh/skills/builder/references/skill.md"

fail() {
  echo "REGRESSION: $1" >&2
  exit 1
}

# 1. The linter exists and is runnable.
[[ -f "$LINTER" ]] || fail "the portability linter is absent: .oh/scripts/registry-portability.sh"
bash -n "$LINTER" 2>/dev/null || fail "the portability linter is not valid bash: .oh/scripts/registry-portability.sh"

# 2. The exception list is present and parseable. The linter fails closed when
#    this file is unreadable, so a malformed contract would turn every run into
#    exit 2 — a permanent SKIPPED that reads like "nothing to report".
[[ -f "$CONTRACT" ]] || fail "the exception list is absent: .oh/scripts/registry-portability.md"

blocks=$(grep -c '^```allow$' "$CONTRACT" || true)
(( blocks == 1 )) || fail "expected exactly one fenced block tagged allow in registry-portability.md, found $blocks"

# Every entry inside the block must carry five fields, a known class, and a
# 12-hex line hash. A malformed entry is skipped with a warning by the linter,
# which silently drops a suppression or a triage record.
malformed=$(
  awk '
    /^```allow$/ { inblock = 1; next }
    inblock && /^```$/ { inblock = 0; next }
    !inblock { next }
    /^[[:space:]]*$/ { next }
    /^[[:space:]]*#/ { next }
    {
      n = split($0, f, "|")
      if (n != 5) { print "not five fields: " $0; next }
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", f[1])
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", f[4])
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", f[5])
      if (f[1] != "ALLOW" && f[1] != "KNOWN") { print "unknown class: " $0; next }
      if (f[4] !~ /^[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]$/) { print "bad hash: " $0; next }
      if (f[5] == "") { print "empty reason: " $0 }
    }
  ' "$CONTRACT"
)
if [[ -n "$malformed" ]]; then
  echo "REGRESSION: malformed entries in the registry-portability exception list:" >&2
  printf '%s\n' "$malformed" >&2
  exit 1
fi

# 3. The gate still has a caller. The check was landed with no invocation site
#    at all; the publishing step in the builder reference is the one place that
#    tells an author to run it before opening a registry pull request.
grep -q 'registry-portability\.sh' "$CALLER" \
  || fail "the builder publishing step no longer cites registry-portability.sh — the gate has no caller"

# 4. The linter fails closed. A scan that could not run must never report a pass.
#    Verified by rejection against a path that does not exist, not by trusting
#    the good case.
absent="$ROOT/.oh/scripts/.registry-portability-probe-absent-$$"
set +e
bash "$LINTER" --registry "$absent" >/dev/null 2>&1
rc=$?
set -e
(( rc == 2 )) || fail "the linter exited $rc on an unreadable registry; the fail-closed contract requires 2"

echo "PASS: the registry portability gate is armed — linter valid and fail-closed, exception list parseable, invocation site intact" >&2
exit 0
