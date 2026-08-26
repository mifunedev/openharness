#!/usr/bin/env bash
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

require_repo() {
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "git-maintenance.sh: not inside a git repository; refusing to run" >&2
    exit 2
  fi
}

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
