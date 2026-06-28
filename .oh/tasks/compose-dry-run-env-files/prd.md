# PRD — Compose dry-run env files

## Introduction

`scripts/docker-compose.sh` generates `.devcontainer/.harness.yaml.env` from `harness.yaml` before invoking Docker Compose. That persistent file is useful for lifecycle commands, but the same write currently happens for read-like diagnostics such as `--print-argv` and `docker compose config`, which makes inspection mutate the working tree.

## Goals

- Make read-like compose helper invocations non-mutating with respect to `.devcontainer/.harness.yaml.env`.
- Preserve the persistent env file for real sandbox lifecycle commands.
- Add tests that prove both behaviors.

## Non-Goals

- Changing the `harness.yaml` schema.
- Changing compose override ordering or existing argv escaping behavior.
- Removing `.devcontainer/.harness.yaml.env` from lifecycle operations.

## User Stories

### US-001 — Temporary env files for read-like diagnostics

As a harness operator, I want compose diagnostics to avoid writing persistent generated env state so clean worktrees stay clean during inspection.

Acceptance criteria:
- `scripts/docker-compose.sh --print-argv ...` uses a temporary generated env file when `harness.yaml` exists.
- `scripts/docker-compose.sh ... config` uses a temporary generated env file when `harness.yaml` exists.
- The persistent `.devcontainer/.harness.yaml.env` file is not created or overwritten by those read-like paths.

### US-002 — Persistent env files for lifecycle commands

As a sandbox operator, I want normal lifecycle commands to keep the persistent generated env file so existing compose behavior remains compatible.

Acceptance criteria:
- Lifecycle invocations such as `up -d` still write `.devcontainer/.harness.yaml.env` from `harness.yaml`.
- Compose env-file ordering remains `.devcontainer/.env` first, generated harness env second, then compose files.
- Existing override and Hermes dashboard compose argv behavior is preserved.

### US-003 — Regression coverage and durable model

As a future agent, I want tests and wiki context to capture when the helper may mutate state.

Acceptance criteria:
- `scripts/__tests__/compose-args.test.ts` covers temporary env behavior for `--print-argv` and `config`.
- Tests cover persistent env behavior for a lifecycle command using a fake `docker` executable.
- `wiki/compose-wrapper.md` documents the persistent-vs-temporary split and `wiki/README.md` stays indexed.

## Wiki Alignment

- **Impact**: REQUIRED
- **Local entries**: create `wiki/compose-wrapper.md`; refresh `wiki/README.md`.
- **Spec alignment**: The wiki entry must describe the compose helper's env-file ordering, temporary generated env files for diagnostics, and persistent generated env files for lifecycle commands.
- **DeepWiki comparison**: No dedicated public DeepWiki compose-wrapper page was found; use DeepWiki-style local source-file citations and a relationship diagram.
- **Acceptance criteria**: US-003 includes wiki update and `bash evals/probes/wiki-readme-index.sh` verification.

## PM Plan

PM_DESC: Make compose dry-run diagnostics use temp env files while lifecycle commands keep persistent env state.

PM_PLAN:
- Update `scripts/docker-compose.sh` so read-like modes build argv/config with a temporary env file.
- Preserve persistent `.devcontainer/.harness.yaml.env` writes for lifecycle operations.
- Add tests proving `--print-argv`/`config` do not mutate files and lifecycle commands still persist env.
