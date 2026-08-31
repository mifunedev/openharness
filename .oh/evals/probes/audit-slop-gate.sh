#!/usr/bin/env bash
# tier: A
# source: .claude/specs/images/reduce-slop.png — the four correctness gates all pass a change
#         that works and is twice the size it needed to be. Nothing forced the diff smaller.
# desc: /audit implementation gate 5 measures slop, blocks on a concrete smaller alternative,
#       and terminates by construction (round cap or a non-reducing round) rather than by taste.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
REF="$ROOT/.oh/skills/audit/references/implementation.md"
EXEC="$ROOT/.oh/skills/spec/references/execute.md"
GATE="$ROOT/.oh/skills/audit/scripts/implementation-gates.sh"

fail() { echo "REGRESSION: $*" >&2; exit 1; }

for f in "$REF" "$EXEC" "$GATE"; do [[ -f $f ]] || fail "missing: $f"; done

grep -Fq '## The five gates (fail-fast, in order)' "$REF" || fail 'gate 5 not in the fail-fast chain'
grep -Fq '### Gate 5 — Slop (less code, low complexity)' "$REF" || fail 'gate 5 section missing'
grep -Fq 'concrete simpler alternative is not a finding' "$REF" \
  || fail 'the termination rule that keeps gate 5 from becoming taste is missing'
grep -Fq 'SIMPLICITY-RESIDUAL' "$REF" || fail 'residual disclosure missing from the verdict'
grep -Fq 'never report it as CCN' "$REF" || fail 'the bash branch-point proxy is not labelled as a proxy'
grep -Fq 'never infer green from' "$REF" || fail 'unavailable complexity tool may be read as green'
grep -Fq '.oh/tasks/<slug>/simplify-rounds.json' "$REF" || fail 'gate 5 does not name the round record'
grep -Fq 'simplify-rounds.json' "$EXEC" || fail 'the caller that owns the round record does not write it'
grep -Fq 'non-reducing round' "$EXEC" || fail 'the monotone termination rule is not documented for the caller'

root=$(mktemp -d); trap 'rm -rf "$root"' EXIT
mkdir -p "$root/.oh/tasks/demo"
git -C "$root" init -q
git -C "$root" config user.email test@example.invalid
git -C "$root" config user.name test
printf 'a\nb\nc\n' >"$root/keep.sh"
git -C "$root" add .; git -C "$root" commit -qm base
base=$(git -C "$root" rev-parse HEAD)
printf 'a\nb\nc\nif x; then y; fi\nwhile z; do w; done\n' >"$root/keep.sh"
git -C "$root" add .; git -C "$root" commit -qm change

metrics=$(AUDIT_ROOT="$root" bash "$GATE" slop-metrics "$base")
[[ $(jq -r .netAdded <<<"$metrics") == 2 ]] || fail "netAdded wrong: $metrics"
[[ $(jq -r .netRemoved <<<"$metrics") == 0 ]] || fail "netRemoved wrong: $metrics"
[[ $(jq -r .shBranchPoints <<<"$metrics") == 2 ]] || fail "shBranchPoints wrong: $metrics"

if AUDIT_ROOT="$root" bash "$GATE" slop-metrics no-such-ref >/dev/null 2>&1; then
  fail 'unknown base ref was accepted'
fi

stub=$(mktemp -d); printf '#!/bin/sh\nexit 127\n' >"$stub/uvx"; chmod +x "$stub/uvx"
printf 'export function f(){return 1}\n' >"$root/x.ts"
git -C "$root" add .; git -C "$root" commit -qm ts
offline=$(PATH="$stub:$PATH" AUDIT_ROOT="$root" bash "$GATE" slop-metrics "$base")
rm -rf "$stub"
[[ $(jq -r .tool <<<"$offline") == unavailable ]] \
  || fail "an unresolvable lizard must report unavailable, got: $(jq -r .tool <<<"$offline")"

round() { AUDIT_ROOT="$root" bash "$GATE" simplicity-round demo; }
[[ $(round) == 'rounds=0 cap=3 escalate=false prevNetAdded=none' ]] || fail "missing counter: $(round)"
printf '{"rounds":2,"netAdded":410}' >"$root/.oh/tasks/demo/simplify-rounds.json"
[[ $(round) == 'rounds=2 cap=3 escalate=false prevNetAdded=410' ]] || fail "below cap: $(round)"
printf '{"rounds":3,"netAdded":380}' >"$root/.oh/tasks/demo/simplify-rounds.json"
[[ $(round) == 'rounds=3 cap=3 escalate=true prevNetAdded=380' ]] || fail "at cap must escalate: $(round)"
printf '{"rounds":"two"}' >"$root/.oh/tasks/demo/simplify-rounds.json"
if round >/dev/null 2>&1; then fail 'malformed counter was accepted'; fi
if AUDIT_ROOT="$root" bash "$GATE" simplicity-round '../etc' >/dev/null 2>&1; then
  fail 'traversal slug was accepted'
fi
ln -s /tmp "$root/.oh/tasks/linked"
if AUDIT_ROOT="$root" bash "$GATE" simplicity-round linked >/dev/null 2>&1; then
  fail 'symlinked task directory was accepted'
fi

grep -Fq 'slop-metrics|simplicity-round' "$GATE" || fail 'new modes absent from the usage line'

echo 'PASS: gate 5 measures slop and terminates on the cap or a non-reducing round' >&2
