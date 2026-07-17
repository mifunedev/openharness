#!/usr/bin/env bash
# tier: A
# source: issue #645 — one locked versioned ablation recovery owner
# desc: ablation restores bytes, rejects unsafe targets, and clears recovery state
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"; A="$ROOT/.oh/scripts/ablate.sh"
tmp="$ROOT/.oh/evals/.ablate-probe-target.$$"; tmp2="$tmp.two"; probe=$(mktemp); trap 'rm -f "$tmp" "$tmp2" "$probe"; rm -rf "$ROOT/.oh/evals/.ablation-state"' EXIT
printf original >"$tmp"; printf second >"$tmp2"; chmod +x "$probe"
# use a probe independent of args so CLI completes and restores
printf '#!/bin/sh\nexit 0\n' >"$probe"
before=$(sha256sum "$tmp"); AUDIT_ROOT="$ROOT" bash "$A" "$tmp" "$probe" >/dev/null; after=$(sha256sum "$tmp")
[[ $before == "$after" ]] || { echo 'REGRESSION: bytes not restored' >&2; exit 1; }
[[ ! -d "$ROOT/.oh/evals/.ablation-state" || -z $(find "$ROOT/.oh/evals/.ablation-state" -type f ! -name '*.lock' -print -quit) ]] || { echo 'REGRESSION: recovery state remains' >&2; exit 1; }
if AUDIT_ROOT="$ROOT" bash "$A" /tmp/outside "$probe" >/dev/null 2>&1; then echo 'REGRESSION: outside root accepted' >&2; exit 1; fi
if AUDIT_ROOT="$ROOT" bash "$A" "$ROOT/CLAUDE.md" "$probe" >/dev/null 2>&1; then echo 'REGRESSION: CLAUDE.md accepted' >&2; exit 1; fi
# SIGKILL cannot trap: next startup recovery must restore the exact bytes.
set +e
AUDIT_ROOT="$ROOT" A="$A" T="$tmp" bash -c 'source "$A"; ablate_swap_out "$T"; kill -KILL $$' >/dev/null 2>&1
set -e
[[ ! -e $tmp ]] || { echo 'REGRESSION: crash fixture did not swap target' >&2; exit 1; }
AUDIT_ROOT="$ROOT" A="$A" T="$tmp" bash -c 'source "$A"; ablate_recover "$T"'
[[ $(<"$tmp") == original ]] || { echo 'REGRESSION: crash recovery bytes differ' >&2; exit 1; }
# Different canonical targets may be independently locked/swapped and both restore.
AUDIT_ROOT="$ROOT" A="$A" T="$tmp" bash -c 'source "$A"; ablate_swap_out "$T"; sleep 1; ablate_restore "$T"' & p1=$!
AUDIT_ROOT="$ROOT" A="$A" T="$tmp2" bash -c 'source "$A"; ablate_swap_out "$T"; sleep 1; ablate_restore "$T"' & p2=$!
wait "$p1"; wait "$p2"
[[ $(<"$tmp") == original && $(<"$tmp2") == second ]] || { echo 'REGRESSION: concurrent targets not restored' >&2; exit 1; }
echo 'PASS: ablation state machine' >&2
