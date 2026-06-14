# restart-cron-runtime

Implement issue #130: add a tmux watchdog that automatically restores `cron-system` when `scripts/cron-runtime.ts` dies after boot.

Acceptance summary:
- Add idempotent `cron-watchdog` tmux supervision in `.devcontainer/entrypoint.sh`.
- Preserve the legacy `system-cron` migration guard.
- Log watchdog/runtime output to `/tmp/cron-watchdog.log` and `/tmp/cron-system.log`.
- Add Vitest + eval probe coverage.
- Document the runtime in `context/TOOLS.md`, `crons/README.md`, and `CHANGELOG.md`.
