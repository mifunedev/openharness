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
  [[ ! -L $target ]] || { echo "ablate: symlink targets are forbidden: $target" >&2; return 1; }
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
  ABLATE_GUARD="$ABLATE_STATE_ROOT/.locks.guard"
}
_ablate_reject_state_symlinks() {
  local path
  for path in "$ABLATE_RECORD" "$ABLATE_BACKUP" "$ABLATE_LOCK" "$ABLATE_GUARD"; do
    [[ ! -L $path ]] || { echo "ablate: symlink recovery state rejected: $path" >&2; return 1; }
  done
}
_ablate_record() {
  local phase=$1 tmp="$ABLATE_RECORD.tmp.$$"
  jq -n --arg phase "$phase" --arg target "$ABLATE_TARGET" --arg backup "$ABLATE_BACKUP" \
    '{schemaVersion:1,phase:$phase,target:$target,backup:$backup}' >"$tmp"
  mv -f "$tmp" "$ABLATE_RECORD"
}
_ablate_validate_record() {
  [[ -f $ABLATE_RECORD && ! -L $ABLATE_RECORD ]] || return 1
  jq -e --arg t "$ABLATE_TARGET" --arg b "$ABLATE_BACKUP" '
    .schemaVersion==1 and (.phase=="PREPARED" or .phase=="SWAPPED" or .phase=="RESTORING")
    and .target==$t and .backup==$b' "$ABLATE_RECORD" >/dev/null
}
_ablate_lock() {
  mkdir -p "$ABLATE_STATE_ROOT"
  _ablate_reject_state_symlinks || return 1
  exec {ABLATE_GUARD_FD}>"$ABLATE_GUARD"
  flock "$ABLATE_GUARD_FD"
  exec {ABLATE_LOCK_FD}>"$ABLATE_LOCK"
  if ! flock -n "$ABLATE_LOCK_FD"; then
    flock -u "$ABLATE_GUARD_FD"; eval "exec ${ABLATE_GUARD_FD}>&-"; unset ABLATE_GUARD_FD
    eval "exec ${ABLATE_LOCK_FD}>&-"; unset ABLATE_LOCK_FD
    echo "ablate: target is locked: $ABLATE_TARGET" >&2; return 75
  fi
  flock -u "$ABLATE_GUARD_FD"
}
_ablate_unlock() {
  [[ -n ${ABLATE_LOCK_FD:-} ]] || return 0
  # Serialize unlink with lock opening. This prevents a waiter holding an old inode
  # while a newcomer locks a newly-created inode at the same pathname.
  flock "$ABLATE_GUARD_FD"
  rm -f "$ABLATE_LOCK"
  flock -u "$ABLATE_LOCK_FD" || true
  eval "exec ${ABLATE_LOCK_FD}>&-"; unset ABLATE_LOCK_FD
  flock -u "$ABLATE_GUARD_FD" || true
  eval "exec ${ABLATE_GUARD_FD}>&-"; unset ABLATE_GUARD_FD
}
_ablate_same_bytes() { [[ -f $1 && -f $2 ]] && cmp -s "$1" "$2"; }
_ablate_clear_state() { rm -f "$ABLATE_RECORD" "$ABLATE_BACKUP" "$ABLATE_RECORD.tmp."* 2>/dev/null || true; }
_ablate_restore_copy() {
  local tmp="$ABLATE_TARGET.restore.$$"
  cp -p "$ABLATE_BACKUP" "$tmp" && mv -f "$tmp" "$ABLATE_TARGET"
}
_ablate_recover_locked() {
  local phase
  if [[ ! -e $ABLATE_RECORD && ! -e $ABLATE_BACKUP ]]; then return 0; fi
  _ablate_validate_record || { echo "ablate: corrupt or mismatched recovery state" >&2; return 1; }
  [[ -f $ABLATE_BACKUP && ! -L $ABLATE_BACKUP ]] || { echo "ablate: sentinel without regular backup" >&2; return 1; }
  phase=$(jq -r .phase "$ABLATE_RECORD")
  case $phase in
    PREPARED)
      [[ -f $ABLATE_TARGET && ! -L $ABLATE_TARGET ]] || { echo "ablate: contradictory PREPARED state" >&2; return 1; }
      _ablate_same_bytes "$ABLATE_TARGET" "$ABLATE_BACKUP" || { echo "ablate: PREPARED copies differ; refusing overwrite" >&2; return 1; }
      _ablate_clear_state
      ;;
    SWAPPED)
      [[ ! -e $ABLATE_TARGET ]] || { echo "ablate: contradictory SWAPPED state" >&2; return 1; }
      _ablate_record RESTORING
      _ablate_restore_copy
      _ablate_clear_state
      ;;
    RESTORING)
      if [[ -e $ABLATE_TARGET ]]; then
        if [[ -L $ABLATE_TARGET ]] || ! _ablate_same_bytes "$ABLATE_TARGET" "$ABLATE_BACKUP"; then
          echo "ablate: contradictory RESTORING copies" >&2; return 1
        fi
      else
        _ablate_restore_copy
      fi
      _ablate_clear_state
      ;;
  esac
}
ablate_recover() {
  local requested=${1:-} record target backup state_root rc
  if [[ -n $requested ]]; then
    _ablate_paths "$requested" || return 1
    _ablate_lock || return 1
    if ! _ablate_recover_locked; then _ablate_unlock; return 1; fi
    _ablate_unlock
    return 0
  fi
  state_root=$(_ablate_state_root); [[ -d $state_root ]] || return 0
  for record in "$state_root"/*.json; do
    [[ -e $record || -L $record ]] || continue
    [[ ! -L $record ]] || { echo "ablate: symlink recovery record rejected: $record" >&2; return 1; }
    target=$(jq -r '.target // empty' "$record" 2>/dev/null) || return 1
    [[ -n $target ]] || { echo "ablate: corrupt recovery record: $record" >&2; return 1; }
    rc=0; ablate_recover "$target" || rc=$?
    [[ $rc -eq 0 || $rc -eq 75 ]] || return "$rc"
  done
  for backup in "$state_root"/*.backup; do
    [[ -e $backup || -L $backup ]] || continue
    [[ ! -L $backup ]] || { echo "ablate: symlink backup rejected: $backup" >&2; return 1; }
    [[ -e ${backup%.backup}.json ]] || { echo "ablate: backup without sentinel: $backup" >&2; return 1; }
  done
}
_ablate_saved_trap_command() {
  local sig=$1 line
  line=$(trap -p "$sig" || true)
  [[ -n $line ]] || return 0
  line=${line#trap -- \'}
  line=${line%\' "$sig"}
  printf '%s' "$line"
}
_ablate_on_trap() {
  local sig=$1 prior rc=0
  case $sig in EXIT) prior=${ABLATE_PRIOR_EXIT:-};; INT) prior=${ABLATE_PRIOR_INT:-};; TERM) prior=${ABLATE_PRIOR_TERM:-};; HUP) prior=${ABLATE_PRIOR_HUP:-};; esac
  trap - EXIT INT TERM HUP
  ablate_restore "$ABLATE_TARGET" || rc=$?
  [[ -z $prior ]] || eval "$prior"
  [[ $sig == EXIT ]] || exit $((128 + $(kill -l "$sig")))
  return "$rc"
}
_ablate_install_traps() {
  ABLATE_PRIOR_EXIT=$(_ablate_saved_trap_command EXIT)
  ABLATE_PRIOR_INT=$(_ablate_saved_trap_command INT)
  ABLATE_PRIOR_TERM=$(_ablate_saved_trap_command TERM)
  ABLATE_PRIOR_HUP=$(_ablate_saved_trap_command HUP)
  trap '_ablate_on_trap EXIT' EXIT
  trap '_ablate_on_trap INT' INT
  trap '_ablate_on_trap TERM' TERM
  trap '_ablate_on_trap HUP' HUP
}
ablate_swap_out() {
  _ablate_paths "$1" || return 1
  _ablate_lock || return 1
  [[ -f $ABLATE_TARGET && ! -L $ABLATE_TARGET ]] || { echo "ablate: target is not a regular file: $ABLATE_TARGET" >&2; _ablate_unlock; return 1; }
  [[ ! -e $ABLATE_RECORD && ! -e $ABLATE_BACKUP ]] || { echo "ablate: existing state requires recovery" >&2; _ablate_unlock; return 1; }
  cp -p "$ABLATE_TARGET" "$ABLATE_BACKUP"
  _ablate_record PREPARED
  rm -f "$ABLATE_TARGET"
  _ablate_record SWAPPED
  _ablate_install_traps
}
ablate_restore() {
  local target=${1:-${ABLATE_TARGET:-}}
  [[ -n $target ]] || return 0
  if [[ -z ${ABLATE_LOCK_FD:-} ]]; then _ablate_paths "$target" || return 1; _ablate_lock || return 1; fi
  _ablate_validate_record || { echo "ablate: invalid restore state" >&2; _ablate_unlock; return 1; }
  [[ $(jq -r .phase "$ABLATE_RECORD") == SWAPPED || $(jq -r .phase "$ABLATE_RECORD") == RESTORING ]] \
    || { echo "ablate: restore requires SWAPPED/RESTORING state" >&2; _ablate_unlock; return 1; }
  [[ -f $ABLATE_BACKUP && ! -L $ABLATE_BACKUP ]] || { echo "ablate: missing regular backup during restore" >&2; _ablate_unlock; return 1; }
  [[ ! -e $ABLATE_TARGET ]] || { echo "ablate: target unexpectedly exists during restore" >&2; _ablate_unlock; return 1; }
  _ablate_record RESTORING
  _ablate_restore_copy
  _ablate_clear_state
  trap - EXIT INT TERM HUP
  _ablate_unlock
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
  target=${1:?usage: ablate.sh <target-file> <probe-script>}; probe=${2:?usage: ablate.sh <target-file> <probe-script>}
  [[ -f $probe && ! -L $probe ]] || { echo "ablate: probe is not a regular file: $probe" >&2; exit 2; }
  ablate_recover "$target"
  run_probe() { if bash "$probe" >/dev/null 2>&1; then echo 0; else echo $?; fi; }
  with=$(run_probe); ablate_swap_out "$target"; without=$(run_probe); ablate_restore "$target"
  if [[ $with == 0 && $without != 0 ]]; then verdict=LOAD-BEARING; elif [[ $with == "$without" ]]; then verdict=PRUNABLE; else verdict=CHANGED; fi
  printf '%s (with=%s without=%s) target=%s probe=%s\n' "$verdict" "$with" "$without" "$(basename "$target")" "$(basename "$probe")"
fi
