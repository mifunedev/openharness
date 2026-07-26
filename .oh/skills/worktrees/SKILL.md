---
name: worktrees
description: |
  Manage .oh/worktrees/ lifecycle: create worktree, list worktrees, remove worktree,
  clean worktrees, stale worktrees audit, isolate work, project clone.
  TRIGGER when: any git worktree operation, branch isolation needed, stale worktrees
  review, project clone under .oh/worktrees/project/ (e.g. "clone <owner>/<repo> to
  worktrees", "add <repo> to .oh/worktrees", "clone this repo into worktrees"), worktree
  cleanup. A leading-slash harness dir like "/worktrees" still means the repo-relative
  .oh/worktrees/ — never a literal filesystem-root path.
allowed-tools: Bash
---

# Worktrees

Manage `.oh/worktrees/`. Full policy: `/git` § Worktrees; `.oh/context/rules/git.md` is only a compatibility pointer.

## DETECT BASE

Run first. Every create/remove op needs `$BASE` and `$WORKTREES_ROOT`.

```bash
BASE=$(git show-ref --verify --quiet refs/heads/development && echo development || \
       git show-ref --verify --quiet refs/heads/main && echo main || echo master)
WORKTREES_ROOT="$(bash .oh/scripts/oh-path worktrees --no-create 2>/dev/null || printf '%s' "${WORKTREES_DIR:-.oh/worktrees}")"
echo "$BASE"
echo "$WORKTREES_ROOT"
```

## CREATE — new branch

```bash
PREFIX=feat   # feat bug task audit skill agent
ISSUE=42
DESC=short-desc
BRANCH="$PREFIX/$ISSUE-$DESC"
mkdir -p "$WORKTREES_ROOT"
git worktree add -b "$BRANCH" "$WORKTREES_ROOT/$BRANCH" "$BASE"
```

## CREATE — existing branch

```bash
BRANCH=feat/42-short-desc
mkdir -p "$WORKTREES_ROOT"
git worktree add "$WORKTREES_ROOT/$BRANCH" "$BRANCH"
```

## LIST — all worktrees + age + PR status

```bash
git worktree list --porcelain | awk '/^worktree /{wt=$2} /^branch /{
  sub("refs/heads/",""); br=$2; print wt, br}' | while read -r path branch; do
  age=$(( ( $(date +%s) - $(git -C "$path" log -1 --format=%ct 2>/dev/null || echo $(date +%s)) ) / 86400 ))
  pr=$(gh pr list --head "$branch" --state open --json number,title \
       --jq '.[0] | if . then "#\(.number) \(.title)" else "no PR" end' 2>/dev/null)
  printf "%-50s  %3dd  %s\n" "$branch" "$age" "$pr"
done
```

## ISOLATE — in-flight work

Main checkout has loose files. Don't stash. Don't switch.

```bash
# 1. Cut worktree off base
BRANCH=feat/42-my-work
git worktree add -b "$BRANCH" "$WORKTREES_ROOT/$BRANCH" "$BASE"

# 2. Copy files in
cp path/to/file1 path/to/file2 "$WORKTREES_ROOT/$BRANCH/<destination>/"

# 3. Commit in worktree
cd "$WORKTREES_ROOT/$BRANCH"
git add . && git commit -m "feat: ..."
```

Before cleaning main checkout — byte-check every file first:

```bash
for f in path/to/file1 path/to/file2; do
  a=$(md5sum "$f" | awk '{print $1}')
  b=$(git show "$BRANCH:$f" | md5sum | awk '{print $1}')
  [ "$a" = "$b" ] && echo "same:  $f" || echo "DRIFT: $f"
done
```

All `same:`? Then clean:

```bash
git restore path/to/file1 path/to/file2
```

Any `DRIFT:`? Stop. File not committed right. Fix first.

## REMOVE — clean

```bash
BRANCH=feat/42-short-desc
git worktree remove "$WORKTREES_ROOT/$BRANCH"
git worktree prune
```

Corrupted (not in `git worktree list`):

```bash
rm -rf "$WORKTREES_ROOT/$BRANCH"
git worktree prune
```

### Forced removal under the cc-safety-net guard

`git worktree remove --force` (and `git branch -D`) are denied inline by cc-safety-net. In agent (hook-mediated) contexts route them through the file-invoked shim:

```bash
bash .oh/scripts/git-maintenance.sh worktree-remove "$WORKTREES_ROOT/$BRANCH"
bash .oh/scripts/git-maintenance.sh branch-delete "$BRANCH"
```

Scope: only **non-agent-mediated** invocations (raw scheduler/tmux shell scripts) bypass PreToolUse hooks. Agent-driven crons do **not** bypass them, so they must use the shim too. Plain `git worktree remove` (no `--force`) stays allowed.

## STALE AUDIT — review only, no auto-delete

List worktrees older than 30 days with no open PR. Surface. Don't remove.

```bash
git worktree list --porcelain | awk '/^worktree /{wt=$2} /^branch /{
  sub("refs/heads/",""); br=$2; print wt, br}' | while read -r path branch; do
  age=$(( ( $(date +%s) - $(git -C "$path" log -1 --format=%ct 2>/dev/null || echo $(date +%s)) ) / 86400 ))
  [ "$age" -lt 30 ] && continue
  pr=$(gh pr list --head "$branch" --state open --json number \
       --jq 'length' 2>/dev/null)
  [ "$pr" = "0" ] && printf "STALE %3dd  %s\n" "$age" "$branch"
done
```

Review each `STALE` line. Remove manually if safe (see REMOVE above).

## PROJECT CLONE

Independent repo — not a harness branch. Has its own `.git`.

```bash
# Clone
OWNER=ryaneggz
REPO=some-project
mkdir -p "$WORKTREES_ROOT/project/$OWNER"
git clone "https://github.com/$OWNER/$REPO.git" "$WORKTREES_ROOT/project/$OWNER/$REPO"

# Remove
rm -rf "$WORKTREES_ROOT/project/$OWNER/$REPO"
```

No `git worktree` for these. Plain `git clone` / `rm -rf`.
