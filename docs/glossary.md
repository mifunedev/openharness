# Glossary

A canonical, **descriptive** glossary of Open Harness's core vocabulary — each
term defined as this repo actually uses it today, with a pointer to a canonical
source file or skill. This is a plain reference page, not a standards document:
there are no normative requirements here, only working definitions.

Terms are listed alphabetically below.

## Layers

These names describe separate layers, not interchangeable jobs:

- **Model** — The LLM selected by a provider; it proposes text and tool calls, while the surrounding agent, harness, and policy decide where those requests run and what is allowed. See the **model** glossary entry.
- **Agent / CLI** — The process that wraps a model with tools, instructions, and session state, such as Claude Code, Codex, or Pi. It is the runtime: the active session owns the work. See the **agent** glossary entry.
- **Harness** — The repo, Docker sandbox, and `.oh/` control plane that give agents a reproducible workspace and lifecycle. See the **harness** glossary entry.
- **Loop** — A repeated workflow that the harness drives until a terminal state, such as the `/spec execute` implementation cycle ending after every story passes. See the **loop** and **terminal state** glossary entries.
- **Policy** — The provider-portable rules, skills, and hooks that constrain agent behavior and tool use. See the **policy** and **tool** glossary entries.
- **Trace** — Recorded session evidence consumed later by analysis, not the live execution layer itself. See the **trace** glossary entry.

## Terms

- **agent / coding agent** — The running model-plus-tools process that reads the
  workspace and does the task: Claude Code, Codex, Pi, or another coding harness
  running inside the sandbox. The agent is the **runtime and the owner of the
  work**; a role never implies a separate session or process. The repository
  authors no agent definition files — a durable role is a **skill** the active
  session adopts. Source: [`AGENTS.md`](../AGENTS.md).

- **artifact** — Any inspectable file a workflow stage produces and a later stage
  or a human then consumes. The canonical example is the `.oh/tasks/<slug>/` task
  folder and its four-file contract (`prd.md`, `prd.json`, `prompt.md`,
  `progress.txt`), which the `/spec` pipeline reads and writes as
  they progress. Source: [`.oh/tasks/`](../.oh/tasks/).

- **capability** — What the harness can actually do end-to-end, measured by the
  capability benchmark rather than by how much machinery it accumulates. The
  `.oh/evals/capability/` suite grades concrete deliverables (a shipped PR, a
  passing eval, a clean retro), so a rising score is evidence the loop got
  better. Source: [`.oh/evals/capability/`](../.oh/evals/capability/).

- **checkpoint** — An intermediate, observable stage output that is explicitly
  *not* the terminal state. For example, `/spec execute` opens a draft PR early as
  an observability checkpoint while implementation is still pending, then marks
  it ready once the gates pass.
  Source: [`.oh/skills/spec/references/execute.md`](../.oh/skills/spec/references/execute.md).

- **evaluator / eval** — A deterministic, exit-code-scored probe that checks
  harness state against a recorded lesson; the probe corpus and the `/eval`
  skill that runs it form the harness's fitness function, reporting PASS /
  REGRESSION / SKIPPED per probe. Source: [`.oh/evals/`](../.oh/evals/).

- **harness** — The whole portable setup: one git repo that boots one Docker
  sandbox, wraps your project inside it, and versions the agent's identity,
  skills, crons, and memory. "Open Harness" names both this project and any
  single repo-per-sandbox instance of it.
  Source: [`intro.md`](intro.md).

- **loop** — A repeated implement → commit → check cycle driven until a
  completion marker appears. `/spec execute` owns the implementation cycle and
  records completion in `progress.txt` after every story passes.
  Source: [`.oh/skills/spec/references/execute.md`](../.oh/skills/spec/references/execute.md).

- **model** — The LLM an agent or CLI uses to produce reasoning, text, and
  tool-call requests. The model is only one part of an agent session; the
  harness, tools, and policy decide where it runs and which actions are allowed.
  Source: [`docs/harnesses/overview.md`](harnesses/overview.md).

- **orchestrator** — The root-level role that manages the sandbox lifecycle and
  git but does not write application code; its job is provisioning, scaffolding
  the workspace, and running lifecycle skills. Its instructions live in the root
  `AGENTS.md` (aliased for provider compatibility as `CLAUDE.md`).
  Source: [`AGENTS.md`](../AGENTS.md).

- **policy** — The provider-portable conventions and guardrails the harness
  follows — for example the git workflow (branch names, commit format, PR
  targets, changelog discipline) codified in the `/git` skill, alongside the
  hook-enforced security rules.
  Source: [`.oh/skills/git/SKILL.md`](../.oh/skills/git/SKILL.md).

- **primitive** — A reusable unit from the shared pack — skills and hooks —
  vendored directly into the `.oh/` control plane and exposed to each provider
  (`.claude/`, `.codex/`, `.pi/`) via symlinks into `.oh/`.
  Source: [`README.md`](README.md) (the primitive pack under `.oh/skills/`,
  `.oh/hooks/`).

- **rfc / adr** — A durable architecture decision, recorded as a GitHub issue
  titled `RFC:` or `ADR:` and indexed on the RFC/ADR page. Three states —
  `Draft`, `Accepted`, `Superseded` — and no further taxonomy. This is the only
  decision store; `/architect` points durable decisions here rather than
  creating another one. Source: [`docs/rfcs/README.md`](rfcs/README.md).

- **rule** — Ambient repository policy an agent carries without invoking
  anything: an `AGENTS.md` (aliased `CLAUDE.md` for provider compatibility) that
  applies to every task under its directory, or a path-scoped reference skill.
  Distinct from a skill, which is invoked for a job.
  Source: [`AGENTS.md`](../AGENTS.md).

- **runtime** — The always-on machinery that wakes the agent on a schedule: a
  tiny croner that reads scheduled-agent definitions from `crons/` and fires
  them inside the sandbox.
  Source: [`.oh/scripts/cron-runtime.ts`](../.oh/scripts/cron-runtime.ts).

- **sandbox** — The isolated Docker container the agent runs inside, built from
  `.devcontainer/`, so the agent works against your code without touching the
  host machine. Source: [`.devcontainer/`](../.devcontainer/).

- **session** — A terminal-backend run of an agent: a tmux session, a Herdr pane, or a
  plain shell. It is a *backend*, not an identity. Distinguish it from the
  **implementation owner** — the logical role that owns one `/spec execute` task from the
  isolated worktree through the final PR gates. `/spec execute` keeps implementation,
  validation, evidence, and PR finalization with the single agent that invoked it, whatever
  backend that agent happens to be running in, and launches no session of its own.
  Source: [`.oh/skills/spec/references/execute.md`](../.oh/skills/spec/references/execute.md) and
  [`sandbox-processes.md`](../.oh/skills/t3/references/sandbox-processes.md).

- **skill** — A packaged, invocable workflow (a `SKILL.md` plus optional
  references and scripts) that an agent runs via the Skill tool or a `/name`
  slash command; the shared set lives under `.oh/skills/`. **Skills are the
  canonical primitive for a reusable role, procedure, checklist, constraint set,
  or body of domain judgment** — `/architect`, `/spec`, `/audit`, `/retro`, and
  `/delegate` are roles encoded this way, loaded into the active session rather
  than spawned as separate identities. Source: [`.oh/skills/`](../.oh/skills/).

- **terminal state** — The end state that closes a workflow cycle. `/spec execute`
  completes implementation only after every story passes; the operative path
  then ends at the human `merge` followed by the runner's `reset | clean`.
  Source: [the `/spec` workflow contract](../.oh/skills/spec/SKILL.md#workflow-contract).

- **tool** — A discrete action an agent can invoke — read a file, run a command,
  call an MCP server. Hooks under `.oh/hooks/` intercept tool calls to enforce
  policy before they run. Source: [`.oh/hooks/`](../.oh/hooks/).

- **trace** — The recorded log of a past agent session (prompts, tool calls,
  results) that later analysis mines. `/prompt-miner` runs `mine-traces.mjs`
  over Claude and Pi session traces to score prompts by outcome.
  Source: [`mine-traces.mjs`](../.oh/skills/prompt-miner/scripts/mine-traces.mjs).

- **worker / subagent** — An optional bounded, isolated execution context the
  active agent spawns for one self-contained job — parallelism, context
  isolation, verbose disposable output, or a deliberate tool restriction. It is
  an execution primitive, not a project role: workers are provider built-ins
  with no repository definition file, and `/delegate` owns when one is
  justified. Source:
  [`.oh/skills/delegate/SKILL.md`](../.oh/skills/delegate/SKILL.md).

- **worktree** — A separate git working directory under `.worktrees/` that
  isolates a branch so parallel work doesn't collide; the `/worktrees` skill
  manages their lifecycle and `/spec execute` builds each task in one.
  Source: [`.oh/skills/worktrees/SKILL.md`](../.oh/skills/worktrees/SKILL.md).
