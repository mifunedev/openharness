# Glossary

A canonical, **descriptive** glossary of Open Harness's core vocabulary — each
term defined as this repo actually uses it today, with a pointer to a canonical
source file or skill. This is a plain reference page, not a standards document:
there are no normative requirements here, only working definitions.

Terms are listed alphabetically.

- **agent** — A model-driven worker that reads the workspace and does the task:
  an agent CLI (Claude Code, Codex, Pi, …) running inside the sandbox, or a
  scoped sub-agent defined under `.oh/agents/` (e.g. `critic`, `implementer`,
  `pm`) that the orchestrator spawns for a bounded job.
  Source: [`.oh/agents/`](../agents/).

- **artifact** — Any inspectable file a workflow stage produces and a later stage
  or a human then consumes. The canonical example is the `.oh/tasks/<slug>/` task
  folder and its four-file contract (`prd.md`, `prd.json`, `prompt.md`,
  `progress.txt`), which the `/spec` and `/ship-spec` pipelines read and write as
  they progress. Source: [`.oh/tasks/`](../tasks/).

- **capability** — What the harness can actually do end-to-end, measured by the
  capability benchmark rather than by how much machinery it accumulates. The
  `.oh/evals/capability/` suite grades concrete deliverables (a shipped PR, a
  passing eval, a clean retro), so a rising score is evidence the loop got
  better. Source: [`.oh/evals/capability/`](../evals/capability/).

- **checkpoint** — An intermediate, observable stage output that is explicitly
  *not* the terminal state. For example, `/ship-spec` opens a draft PR early as
  an observability checkpoint while implementation is still pending, then marks
  it ready once the gates pass.
  Source: [`.oh/skills/ship-spec/SKILL.md`](../skills/ship-spec/SKILL.md).

- **evaluator / eval** — A deterministic, exit-code-scored probe that checks
  harness state against a recorded lesson; the probe corpus and the `/eval`
  skill that runs it form the harness's fitness function, reporting PASS /
  REGRESSION / SKIPPED per probe. Source: [`.oh/evals/`](../evals/).

- **harness** — The whole portable setup: one git repo that boots one Docker
  sandbox, wraps your project inside it, and versions the agent's identity,
  skills, crons, and memory. "Open Harness" names both this project and any
  single repo-per-sandbox instance of it.
  Source: [`intro.md`](intro.md).

- **loop** — A repeated implement → commit → check cycle driven until a
  completion marker appears. The reference implementation is the Ralph loop,
  which re-invokes the agent on a task until `progress.txt` contains the line
  `STATUS: COMPLETE`. Source: [`.oh/scripts/ralph.sh`](../scripts/ralph.sh).

- **orchestrator** — The root-level role that manages the sandbox lifecycle and
  git but does not write application code; its job is provisioning, scaffolding
  the workspace, and running lifecycle skills. Its instructions live in the root
  `AGENTS.md` (aliased for provider compatibility as `CLAUDE.md`).
  Source: [`AGENTS.md`](../../AGENTS.md).

- **policy** — The provider-portable conventions and guardrails the harness
  follows — for example the git workflow (branch names, commit format, PR
  targets, changelog discipline) codified in the `/git` skill, alongside the
  hook-enforced security rules.
  Source: [`.oh/skills/git/SKILL.md`](../skills/git/SKILL.md).

- **primitive** — A reusable unit from the shared pack — skills, agents, and
  hooks — vendored directly into the `.oh/` control plane and exposed to each
  provider (`.claude/`, `.codex/`, `.pi/`) via symlinks into `.oh/`.
  Source: [`README.md`](README.md) (the primitive pack under `.oh/skills/`,
  `.oh/agents/`, `.oh/hooks/`).

- **runtime** — The always-on machinery that wakes the agent on a schedule: a
  tiny croner that reads scheduled-agent definitions from `.oh/crons/` and fires
  them inside the sandbox.
  Source: [`.oh/scripts/cron-runtime.ts`](../scripts/cron-runtime.ts).

- **sandbox** — The isolated Docker container the agent runs inside, built from
  `.devcontainer/`, so the agent works against your code without touching the
  host machine. Source: [`.devcontainer/`](../../.devcontainer/).

- **session** — A single named run of an agent, typically a tmux session in the
  sandbox. `ralph.sh` launches its loop in a named tmux session, and autopilot
  uses per-run `autopilot-<branch>` sessions.
  Source: [`.oh/scripts/ralph.sh`](../scripts/ralph.sh) and
  [`sandbox-processes.md`](../skills/t3/references/sandbox-processes.md).

- **skill** — A packaged, invocable workflow (a `SKILL.md` plus optional
  references and scripts) that an agent runs via the Skill tool or a `/name`
  slash command; the shared set lives under `.oh/skills/`.
  Source: [`.oh/skills/`](../skills/).

- **terminal state** — The end state that stops a loop or closes a workflow
  cycle. For the Ralph loop it is `STATUS: COMPLETE`; for the operative path it
  is the human `merge` followed by the runner's `reset | clean`.
  Source: [`AGENTS.md § The Workflow`](../../AGENTS.md#the-workflow).

- **tool** — A discrete action an agent can invoke — read a file, run a command,
  call an MCP server. Hooks under `.oh/hooks/` intercept tool calls to enforce
  policy before they run. Source: [`.oh/hooks/`](../hooks/).

- **trace** — The recorded log of a past agent session (prompts, tool calls,
  results) that later analysis mines. `/prompt-miner` runs `mine-traces.mjs`
  over Claude and Pi session traces to score prompts by outcome.
  Source: [`mine-traces.mjs`](../skills/prompt-miner/scripts/mine-traces.mjs).

- **worktree** — A separate git working directory under `.worktrees/` that
  isolates a branch so parallel work doesn't collide; the `/worktrees` skill
  manages their lifecycle and `/ship-spec` builds each task in one.
  Source: [`.oh/skills/worktrees/SKILL.md`](../skills/worktrees/SKILL.md).
