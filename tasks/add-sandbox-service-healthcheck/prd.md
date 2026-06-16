# PRD — Add Sandbox Service Healthcheck

## Introduction

The sandbox container can remain Docker-healthy while its tmux-managed runtime services have died. Add a lightweight healthcheck that verifies the core runtime sessions and surfaces failures through Docker/Compose health status.

## Goals

- Report missing `cron-watchdog` or `cron-system` tmux sessions as container-unhealthy.
- Report a legacy `system-cron` session as unhealthy because it blocks the current cron runtime.
- Check optional Slack and Hermes dashboard sessions only when those services are configured/enabled.
- Keep the check local, fast, and network-free.
- Document how operators inspect health status.

## Non-Goals

- Do not restart tmux sessions from the healthcheck; entrypoint/watchdog own recovery.
- Do not change cron runtime scheduling behavior.
- Do not expose new network ports or change sandbox security posture.
- Do not touch sandbox application/business code.

## User Stories

### US-001 — Healthcheck script

As a maintainer/operator, I need a script that checks sandbox runtime sessions so Docker health reflects whether harness automation is alive.

Acceptance criteria:
- `scripts/sandbox-healthcheck.sh` exits `0` only when required sessions are present, no legacy blocker exists, and all enabled optional sessions are present.
- It exits nonzero with actionable stderr when `cron-watchdog` or `cron-system` is missing.
- It exits nonzero when a legacy `system-cron` tmux session exists.
- It runs tmux checks as the `sandbox` user when invoked by Docker as root, with test coverage or static assertions for the delegation path.

### US-002 — Optional services

As an operator, I need optional services to affect health only when configured so disabled features do not make the sandbox unhealthy.

Acceptance criteria:
- The Hermes dashboard session `app-hermes-dashboard` is required only when `HERMES_DASHBOARD=true` and the `hermes` binary is available.
- The Slack session `client-slack` is required only when `SLACK_APP_TOKEN` and `SLACK_BOT_TOKEN` are present in environment or `.devcontainer/.env`, matching the entrypoint startup predicate; Slack allowlists are out of scope for health gating.
- If Slack tokens are configured but the `pi` binary is unavailable, the healthcheck fails with a specific message.
- Missing configured optional sessions produce specific stderr messages.

### US-003 — Compose wiring and validation docs

As an operator, I need Docker/Compose to run the healthcheck automatically and documentation to show how to inspect it.

Acceptance criteria:
- `.devcontainer/docker-compose.yml` defines a `healthcheck` for the sandbox service using the script.
- Healthcheck timing includes `start_period: 300s` to let entrypoint first-boot setup and cron tmux startup settle.
- Focused tests cover required sessions, optional service gating, legacy session detection, root-to-sandbox tmux delegation, and compose wiring.
- Installation/validation docs mention `docker ps`/`docker inspect` health inspection, manual script execution for debugging, and a local-only Compose override escape hatch.
- `scripts/sandbox-healthcheck.sh` is added to `.claude/protected-paths.txt` because compose now depends on it.

## Risks and mitigations

- **False negatives during first boot**: use a 300-second `start_period` so `pnpm install` and tmux startup can settle.
- **Root vs sandbox tmux sockets**: the script uses `gosu sandbox` when run as root.
- **Secret exposure**: tests must avoid committing literal Slack token assignment syntax that trips secret guards.

## Open Questions

None.
