# PRD — Update Agent Browser Skill CLI Docs

## Introduction

The `agent-browser` skill is an executable runbook for visual browser checks. It currently documents stale `agent-browser` 0.8.5 behavior: examples use `execute` and relative screenshot paths even though memory records that the current command is `eval` and screenshots must use absolute output paths.

## Goals

- Make `.claude/skills/agent-browser/SKILL.md` match observed `agent-browser` 0.8.5 CLI behavior.
- Prevent drift by adding an eval probe that fails if the stale command/path guidance returns.
- Keep scope limited to harness-infra documentation and eval coverage.

## Constraints and Non-Goals

- Protected-path mitigation: `.claude/skills/agent-browser/SKILL.md` is protected; modify it in place only. Do not delete, rename, deprecate, or move the `agent-browser` skill.
- Ship-spec creates `tasks/update-agent-browser-skill/prd.json` before implementation using schemaVersion 1, `branchName: "feat/148-update-agent-browser-skill"`, and the user-story shape used by existing `tasks/*/prd.json` files.
- Do not change the `agent-browser` package version or install path.
- Do not add runtime wrappers around `agent-browser`.
- Do not modify sandbox application code.
- Do not change unrelated skills.

## User Stories

### US-001 — Correct the agent-browser runbook

As an orchestrator using `/agent-browser`, I want the skill to use the current CLI command and screenshot path requirements so browser validation commands work reliably.

Acceptance criteria:

- `.claude/skills/agent-browser/SKILL.md` replaces `agent-browser execute` with `agent-browser eval` for viewport resizing or other JavaScript execution examples.
- The screenshot section requires an absolute screenshot output path and shows a command that builds an absolute path from `$PWD`.
- The report section displays the absolute screenshot path and the custom screenshot example uses `<absolute-path>`.
- The skill does not mention an unsupported `--full-page` flag.
- The edit preserves the existing install/preflight/session hygiene headings: `2a. Check agent-browser is installed`, `2b. Check Chromium launches`, `2c. Verify page loaded`, and `Session Hygiene`.

### US-002 — Add an eval probe for the runbook contract

As the eval suite, I want a probe that guards the corrected `agent-browser` skill text so future edits cannot silently reintroduce stale CLI instructions.

Acceptance criteria:

- `evals/probes/agent-browser-cli.sh` exists and is executable.
- The probe follows the existing Tier-A 3-state pattern: exit 0 PASS, exit 1 REGRESSION, exit 2 SKIPPED.
- It skips if `.claude/skills/agent-browser/SKILL.md` is absent.
- It passes only when all exact checks hold: the skill contains `agent-browser eval`; contains the phrase `absolute output path`; contains `SCREENSHOT_PATH="$PWD/.claude/screenshots/${FILENAME}.png"`; contains `<absolute-path>`; does not contain `agent-browser execute`; and does not contain `--full-page`.
- `bash -n evals/probes/agent-browser-cli.sh` passes.
- `bash evals/probes/agent-browser-cli.sh` exits 0 against the corrected skill.

### US-003 — Refresh traceability artifacts

As a reviewer, I want the change traceable through the task artifacts, changelog, and eval scoreboard.

Acceptance criteria:

- `CHANGELOG.md` notes the agent-browser skill/probe fix under `[Unreleased]` and links issue #148.
- `tasks/update-agent-browser-skill/prd.json` records every story as passed when complete.
- `/eval` runs through `.claude/skills/eval/run.sh` and `evals/RESULTS.md` records `agent-browser-cli` as PASS with no new green→red regressions.
- Baseline handling: pre-existing unrelated reds with unchanged deltas are documented in the PR but not fixed in this task; only a new green→red regression or non-zero eval runner exit blocks readiness.
