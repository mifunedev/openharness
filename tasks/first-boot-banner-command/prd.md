# PRD: Correct first-boot banner command

## Introduction

The devcontainer first-boot banner currently tells new sandbox users to run `openharness onboard <name>` or `openharness onboard`, but the image installs the in-tree CLI as `oh` and the current setup wizard is `oh config slack`. A fresh user who follows the banner hits a missing command before reaching the agent.

This change updates the first-boot message to advertise commands that exist today and adds a regression test so the stale `openharness onboard` copy cannot return silently.

## Protected-path override note

`.devcontainer/entrypoint.sh` and `install/banner.sh` are listed in `.claude/protected-paths.txt`. This ticket does not delete, deprecate, or bypass either boot surface; it performs narrow copy/status corrections so both user-visible banners name the installed `oh` CLI, then adds test guards. Both protected files remain load-bearing and protected after the change.

## Goals

- Remove the nonexistent `openharness onboard` command from the first-boot banner.
- Point users at the real optional setup wizard: `oh config slack` without implying it completes or dismisses onboarding.
- Update the interactive shell banner's Open Harness CLI status row to check and label the installed `oh` command, not `openharness`.
- Preserve existing first-boot detection and banner-printing behavior outside copy/status naming.
- Add fast script-test regression guards for both banner contracts.

## User Stories

### US-001: Correct the first-boot banner copy

**Description:** As a new harness user, I want the first-boot banner to show commands that actually exist so I can complete optional setup without dead-ending.

**Acceptance Criteria:**

- [ ] `.devcontainer/entrypoint.sh` no longer contains `openharness onboard`.
- [ ] The first-boot banner includes `oh config slack` as the optional Slack setup wizard.
- [ ] The banner removes `Complete setup` / onboarding-completion framing and explicitly says Slack setup is optional.
- [ ] The banner includes normal usage guidance such as starting an installed agent (`claude`, `codex`, or `pi`) from the shell.
- [ ] No surrounding entrypoint behavior is changed beyond the banner text.

### US-002: Correct the interactive shell banner CLI row

**Description:** As a user attaching to the sandbox shell, I want the onboarding status banner to check and label the installed Open Harness CLI correctly.

**Acceptance Criteria:**

- [ ] `install/banner.sh` checks `command -v oh` instead of `command -v openharness`.
- [ ] The version probe uses `oh --version`.
- [ ] The printed status row label is `oh`, not `openharness`.
- [ ] No other banner status rows or shortcut behavior are changed.

### US-003: Add regression tests for the banner contracts

**Description:** As the harness maintainer, I want fast tests that catch stale onboarding commands and CLI names in boot banners before they ship.

**Acceptance Criteria:**

- [ ] A Vitest test under `scripts/__tests__/` reads `.devcontainer/entrypoint.sh` and `install/banner.sh` from the repo root.
- [ ] The test fails if the first-boot echo block contains `openharness onboard`.
- [ ] The test fails if the first-boot echo block does not contain `oh config slack`.
- [ ] The test fails if `install/banner.sh` checks `command -v openharness`, runs `openharness --version`, or prints the Open Harness CLI row as `openharness`.
- [ ] The test is included by `pnpm test:scripts` with no new runtime dependencies.

### US-004: Record the user-visible fix

**Description:** As the harness maintainer, I want release notes to capture that the first-boot guidance now points to the real CLI.

**Acceptance Criteria:**

- [ ] `CHANGELOG.md` gains one bullet under the existing `## [Unreleased]` → `### Fixed` section linking issue #124.
- [ ] The entry states that the first-boot and shell banners now point at the installed `oh` CLI instead of nonexistent/stale Open Harness command names.

## Functional Requirements

- FR-1: The first-boot banner must not reference commands absent from the installed `oh` CLI.
- FR-2: The interactive shell banner must check, version, and label the installed `oh` CLI.
- FR-3: Regression tests must validate the specific first-boot echo block and shell-banner CLI status block, not unrelated comments or prose.
- FR-4: The regression test must be path-stable from any current working directory by resolving the repository root from the test file location.
- FR-5: The fix must stay harness-infra scoped: `.devcontainer/`, `install/`, `scripts/__tests__/`, `tasks/`, and `CHANGELOG.md` only.

## Non-Goals (Out of Scope)

- Implementing a new `openharness onboard` or `oh onboard` command.
- Creating or changing the `.claude/.onboarded` marker semantics.
- Adding a dismissal path for the first-boot banner.
- Changing Slack token collection behavior, tmux session behavior, or Pi extension loading.
- Modifying sandbox application code.

## Technical Considerations

- `packages/oh/package.json` exposes only the `oh` binary.
- `packages/oh/src/cli.ts` exposes the `config` command family, including `oh config slack`.
- The test can mirror existing `scripts/__tests__/*.test.ts` style with Node `fs`/`path` helpers and Vitest assertions.

## Success Metrics

- `pnpm test:scripts` fails on a fixture/revert that reintroduces `openharness onboard` into `.devcontainer/entrypoint.sh`.
- New users see an actionable first-boot prompt that names the installed CLI.

## Open Questions

- None.
