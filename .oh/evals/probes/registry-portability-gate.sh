#!/usr/bin/env bash
# tier: A
# source: issue #758
# desc: the registry portability gate stays armed — linter present and fail-closed, exception list parseable, invocation site still cites it
set -euo pipefail


ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
LINTER="$ROOT/.oh/scripts/registry-portability.sh"
CONTRACT="$ROOT/.oh/scripts/registry-portability.md"
CALLER="$ROOT/.oh/skills/builder/references/skill.md"

fail() {
  echo "REGRESSION: $1" >&2
  exit 1
}

[[ -f "$LINTER" ]] || fail "the portability linter is absent: .oh/scripts/registry-portability.sh"
bash -n "$LINTER" 2>/dev/null || fail "the portability linter is not valid bash: .oh/scripts/registry-portability.sh"

[[ -f "$CONTRACT" ]] || fail "the exception list is absent: .oh/scripts/registry-portability.md"

blocks=$(grep -c '^```allow$' "$CONTRACT" || true)
(( blocks == 1 )) || fail "expected exactly one fenced block tagged allow in registry-portability.md, found $blocks"

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

grep -q 'registry-portability\.sh' "$CALLER" \
  || fail "the builder publishing step no longer cites registry-portability.sh — the gate has no caller"

absent="$ROOT/.oh/scripts/.registry-portability-probe-absent-$$"
set +e
bash "$LINTER" --registry "$absent" >/dev/null 2>&1
rc=$?
set -e
(( rc == 2 )) || fail "the linter exited $rc on an unreadable registry; the fail-closed contract requires 2"

echo "PASS: the registry portability gate is armed — linter valid and fail-closed, exception list parseable, invocation site intact" >&2
exit 0
