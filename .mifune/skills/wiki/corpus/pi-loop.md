---
title: "Pi Loop"
slug: pi-loop
tags: [pi, monitor, loop, scheduler, extension]
created: 2026-06-14
updated: 2026-06-14
sources:
  - raw/2026-06-14-pi-loop.md
related: [pi-tasks, pi-recap, pi-codex-usage, inspectable-agent-harness]
confidence: confirmed
---

# Pi Loop

## Summary
Pi Loop (`@trevonistrevon/pi-loop`) is a Pi extension package for scheduled re-wake loops and background command monitoring. Open Harness loads version `0.5.5` through `.pi/settings.json`, making Monitor tools (`MonitorCreate`, `MonitorList`, `MonitorStop`) and loop tools (`LoopCreate`, `LoopList`, `LoopDelete`) available in project Pi sessions by default.

## Detail
The upstream package is published as `@trevonistrevon/pi-loop` with a Pi extension manifest pointing at `./src/index.ts`. It installs with `pi install npm:@trevonistrevon/pi-loop` or can be tried ephemerally with `pi -e npm:@trevonistrevon/pi-loop`.

Monitor is the primary Open Harness reason to load it: `MonitorCreate` starts a long-running or background command, streams output through `monitor:output` events, and can take an `onDone` prompt that auto-creates a one-shot completion wake when the process exits. `MonitorList` reports status, uptime, output line count, exit code, and recent buffered output; `MonitorStop` terminates a running monitor with SIGTERM followed by SIGKILL after five seconds. The package caps active monitors at 25.

Loop tools schedule prompts on cron intervals, Pi events, or hybrid triggers. `/loop 5m check the deploy` is the interactive path; `LoopCreate trigger="5m" prompt="Check if the build passed"` is the tool path. Recurring loops expire after seven days and active loops are capped at 25.

The package also integrates with `@tintinweb/pi-tasks`: with `autoTask: true`, loop fires can create tracked tasks after the package detects `pi-tasks` on Pi's event bus. If `pi-tasks` is absent, `pi-loop` registers native fallback task tools and `/tasks`; in Open Harness this fallback normally does not register because `pi-tasks` is also loaded by default.

Storage is controlled by `PI_LOOP` and `PI_LOOP_SCOPE`. Open Harness leaves both unset, so the upstream default `PI_LOOP_SCOPE=session` applies and loop state is written to `.pi/loops/loops-<sessionId>.json`. This preserves loops across a session restart while isolating concurrent sessions and worktree agents. `.pi/loops/` is local runtime state and is gitignored. Use `PI_LOOP_SCOPE=memory` for no persisted state, `PI_LOOP_SCOPE=project` only for intentionally shared automation, and `PI_LOOP=off` to disable the package store.

## See Also
- [[pi-tasks]]
- [[pi-recap]]
- [[pi-codex-usage]]
- [[inspectable-agent-harness]]
