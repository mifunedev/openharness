#!/usr/bin/env bash
# id: memory-dir-shared-across-worktrees
# tier: A
# source: .oh/scripts/oh-path (#768)
# desc: `oh-path memory` resolves to the MAIN worktree's memory dir when invoked
#       from inside a linked git worktree, so one ledger serves the whole
#       checkout — while every other name stays worktree-local.
#
# Why this cannot be a fixture test: the defect lives entirely in which root a
# relative value is measured against, and that root is derived from the script's
# own location. Invoke oh-path from the main checkout and the buggy and fixed
# versions print the same path, so the test stays green with the bug live. That
# is how the same defect survived two point-fixes (#152 autopilot, #693
# prompt-miner) without anyone fixing the resolver. The probe must therefore
# build a real linked worktree and run THAT worktree's own copy of oh-path.
#
# The probe reads git topology and paths only. It never reads MEMORY.md content
# or any other untracked state, so a fresh CI clone and a developer worktree
# produce the same verdict (the defect PR #760 fixed in cc-safety-net-wiring).
#
# Exit: 0 pass | 1 REGRESSION | 2 SKIPPED (honest environment gap)
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "SKIP: not inside a git repository" >&2; exit 2; }
command -v git >/dev/null 2>&1 || { echo "SKIP: git unavailable" >&2; exit 2; }
command -v awk >/dev/null 2>&1 || { echo "SKIP: awk unavailable" >&2; exit 2; }
[ -f "$ROOT/.oh/scripts/oh-path" ] || { echo "SKIP: oh-path not found" >&2; exit 2; }

# The expected destination is the MAIN worktree, which is NOT necessarily $ROOT:
# this probe may itself be running from a linked worktree. Resolve it the way git
# defines it — `worktree list --porcelain` prints the main worktree first.
MAIN_ROOT="$(git -C "$ROOT" worktree list --porcelain 2>/dev/null \
  | awk 'NR==1 && $1=="worktree" { sub(/^worktree /,""); print; exit }')"
[ -n "$MAIN_ROOT" ] && [ -d "$MAIN_ROOT" ] || {
  echo "SKIP: could not resolve the main worktree path" >&2; exit 2; }

TMP="$(mktemp -d 2>/dev/null)" || { echo "SKIP: mktemp -d failed" >&2; exit 2; }
WT="$TMP/linked"
cleanup() {
  git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1
  git -C "$ROOT" worktree prune >/dev/null 2>&1
  rm -rf "$TMP" >/dev/null 2>&1
}
trap cleanup EXIT

if ! git -C "$ROOT" worktree add --detach "$WT" HEAD >/dev/null 2>&1; then
  echo "SKIP: could not create a linked worktree (detached HEAD add failed)" >&2
  exit 2
fi
[ -x "$WT/.oh/scripts/oh-path" ] || [ -f "$WT/.oh/scripts/oh-path" ] || {
  echo "SKIP: the linked worktree has no oh-path (HEAD predates it)" >&2; exit 2; }

# Guard against a vacuous pass: if the scratch worktree were somehow the main
# worktree, every assertion below would hold no matter what oh-path did.
if [ "$WT" = "$MAIN_ROOT" ]; then
  echo "SKIP: scratch worktree resolved to the main worktree" >&2; exit 2
fi

fail=0
note() { echo "REGRESSION: $*" >&2; fail=$((fail + 1)); }

# `oh-path` honors MEMORY_DIR / CRONS_DIR / ... ahead of its own anchoring. The
# ambient environment exports MEMORY_DIR=.oh/memory (docker-compose), which is
# relative and therefore still exercises the anchor — but an operator with an
# ABSOLUTE override would mask the assertion entirely. Clear the overrides so the
# probe tests the resolver, not the environment it happens to run in.
run_oh_path() {
  ( cd "$WT" && env -u MEMORY_DIR -u CRONS_DIR -u EVALS_DIR -u TASKS_DIR \
      -u CONTEXT_DIR -u WORKTREES_DIR sh ./.oh/scripts/oh-path "$1" 2>/dev/null )
}

# (a) memory resolves to the MAIN worktree, not the caller's worktree.
GOT_MEM="$(run_oh_path memory)"
if [ "$GOT_MEM" != "$MAIN_ROOT/.oh/memory" ]; then
  note "(a) oh-path memory from a linked worktree resolved to '$GOT_MEM'," \
       "expected '$MAIN_ROOT/.oh/memory'"
fi

# (b) it must not resolve inside the linked worktree at all — the failure mode
#     that stranded lessons on deleted branches (#768).
case "$GOT_MEM" in
  "$WT"/*) note "(b) oh-path memory resolved INSIDE the linked worktree: $GOT_MEM" ;;
esac

# (c) every other name stays worktree-local; the memory anchor must not leak.
for name in crons evals tasks context; do
  got="$(run_oh_path "$name")"
  if [ "$got" != "$WT/.oh/$name" ]; then
    note "(c) oh-path $name from a linked worktree resolved to '$got'," \
         "expected the worktree-local '$WT/.oh/$name'"
  fi
done

# (d) an ABSOLUTE override is still honored verbatim — anchoring applies only to
#     relative values, so paths.memory / MEMORY_DIR keep working.
GOT_ABS="$( cd "$WT" && MEMORY_DIR="$TMP/abs" sh ./.oh/scripts/oh-path memory 2>/dev/null )"
if [ "$GOT_ABS" != "$TMP/abs" ]; then
  note "(d) an absolute MEMORY_DIR was rewritten: got '$GOT_ABS', expected '$TMP/abs'"
fi

if [ "$fail" -ne 0 ]; then
  echo "memory-dir-shared-across-worktrees: $fail assertion(s) failed" >&2
  exit 1
fi
echo "memory-dir-shared-across-worktrees: PASS (memory -> $GOT_MEM)"
exit 0
