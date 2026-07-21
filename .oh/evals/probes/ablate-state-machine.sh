#!/usr/bin/env bash
# tier: A
# source: issue #645 — one locked versioned ablation recovery owner
# desc: production ablation handles locking, symlinks, traps, contradiction, and recovery safely
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"; A="$REPO/.oh/scripts/ablate.sh"
ROOT=$(mktemp -d); probe="$ROOT/probe.sh"; trap 'rm -rf "$ROOT"' EXIT
mkdir -p "$ROOT/.oh/evals" "$ROOT/.oh/context" "$ROOT/.oh/memory"; printf '#!/bin/sh\nexit 0\n' >"$probe"; chmod +x "$probe"
target="$ROOT/.oh/context/SOUL.md"; target2="$ROOT/.oh/context/USER.md"
printf original >"$target"; printf second >"$target2"
fail(){ echo "REGRESSION: $*" >&2; exit 1; }
state="$ROOT/.oh/evals/.ablation-state"
assert_clean(){
  [[ ! -d $state || -z $(find "$state" -type f -print -quit) ]] || fail 'recovery/lock/guard state remains'
}
before=$(sha256sum "$target"); AUDIT_ROOT="$ROOT" bash "$A" "$target" "$probe" >/dev/null; after=$(sha256sum "$target")
[[ $before == "$after" ]] || fail 'bytes not restored'; assert_clean
if AUDIT_ROOT="$ROOT" bash "$A" /tmp/outside-ablation-target "$probe" >/dev/null 2>&1; then fail 'outside root accepted'; fi
printf internal >"$ROOT/.oh/evals/not-default-loaded"
if AUDIT_ROOT="$ROOT" bash "$A" "$ROOT/.oh/evals/not-default-loaded" "$probe" >/dev/null 2>&1; then fail 'non-context in-root target accepted'; fi
printf forbidden >"$ROOT/CLAUDE.md"
if AUDIT_ROOT="$ROOT" bash "$A" "$ROOT/CLAUDE.md" "$probe" >/dev/null 2>&1; then fail 'CLAUDE.md accepted'; fi
ln -s "$target" "$ROOT/.oh/evals/link"
if AUDIT_ROOT="$ROOT" bash "$A" "$ROOT/.oh/evals/link" "$probe" >/dev/null 2>&1; then fail 'symlink target accepted'; fi
rm "$ROOT/.oh/evals/link"
# The state directory itself must never be followed through a symlink.
rm -rf "$state"; mkdir "$ROOT/external-state"; ln -s "$ROOT/external-state" "$state"
if AUDIT_ROOT="$ROOT" bash "$A" "$target" "$probe" >/dev/null 2>&1; then fail 'symlinked state directory accepted'; fi
[[ -z $(find "$ROOT/external-state" -mindepth 1 -print -quit) ]] || fail 'symlink state directory was written'
# Global recovery must reject the symlink even when its destination is empty.
if AUDIT_ROOT="$ROOT" A="$A" bash -c 'source "$A"; ablate_recover' >/dev/null 2>&1; then fail 'global recovery accepted empty symlinked state directory'; fi
rm "$state"
# Shared-memory context lives under AUDIT_LOG_ROOT, while source context stays
# constrained to AUDIT_ROOT. It uses the same locked recovery owner safely.
SHARED=$(mktemp -d); mkdir -p "$SHARED/.oh/memory" "$SHARED/.oh/context"; printf shared >"$SHARED/.oh/memory/MEMORY.md"; printf forbidden >"$SHARED/.oh/context/USER.md"
AUDIT_ROOT="$ROOT" AUDIT_LOG_ROOT="$SHARED" A="$A" T="$SHARED/.oh/memory/MEMORY.md" bash -c 'source "$A"; ablate_swap_out "$T"; [[ ! -e $T ]]; ablate_restore "$T"'
[[ $(<"$SHARED/.oh/memory/MEMORY.md") == shared ]] || fail 'shared MEMORY bytes not restored'
if AUDIT_ROOT="$ROOT" AUDIT_LOG_ROOT="$SHARED" A="$A" T="$SHARED/.oh/context/USER.md" bash -c 'source "$A"; _ablate_canonical "$T"' >/dev/null 2>&1; then fail 'non-memory shared target escaped source-root constraint'; fi
rm -rf "$SHARED"; assert_clean
# SIGKILL cannot trap: the next startup recovery restores exact bytes.
set +e
AUDIT_ROOT="$ROOT" A="$A" T="$target" bash -c 'source "$A"; ablate_swap_out "$T"; kill -KILL $$' >/dev/null 2>&1
set -e
[[ ! -e $target ]] || fail 'crash fixture did not swap target'
AUDIT_ROOT="$ROOT" A="$A" T="$target" bash -c 'source "$A"; ablate_recover "$T"'
[[ $(<"$target") == original ]] || fail 'crash recovery bytes differ'; assert_clean
# PREPARED can be durable while target removal already happened (crash before SWAPPED).
AUDIT_ROOT="$ROOT" A="$A" T="$target" bash -c 'source "$A"; _ablate_paths "$T"; _ablate_lock; cp -p "$T" "$ABLATE_BACKUP"; _ablate_record PREPARED; rm "$T"; _ablate_unlock'
AUDIT_ROOT="$ROOT" A="$A" T="$target" bash -c 'source "$A"; ablate_recover "$T"'
[[ $(<"$target") == original ]] || fail 'PREPARED missing-target recovery failed'; assert_clean
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
# Explicit restore reinstates prior traps instead of clearing them.
marker2="$ROOT/prior-after-restore"
AUDIT_ROOT="$ROOT" A="$A" T="$target" M="$marker2" bash -c 'source "$A"; trap '\''printf restored >"$M"'\'' EXIT; ablate_swap_out "$T"; ablate_restore "$T"; [[ $(trap -p EXIT) == *"printf restored"* ]]'
[[ $(<"$marker2") == restored ]] || fail 'prior trap not preserved after explicit restore'; assert_clean
# Contradictory PREPARED state fails closed without overwriting either copy.
AUDIT_ROOT="$ROOT" A="$A" T="$target" bash -c 'source "$A"; _ablate_paths "$T"; mkdir -p "$ABLATE_STATE_ROOT"; cp "$T" "$ABLATE_BACKUP"; _ablate_record PREPARED; printf changed >"$T"'
if AUDIT_ROOT="$ROOT" A="$A" T="$target" bash -c 'source "$A"; ablate_recover "$T"' >/dev/null 2>&1; then fail 'contradictory PREPARED recovered'; fi
[[ $(<"$target") == changed ]] || fail 'contradictory recovery overwrote target'
backup=$(find "$state" -name '*.backup' -print -quit); [[ -n $backup && $(<"$backup") == original ]] || fail 'contradictory recovery overwrote backup'
rm -rf "$state"
# A recovery record whose filename hash does not match its declared target is an
# orphan mismatch, not a reason to silently recover a different path.
AUDIT_ROOT="$ROOT" A="$A" T="$target" bash -c 'source "$A"; _ablate_paths "$T"; mkdir -p "$ABLATE_STATE_ROOT"; cp "$T" "$ABLATE_BACKUP"; _ablate_record PREPARED; mv "$ABLATE_RECORD" "$ABLATE_STATE_ROOT/not-the-target-key.json"'
if AUDIT_ROOT="$ROOT" A="$A" bash -c 'source "$A"; ablate_recover' >/dev/null 2>&1; then fail 'mismatched recovery record accepted'; fi
[[ $(<"$target") == changed ]] || fail 'mismatched recovery overwrote target'
rm -rf "$state"
echo 'PASS: restricted clean fail-closed ablation state machine' >&2
