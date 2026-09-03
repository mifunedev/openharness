---
title: "Contributing"
---

# Contributing to Open Harness

This guide covers the workflow for contributing to Open Harness: creating branches, writing commits, updating the changelog, and shipping releases.

For the inbound license terms and the Developer Certificate of Origin (DCO), see the root [`CONTRIBUTING.md`](../CONTRIBUTING.md).

## Setup

Clone the repository:

```bash
git clone --recurse-submodules https://github.com/mifunedev/openharness.git
cd openharness
```

Open Harness has no host-side build step. The orchestrator runs at the project root, and all application work happens inside the sandbox container. You only need:

- Docker (with `docker compose`)
- Node.js ≥ 20, to run the `oh` CLI. To install both:

  ```bash
  curl -fsSL -o get-oh.sh https://oh.mifune.dev/get-oh.sh   # review it first
  bash get-oh.sh
  ```

  Or, if you would rather not review it, `curl -fsSL https://oh.mifune.dev/get-oh.sh | bash`.
- `git` and the GitHub CLI (`gh`)

### Provision the sandbox

The lifecycle is driven entirely by `oh`:

```bash
oh sandbox    # provision and start the sandbox (docker compose up -d --build)
oh shell      # enter the sandbox as the `sandbox` user
oh ps         # show service status
oh logs       # tail compose logs
oh stop       # stop the sandbox, preserving volumes
oh destroy    # stop and remove the sandbox (volumes wiped)
oh restart    # restart the service
oh --help     # list every verb
```

A first-run helper is available at `.oh/scripts/install.sh` — it prompts for the non-secret values written to `oh.json` and the secrets written to the gitignored root `.env` (GitHub token autodetect, idempotent re-runs) before it calls `oh sandbox install docker`.

### Onboard inside the sandbox

After `oh shell`, install and start Herdr before any other inside-sandbox setup.
A fresh sandbox has none, because nothing installs at boot:

```bash
oh tool install herdr
herdr
```

From the initial Herdr pane, complete one-time GitHub auth so `git push` and `gh` work from within the container:

```bash
gh auth login && gh auth setup-git
```

Then start agents from Herdr panes. The default is the `pi` CLI; `claude` and `codex` are also installed:

```bash
pi          # default agent CLI
claude      # Claude Code
codex       # OpenAI Codex CLI
```

### Local validation

Use the fast harness build for routine development:

```bash
pnpm run build          # fast non-docs build
pnpm run test:scripts   # root script + .pi extension tests
bash .claude/skills/eval/run.sh
```

The rendered docs site is maintained in [`mifunedev/openharness-web`](https://github.com/mifunedev/openharness-web). In this core repo, validate docs by checking the Markdown links and the GitHub-readable index at `docs/README.md`; no Docusaurus build runs here.

### Multi-agent messaging (Slack)

Slack (and other messengers) bridge to a Pi agent via the
[`pi-messenger-bridge`](https://github.com/tintinweb/pi-messenger-bridge) npm package. The
harness installs it into a gitignored `.pi/bridge/` directory and loads it via `--extension`
only in the dedicated `client-slack-pi` tmux session (managed by `.oh/scripts/gateway.sh`) —
you don't run `pi install` yourself. Full setup (tokens, trust, the sibling Hermes gateway)
lives in [Slack integration](./integrations/slack.md).

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

Link the issue in the title or the body with a closing keyword:

```
Closes #42
```

`Closes`, `Fixes` and `Resolves` all work, and each grammatical variant works
(`Closed`, `Fixed`, `Resolved`). List every issue the pull request completes —
one keyword per issue. A bare `#42` links the issue but does not close it.

When the pull request merges into `development`, the workflow
[`.github/workflows/close-issues-on-development.yml`](../.github/workflows/close-issues-on-development.yml)
closes each referenced issue as `completed`. Closing the pull request without
merging it closes no issue. A pull request opened from a fork gets a read-only
token, so close its issue by hand.

Create the PR:

```bash
gh pr create --base development \
  --title "FROM feat/42-slack-thread-replies TO development" \
  --body "Closes #42"
```

## Releases

Open Harness uses SemVer versioning: `MAJOR.MINOR.PATCH`, tagged
`vMAJOR.MINOR.PATCH`. Root `package.json` holds the version. No other file
records it.

A release is a deliberate bump, not a side effect of a push. Every push to
`main` or `master` runs `.github/workflows/release.yml`, which validates the
commit, then publishes the version `package.json` names:

1. Validation, boot-path lint, and the eval probe suite must pass first
2. The workflow reads the version from root `package.json`
3. Creating `refs/tags/v<version>` reserves the version — this act is atomic
4. Build and smoke-test the image
5. Push the GHCR image tags `:<version>` and `:sha-<SHA>`, both bare — the `v`
   prefix belongs to the git tag, not to the registry
6. Promote `latest` by immutable digest from the canonical branch
7. Publish the CLI
8. Publish the GitHub Release

To cut a release, bump the version in `package.json` and add the matching
`## [<version>]` section to `CHANGELOG.md` in the same PR, then promote
`development` to `main`. If you push to `main` without bumping the version, the
run is a clean, **green** no-op: the reserve step reports the version as already
released and every publication job skips.

Do **not** manually pre-create a release tag or a `release/<version>` branch.

Run the release skill from inside the orchestrator sandbox:

```bash
/release
```

For details on the full workflow, see `/git` (`.claude/skills/git/SKILL.md`) in
the repo.

---

Need to dive deeper? See `/git` (`.claude/skills/git/SKILL.md`)
in the repo for the canonical workflow.
