---
title: "Pi Plan Mode"
slug: pi-plan-mode
tags: [pi, plan-mode, planning, approval, agent-harness]
created: 2026-06-13
updated: 2026-06-13
sources:
  - raw/2026-06-13-pi-plan-mode.md
related: [pi-tasks, inspectable-agent-harness]
confidence: provisional
---

# Pi Plan Mode

## Summary
Pi Plan Mode (`@narumitw/pi-plan-mode`) is a Pi package that adds Codex-like read-only planning before implementation. Open Harness loads it through `.pi/settings.json`, replacing the former local `.pi/extensions/plan-mode/` scaffold with an upstream-maintained package.

## Detail
The package registers `/plan` and `--plan` so a Pi session can enter a planning-only collaboration mode. While active, it enables built-in read-only tools such as `read`, limited `bash`, `grep`, `find`, and `ls`; blocks mutating built-ins such as `edit` and `write`; and filters bash commands that mutate files, install dependencies, commit, push, or launch editors.

Plan Mode is intentionally not a task-progress tracker. The expected output boundary is a single `<proposed_plan>...</proposed_plan>` block after the agent has explored discoverable facts and asked any high-impact clarification questions. The package provides a `plan_mode_question` tool for structured 1-3 question prompts while planning. After detecting a proposed plan, Pi can implement it, stay in Plan Mode, or exit and discard it; implementation restores full tool access first.

The package disables extension and custom tools by default during planning because Pi does not expose standardized mutability metadata for every extension tool. Users can opt specific tools back in with `/plan tools` when they accept that session's risk. Statusline integrations can show `📝 plan active` or `📝 plan ready`.

For Open Harness, this moves plan-mode maintenance out of the repository's local `.pi/extensions/` tree. The source of truth is the pinned package entry in `.pi/settings.json`; docs should describe package-backed behavior rather than the old local `/plan approve`, `/todos`, numbered `Plan:` parsing, or `[DONE:n]` progress semantics.

## See Also
- [[pi-tasks]] — default Pi task-tracking package loaded alongside plan mode
- [[inspectable-agent-harness]] — broader pattern of making agent workflows reviewable and approval-gated
