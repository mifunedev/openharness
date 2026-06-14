---
sidebar_position: 4
title: "Pi"
---

# Pi

Pi is a lightweight, customizable harness — a hackable agent framework you can shape to your project. It ships in the default sandbox image alongside Claude Code and Codex.

## Verify installation

```bash
pi --version
```

## Authentication

Pi's subscription login runs its own OAuth flow with a local callback server on `http://localhost:1455`. For the login to complete, the browser on your laptop has to reach port 1455 inside the container.

The base `.devcontainer/docker-compose.yml` publishes `127.0.0.1:1455:1455` so the callback port lands on the host loopback:

- **VS Code Remote SSH (works out of the box):** VS Code automatically forwards the loopback port to your laptop — just run the Pi login, the redirect completes with no extra step.
- **Direct terminal (plain `ssh`):** plain SSH does not auto-forward ports. Open the tunnel yourself before logging in:

  ```bash
  ssh -L 1455:localhost:1455 user@your-host
  ```

This is Pi-specific. The Codex CLI has its own headless path (`codex login --device-auth`) and does not need port 1455 — see [Codex § Authentication](./codex.md#authentication).

## Upstream

[`@earendil-works/pi-coding-agent` on npm](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) — see the upstream repository at [earendil-works/pi-mono](https://github.com/earendil-works/pi-mono) for documentation, configuration, and roadmap. (The previous package, `@mariozechner/pi-coding-agent`, is deprecated — install the `@earendil-works/...` successor instead.)

## Default packages

Open Harness loads these project-local Pi packages from `.pi/settings.json`:

- [`@tintinweb/pi-subagents`](https://pi.dev/packages/@tintinweb/pi-subagents) — Claude Code-style sub-agent commands for Pi.
- [`@tintinweb/pi-tasks`](https://github.com/tintinweb/pi-tasks) — task tracking for Pi with `TaskCreate`, `TaskList`, `TaskGet`, `TaskUpdate`, `TaskOutput`, `TaskStop`, and `TaskExecute` tools; a `/tasks` menu; and a persistent task widget. `TaskExecute` integrates with `@tintinweb/pi-subagents` so tracked tasks can run through configured subagents.
- [`@narumitw/pi-goal`](https://pi.dev/packages/@narumitw/pi-goal?name=goal) — `/goal <task>` mode that keeps Pi working until it verifies completion and calls the `goal_complete` tool. Use `/goal pause`, `/goal resume`, or `/goal clear` to manage the active goal.
- [`@narumitw/pi-plan-mode`](https://pi.dev/packages/@narumitw/pi-plan-mode) — Codex-like `/plan` mode for read-only exploration, structured clarification through `plan_mode_question`, and approval-gated implementation. Open Harness uses this upstream package instead of maintaining a local `.pi/extensions/plan-mode/` implementation.
- [`@narumitw/pi-codex-usage`](https://github.com/narumiruna/pi-extensions/tree/main/extensions/pi-codex-usage) — Codex subscription usage inside Pi via `/codex-status`, including 5-hour session usage, weekly usage, reset times, credits, and an automatic compact statusline for `openai-codex` models.

Pi installs missing project packages automatically on startup after the project is trusted. In Open Harness, start package-backed plan mode with:

```bash
pi --plan
```

Outside this project, try the packages manually with `pi -e npm:@narumitw/pi-goal`, `pi -e npm:@narumitw/pi-plan-mode --plan`, or `pi -e npm:@narumitw/pi-codex-usage`.

## Codex usage status

Use `/codex-status` to show ChatGPT Codex subscription usage without leaving Pi:

```text
/codex-status
/codex-status --refresh
/codex-status --no-statusline
/codex-status --clear-statusline
/codex-status --timeout 30
```

When the selected Pi model provider is `openai-codex`, the package refreshes a compact statusline item every five minutes, for example `📊 codex 59% 5h 61% wk`, so 5-hour session usage and weekly usage stay visible during the session. `/codex-status --refresh` bypasses the short in-memory cache.

Auth is layered: the extension uses Pi's own `openai-codex` provider auth first, then falls back to `codex app-server --listen stdio://` only when Pi auth cannot provide usable ChatGPT subscription auth. OpenAI API keys do not expose this quota.

## Task tracking

The default task runtime state lives under `.pi/tasks/`, which is gitignored. Leave the default for per-checkout task state; set `PI_TASKS=off` to disable task tracking; set `PI_TASKS=<named-list>` to select a named task list; or pass an explicit task-list path when you intentionally want a shared list outside the gitignored default.

## Slack integration

Pi ships with a Slack Socket Mode bridge as a first-class extension at `.pi/extensions/slack/`. Set `SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`, and at least one of `SLACK_ALLOW_CHANNELS` / `SLACK_ALLOW_USERS` (the allowlist denies by default), then start `pi` — inbound Slack messages route into the agent via `pi.sendUserMessage()`, and the agent can post back through the registered `slack_post`, `slack_reply`, `slack_react`, and `slack_upload` tools.

See [Slack integration](../integrations/slack.md) for setup steps and the [`.pi/extensions/slack/` package README](https://github.com/mifunedev/openharness/tree/development/.pi/extensions/slack) for the file inventory and divergence tracking.
