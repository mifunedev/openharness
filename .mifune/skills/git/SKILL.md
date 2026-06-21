---
name: git
description: |
  Use when creating issues, branches, worktrees, commits, PRs, changelog entries,
  stacked PRs, or releases in Open Harness. Provider-portable source of truth for
  git conventions that should be loaded as a slash skill because rules files are
  not supported by every harness provider.
allowed-tools: Bash
---

# Git Workflow

## Overview

This skill is the provider-portable source of truth for Open Harness git and
GitHub conventions. Use it instead of relying on `context/rules/git.md`: some
harness providers do not load `context/rules/*`, but they can still expose skills
as slash commands or command pointers.

The legacy rules file remains only as a pointer to this skill.

## When to Use

Load or invoke `/git` whenever you need to:

- create or title a GitHub issue
- name a branch or worktree
- choose a base branch for a PR
- write a PR title/body
- write a commit message
- update `CHANGELOG.md`
- isolate in-flight work in a worktree
- stack a PR on another open PR
- cut or verify a release
- decide what to do after pushing a branch

Do not use this skill for PR queue triage; use `/pr-audit` for that. Use
`/worktrees` for detailed worktree commands, but keep its behavior aligned with
this skill.

## Issue Titles

Format:

```text
<prefix>(<issue#>): <shortdesc>
```

Allowed `<prefix>` values:

- `feat`
- `bug`
- `task`
- `audit`
- `skill`
- `agent`

These match `.github/ISSUE_TEMPLATE/<prefix>.md`.

Example:

```text
feat(#42): slack thread replies
```

Create the issue first so `<issue#>` exists, then create the branch.

## Branch Names

Format:

```text
<prefix>/<issue#>-<short-desc>
```

Rules:

- `<short-desc>` is kebab-case.
- Keep `<short-desc>` to five words or fewer.
- Base new branches off the detected default target branch.
- For Open Harness feature/task PRs, prefer `feat/<short-slug>` when no issue
  number is available from the user request.
- Reserve `agent/<agent-name>` for persistent autonomous agent identities or
  workspaces, not ordinary feature/task PRs.

Example:

```text
feat/42-slack-thread-replies
```

## Default Target Branch

Use the first branch that exists:

1. `development` — preferred
2. `main` — fallback
3. `master` — fallback

Detection:

```bash
BASE=$(git show-ref --verify --quiet refs/heads/development && echo development || \
       git show-ref --verify --quiet refs/heads/main && echo main || \
       git show-ref --verify --quiet refs/remotes/origin/development && echo development || \
       git show-ref --verify --quiet refs/remotes/origin/main && echo main || \
       echo master)
echo "$BASE"
```

PRs target this branch; new branches cut from it.

For canonical Open Harness upstream work, target `mifunedev/openharness` and the
`upstream` remote explicitly when the local checkout's `origin` is a personal
fork.

## Git Authentication

Inside the sandbox, run this during onboarding:

```bash
gh auth login && gh auth setup-git
```

GitHub CLI installs the credential helper. `git push` and `git fetch` then use
the GitHub token; SSH keys are not required.

## PR Titles

Format:

```text
FROM <source-branch> TO <target-branch>
```

The `FROM` and `TO` words are literal.

Example:

```text
FROM feat/42-slack-thread-replies TO development
```

## PR Bodies

Include:

- issue link: `Closes #<issue#>` or `Fixes #<issue#>` / `Resolves #<issue#>`
- target branch context
- short summary and verification when useful

Target the detected default target branch: `development` → `main` → `master`.

## Commit Messages

Format:

```text
<type>: <description>
```

Allowed types:

- `feat`
- `fix`
- `task`
- `audit`
- `skill`

Keep the subject concise. Add a body only when it materially clarifies rationale,
risks, or verification.

## Changelog

Root `CHANGELOG.md` follows Keep a Changelog with CalVer tags.

Every PR with user-visible impact MUST add an entry under the `## [Unreleased]`
heading in the same commit as the change.

Categories:

- `### Added`
- `### Changed`
- `### Fixed`
- `### Removed`
- `### Deprecated`
- `### Security`

Skip changelog entries only for pure chores with no runtime or workflow effect:
internal refactors, test-only changes, typo fixes. When in doubt, add an entry.

Entry format: one line, imperative mood, link the PR or issue when known.

```markdown
### Added
- Slack thread replies in multi-channel mode ([#42](https://github.com/mifunedev/openharness/pull/42)).
```

At release time, `/release` promotes `[Unreleased]` to a new
`## [<VERSION>] - YYYY-MM-DD` section and re-seeds an empty `[Unreleased]` block.
Do not hand-edit versioned sections after the tag ships.

## Worktrees

Default path:

```text
.worktrees/<branch>
```

Create `.worktrees/` if missing. Independent project clones with their own
`.git` directories live under:

```text
.worktrees/project/<project-name>/<repo>/
```

See `.worktrees/README.md` for project clone details.

Create a worktree for an existing branch:

```bash
mkdir -p .worktrees
git worktree add .worktrees/<branch> <branch>
```

Create a new branch off `$BASE`:

```bash
mkdir -p .worktrees
git worktree add -b <prefix>/<issue#>-<short-desc> \
  .worktrees/<prefix>/<issue#>-<short-desc> "$BASE"
```

Example path:

```text
.worktrees/feat/42-slack-thread-replies
```

Cleanup:

```bash
git worktree remove .worktrees/<branch>
git worktree prune
```

`.worktrees/` is gitignored; only `.worktrees/README.md` is tracked.

### Stale worktree policy

Worktrees older than 30 days without a corresponding open PR may be removed via
`git worktree remove`. Corrupted worktree directories may be removed with
`rm -rf` only after confirming they are not valid `git worktree list` entries.
The `/harness-audit` skill flags stale-worktree candidates for review before
cleanup.

### Isolating in-flight work

When the main checkout has unstaged changes you should not commit in the current
PR, do not stash and switch branches. Instead:

1. Cut a worktree off target base:
   ```bash
   git worktree add -b <new> .worktrees/<new> "$BASE"
   ```
2. Copy in-flight files into the worktree. Plain `cp` preserves the main
   checkout's working tree untouched.
3. Commit inside the worktree. Main checkout remains exactly as-is.

Before discarding duplicated state from the main checkout, verify byte-equivalence
with the committed branch:

```bash
for f in <changed-files>; do
  a=$(md5sum "$f" | awk '{print $1}')
  b=$(git show <branch>:"$f" | md5sum | awk '{print $1}')
  [ "$a" = "$b" ] && echo "same:  $f" || echo "DRIFT: $f"
done
```

Only after every file shows `same:` should you run `git restore` or `rm -f` to
clean the main checkout.

## Catching Up Feature Branches

When an open feature branch falls behind `development`, prefer merging the target
branch into the feature branch instead of rebasing it. This preserves the
branch's published history, avoids force-push churn, and keeps integration
conflict resolution on the feature branch; the final squash merge keeps
`development` free of the catch-up merge commit.

```bash
git fetch origin development
git checkout <feature-branch>              # or run inside its worktree
git merge origin/development               # resolve conflicts on the feature branch
git push origin <feature-branch>           # normal push; no --force-with-lease
```

After the merge, rerun the targeted checks and `/ci-status`/`/pr-audit` before
marking the PR ready or merging it.

Use rebase/force-push only for deliberate history surgery, for example before a
branch has been shared, or when explicitly managing a stacked PR.

## Stacked PRs

When a PR needs work from another open PR, stack instead of waiting:

```bash
git fetch origin <parent-branch>
git rebase origin/<parent-branch>
git push --force-with-lease
gh pr edit <pr#> --base <parent-branch>
gh pr edit <pr#> --title "FROM <branch> TO <parent-branch>"
```

Resolve conflicts and rerun targeted tests/checks after rebasing.

When the parent PR merges, GitHub auto-rebases the stacked PR's base to the
parent's target, usually `development`. Do not force-push again after the parent
merges; let GitHub handle retargeting.

Keep stacks shallow:

- one level is routine
- two levels is rare
- three levels means sequencing is probably wrong

## Releases

Versioning: CalVer `YYYY.M.D` for the first release of a day, then
`YYYY.M.D-N` for subsequent releases that day.

Release branch:

```text
release/<VERSION>
```

Example:

```text
release/2026.4.18-2
```

Pushing a tag triggers `.github/workflows/release.yml`. The release gate runs
lint, format check, typecheck, build, test, root-scripts tests, pnpm-pin drift
checks, boot-path lint, and the eval-probe regression gate before building and
pushing `ghcr.io/mifunedev/openharness:<VERSION>` and creating the GitHub
Release.

Branch model:

```text
development → main → release/<VERSION> → tag <VERSION> → main & development in sync
```

`development` is the integration branch. `main` is the release line. A release
promotes `development` into `main`, cuts the release branch from `main`, tags it,
and leaves both branches converged.

Pre-flight before tagging:

- intended source branch, usually `development`, has no uncommitted changes
- `development` is pushed and CI is green
- `main` is fast-forwardable from `development`

Procedure:

```bash
VERSION=$(date '+%Y.%-m.%-d')  # append -N if tag exists

# 1. Promote CHANGELOG [Unreleased] -> [VERSION], commit on development, push.
#    /release automates this.
git push origin development

# 2. Promote development -> main. main must be strictly behind development.
git fetch origin main development
git merge-base --is-ancestor origin/main origin/development \
  && echo "FF-safe" || echo "DIVERGED — reconcile before releasing"
git push origin origin/development:main

# 3. Cut release branch from main and tag.
git checkout -b "release/$VERSION" origin/main
git push origin "release/$VERSION"
git tag "$VERSION" && git push origin "$VERSION"
```

After pushing the tag, monitor `.github/workflows/release.yml` and verify the
GitHub Release and GHCR image. Prefer `/release` for the complete automated
procedure.

## After Push

If `.claude/skills/ci-status/` exists, invoke `/ci-status` after every `git push`
to confirm pipeline green before declaring work done. A push with failing CI is
not done.

## Standard Workflow

Let `$BASE` be the default target branch detected above.

1. Create GitHub issue and record `<issue#>`.
2. Create a branch from `$BASE`:
   ```bash
   git checkout -b <prefix>/<issue#>-<short-desc> "$BASE"
   ```
3. Add a `CHANGELOG.md` entry under `## [Unreleased]` unless the change is pure
   chore.
4. Commit with `<type>: <description>`.
5. Push the branch, explicitly choosing the target remote when `origin` is a
   fork:
   ```bash
   git push -u origin <branch>
   ```
6. Run `/ci-status` if available.
7. Create the PR:
   ```bash
   gh pr create --base "$BASE" --title "FROM <branch> TO $BASE" --body "Closes #<issue#>"
   ```

## Provider Portability

Because not every provider loads `context/rules/*`, put active instructions in
skills and use rules files only as compatibility pointers. If you discover a
provider-specific workflow dependency hiding in a rules file, promote it to a
skill and leave a short rule file that points to the skill.

## Common Pitfalls

1. **Assuming rules files load everywhere.** They do not. For workflows that must
   work across Claude, Pi, Codex, and future harness providers, prefer skills.
2. **Creating a feature branch from the wrong base.** Detect the base first and
   cut from `development` when present.
3. **Using `agent/` for normal feature work.** `agent/` is for persistent agent
   identities/workspaces. Use `feat/`, `fix/`, `task/`, `audit/`, or `skill/`.
4. **Forgetting the changelog.** User-visible workflow changes need an
   `Unreleased` entry.
5. **Stashing human work.** Isolate in a worktree instead of stash-and-switch.
6. **Force-pushing a stack after parent merge.** Let GitHub retarget the child PR.
7. **Skipping CI after push.** Use `/ci-status` when available before declaring
   the branch done.
8. **Hand-editing versioned changelog sections after release.** Only edit
   `[Unreleased]`; `/release` promotes it.

## Verification Checklist

- [ ] Issue, branch, PR title, and commit message follow the conventions above.
- [ ] Branch was cut from the detected default target branch.
- [ ] Work was isolated in `.worktrees/` when the main checkout was dirty.
- [ ] `CHANGELOG.md` has an `Unreleased` entry unless the change is pure chore.
- [ ] PR targets `$BASE` and links the issue when one exists.
- [ ] `/ci-status` or equivalent checks were run after push.
