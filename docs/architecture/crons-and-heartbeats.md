---
sidebar_position: 3
title: "Crons and Heartbeats"
---

# Crons and Heartbeats

> **Stub.** Full content lands in PR-B (the second PR of the
> repo-layout-consolidation stack). This stub exists so that links from
> `README.md` and `docs/architecture/container-runtime.md` resolve in PR-A.
>
> The crons system is real and shipping today: `scripts/cron-runtime.ts`
> reads `crons/*.md` markdown frontmatter, schedules the bodies as agent
> prompts via [`croner`](https://github.com/Hexagon/croner), and runs the
> result in the `system-cron` tmux session inside the sandbox. The two
> shipped crons are `crons/heartbeat.md` and `crons/cleanup-tasks.md`.
>
> See [#235](https://github.com/ryaneggz/open-harness/issues/235) for the
> stack overview.
