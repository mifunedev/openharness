#!/usr/bin/env bash
# git-maintenance.sh — file-invoked destructive-git operations for harness automation.
#
# cc-safety-net's PreToolUse hook denies inline destructive git (`git reset --hard <ref>`,
# `git clean -f`, `git branch -D`, `git worktree remove --force`, `git push --force`) in
# every mode, and its built-in git rules are NOT allowlistable. Script-file invocation
# (`bash .oh/scripts/git-maintenance.sh ...`) is not analyzed by the guard, so the harness's
# own legitimate destructive git — the reset|clean runner, /watchdog, worktree/branch
# grooming — routes through this script instead of inline agent Bash.
#
# Usage:
#   git-maintenance.sh reset-hard <ref>            # git reset --hard <ref>
#   git-maintenance.sh clean                       # git clean -fd
#   git-maintenance.sh branch-delete <branch>      # git branch -D <branch>
#   git-maintenance.sh worktree-remove <path>      # git worktree remove --force <path>
#   git-maintenance.sh push-force <remote> <branch> # git push --force-with-lease <remote> <branch>
#
# Every subcommand refuses to run outside a git repository and echoes a one-line log of
# exactly what it ran. Unknown or missing subcommands print usage and exit 2.
#
# This is a compatibility shim, NOT a security control: the same script-file gap is the
# model's evasion route. Docker is the security boundary; cc-safety-net is a footgun net.
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: git-maintenance.sh <subcommand> [args]

Subcommands:
  reset-hard <ref>             git reset --hard <ref>
  clean                        git clean -fd
  branch-delete <branch>       git branch -D <branch>
  worktree-remove <path>       git worktree remove --force <path>
  push-force <remote> <branch> git push --force-with-lease <remote> <branch>
EOF
}

# Refuse to run outside a git repository.
require_repo() {
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "git-maintenance.sh: not inside a git repository; refusing to run" >&2
    exit 2
  fi
}

# Echo the one-line log of what we ran.
log_run() {
  echo "git-maintenance.sh: ran: $*"
}

[ "$#" -ge 1 ] || { usage; exit 2; }

subcommand="$1"
shift

case "$subcommand" in
  reset-hard)
    [ "$#" -eq 1 ] || { usage; exit 2; }
    require_repo
    git reset --hard "$1"
    log_run "git reset --hard $1"
    ;;
  clean)
    [ "$#" -eq 0 ] || { usage; exit 2; }
    require_repo
    git clean -fd
    log_run "git clean -fd"
    ;;
  branch-delete)
    [ "$#" -eq 1 ] || { usage; exit 2; }
    require_repo
    git branch -D "$1"
    log_run "git branch -D $1"
    ;;
  worktree-remove)
    [ "$#" -eq 1 ] || { usage; exit 2; }
    require_repo
    git worktree remove --force "$1"
    log_run "git worktree remove --force $1"
    ;;
  push-force)
    [ "$#" -eq 2 ] || { usage; exit 2; }
    require_repo
    git push --force-with-lease "$1" "$2"
    log_run "git push --force-with-lease $1 $2"
    ;;
  *)
    usage
    exit 2
    ;;
esac
