#!/usr/bin/env bash
# Sole locked/versioned ablation swap, restore, and crash-recovery state machine.
set -euo pipefail

_ablate_root() { printf '%s\n' "${AUDIT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)}"; }
_ablate_state_root() { printf '%s/.oh/evals/.ablation-state\n' "$(_ablate_root)"; }
_ablate_key() { printf '%s' "$1" | sha256sum | cut -d' ' -f1; }
_ablate_canonical() {
  local root target parent real
  root=$(cd "$(_ablate_root)" && pwd -P) || return 1
  target=$1
  [[ $target = /* ]] || target="$root/$target"
  parent=$(cd "$(dirname "$target")" 2>/dev/null && pwd -P) || return 1
  real="$parent/$(basename "$target")"
  [[ $real == "$root/"* && $real != "$root/CLAUDE.md" ]] || {
    echo "ablate: unsafe target outside AUDIT_ROOT or disallowed: $real" >&2; return 1;
  }
  printf '%s\n' "$real"
}
_ablate_paths() {
  ABLATE_TARGET=$(_ablate_canonical "$1") || return 1
  ABLATE_KEY=$(_ablate_key "$ABLATE_TARGET")
  ABLATE_STATE_ROOT=$(_ablate_state_root)
  ABLATE_RECORD="$ABLATE_STATE_ROOT/$ABLATE_KEY.json"
  ABLATE_BACKUP="$ABLATE_STATE_ROOT/$ABLATE_KEY.backup"
  ABLATE_LOCK="$ABLATE_STATE_ROOT/$ABLATE_KEY.lock"
}
_ablate_record() {
  local phase=$1
  jq -n --arg phase "$phase" --arg target "$ABLATE_TARGET" --arg backup "$ABLATE_BACKUP" \
    '{schemaVersion:1,phase:$phase,target:$target,backup:$backup}' >"$ABLATE_RECORD.tmp"
  mv -f "$ABLATE_RECORD.tmp" "$ABLATE_RECORD"
}
_ablate_validate_record() {
  [[ -f $ABLATE_RECORD ]] || return 1
  jq -e --arg t "$ABLATE_TARGET" --arg b "$ABLATE_BACKUP" '
    .schemaVersion==1 and (.phase=="PREPARED" or .phase=="SWAPPED" or .phase=="RESTORING")
    and .target==$t and .backup==$b' "$ABLATE_RECORD" >/dev/null
}
_ablate_lock() {
  mkdir -p "$ABLATE_STATE_ROOT"
  exec {ABLATE_LOCK_FD}>"$ABLATE_LOCK"
  flock -n "$ABLATE_LOCK_FD" || { echo "ablate: target is locked: $ABLATE_TARGET" >&2; return 1; }
}
_ablate_unlock() {
  if [[ -n ${ABLATE_LOCK_FD:-} ]]; then flock -u "$ABLATE_LOCK_FD" || true; eval "exec ${ABLATE_LOCK_FD}>&-"; unset ABLATE_LOCK_FD; fi
  [[ -n ${ABLATE_LOCK:-} ]] && rm -f "$ABLATE_LOCK"
}
ablate_recover() {
  local requested=${1:-} record target backup phase
  if [[ -n $requested ]]; then
    _ablate_paths "$requested"; _ablate_lock
    if [[ ! -e $ABLATE_RECORD && ! -e $ABLATE_BACKUP ]]; then _ablate_unlock; return 0; fi
    _ablate_validate_record || { echo "ablate: corrupt or mismatched recovery state" >&2; _ablate_unlock; return 1; }
    phase=$(jq -r .phase "$ABLATE_RECORD")
    [[ -f $ABLATE_BACKUP ]] || { echo "ablate: sentinel without backup" >&2; _ablate_unlock; return 1; }
    [[ $phase != PREPARED || -f $ABLATE_TARGET ]] || { echo "ablate: invalid PREPARED state" >&2; _ablate_unlock; return 1; }
    _ablate_record RESTORING; mv -f "$ABLATE_BACKUP" "$ABLATE_TARGET"; rm -f "$ABLATE_RECORD"; _ablate_unlock
    return 0
  fi
  local state_root; state_root=$(_ablate_state_root); [[ -d $state_root ]] || return 0
  shopt -s nullglob
  for record in "$state_root"/*.json; do
    target=$(jq -r '.target // empty' "$record" 2>/dev/null) || return 1
    [[ -n $target ]] || { echo "ablate: corrupt recovery record: $record" >&2; return 1; }
    ablate_recover "$target" || return 1
  done
  for backup in "$state_root"/*.backup; do
    [[ -e ${backup%.backup}.json ]] || { echo "ablate: backup without sentinel: $backup" >&2; return 1; }
  done
}
ablate_swap_out() {
  _ablate_paths "$1"; _ablate_lock
  [[ -f $ABLATE_TARGET ]] || { echo "ablate: target not found: $ABLATE_TARGET" >&2; _ablate_unlock; return 1; }
  [[ ! -e $ABLATE_RECORD && ! -e $ABLATE_BACKUP ]] || { echo "ablate: existing state requires recovery" >&2; _ablate_unlock; return 1; }
  cp -p "$ABLATE_TARGET" "$ABLATE_BACKUP"; _ablate_record PREPARED
  rm -f "$ABLATE_TARGET"; _ablate_record SWAPPED
  trap 'ablate_restore "$ABLATE_TARGET"' EXIT INT TERM HUP
}
ablate_restore() {
  local target=${1:-${ABLATE_TARGET:-}}
  [[ -n $target ]] || return 0
  if [[ -z ${ABLATE_LOCK_FD:-} ]]; then _ablate_paths "$target"; _ablate_lock; fi
  _ablate_validate_record || { echo "ablate: invalid restore state" >&2; _ablate_unlock; return 1; }
  [[ -f $ABLATE_BACKUP ]] || { echo "ablate: missing backup during restore" >&2; _ablate_unlock; return 1; }
  _ablate_record RESTORING; mv -f "$ABLATE_BACKUP" "$ABLATE_TARGET"; rm -f "$ABLATE_RECORD"
  trap - EXIT INT TERM HUP; _ablate_unlock
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
  target=${1:?usage: ablate.sh <target-file> <probe-script>}; probe=${2:?usage: ablate.sh <target-file> <probe-script>}
  [[ -f $probe ]] || { echo "ablate: probe not found: $probe" >&2; exit 2; }
  ablate_recover "$target"
  run_probe() { if bash "$probe" >/dev/null 2>&1; then echo 0; else echo $?; fi; }
  with=$(run_probe); ablate_swap_out "$target"; without=$(run_probe); ablate_restore "$target"
  if [[ $with == 0 && $without != 0 ]]; then verdict=LOAD-BEARING; elif [[ $with == "$without" ]]; then verdict=PRUNABLE; else verdict=CHANGED; fi
  printf '%s (with=%s without=%s) target=%s probe=%s\n' "$verdict" "$with" "$without" "$(basename "$target")" "$(basename "$probe")"
fi
