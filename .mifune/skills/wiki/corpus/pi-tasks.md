---
title: "Pi Tasks"
slug: pi-tasks
tags: [pi, tasks, coordination, subagents, agent-harness]
created: 2026-06-13
updated: 2026-06-13
sources:
  - raw/2026-06-13-pi-tasks.md
related: [pi-plan-mode, inspectable-agent-harness, compound-engineering]
confidence: provisional
---

# Pi Tasks

## Summary
Pi Tasks (`@tintinweb/pi-tasks`) is a pi extension that adds Claude Code-style task tracking and coordination to pi. In Open Harness it is loaded as a project-local pi package through `.pi/settings.json`, not as a Dockerfile or root dependency, so task capability follows the harness project configuration.

## Detail
Pi Tasks provides seven LLM-callable task tools: `TaskCreate`, `TaskList`, `TaskGet`, `TaskUpdate`, `TaskOutput`, `TaskStop`, and `TaskExecute`. Together they cover structured task creation, status/dependency updates, task listing and inspection, background output retrieval, stopping running work, and executing ready tasks as background subagents.

The user-facing `/tasks` command opens an interactive task menu for viewing, creating, clearing, and configuring tasks. The extension also renders a persistent widget above the editor with task counts, status icons, active spinners, elapsed time, and token counts. Dependency support is bidirectional through `blocks` and `blockedBy`, with warnings for cycles, self-dependencies, and dangling references.

Task state can be memory-only, session-scoped, or project-scoped. The default session store writes under `<cwd>/.pi/tasks/tasks-<sessionId>.json`; project scope writes `<cwd>/.pi/tasks/tasks.json`. Settings live in `<cwd>/.pi/tasks-config.json`. Open Harness should treat `.pi/tasks` as local runtime state rather than source code.

`PI_TASKS` controls storage overrides: `PI_TASKS=off` forces in-memory-only operation for CI or automation, while `PI_TASKS=<name>` selects a named shared list at `~/.pi/tasks/<name>.json`. Absolute or relative JSON paths are also supported, and named/shared paths use file locking so multiple pi sessions can coordinate against the same task list.

`TaskExecute` integrates with `@tintinweb/pi-subagents`: a pending task with `agentType` set and completed blockers can spawn as an independent background subagent. When auto-cascade is enabled, completed tasks can trigger newly unblocked dependents through the DAG, giving pi a task-graph coordination layer for multi-agent harness work.

## See Also
- [[pi-plan-mode]] — default Pi planning package loaded alongside task tracking
- [[inspectable-agent-harness]] — broader Open Harness pattern for visible, auditable agent workflows
- [[compound-engineering]] — feedback-loop framing that task DAGs and subagents can support
