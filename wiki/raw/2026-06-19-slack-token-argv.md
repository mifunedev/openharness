# Slack token argv hardening snapshot — 2026-06-19

Source: autopilot harness-audit finding and issue #461.

Finding: `.devcontainer/entrypoint.sh` restored the `client-slack` tmux session by interpolating `SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`, and optional Slack allow-list values into the tmux shell command string. Those values can be exposed through process argv or tmux command inspection.

Resolution model: keep `.devcontainer/.env` treated as data, write only the required Slack values into a temporary runtime env file with restrictive permissions, start `client-slack` with a command string that contains only the runtime env file path, source and remove that file inside the child shell, then launch `pi` with existing logging to `/tmp/client-slack.log`.
