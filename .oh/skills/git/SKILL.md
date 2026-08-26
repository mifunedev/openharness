---
name: git
description: |
  Open Harness git workflow: issues, branches, commits, PR titles/bodies,
  changelog discipline, worktrees, branch catch-up, stacked PRs, releases,
  and post-push CI checks.
  TRIGGER when: any chat mentions git, GitHub, branches, commits, pushes,
  pulls, PRs, issues, worktrees, merge conflicts, dirty workspaces,
  changelog entries, release branch/tag workflow, or project git conventions.
allowed-tools: Bash
---

# Git Workflow

## Always Load This Skill

Any time a chat mentions git, GitHub, branches, commits, pushes, pulls, PRs,
issues, worktrees, merge conflicts, releases, changelog entries, or dirty
workspace cleanup, read this skill before acting. Treat it as the source of truth
for routing changes to the right remote and for preserving local work safely.

## Repository and Memory Routing

This checkout commonly has two remotes:

- `upstream` → `mifunedev/openharness` (public template/canonical upstream)
- `origin` → your fork of `openharness` (private/operator fork)

Before every commit or PR, inspect the changed paths and choose the remote
explicitly. Do not assume `origin` is the public target.

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

- Link issue: `Closes #<issue#>` (or `Fixes`/`Resolves`) in the PR title or body
- Target default target branch (`development` → `main` → `master`, whichever exists)

> **`Closes #N` closes the issue on merge into `development` — the workflow does it, not
> GitHub.** GitHub honors a closing trailer only on merge into the **default** branch. PRs
> here target `development` while the default branch is `main`, so GitHub records the
> trailer as a `referenced` timeline event and nothing else. Verified on #759 (whose
> `closed` event carries `commit=none`) and independently on #753 from PR #757.
> `.github/workflows/close-issues-on-development.yml` closes the gap: on a **merged** PR
> into `development` it parses the title and body for the nine closing keywords and closes
> each referenced issue as `completed` (#841).
>
> The trailer is therefore load-bearing — write it on every PR. Close by hand only when the
> automation cannot see the merge (a direct push, a merge into another branch, a PR whose
> body carried no trailer, or a PR opened from a **fork**, which gets a read-only token):
>
> ```bash
> gh issue close <N> --repo <owner/name> --comment "Merged in #<PR>."
> ```

## Commit Messages

Format: `<type>: <description>` where `<type>` ∈ `feat` · `fix` · `task` · `audit` · `skill`

## Changelog

Root `CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com) with SemVer versions and `v`-prefixed tags.

Every PR with user-visible impact MUST add entry under `## [Unreleased]` heading, in same commit as change. Categories: `### Added` · `### Changed` · `### Fixed` · `### Removed` · `### Deprecated` · `### Security`.

Skip entries only for pure chores with no runtime or workflow effect (internal refactors, test-only changes, typo fixes). When in doubt, add entry.

Entry format: ONE sentence, imperative mood, **≤ 250 characters**, link the PR or issue.

An entry states WHAT changed and its user-visible effect. Never why. Never alternatives considered. Never implementation detail.

```markdown
### Added
- Slack thread replies in multi-channel mode ([#42](https://github.com/mifunedev/openharness/pull/42)).
```

Displaced detail has a destination — put it there, not in the entry:

| Detail | Destination |
|--------|-------------|
| Rationale, rejected alternatives | The PR body — the `([#N])` link is the pointer |
| Task/spec decisions | `.oh/tasks/<slug>/prd.md` |
| Architecture decisions | `.oh/docs/rfcs/` |
| Durable, generalized lessons | `.oh/context/IDENTITY.md` |

BAD (real entry, 3,579 chars — a design doc wearing a bullet):

```markdown
- Add `oh harness <list|install|status>` so installing an agent harness stops requiring a full image rebuild. Adding one of the four optional harnesses previously meant knowing that `harness.yaml` carries an `install:` section, …
```

GOOD (233 chars — same fact, rationale left to the PR):

```markdown
- Add `oh harness <list|install|status>` to install optional harnesses into a running sandbox without a rebuild, persisting the choice to `install.<key>` for the next build ([#821](https://github.com/mifunedev/openharness/pull/821)).
```

Enforced by `.oh/evals/probes/changelog-entry-length.sh` (report-only) over `## [Unreleased]`.

Automatic branch-push releases use the matching `## [<VERSION>] - YYYY-MM-DD` section when one already exists; otherwise they publish the current `[Unreleased]` body. Do **not** hand-edit a versioned section after its tag ships, except for a repo-wide reformat that changes no facts.

## Worktrees

Default path: `.oh/worktrees/<branch>` at project root, configurable with `WORKTREES_DIR` / `paths.worktrees`. Independent project clones (own `.git`, not harness branches) live under `.oh/worktrees/project/<project-name>/<repo>/` by default — see `.oh/worktrees/README.md`.

```bash
WORKTREES_ROOT="$(bash .oh/scripts/oh-path worktrees --no-create 2>/dev/null || printf '%s' "${WORKTREES_DIR:-.oh/worktrees}")"
mkdir -p "$WORKTREES_ROOT"
git worktree add "$WORKTREES_ROOT/<branch>" <branch>                # existing branch
git worktree add -b <prefix>/<issue#>-<short-desc> \
  "$WORKTREES_ROOT/<prefix>/<issue#>-<short-desc>" $BASE            # new branch off $BASE
```

Example path: `.oh/worktrees/feat/42-slack-thread-replies`

Cleanup: `git worktree remove "$WORKTREES_ROOT/<branch>"`.

`.oh/worktrees/` gitignored (see `.gitignore`); only `.oh/worktrees/README.md` tracked.

### Stale worktree policy

Worktrees older than 30 days without a corresponding open PR may be removed via `git worktree remove`; corrupted worktree directories may be removed with `rm -rf` after confirming they are not valid `git worktree list` entries. The `/audit harness` skill flags stale-worktree candidates for review before cleanup.

### Isolating in-flight work

When main checkout has unstaged changes you shouldn't commit in current PR, do **not** stash-and-switch-branches (risk of losing context). Instead:

1. Cut worktree off target base: `git worktree add -b <new> "$WORKTREES_ROOT/<new>" $BASE`.
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

## Destructive git under the cc-safety-net guard

`cc-safety-net` denies inline destructive git — `git reset --hard <ref>`, `git clean -f`, `git branch -D`, `git worktree remove --force`, `git push --force` — in every mode (its built-in git rules are not allowlistable). In agent (hook-mediated) contexts you must route these through the file-invoked shim instead:

```bash
bash .oh/scripts/git-maintenance.sh reset-hard <ref>
bash .oh/scripts/git-maintenance.sh clean
bash .oh/scripts/git-maintenance.sh branch-delete <branch>
bash .oh/scripts/git-maintenance.sh worktree-remove <path>
bash .oh/scripts/git-maintenance.sh push-force <remote> <branch>   # uses --force-with-lease
```

**Scope rule:** only **non-agent-mediated** invocations — raw scheduler/tmux shell scripts that never spawn a provider — bypass the PreToolUse hooks. Agent-driven crons do **not** bypass them (`cron-runtime.ts` runs them as `pi --continue` / `claude -p` prompts, so their Bash passes through the guard), so those must use the shim too. This is a compatibility shim, not a security control — the same script-file gap is also an evasion route; Docker is the security boundary.

## Catching Up Feature Branches

When an open feature branch falls behind `development`, prefer merging the target branch into the feature branch instead of rebasing it. This preserves the branch's published history, avoids force-push churn, and keeps integration-conflict resolution on the feature branch; the final squash merge keeps `development` free of the catch-up merge commit.

```bash
git fetch origin development
git checkout <feature-branch>              # or run inside its worktree
git merge origin/development               # resolve conflicts on the feature branch
git push origin <feature-branch>           # normal push; no --force-with-lease
```

After the merge, rerun the targeted checks and `/ci-status`/`/audit pr` before marking the PR ready or merging it.

Use rebase/force-push only for deliberate history surgery (for example, before a branch has been shared, or when explicitly managing a stacked PR as described below).

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

Every push to `main` or `master` triggers `.github/workflows/release.yml`. The
workflow checks out the exact event SHA and requires validation, boot-path lint,
and eval probes to pass before it mutates a tag, GitHub Release, or package.
Do **not** manually pre-create a release tag or `release/<version>` branch.

Versioning is SemVer: `MAJOR.MINOR.PATCH`, tagged `vMAJOR.MINOR.PATCH`. Root
`package.json` holds the version. No other file records it. The workflow reads
that file and never derives a version from the clock, so cutting a release is a
deliberate bump, not a side effect of pushing.

Creating `refs/tags/v<version>` is the atomic reservation. A retry reads the same
version from the same commit, so it reuses a same-SHA draft, and a retry of an
already-published same-SHA release is a successful no-op.

**An unbumped push to `main` is a clean skip, not a failure.** When the tag
already exists on a different commit, the reserve step reports the version as
already released, sets `publishedNoop=true`, and the image, CLI, and finalize
jobs all skip. The run stays **green**. To publish again, bump the version.

The `v` prefix appears only in the git tag and the GitHub Release name. The step
output, the GHCR image tags, and the concurrency group all stay bare
(`ghcr.io/mifunedev/openharness:0.1.0`).

The artifact sequence is:

```
main|master push → validate + boot-lint + eval → read version from package.json
                 → reserve v<version> tag + draft
                 → build + smoke → push <version> + sha-<full-SHA> GHCR tags
                 → canonical latest-by-digest → publish/no-op CLI
                 → publish GitHub Release
```

The mutable/latest branch is canonically `main` when it exists, otherwise
`master`. A helper fetches both refs immediately before digest promotion, so a
`master` run can never regress `latest` when `main` exists; stale canonical runs
also skip it. GitHub `make_latest` repeats the same fresh canonical check and is
always false for the noncanonical branch. The GitHub Release stays draft until
immutable image and successful/no-op CLI publication finish. See `/release` for
the fast-forward promotion, monitoring, and verification procedure.

## After Push

If `.claude/skills/ci-status/` exists, invoke `/ci-status` after every `git push` to confirm pipeline green before declaring work done. Push failing CI is not done.

## Provider Portability

Because not every provider loads `.oh/context/rules/*`, put active instructions in
skills and use rules files only as compatibility pointers. If you discover a
provider-specific workflow dependency hiding in a rules file, promote it to a
skill and leave a short rule file that points to the skill.

## Workflow

Let `$BASE` = default target branch (detected per rule above).

1. Create GitHub issue → record `<issue#>`
2. `git checkout -b <prefix>/<issue#>-<short-desc> $BASE`
3. Add `CHANGELOG.md` entry under `## [Unreleased]` (see § Changelog) — unless change is pure chore
4. Commit with `<type>: <description>`
5. `git push -u origin <branch>` → then `/ci-status` (if skill exists)
6. `gh pr create --base $BASE --title "FROM <branch> TO $BASE" --body "Closes #<issue#>"`
7. After the merge, confirm the issue closed. The `close-issues-on-development` workflow
   closes it from the `Closes #N` trailer (see § PR Bodies). If the merge bypassed a PR into
   `development`, close it by hand: `gh issue close <issue#> --repo <owner/name>`
