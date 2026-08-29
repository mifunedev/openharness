---
name: worktrees
description: |
  Manage .worktrees/ lifecycle: create worktree, list worktrees, remove worktree,
  clean worktrees, stale worktrees audit, isolate work, project clone.
  TRIGGER when: any git worktree operation, branch isolation needed, stale worktrees
  review, project clone under projects/ (e.g. "clone <owner>/<repo> to projects",
  "add <repo> to projects", "clone this repo into projects"), worktree
  cleanup. A leading-slash harness dir like "/worktrees" still means the repo-relative
  .worktrees/ — never a literal filesystem-root path.
allowed-tools: Bash
---

# Worktrees

Manage `.worktrees/` and `projects/`. Full policy: `/git` § Worktrees.

A repository's worktrees live at that repository's own root, in `.worktrees/`.
The harness is the first instance of that rule; a project clone under `projects/`
follows it too, in `projects/<owner>/<repo>/.worktrees/`.

## CHANGE ROUTING — TRACK VS RESET

`~/harness` and `$PROJECTS_ROOT/<owner>/<repo>` are different Git
boundaries. The parent harness ignores the latter; a project clone's files are
never changes to the harness. Classify changes before committing, resetting, or
removing anything. A dirty checkout is not disposable merely because it lives
under `.worktrees/`.

### `~/harness` — harness control plane

**Track/preserve** deliberate, durable harness changes, including:

- `.oh/skills/`, `.oh/agents/`, `.oh/hooks/`, `.oh/scripts/`, `.devcontainer/`,
  `.github/`, docs, templates, and supported configuration
  defaults.
- `.worktrees/AGENTS.md`, `projects/AGENTS.md`, and other lifecycle
  documentation.
- Curated wiki entries and the wiki index when intentionally promoted. The wiki
  corpus is ignored by default; use `git add -f` only for reviewed entries.
  Never promote `corpus/raw/` snapshots by accident.
- A handoff only when it is deliberately shared, scrubbed of secrets, and meant
  to be durable in this harness checkout or its private operator fork.

**Reset/remove** only known local, generated, or abandoned state, such as:

- worktree contents, task progress, memory/log state, plans/spec scratch,
  screenshots, build output, dependencies, local env/auth files, and caches
  covered by `.gitignore`;
- an explicit operator-local setting or a tracked edit that was reviewed and
  rejected.

Do not reset a tracked source/config/doc change just because it is unstaged, and
do not delete an untracked file before inspecting it. For root state, inspect
both index and worktree changes:

```bash
git -C ~/harness status --short --untracked-files=all
git -C ~/harness diff --name-status
git -C ~/harness diff --cached --name-status
```

Use `git restore <path>` only for identified files. Preview cleanup with
`git clean -nd` (or `git clean -ndX` for ignored files); route destructive
`reset`/`clean` operations through `.oh/scripts/git-maintenance.sh` as required
by `/git`.

### `$PROJECTS_ROOT/<owner>/<repo>` — independent project clone

These directories have their own `.git` and their own branch/remote policy.
Run status and diffs with `git -C "$PROJECT"`, never from `~/harness`.

**Track/preserve in the project repository** intentional source, tests,
migrations, documentation, CI, deployment, and project configuration changes.
A reviewed `.example.env` or environment-variable guide is project source;
real `.env*`, credentials, auth files, and local overrides are not. Commit
preserved work on a project branch and push it to that project's remote, not to
the harness remote.

**Reset/remove in the project repository** only generated output, dependency
and build caches, logs, local secret/config files, nested worktree state after
confirming no child worktree is active, or changes the owner explicitly
abandons. An active nested worktree is operational state: preserve it, do not
add its path to the parent clone, and inspect the child repository separately.
Do not blanket-reset source or docs because a clone is being cleaned.

Before removing or resetting a project clone:

```bash
PROJECT="$PROJECTS_ROOT/<owner>/<repo>"
git -C "$PROJECT" status --short --untracked-files=all
git -C "$PROJECT" diff --name-status
git -C "$PROJECT" ls-files --others --exclude-standard
git -C "$PROJECT" worktree list --porcelain
```

If status is non-empty, stop and classify each path. Preserve intentional work
by committing it on the project branch, or by making an explicit patch/backup;
discard only after the owner confirms. A project clone with dirty, unclassified
work must not be removed with `rm -rf`.

## DETECT BASE

Run first. Every create/remove op needs `$BASE` and `$WORKTREES_ROOT`.

`$WORKTREES_ROOT` is always `.worktrees/` inside **the repository you are standing
in** — run this from the harness root for harness branches, or from
`projects/<owner>/<repo>/` to cut a worktree of that project. `oh-path` resolves the
fixed root and only exists at the harness root, so the project case
falls through to the repository toplevel.

```bash
BASE=$(git show-ref --verify --quiet refs/heads/development && echo development || \
       git show-ref --verify --quiet refs/heads/main && echo main || echo master)
TOPLEVEL="$(git rev-parse --show-toplevel)"
if [ -x "$TOPLEVEL/.oh/scripts/oh-path" ]; then
  WORKTREES_ROOT="$(bash "$TOPLEVEL/.oh/scripts/oh-path" worktrees --no-create 2>/dev/null || printf '%s' "$TOPLEVEL/.worktrees")"
  PROJECTS_ROOT="$(bash "$TOPLEVEL/.oh/scripts/oh-path" projects --no-create 2>/dev/null || printf '%s' "$TOPLEVEL/projects")"
else
  WORKTREES_ROOT="$TOPLEVEL/.worktrees"
  PROJECTS_ROOT=""
fi
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
mkdir -p "$PROJECTS_ROOT/$OWNER"
git clone "https://github.com/$OWNER/$REPO.git" "$PROJECTS_ROOT/$OWNER/$REPO"

# Remove only after the CHANGE ROUTING preflight above.
PROJECT="$PROJECTS_ROOT/$OWNER/$REPO"
if ! git -C "$PROJECT" status --porcelain=v1 --untracked-files=all; then
  echo "Cannot inspect project clone; refusing removal: $PROJECT" >&2
  exit 1
fi
if [ -n "$(git -C "$PROJECT" status --porcelain=v1 --untracked-files=all)" ]; then
  echo "Dirty project clone; preserve or explicitly classify changes first: $PROJECT" >&2
  exit 1
fi
rm -rf "$PROJECT"
```

No `git worktree` for these. Plain `git clone` / `rm -rf`.

To cut a worktree **of** a project clone, re-run DETECT BASE from inside it —
`$WORKTREES_ROOT` then resolves to `$PROJECT/.worktrees` and every CREATE, REMOVE,
and STALE AUDIT block above applies unchanged.
