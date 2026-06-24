#!/usr/bin/env bash
# Shared ablation mechanics for the harness fitness function: back up a context
# file, remove it (so a probe/oracle runs WITHOUT it), and restore on EXIT —
# even after a crash, via the evals/.ablation-active sentinel that /eval recovers
# on startup.
#
# Only the swap/restore/trap MECHANICS are shared (prd.md §10 M-1). Each caller
# supplies its own oracle:
#   - /eval --ablate : deterministic shell-probe exit code (this file's CLI mode)
#   - /context-audit : `claude -p` marker scoring (sources the functions below)
#
# Source for the functions:
#   source scripts/ablate.sh
#   ablate_swap_out <target>   # back up + remove target; arms EXIT-restore trap + sentinel
#   ablate_restore  <target>   # restore now (also runs automatically on EXIT)
# Or run as a CLI for a single deterministic probe:
#   scripts/ablate.sh <target-file> <probe-script>   # -> LOAD-BEARING | PRUNABLE | CHANGED
set -euo pipefail

_ablate_root() { cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd; }
ABLATE_SENTINEL="$(_ablate_root)/evals/.ablation-active"

ablate_swap_out() {
  local target="$1" bak="$1.bak"
  cp "$target" "$bak"
  printf '%s\t%s\n' "$target" "$bak" >> "$ABLATE_SENTINEL"   # crash-recovery record
  # shellcheck disable=SC2064  # expand $target now, not at trap time
  trap "ablate_restore '$target'" EXIT
  mv -f "$bak" "$target.__ablated_bak" 2>/dev/null || true   # keep backup under a stable name
  mv -f "$target" "$bak"                                      # remove target (backup is .bak)
  mv -f "$target.__ablated_bak" "$bak" 2>/dev/null || true
}

ablate_restore() {
  local target="$1" bak="$1.bak"
  [ -f "$bak" ] && mv -f "$bak" "$target"
  if [ -f "$ABLATE_SENTINEL" ]; then
    grep -vF -- "$target	$bak" "$ABLATE_SENTINEL" > "$ABLATE_SENTINEL.tmp" 2>/dev/null || true
    mv -f "$ABLATE_SENTINEL.tmp" "$ABLATE_SENTINEL" 2>/dev/null || true
    [ -s "$ABLATE_SENTINEL" ] || rm -f "$ABLATE_SENTINEL"
  fi
}

# --- CLI mode: ablate a single deterministic probe ---
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  target="${1:?usage: ablate.sh <target-file> <probe-script>}"
  probe="${2:?usage: ablate.sh <target-file> <probe-script>}"
  [ -f "$target" ] || { echo "ablate: target not found: $target" >&2; exit 2; }
  [ -f "$probe" ]  || { echo "ablate: probe not found: $probe" >&2; exit 2; }
  run_probe() { if bash "$probe" >/dev/null 2>&1; then echo 0; else echo $?; fi; }

  with="$(run_probe)"
  ablate_swap_out "$target"
  without="$(run_probe)"
  ablate_restore "$target"
  trap - EXIT

  if [ "$with" = "0" ] && [ "$without" != "0" ]; then verdict="LOAD-BEARING"
  elif [ "$with" = "$without" ]; then verdict="PRUNABLE"
  else verdict="CHANGED"; fi
  echo "$verdict (with=$with without=$without) target=$(basename "$target") probe=$(basename "$probe")"
fi
