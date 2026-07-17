#!/usr/bin/env bash
# tier: A
# source: issue #583/#645 — production /audit implementation Gate 1 behavior
# desc: unfinished stories and missing/root-escaping artifacts return nonzero; valid rooted fixtures pass
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
GATE="$REPO/.oh/skills/audit/scripts/implementation-gates.sh"
FIX="$REPO/.oh/skills/audit/fixtures/artifact-contract.prd.json"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/.oh/tasks/fixture" "$tmp/.oh/skills/audit/fixtures"
cp "$FIX" "$tmp/.oh/tasks/fixture/prd.json"; cp "$FIX" "$tmp/.oh/skills/audit/fixtures/artifact-contract.prd.json"
fail(){ echo "REGRESSION: $*" >&2; exit 1; }
# Resolve the documentation link from its containing references directory.
doc_link=$(grep -o '](\.\./\.\./\.\./docs/artifact-contract-schema.md)' "$REPO/.oh/skills/audit/references/implementation.md" | head -1)
doc_rel=${doc_link#](}; doc_rel=${doc_rel%)}
[[ -n $doc_rel && -f "$REPO/.oh/skills/audit/references/$doc_rel" ]] || fail 'artifact schema documentation link is broken'
set +e; out=$(AUDIT_ROOT="$tmp" bash "$GATE" gate1 fixture 2>&1); rc=$?; set -e
[[ $rc -ne 0 && $out == *'FAIL gate1'* ]] || fail 'missing artifact did not fail Gate 1'
printf present >"$tmp/.oh/skills/audit/fixtures/MISSING-ON-PURPOSE.md"
AUDIT_ROOT="$tmp" bash "$GATE" gate1 fixture >/dev/null || fail 'all-present contract failed'
jq '.userStories[0].passes=false' "$tmp/.oh/tasks/fixture/prd.json" >"$tmp/prd.tmp"; mv "$tmp/prd.tmp" "$tmp/.oh/tasks/fixture/prd.json"
if AUDIT_ROOT="$tmp" bash "$GATE" gate1 fixture >/dev/null 2>&1; then fail 'unfinished graph returned zero'; fi
jq '.userStories[0].passes=true | .artifact_contract.required_artifacts=["/tmp/outside"]' "$tmp/.oh/tasks/fixture/prd.json" >"$tmp/prd.tmp"; mv "$tmp/prd.tmp" "$tmp/.oh/tasks/fixture/prd.json"
if AUDIT_ROOT="$tmp" bash "$GATE" gate1 fixture >/dev/null 2>&1; then fail 'absolute artifact escaped AUDIT_ROOT'; fi
jq '.artifact_contract.required_artifacts=[".oh/skills/audit/fixtures/../../../tasks/fixture/prd.json"]' "$tmp/.oh/tasks/fixture/prd.json" >"$tmp/prd.tmp"; mv "$tmp/prd.tmp" "$tmp/.oh/tasks/fixture/prd.json"
if AUDIT_ROOT="$tmp" bash "$GATE" gate1 fixture >/dev/null 2>&1; then fail 'non-canonical traversal artifact accepted'; fi
mkdir -p "$tmp/outside"; printf outside >"$tmp/outside/value"; ln -s "$tmp/outside" "$tmp/.oh/linked-artifacts"
jq '.artifact_contract.required_artifacts=[".oh/linked-artifacts/value"]' "$tmp/.oh/tasks/fixture/prd.json" >"$tmp/prd.tmp"; mv "$tmp/prd.tmp" "$tmp/.oh/tasks/fixture/prd.json"
if AUDIT_ROOT="$tmp" bash "$GATE" gate1 fixture >/dev/null 2>&1; then fail 'symlinked artifact component accepted'; fi
echo 'PASS: production implementation Gate 1 behavior' >&2
