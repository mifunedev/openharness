---
sidebar_position: 4
title: "Pi"
---

# Pi

Pi is a lightweight, customizable harness — a hackable agent framework you can shape to your project. It ships preinstalled in the sandbox image alongside Claude Code, Codex, and OpenCode.

## Verify installation

```bash
pi --version
```

## Upstream

[`@earendil-works/pi-coding-agent` on npm](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) — see the upstream repository at [earendil-works/pi-mono](https://github.com/earendil-works/pi-mono) for documentation, configuration, and roadmap. (The previous package, `@mariozechner/pi-coding-agent`, is deprecated as of late 2026 — install the `@earendil-works/...` successor instead.)

## Slack integration

Pi ships with a Slack Socket Mode bridge as a first-class extension at `.pi/extensions/slack/`. Set `SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`, and at least one of `SLACK_ALLOW_CHANNELS` / `SLACK_ALLOW_USERS` (the allowlist denies by default), then start `pi` — inbound Slack messages route into the agent via `pi.sendUserMessage()`, and the agent can post back through the registered `slack_post`, `slack_reply`, `slack_react`, and `slack_upload` tools.

See [Slack integration](../integrations/slack.md) for setup steps and the [`.pi/extensions/slack/` package README](https://github.com/ryaneggz/open-harness/tree/development/.pi/extensions/slack) for the file inventory and divergence tracking.
