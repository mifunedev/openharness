#!/usr/bin/env bash
# tier: A
# source: .oh/tasks/spec-simplification/ (issue #816, US-007) — OBSERVED: `MEMORY_DIR=.oh/memory`
#         shadowed the oh-path resolver PR #772 added, so this worktree had its own empty
#         ledger while MEMORY.md sat in the main checkout.
# desc: MEMORY_DIR is absolute or unset — never relative. It is precedence-1 in
#       .oh/scripts/oh-path, and every caller uses the `${MEMORY_DIR:-$(oh-path memory)}`
#       idiom, where a set value means the `:-` fallback NEVER fires. A relative value is
#       therefore used raw and resolves against the CALLER'S CWD: inside a linked worktree
#       that is a per-branch empty ledger, stranding each session's lessons on a branch that
#       is later deleted (#768). oh-path anchors `memory` to the MAIN worktree; a relative
#       override defeats that for everyone.
#
#       GATES on what a commit can fix: no compose file declaring a relative default, and
#       oh-path still anchoring `memory` to the main worktree. WARNS (non-gating) when the
#       ambient value in the current shell is relative — that is a container started before
#       the fix, and no commit can change a running process's environment.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
missing=()

# --- (1) the live environment — WARNS, does not gate ------------------------
# A container started before the compose fix still exports the old relative value, and no
# commit can change the environment of an already-running process. Gating on it would leave
# this probe red on every existing sandbox until someone recreated it — and a permanently
# red probe teaches the whole board to be ignored, which is the failure mode this suite is
# supposed to prevent. So the ambient value is surfaced LOUDLY and separately from the
# verdict; what this probe gates on is what a commit can actually fix (checks 2 and 3).
warnings=()
if [[ -n "${MEMORY_DIR:-}" ]]; then
  case "$MEMORY_DIR" in
    /*) : ;;  # absolute — safe: identical from any CWD
    *)  warnings+=("the ambient MEMORY_DIR is RELATIVE ('$MEMORY_DIR') — this shell shadows oh-path and resolves against the caller's CWD. No commit fixes a running process: recreate the container (docker compose up -d) or export an absolute path.") ;;
  esac
fi

# --- (2) the declared defaults that create the ambient value ---------------
# A clean live env proves nothing if compose re-exports a relative default on next boot.
for compose in "$ROOT/.devcontainer/docker-compose.yml" "$ROOT/.devcontainer/docker-compose.image-only.yml"; do
  [[ -f "$compose" ]] || continue
  rel="$(grep -oE '^[[:space:]]*-[[:space:]]*MEMORY_DIR=\$\{MEMORY_DIR:-[^}]+\}' "$compose" | grep -vE ':-\}' || true)"
  if [[ -n "$rel" ]]; then
    while IFS= read -r line; do
      val="${line#*:-}"; val="${val%\}}"
      case "$val" in
        /*) : ;;
        *)  missing+=("$(basename "$compose") declares a RELATIVE MEMORY_DIR default ('$val') — leave it empty so callers fall through to oh-path") ;;
      esac
    done <<< "$rel"
  fi
done

# --- (3) the resolver still anchors memory to the MAIN worktree ------------
# This is the guarantee a relative override was defeating; assert it directly so the probe
# fails if someone "fixes" the override by removing the anchoring instead.
if [[ -x "$ROOT/.oh/scripts/oh-path" || -f "$ROOT/.oh/scripts/oh-path" ]]; then
  resolved="$(env -u MEMORY_DIR sh "$ROOT/.oh/scripts/oh-path" memory --no-create 2>/dev/null || true)"
  case "$resolved" in
    /*) : ;;
    *)  missing+=("oh-path memory returned a non-absolute path ('$resolved')") ;;
  esac
  main_wt="$(git -C "$ROOT" worktree list --porcelain 2>/dev/null \
    | awk 'NR==1 && $1=="worktree" { sub(/^worktree /,""); print; exit }' || true)"
  if [[ -n "$main_wt" && -n "$resolved" && "$resolved" != "$main_wt"/* ]]; then
    missing+=("oh-path memory ('$resolved') is not under the main worktree ('$main_wt') — every worktree would get its own ledger")
  fi
else
  missing+=(".oh/scripts/oh-path is absent — nothing resolves the shared memory dir")
fi

if (( ${#warnings[@]} > 0 )); then
  printf 'WARNING (non-gating — live environment, not the repo):\n' >&2
  printf '  ! %s\n' "${warnings[@]}" >&2
fi

if (( ${#missing[@]} > 0 )); then
  printf 'REGRESSION: MEMORY_DIR must be absolute or unset:\n' >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

if (( ${#warnings[@]} > 0 )); then
  echo "PASS (with warning): no compose file declares a relative MEMORY_DIR default and oh-path anchors memory to the main worktree; this shell's inherited value is stale — see the warning above" >&2
else
  echo "PASS: MEMORY_DIR is absolute or unset, no compose file declares a relative default, and oh-path anchors memory to the main worktree" >&2
fi
exit 0
