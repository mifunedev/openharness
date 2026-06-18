# PRD: Avoid Shell-Sourcing Slack Env During Startup

## Introduction

The devcontainer entrypoint restores the optional `client-slack` tmux session when Slack tokens are present in `.devcontainer/.env`. Today the tmux command shell-sources that Compose env file before launching `pi`, which treats configuration data as executable shell. This change makes Slack restore parse tokens as data and pass only the required Slack environment variables to the child process.

## Goals

- Remove the boot-time `source .devcontainer/.env` path from Slack restore.
- Preserve existing Slack restore behavior when `SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`, `tmux`, and `pi` are available.
- Pass only the Slack variables read from `.devcontainer/.env` that the Slack extension needs (`SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`, plus optional `SLACK_ALLOW_USERS` / `SLACK_ALLOW_CHANNELS`) into the `client-slack` launch command; do not scrub unrelated inherited process env.
- Add regression tests for non-shell-safe env content, optional allowlist preservation, and the no-source contract.

## User Stories

### US-001: Launch Slack restore with explicit token env vars

**Description:** As the harness operator, I want Slack restore to launch `pi` with explicit token environment variables so `.devcontainer/.env` is parsed as data, not shell code.

**Acceptance Criteria:**

- [ ] `.devcontainer/entrypoint.sh` no longer sources `.devcontainer/.env` in the Slack restore path.
- [ ] `client-slack` still starts only when `SLACK_APP_TOKEN` and `SLACK_BOT_TOKEN` are present, `tmux` is available, `pi` is installed for the sandbox user, and the tmux session does not already exist.
- [ ] The tmux command explicitly passes `SLACK_APP_TOKEN` and `SLACK_BOT_TOKEN`, and preserves optional `SLACK_ALLOW_USERS` / `SLACK_ALLOW_CHANNELS` values when those keys are present in `.devcontainer/.env`.
- [ ] Slack values embedded in the tmux command are shell-escaped or otherwise argv-safe.
- [ ] Relevant tests pass.

### US-002: Guard Slack restore env parsing with regression tests

**Description:** As a maintainer, I want tests that prove Slack restore no longer depends on shell-sourcing `.devcontainer/.env` so future entrypoint edits do not reintroduce the unsafe pattern.

**Acceptance Criteria:**

- [ ] Entry point tests assert the Slack restore block does not contain `source $SLACK_ENV` or an equivalent shell-source command.
- [ ] Tests assert the Slack restore command includes explicit `SLACK_APP_TOKEN=` and `SLACK_BOT_TOKEN=` environment assignments.
- [ ] Tests assert optional `SLACK_ALLOW_USERS` and `SLACK_ALLOW_CHANNELS` assignments are preserved when present.
- [ ] Tests cover a non-shell-safe Slack value/metacharacter fixture through the escaping helper or command construction path.
- [ ] `bash -n .devcontainer/entrypoint.sh` and typecheck/tests pass for the touched suite.

## Functional Requirements

- FR-1: The entrypoint must read Slack keys from `.devcontainer/.env` without executing the file, supporting full-line comments/blanks, simple `KEY=value` lines, and duplicate keys with the last matching assignment winning; it must not perform shell expansion or command substitution.
- FR-2: The entrypoint must explicitly pass `SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`, and any present `SLACK_ALLOW_USERS` / `SLACK_ALLOW_CHANNELS` from `.devcontainer/.env` to the Slack restore launch command; this means only these `.env` keys are imported, not that the child process is run under `env -i`.
- FR-3: The entrypoint must preserve the existing `client-slack` tmux session name and logging to `/tmp/client-slack.log`.
- FR-4: The entrypoint must not alter Slack token storage format or the Slack Pi extension.
- FR-5: Tests must fail if shell-sourcing returns to the Slack restore path.

## Non-Goals

- No changes to `.devcontainer/.env` format or token names.
- No changes to Slack extension behavior, Pi package configuration, or `oh config slack`.
- No broad entrypoint refactor outside the Slack restore block and its tests.
- No fix to the interactive `oh config slack` relaunch/manual fallback source pattern in this pass; this PR only removes boot-time entrypoint sourcing.
- No changes to Docker Compose env-file precedence.

## Technical Considerations

- `.devcontainer/entrypoint.sh` is protected and boot-critical; keep the patch narrow and shellcheck-friendly.
- Existing tests in `scripts/__tests__/entrypoint.test.ts` are text-level regression tests for entrypoint contracts; extend that pattern before adding heavier boot integration.
- If a shell escaping helper is added, keep it local/simple and test it through stable entrypoint text or a small executable extraction.

## Success Metrics

- Slack restore starts through `client-slack` without any `source $SLACK_ENV` command.
- Existing entrypoint tests plus new Slack restore tests pass.
- Shell syntax validation for `.devcontainer/entrypoint.sh` passes.

## Open Questions

- None.

## Wiki Alignment

- **Impact**: NOT-APPLICABLE
- **Local entries**: none
- **Spec alignment**: This is a narrow startup safety fix to an existing implementation detail; it does not change harness architecture, runtime flow, agent roles, public conceptual vocabulary, or operator-facing Slack setup semantics.
- **DeepWiki comparison**: No relevant DeepWiki page comparison required because no wiki/public mental model changes.
- **Acceptance criteria**: No wiki update required.
