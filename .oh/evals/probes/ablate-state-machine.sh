#!/usr/bin/env bash
# tier: A
# source: issue #645 — one locked versioned ablation recovery owner
# desc: production ablation handles locking, symlinks, traps, contradiction, and recovery safely
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"; A="$REPO/.oh/scripts/ablate.sh"
ROOT=$(mktemp -d); probe="$ROOT/probe.sh"; trap 'rm -rf "$ROOT"' EXIT
mkdir -p "$ROOT/.oh/evals"; printf '#!/bin/sh\nexit 0\n' >"$probe"; chmod +x "$probe"
target="$ROOT/.oh/evals/target"; target2="$ROOT/.oh/evals/target.two"
printf original >"$target"; printf second >"$target2"
fail(){ echo "REGRESSION: $*" >&2; exit 1; }
state="$ROOT/.oh/evals/.ablation-state"
assert_clean(){
  [[ ! -d $state || -z $(find "$state" -type f ! -name '.locks.guard' -print -quit) ]] || fail 'recovery/lock state remains'
}
before=$(sha256sum "$target"); AUDIT_ROOT="$ROOT" bash "$A" "$target" "$probe" >/dev/null; after=$(sha256sum "$target")
[[ $before == "$after" ]] || fail 'bytes not restored'; assert_clean
if AUDIT_ROOT="$ROOT" bash "$A" /tmp/outside-ablation-target "$probe" >/dev/null 2>&1; then fail 'outside root accepted'; fi
printf forbidden >"$ROOT/CLAUDE.md"
if AUDIT_ROOT="$ROOT" bash "$A" "$ROOT/CLAUDE.md" "$probe" >/dev/null 2>&1; then fail 'CLAUDE.md accepted'; fi
ln -s "$target" "$ROOT/.oh/evals/link"
if AUDIT_ROOT="$ROOT" bash "$A" "$ROOT/.oh/evals/link" "$probe" >/dev/null 2>&1; then fail 'symlink target accepted'; fi
rm "$ROOT/.oh/evals/link"
# SIGKILL cannot trap: the next startup recovery restores exact bytes.
set +e
AUDIT_ROOT="$ROOT" A="$A" T="$target" bash -c 'source "$A"; ablate_swap_out "$T"; kill -KILL $$' >/dev/null 2>&1
set -e
[[ ! -e $target ]] || fail 'crash fixture did not swap target'
AUDIT_ROOT="$ROOT" A="$A" T="$target" bash -c 'source "$A"; ablate_recover "$T"'
[[ $(<"$target") == original ]] || fail 'crash recovery bytes differ'; assert_clean
# Same-target lock contention fails; different targets remain independent.
AUDIT_ROOT="$ROOT" A="$A" T="$target" bash -c 'source "$A"; ablate_swap_out "$T"; sleep 1; ablate_restore "$T"' & p1=$!
sleep 0.2
if AUDIT_ROOT="$ROOT" A="$A" T="$target" bash -c 'source "$A"; ablate_swap_out "$T"' >/dev/null 2>&1; then fail 'same target lock contention accepted'; fi
AUDIT_ROOT="$ROOT" A="$A" T="$target2" bash -c 'source "$A"; ablate_swap_out "$T"; ablate_restore "$T"' & p2=$!
wait "$p1"; wait "$p2"
[[ $(<"$target") == original && $(<"$target2") == second ]] || fail 'concurrent target bytes differ'; assert_clean
# Existing EXIT trap is composed rather than clobbered.
marker="$ROOT/prior-trap"
AUDIT_ROOT="$ROOT" A="$A" T="$target" M="$marker" bash -c 'source "$A"; trap '\''printf prior >"$M"'\'' EXIT; ablate_swap_out "$T"; exit 0'
[[ $(<"$target") == original && $(<"$marker") == prior ]] || fail 'EXIT trap composition failed'; assert_clean
# Contradictory PREPARED state fails closed without overwriting either copy.
AUDIT_ROOT="$ROOT" A="$A" T="$target" bash -c 'source "$A"; _ablate_paths "$T"; mkdir -p "$ABLATE_STATE_ROOT"; cp "$T" "$ABLATE_BACKUP"; _ablate_record PREPARED; printf changed >"$T"'
if AUDIT_ROOT="$ROOT" A="$A" T="$target" bash -c 'source "$A"; ablate_recover "$T"' >/dev/null 2>&1; then fail 'contradictory PREPARED recovered'; fi
[[ $(<"$target") == changed ]] || fail 'contradictory recovery overwrote target'
backup=$(find "$state" -name '*.backup' -print -quit); [[ -n $backup && $(<"$backup") == original ]] || fail 'contradictory recovery overwrote backup'
rm -rf "$state"
echo 'PASS: ablation state machine' >&2
