#!/usr/bin/env bash
# tier: A
# source: retro lesson 2026-08-31 (unexercised oracle) — a probe green in a 112-probe run carried three parser defects
# desc: the probe contract requires driving a new probe's REGRESSION branch against a broken input, and the two probes whose oracle lives in git history keep their comparison-point override reachable
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
README="$ROOT/.oh/evals/README.md"

if [[ ! -f "$README" ]]; then
  echo "SKIPPED: evals README absent: .oh/evals/README.md" >&2
  exit 2
fi

failures=()
need() { grep -qF -- "$1" "$README" || failures+=("evals/README.md missing contract text: $1"); }

need '### Fault injection'
need 'drive its REGRESSION branch'
need 'expose the'
need 'is unexercised, not healthy'

# The documented overrides must still exist, or the guidance names a dead handle.
declare -A OVERRIDES=(
  ["wiki-skill-impact-append-only"]="WIKI_LEDGER_BASE"
  ["wiki-pattern-persistence"]="WIKI_PERSISTENCE_BASE"
)
for id in "${!OVERRIDES[@]}"; do
  probe="$ROOT/.oh/evals/probes/$id.sh"
  var="${OVERRIDES[$id]}"
  if [[ ! -f "$probe" ]]; then
    failures+=("$id.sh is named in the fault-injection guidance but does not exist")
    continue
  fi
  grep -qF "\${$var:-}" "$probe" \
    || failures+=("$id.sh no longer reads $var — its failing branch is unreachable after the fact")
done

if ((${#failures[@]})); then
  printf 'REGRESSION: %s\n' "${failures[@]}" >&2
  exit 1
fi

echo "PASS: the probe contract requires fault injection and both documented comparison-point overrides are live" >&2
exit 0
