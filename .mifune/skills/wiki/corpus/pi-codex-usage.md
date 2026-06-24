---
title: "Pi Codex Usage"
slug: pi-codex-usage
tags: [pi, codex, usage, statusline, extension]
created: 2026-06-14
updated: 2026-06-14
sources:
  - raw/2026-06-14-pi-codex-usage.md
related: [pi-tasks, inspectable-agent-harness]
confidence: confirmed
---

# Pi Codex Usage

## Summary
Pi Codex Usage (`@narumitw/pi-codex-usage`) is a native Pi extension package that shows ChatGPT Codex subscription usage from inside Pi. Version `0.4.2` exposes `/codex-status` and a compact statusline item for sessions using the `openai-codex` model provider, including 5-hour session usage and weekly usage.

## Detail
The npm package `@narumitw/pi-codex-usage@0.4.2` declares a Pi extension entrypoint at `./src/codex-usage.ts`. It installs with `pi install npm:@narumitw/pi-codex-usage`, can be tried ephemerally with `pi -e npm:@narumitw/pi-codex-usage`, and is published from the `extensions/pi-codex-usage` directory of the upstream `narumiruna/pi-extensions` repository.

The extension adds `/codex-status`, including options such as `--refresh`, `--no-statusline`, `--clear-statusline`, and `--timeout 30`. Its report summarizes the Codex plan, 5-hour and weekly usage windows, reset times, credits, and any additional usage buckets returned by the Codex backend. Results are cached for five minutes unless `--refresh` bypasses the in-memory cache.

When the selected Pi model provider is `openai-codex`, the extension automatically refreshes a compact statusline item from the cached usage snapshot every five minutes, for example `📊 codex 59% 5h 61% wk`. If the current model has a returned usage bucket, such as `gpt-5.3-codex-spark`, the statusline switches to that bucket; switching away from an OpenAI Codex model clears the item.

Authentication is intentionally layered. The extension first uses Pi's own `openai-codex` provider auth through the Pi extension API. If Pi cannot provide usable subscription auth, it falls back to the Codex CLI app-server path, `codex app-server --listen stdio://`, which requires Codex CLI to be installed and logged in. The extension does not read Pi or Codex auth files directly and does not expose bearer tokens in error messages.

The upstream limitation is that OpenAI API keys are not ChatGPT Codex subscription auth and do not expose this quota. Users need Pi OpenAI Codex subscription auth or a logged-in Codex CLI fallback for quota retrieval.

## See Also
- [[pi-tasks]]
- [[inspectable-agent-harness]]
