---
name: worktrees
description: |
  Manage .worktrees/ lifecycle: create worktree, list worktrees, remove worktree,
  clean worktrees, stale worktrees audit, isolate work, project clone.
  TRIGGER when: any git worktree operation, branch isolation needed, stale worktrees
  review, project clone under .worktrees/project/ (e.g. "clone <owner>/<repo> to
  worktrees", "add <repo> to .worktrees", "clone this repo into worktrees"), worktree
  cleanup. A leading-slash harness dir like "/worktrees" still means the repo-relative
  .worktrees/ — never a literal filesystem-root path.
allowed-tools: Bash
---

# Worktrees

Manage `.worktrees/`. Full policy: `/git` § Worktrees; `.oh/context/rules/git.md` is only a compatibility pointer.

## DETECT BASE

Run first. Every create op needs `$BASE`.

```bash
BASE=$(git show-ref --verify --quiet refs/heads/development && echo development || \
       git show-ref --verify --quiet refs/heads/main && echo main || echo master)
echo $BASE
```

## CREATE — new branch

```bash
PREFIX=feat   # feat bug task audit skill agent
ISSUE=42
DESC=short-desc
BRANCH="$PREFIX/$ISSUE-$DESC"
mkdir -p .worktrees
git worktree add -b "$BRANCH" ".worktrees/$BRANCH" "$BASE"
```

## CREATE — existing branch

```bash
BRANCH=feat/42-short-desc
mkdir -p .worktrees
git worktree add ".worktrees/$BRANCH" "$BRANCH"
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
git worktree add -b "$BRANCH" ".worktrees/$BRANCH" "$BASE"

# 2. Copy files in
cp path/to/file1 path/to/file2 ".worktrees/$BRANCH/<destination>/"

# 3. Commit in worktree
cd ".worktrees/$BRANCH"
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
git worktree remove ".worktrees/$BRANCH"
git worktree prune
```

Corrupted (not in `git worktree list`):

```bash
rm -rf ".worktrees/$BRANCH"
git worktree prune
```

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
mkdir -p ".worktrees/project/$OWNER"
git clone "https://github.com/$OWNER/$REPO.git" ".worktrees/project/$OWNER/$REPO"

# Remove
rm -rf ".worktrees/project/$OWNER/$REPO"
```

No `git worktree` for these. Plain `git clone` / `rm -rf`.
