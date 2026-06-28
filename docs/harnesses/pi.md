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

## Upstream

[`@earendil-works/pi-coding-agent` on npm](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) — see the upstream repository at [earendil-works/pi-mono](https://github.com/earendil-works/pi-mono) for documentation, configuration, and roadmap. (The previous package, `@mariozechner/pi-coding-agent`, is deprecated — install the `@earendil-works/...` successor instead.)

## Default packages

Open Harness loads these project-local Pi packages from `.pi/settings.json`:

- [`@tintinweb/pi-subagents`](https://pi.dev/packages/@tintinweb/pi-subagents) — Claude Code-style sub-agent commands for Pi.
- [`@tintinweb/pi-tasks`](https://github.com/tintinweb/pi-tasks) — task tracking for Pi with `TaskCreate`, `TaskList`, `TaskGet`, `TaskUpdate`, `TaskOutput`, `TaskStop`, and `TaskExecute` tools; a `/tasks` menu; and a persistent task widget. `TaskExecute` integrates with `@tintinweb/pi-subagents` so tracked tasks can run through configured subagents.
- [`@narumitw/pi-goal`](https://pi.dev/packages/@narumitw/pi-goal?name=goal) — `/goal <task>` mode that keeps Pi working until it verifies completion and calls the `goal_complete` tool. Use `/goal pause`, `/goal resume`, or `/goal clear` to manage the active goal.
- [`@narumitw/pi-plan-mode`](https://pi.dev/packages/@narumitw/pi-plan-mode) — Codex-like `/plan` mode for read-only exploration, structured clarification through `plan_mode_question`, and approval-gated implementation. Open Harness uses this upstream package instead of maintaining a local `.pi/extensions/plan-mode/` implementation.
- [`@narumitw/pi-codex-usage`](https://github.com/narumiruna/pi-extensions/tree/main/extensions/pi-codex-usage) — `/codex-status` plus a compact `openai-codex` statusline for 5-hour session usage and weekly usage. Open Harness pins `0.6.2`, which includes the upstream stale-`ExtensionContext` statusline timer fix that prevents crashes after Pi replaces an extension context.
- [`@tifan/pi-recap`](https://github.com/tifandotme/pi-extensions/tree/master/packages/pi-recap) — one-line session recaps for re-entry. Use `/recap` for a fresh goal-first recap, `/recap status` to inspect freshness/model state, and `/recap config` to choose the recap model. The package also generates one idle recap after five minutes and refreshes stale/missing recaps on resume.
- [`@trevonistrevon/pi-loop`](https://pi.dev/packages/@trevonistrevon/pi-loop?name=monitor) — Monitor and loop tools for background command monitoring and scheduled re-wakes. Use `MonitorCreate`, `MonitorList`, and `MonitorStop` for long-running commands; use `/loop` or `LoopCreate` for cron/event-triggered follow-up prompts.
- [`@guwidoe/pi-prompt-suggester`](https://github.com/guwidoe/pi-prompt-suggester) — intent-aware next-prompt suggestions after assistant completions. Suggestions can appear as ghost text in the editor, with `/suggesterSettings` for interactive configuration and `/suggester status` / `/suggester reseed` for inspection and manual reseeding.
- [`pi-autoresearch`](../integrations/pi-autoresearch.md) — autonomous metric-optimization loops for Pi. Use `/skill:autoresearch-create` to create `.auto/` session files, run benchmark iterations, log keep/revert decisions, and inspect results through `/autoresearch export`.
- [`pi-dynamic-workflows`](../integrations/pi-dynamic-workflows.md) — Claude-Code-style dynamic workflow orchestration for Pi, pinned to the upstream `v1.0.1` commit. It registers a `workflow` tool that lets the model write deterministic JavaScript workflows, fan out to isolated in-memory subagents, and synthesize the results.

Pi installs missing project packages automatically on startup after the project is trusted. Open Harness also auto-loads project-local extensions from `.pi/extensions/`.

### Codex stale-response recovery

The installed `@earendil-works/pi-ai` Codex Responses provider can reuse WebSocket cached continuation state by sending `previous_response_id`. If the upstream Codex backend forgets that response id, it returns `previous_response_not_found`; Pi clears the stale continuation but the failed user turn would otherwise be lost. Open Harness keeps a small auto-loaded `.pi/extensions/codex-stale-response-retry.ts` extension that re-injects non-Slack failed turns once via `sendUserMessage(..., { deliverAs: "followUp" })`, causing the next request to start from fresh/full context. Slack-prefixed turns remain owned by the dedicated `.pi/bridge-recovery/` extension that is co-loaded with `pi-messenger-bridge`.

In Open Harness, start package-backed plan mode with:

```bash
pi --plan
```

Outside this project, try the packages manually with `pi -e npm:@narumitw/pi-goal`, `pi -e npm:@narumitw/pi-plan-mode --plan`, `pi -e npm:@narumitw/pi-codex-usage@0.6.2`, `pi -e npm:@tifan/pi-recap`, `pi -e npm:@trevonistrevon/pi-loop`, `pi -e npm:@guwidoe/pi-prompt-suggester@0.3.10`, `pi -e npm:pi-autoresearch@1.6.0`, or `pi -e git:github.com/Michaelliv/pi-dynamic-workflows@dbc6800d1f725f7439e51705e2664c59484afcd1`.

## Prompt suggestions

Open Harness enables `@guwidoe/pi-prompt-suggester` by default for interactive Pi sessions. The package watches completed turns, builds a lightweight project intent seed, and proposes the next likely user prompt.

```text
/suggesterSettings
/suggester status
/suggester reseed
/suggester config set suggestion.ghostAcceptKeys ["space","right"]
```

By default, compatible suggestions appear as ghost text when the editor is empty. Press `Space` to accept the full suggestion, or change the accept key and other behavior in `/suggesterSettings`. Suggester state, overrides, and logs live under Pi's agent data directory (`${PI_CODING_AGENT_DIR:-~/.pi/agent}/prompt-suggester/`), not in the workspace.

## Monitor and loops

Use Monitor for background commands that should keep running while the agent continues other work:

```text
MonitorCreate command="tail -n0 -f build.log" description="Watch build"
MonitorCreate command="python train.py" onDone="Analyze results and report best loss"
MonitorList
MonitorStop monitorId="1"
```

`onDone` creates a one-shot completion wake so the agent can inspect results without polling. Prefer Monitor over raw shell `while`/`sleep` loops for CI polling, experiments, long downloads, training jobs, log tails, and other parallel work.

Use loops for scheduled or event-triggered follow-up prompts:

```text
/loop 5m check the deploy
LoopCreate trigger="5m" prompt="Check if the build passed"
LoopCreate trigger="tool_execution_start" prompt="Log the tool being used" triggerType="event"
LoopList
LoopDelete id="1"
```

The package keeps a compact status line when loops, monitors, or native fallback tasks are active. Open Harness leaves `PI_LOOP_SCOPE` unset, which means `session` scope: loop state is stored under `.pi/loops/loops-<sessionId>.json` and stays isolated across concurrent sessions and worktree agents. `.pi/loops/` is gitignored. Set `PI_LOOP_SCOPE=memory` for disposable no-disk state, `PI_LOOP_SCOPE=project` only when intentionally sharing loops across sessions, or `PI_LOOP=off` to disable the package store.

## Recap

Use `/recap` when re-entering a long Pi session without rereading the transcript. The recap is goal-first: it summarizes why the session exists, current state, decisions, relevant files or commands, and the likely next action.

```text
/recap
/recap status
/recap config
/recap help
```

`pi-recap` waits five idle minutes after each agent response and generates one automatic recap if you stay away. On resume, it shows the saved recap when current or regenerates it when stale/missing. The visible recap clears when you send a normal non-`/recap` message.

Recap model selection is user-level state, not repository state. `/recap config` writes the user's selected model outside LLM context; the same setting can be edited manually at `~/.config/pi/extensions/pi-recap.json`. The upstream default is `openai-codex/gpt-5.4-mini`.

## Codex usage status

Use `/codex-status` to show ChatGPT Codex subscription usage without leaving Pi. Open Harness enables `@narumitw/pi-codex-usage@0.6.2` by default; this fixed pin includes the upstream stale-`ExtensionContext` statusline timer cleanup, preventing timer callbacks from crashing after Pi replaces the extension context:

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

`pi-loop` detects `@tintinweb/pi-tasks` over Pi's event bus. Because Open Harness loads `pi-tasks` by default, `pi-loop` delegates task management to that package; its native fallback `TaskCreate`/`TaskList`/`TaskUpdate`/`TaskDelete` tools and `/tasks` command only register in projects where `pi-tasks` is absent.

## Dynamic workflows

Use the `workflow` tool when a Pi task benefits from deliberate fan-out: multi-perspective code review, repository audits, research sweeps, or analysis pipelines. The parent model writes a constrained JavaScript workflow that calls `agent()`, `parallel()`, `pipeline()`, and `phase()`; the extension runs it in a deterministic VM sandbox and reports live phase/subagent progress inline.

See [Pi dynamic workflows](../integrations/pi-dynamic-workflows.md) for the workflow script shape, available globals, and safety constraints.

## Slack integration

The harness ships Slack via the **pi-messenger-bridge** npm package, loaded only in the dedicated `client-slack-pi` tmux session via `--extension` (not pinned in `.pi/settings.json`). Set `PI_SLACK_APP_TOKEN` and `PI_SLACK_BOT_TOKEN` in `.devcontainer/.env`, manage the session with `gateway pi` (`gateway status` to check, `gateway pi --restart` after token edits), and configure the messenger from inside it with the bridge's `/msg-bridge` command — access control is challenge-based (deny-by-default, no static allowlist), and inbound Slack messages route into the agent via the package using Pi's native `sendUserMessage()` / `turn_end`.

See [Slack integration](../integrations/slack.md) for setup steps.
