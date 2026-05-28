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

[`@earendil-works/pi-coding-agent` on npm](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) — see the upstream repository at [earendil-works/pi-mono](https://github.com/earendil-works/pi-mono) for documentation, configuration, and roadmap. (The previous package, `@mariozechner/pi-coding-agent`, is deprecated as of late 2026 — install the `@earendil-works/...` successor instead.)

## Slack integration

Pi ships with a Slack Socket Mode bridge as a first-class extension at `.pi/extensions/slack/`. Set `SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`, and at least one of `SLACK_ALLOW_CHANNELS` / `SLACK_ALLOW_USERS` (the allowlist denies by default), then start `pi` — inbound Slack messages route into the agent via `pi.sendUserMessage()`, and the agent can post back through the registered `slack_post`, `slack_reply`, `slack_react`, and `slack_upload` tools.

See [Slack integration](../integrations/slack.md) for setup steps and the [`.pi/extensions/slack/` package README](https://github.com/ryaneggz/open-harness/tree/development/.pi/extensions/slack) for the file inventory and divergence tracking.
