---
sidebar_position: 999
title: "Contributing"
---

# Contributing to Open Harness

This guide covers the workflow for contributing to Open Harness: creating branches, writing commits, updating the changelog, and shipping releases.

## Setup

Clone the repository:

```bash
git clone https://github.com/mifunedev/openharness.git
cd openharness
```

Open Harness has no host-side build step. The orchestrator runs at the project root (Docker + `make`), and all application work happens inside the sandbox container. You only need:

- Docker (with `docker compose`)
- `make`
- `git` and the GitHub CLI (`gh`)

### Provision the sandbox

The lifecycle is driven entirely by the root `Makefile`:

```bash
make sandbox    # provision and start the sandbox (docker compose up -d --build)
make shell      # enter the sandbox as the `sandbox` user
make ps         # show service status
make logs       # tail compose logs
make stop       # stop the sandbox, preserving volumes
make destroy    # stop and remove the sandbox (volumes wiped)
make restart    # restart the service
make help       # list all targets
```

A first-run helper is available at `scripts/install.sh` — it prompts for the values written to `.devcontainer/.env` (GitHub token autodetect, idempotent re-runs) before you call `make sandbox`.

### Onboard inside the sandbox

After `make shell`, complete one-time GitHub auth so `git push` and `gh` work from within the container:

```bash
gh auth login && gh auth setup-git
```

Then start an agent. The default is the `pi` CLI; `claude` and `codex` are also installed:

```bash
pi          # default agent CLI
claude      # Claude Code
codex       # OpenAI Codex CLI
```

### Installing a harness pack

Multi-agent setups (e.g. Pi+Mom Slack bot) ship as harness packs. Install one by cloning it into the workspace and following its README:

```bash
git clone <pack-repo> workspace/<pack>
# then follow workspace/<pack>/README.md
```

The canonical example is [`@ryaneggz/mifune`](https://github.com/ryaneggz/mifune), which defines the pack contract.

## Branch Naming

All feature branches follow the format `<prefix>/<issue#>-<short-desc>`.

Prefixes: `feat` · `fix` · `task` · `audit` · `skill` · `agent`

Short description: kebab-case, maximum 5 words.

Example:

```
feat/42-slack-thread-replies
```

Create your branch off the default target (`development` if it exists, otherwise `main`):

```bash
git checkout -b feat/42-slack-thread-replies development
```

## Commit Messages

Commit format: `<type>: <description>`

Types: `feat` · `fix` · `task` · `audit` · `skill`

Example:

```
feat: add Slack thread replies for multi-channel mode
```

## CHANGELOG Entries

Every pull request with user-visible impact must add an entry to `CHANGELOG.md` under `## [Unreleased]` in the same commit as your change.

Categories: `### Added` · `### Changed` · `### Fixed` · `### Removed` · `### Deprecated` · `### Security`

Format: one line, imperative mood, link to your PR or issue.

Example:

```markdown
### Added
- Slack thread replies in multi-channel mode ([#42](https://github.com/mifunedev/openharness/pull/42)).
```

Skip CHANGELOG entries only for pure chores with no runtime or workflow effect (refactors, test fixes, typos). When in doubt, add an entry.

## Pull Requests

Target the default branch (`development`). Title format: `FROM <source-branch> TO <target-branch>` (literal).

Example:

```
FROM feat/42-slack-thread-replies TO development
```

Link the issue in the body:

```
Closes #42
```

Create the PR:

```bash
gh pr create --base development \
  --title "FROM feat/42-slack-thread-replies TO development" \
  --body "Closes #42"
```

## Releases

Open Harness uses CalVer versioning: `YYYY.M.D` for the first release of the day, then `YYYY.M.D-N` (N ≥ 2) for subsequent releases.

Releases are automated via the `/release` skill, which:

1. Computes the next version
2. Creates a release branch
3. Promotes `[Unreleased]` to the new version in CHANGELOG.md
4. Tags and pushes to trigger CI
5. Verifies the GitHub Release and GHCR image

Run the skill from inside the orchestrator sandbox:

```bash
/release
```

For details on the full workflow and manual procedure, see `/git-workflow`
(`.claude/skills/git-workflow/SKILL.md`) in the repo.

---

Need to dive deeper? See `/git-workflow` (`.claude/skills/git-workflow/SKILL.md`)
in the repo for the canonical workflow.
