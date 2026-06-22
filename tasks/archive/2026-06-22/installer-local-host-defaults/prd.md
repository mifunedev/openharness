# PRD — Installer Local Host Defaults

## Summary

Prevent the installer from dirtying tracked `harness.yaml` with host-specific defaults. First-install values for sandbox name, timezone, and git identity should be written to the gitignored local env surface so the checkout stays clean and future installer runs can pull updates.

## Goals

- Keep `harness.yaml` tracked, template-like, and unchanged by `scripts/install.sh`.
- Preserve the existing first-install convenience of detecting sandbox name, timezone, and git identity.
- Keep `harness.yaml` as the higher-precedence tracked override when users intentionally uncomment keys.
- Add a regression test that fails if the installer reintroduces tracked `harness.yaml` mutation.

## Non-goals

- Redesign the entire harness configuration system.
- Add a new config parser or new compose env-file layer.
- Change secret handling or GitHub token opt-in behavior.
- Modify sandbox application code.

## User stories

### US-001 — Install without dirtying tracked config

As a new Open Harness user, I want `install.sh` to preserve host-detected defaults without editing tracked source so my checkout remains updateable.

Acceptance criteria:
- `scripts/install.sh` no longer writes `sandbox.name`, `sandbox.timezone`, `git.user_name`, or `git.user_email` into `harness.yaml`.
- The generated `.devcontainer/.env` includes `SANDBOX_NAME` and, when detected, `TZ`, `GIT_USER_NAME`, and `GIT_USER_EMAIL`.
- Existing `.devcontainer/.env` files are preserved; the installer must not clobber existing secrets or user customizations on rerun.
- Generated values are quote-safe for shell sourcing when values contain spaces or apostrophes.

### US-002 — Document the local/default precedence clearly

As a maintainer, I want the generated local env comments and example env comments to explain where host-local defaults live so installer behavior matches docs.

Acceptance criteria:
- The generated `.devcontainer/.env` header says host-local defaults live there and `harness.yaml` remains clean.
- `.devcontainer/.example.env` describes `.env` as local defaults + secrets, not secrets-only.
- README, quickstart docs, and installer completion text describe `.devcontainer/.env` as gitignored host defaults + secrets.
- Existing precedence remains unchanged: active `harness.yaml` keys override `.devcontainer/.env`.

### US-003 — Prevent regression

As an orchestrator, I want test coverage that catches tracked-config mutation in the installer before it ships.

Acceptance criteria:
- A Vitest regression checks `scripts/install.sh` keeps host defaults out of tracked `harness.yaml` and preserves an existing `.devcontainer/.env`.
- The existing compose helper wiring test still verifies `scripts/install.sh` uses `scripts/docker-compose.sh`.
- `bash -n scripts/install.sh` and the relevant Vitest file pass.

## Verification

- `bash -n scripts/install.sh`
- `pnpm exec vitest run scripts/__tests__/compose-args.test.ts`
- `pnpm test` or the repository script-test gate before finalization
