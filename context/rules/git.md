# Git Workflow

## Issue Titles

Format: `<prefix>(<issue#>): <shortdesc>`

`<prefix>` ∈ `feat` · `bug` · `task` · `audit` · `skill` · `agent`
(matches `.github/ISSUE_TEMPLATE/<prefix>.md`)

Example: `feat(#42): slack thread replies`

> Create issue first so `<issue#>` exists, then branch.

## Branch Names

Format: `<prefix>/<issue#>-<short-desc>`

- `<short-desc>`: kebab-case, ≤5 words
- Base off default target branch (see below)

Example: `feat/42-slack-thread-replies`

## Default Target Branch

Use first existing in repo:

1. `development` (preferred)
2. `main` (fallback)
3. `master` (fallback)

Detect via `git show-ref --verify --quiet refs/heads/<name>` (or remote `refs/remotes/origin/<name>`). PRs target this branch; new branches cut from it.

## Git Authentication

Inside sandbox, run `gh auth login && gh auth setup-git` during onboarding. GitHub CLI installs credential helper — `git push` / `git fetch` use your GitHub token — no SSH keys required.

## PR Titles

Format: `FROM <source-branch> TO <target-branch>` (literal)

Example: `FROM feat/42-slack-thread-replies TO development`

## PR Bodies

- Link issue: `Closes #<issue#>` (or `Fixes`/`Resolves`)
- Target default target branch (`development` → `main` → `master`, whichever exists)

## Commit Messages

Format: `<type>: <description>` where `<type>` ∈ `feat` · `fix` · `task` · `audit` · `skill`

## Changelog

Root `CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com) with CalVer tags.

Every PR with user-visible impact MUST add entry under `## [Unreleased]` heading, in same commit as change. Categories: `### Added` · `### Changed` · `### Fixed` · `### Removed` · `### Deprecated` · `### Security`.

Skip entries only for pure chores with no runtime or workflow effect (internal refactors, test-only changes, typo fixes). When in doubt, add entry.

Entry format: one line, imperative mood, link PR or issue.

```markdown
### Added
- Slack thread replies in multi-channel mode ([#42](https://github.com/mifunedev/openharness/pull/42)).
```

At release time, `/release` promotes `[Unreleased]` to new `## [<VERSION>] - YYYY-MM-DD` section and re-seeds empty `[Unreleased]` block. Do **not** hand-edit versioned sections after tag ships.

## Worktrees

Default path: `.worktrees/<branch>` at project root. Create `.worktrees/` if missing. Independent project clones (own `.git`, not harness branches) live under `.worktrees/project/<project-name>/<repo>/` — see `.worktrees/README.md`.

```bash
mkdir -p .worktrees
git worktree add .worktrees/<branch> <branch>                # existing branch
git worktree add -b <prefix>/<issue#>-<short-desc> \
  .worktrees/<prefix>/<issue#>-<short-desc> $BASE            # new branch off $BASE
```

Example path: `.worktrees/feat/42-slack-thread-replies`

Cleanup: `git worktree remove .worktrees/<branch>`.

`.worktrees/` gitignored (see `.gitignore`); only `.worktrees/README.md` tracked.

### Stale worktree policy

Worktrees older than 30 days without a corresponding open PR may be removed via `git worktree remove`; corrupted worktree directories may be removed with `rm -rf` after confirming they are not valid `git worktree list` entries. The `/harness-audit` skill flags stale-worktree candidates for review before cleanup.

### Isolating in-flight work

When main checkout has unstaged changes you shouldn't commit in current PR, do **not** stash-and-switch-branches (risk of losing context). Instead:

1. Cut worktree off target base: `git worktree add -b <new> .worktrees/<new> $BASE`.
2. Copy in-flight files into worktree: plain `cp` preserves main checkout's working tree untouched.
3. Commit in worktree. Main checkout stays exactly as-is.

Before discarding duplicated state from main checkout, verify byte-equivalence with committed branch:

```bash
for f in <changed-files>; do
  a=$(md5sum "$f" | awk '{print $1}')
  b=$(git show <branch>:"$f" | md5sum | awk '{print $1}')
  [ "$a" = "$b" ] && echo "same:  $f" || echo "DRIFT: $f"
done
```

Only after all files show `same:` run `git restore` / `rm -f` to clean main checkout.

## Stacked PRs

When PR needs work from another open PR (e.g. feature depending on in-flight docs or infra changes), stack instead of waiting:

1. `git fetch origin <parent-branch>`
2. In worktree: `git rebase origin/<parent-branch>`. Resolve conflicts; tests may need re-running.
3. `git push --force-with-lease`
4. `gh pr edit <pr#> --base <parent-branch>`
5. `gh pr edit <pr#> --title "FROM <branch> TO <parent-branch>"`

When parent PR merges, GitHub auto-rebases stacked PR's base to parent's target (`development`). Do **not** force-push again after parent merges — let GitHub handle retarget.

Keep stacks shallow: one level routine, two levels rare, three levels means something wrong with sequencing.

## Releases

Versioning: **CalVer** `YYYY.M.D` for first release of day, then `YYYY.M.D-N` (N starts at 2) for subsequent releases.

Release branch: `release/<VERSION>` (e.g., `release/2026.4.18-2`).

Pushing tag triggers `.github/workflows/release.yml` — runs lint + type-check + tests, builds `ghcr.io/mifunedev/openharness:<VERSION>`, pushes to GHCR, creates GitHub Release.

Branch model: `development` is the integration branch; `main` is the
release line. A release **promotes `development` into `main`**, cuts the
release branch from `main`, tags it, then leaves both branches converged.
The full flow is:

```
development → main → release/<VERSION> → tag <VERSION> → main & development in sync
```

`release.yml` triggers purely on the tag push and checks out the **tagged
commit** (branch-agnostic), so the build is correct regardless of which
branch the tag sits on. The `main` promotion is what keeps the release
line authoritative — skipping it silently drifts `main` behind every
release.

Pre-flight before tagging:
- On intended source branch (`development`), no uncommitted changes
- `development` pushed and CI green

Procedure:

```bash
VERSION=$(date '+%Y.%-m.%-d')                             # append -N if tag exists

# 1. Promote CHANGELOG [Unreleased] → [VERSION], commit on development, push.
#    (the /release skill automates this; see § Changelog)
git push origin development

# 2. Promote development → main (fast-forward; main is the release line).
#    main must be strictly behind development — verify it is fast-forwardable:
git fetch origin main development
git merge-base --is-ancestor origin/main origin/development \
  && echo "FF-safe" || echo "DIVERGED — reconcile before releasing"
git push origin origin/development:main                   # clean FF, no merge commit

# 3. Cut the release branch from main and tag.
git checkout -b "release/$VERSION" origin/main
git push origin "release/$VERSION"
git tag "$VERSION" && git push origin "$VERSION"          # triggers CI release

# 4. After tag CI passes, main and development are already converged
#    (both at the promotion commit). No extra sync needed when step 2
#    was a fast-forward. If main had diverged and a merge was required,
#    merge main back into development to re-converge.
```

After pushing tag, monitor `.github/workflows/release.yml` and verify both GitHub Release and GHCR image. Use `/release` skill for full automated procedure (version detection, pre-flight, **main promotion**, tag, CI polling, verification).

## After Push

If `.claude/skills/ci-status/` exists, invoke `/ci-status` after every `git push` to confirm pipeline green before declaring work done. Push failing CI is not done.

## Workflow

Let `$BASE` = default target branch (detected per rule above).

1. Create GitHub issue → record `<issue#>`
2. `git checkout -b <prefix>/<issue#>-<short-desc> $BASE`
3. Add `CHANGELOG.md` entry under `## [Unreleased]` (see § Changelog) — unless change is pure chore
4. Commit with `<type>: <description>`
5. `git push -u origin <branch>` → then `/ci-status` (if skill exists)
6. `gh pr create --base $BASE --title "FROM <branch> TO $BASE" --body "Closes #<issue#>"`
