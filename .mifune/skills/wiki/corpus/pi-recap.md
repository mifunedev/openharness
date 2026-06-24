---
title: "Pi Recap"
slug: pi-recap
tags: [pi, recap, session-summary, extension]
created: 2026-06-14
updated: 2026-06-14
sources:
  - raw/2026-06-14-pi-recap.md
related: [pi-tasks, pi-plan-mode, pi-codex-usage, inspectable-agent-harness]
confidence: confirmed
---

# Pi Recap

## Summary
Pi Recap (`@tifan/pi-recap`) is a Pi extension package that generates a one-line, goal-first recap for re-entering a session without rereading the transcript. Open Harness loads version `0.4.2` through `.pi/settings.json`, making `/recap` available in project Pi sessions by default.

## Detail
The upstream package is published from `tifandotme/pi-extensions` under `packages/pi-recap` and declares its Pi extension entrypoint through `package.json` (`pi.extensions: ["./src/index.ts"]`). It installs with `pi install npm:@tifan/pi-recap` or can be tried ephemerally with `pi -e npm:@tifan/pi-recap`.

The main command, `/recap`, generates and displays a fresh recap above the editor. The recap starts with why the session exists, then includes current state, important decisions, relevant files or commands, and the likely next action. Supporting commands are `/recap status` for the selected model, active model, freshness, and visibility state; `/recap config` for choosing a recap model; and `/recap help` for the command list.

The extension also runs passively. After each agent response it waits five idle minutes; if the user stays away, it generates one automatic recap. On resume, it shows the saved recap when current or generates a fresh one when the stored recap is stale or missing. Sending a normal non-`/recap` message clears the visible recap.

Recaps use Pi's current session context, follow the active branch, and respect compaction. They do not scrape the whole session file or terminal history, and the latest recap is stored outside LLM context. The upstream default recap model is `openai-codex/gpt-5.4-mini`; `/recap config` stores the user's override in `~/.config/pi/extensions/pi-recap.json`, so Open Harness does not add repository runtime state for model selection.

## See Also
- [[pi-tasks]]
- [[pi-plan-mode]]
- [[pi-codex-usage]]
- [[inspectable-agent-harness]]
