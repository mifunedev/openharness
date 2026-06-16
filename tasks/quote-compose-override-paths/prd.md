# PRD — Quote Compose Override Paths

## Summary

Safely quote compose override paths from `harness.yaml` and `config.json` across sandbox startup commands so paths with spaces or shell metacharacters are passed to Docker Compose as literal `-f` arguments.

## Goals

- Prevent compose override path word-splitting and shell interpretation in `make sandbox`, `make config`, and `scripts/install.sh` startup paths.
- Preserve existing compose file ordering and existing `harness.yaml` / `config.json` behavior.
- Add regression tests that prove override paths with spaces and shell-significant characters are handled as literal arguments.

## Non-Goals

- Do not change the `harness.yaml` schema.
- Do not change Docker Compose service definitions or add new overlays.
- Do not modify sandbox application code or agent-owned workspace files.
- Do not remove support for `config.json` compose overrides.

## User Stories

### US-001 — Centralize compose argument construction

As a harness maintainer, I want compose file and env-file arguments assembled by a shell-safe helper so every sandbox lifecycle entrypoint passes override paths literally.

**Acceptance criteria**

- A Bash executable helper constructs and executes Docker Compose arguments using arrays, not raw string concatenation, `eval`, or printed shell fragments for `-f` override paths.
- The helper includes base `.devcontainer/docker-compose.yml`, optional Hermes dashboard overlay, `harness.yaml` overlays, and `config.json` overlays in that order.
- Existing explicit env-file precedence remains unchanged: `.devcontainer/.env` first, generated `.devcontainer/.harness.yaml.env` second.
- Override paths keep current repo-root-relative resolution for both Makefile and installer entrypoints; installer calls the helper from a defined repo-root context.
- The helper supports a debug/dry-run mode that prints one argv entry per line for diagnostics without executing Docker Compose.

### US-002 — Wire Make targets through the safe helper

As a harness user, I want `make sandbox`, `make destroy`, `make stop`, `make logs`, `make ps`, `make restart`, and `make config` to use the same safe compose argument path.

**Acceptance criteria**

- Make lifecycle targets no longer expand raw `COMPOSE_OVERRIDES` strings into the shell; they call the shared executable helper directly.
- `make config` still prints the generated harness env file when present and then prints `docker compose config`.
- Target verbs and flags remain unchanged: `sandbox` uses `up -d --build`, `destroy` uses `down -v`, and the other lifecycle targets keep their existing subcommands.
- Sandbox name and shell target behavior remain unchanged.
- Protected `Makefile` is edited only by targeted diff; no deletion, rename, or deprecation.

### US-003 — Wire installer startup through the safe helper

As a fresh installer, I want `scripts/install.sh` to use the same safe compose argument path when it builds and starts the sandbox.

**Acceptance criteria**

- Installer startup calls the shared helper rather than rebuilding `COMPOSE_FILES` with raw string concatenation.
- Installer still writes the generated harness env file before compose execution.
- Existing GitHub-token and first-run messaging behavior remains unchanged.
- If Docker Compose rejects an override, the failure output includes the literal offending compose path through Docker Compose's own diagnostics; installer messaging is otherwise preserved.

### US-004 — Regression coverage

As a maintainer, I want tests proving override paths with spaces and shell metacharacters remain single literal compose file arguments.

**Acceptance criteria**

- Tests cover `harness.yaml` and `config.json` override sources.
- Tests assert the full literal argument ordering: env files, base, Hermes overlay, `harness.yaml` overlays, then `config.json` overlays.
- Tests prove shell metacharacters are not interpreted by using debug argv output from the helper.
- Tests or static assertions verify `Makefile` and `scripts/install.sh` use the shared helper and no longer build raw compose override strings.
- Existing `pnpm test:scripts` passes.

## Critique Synthesis

Critics found 0 high-severity findings, 7 medium-severity findings, and 3 low-severity findings. The mitigations are built into the acceptance criteria above: the helper is an executable Bash wrapper, relative-path behavior is pinned to the repo root, lifecycle verbs/flags remain unchanged, debug argv output provides the rollback/diagnostic path, entrypoint wiring is tested, and protected `Makefile` is edited only by targeted diff with no deletion or rename.

## Validation

- `pnpm test:scripts -- scripts/__tests__/compose-args.test.ts` (or equivalent focused test)
- `pnpm test:scripts`
- `bash .claude/skills/eval/run.sh`
