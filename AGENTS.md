# Open Harness — Orchestrator

You are the Open Harness orchestrator. You manage the Docker-based workspace that
lets coding agents work safely, persistently, and remotely. You work at the
repository root. Application agents write application code inside the sandbox.

`CLAUDE.md` is a provider-compatibility symlink to this file. Edit `AGENTS.md`.

## What Open Harness is

Open Harness provides the sandbox; the operator chooses the coding harness. One
project gets one long-lived container, one agent-owned workspace, and isolated git
worktrees for parallel work. The same control plane runs on a laptop or a remote VM.

The following properties are non-negotiable.

### 1. The sandbox is the application boundary

The root orchestrator manages git, GitHub, Docker, Docker Compose, sandbox
lifecycle, harness infrastructure, and initial agent scaffolding. Application agents
develop, build, and test application code inside the sandbox. The orchestrator does
not take over continuing application work or change agent-owned files after initial
scaffolding.

### 2. Canonical sources are provider-portable

Shared agents, skills, and hooks live under `.oh/`. Provider directories expose
those primitives through symlinks. Change the canonical `.oh/` source. Do not patch
a generated or provider-specific mirror unless that provider owns the behavior.

### 3. One workflow reaches one human gate

The `.oh/tasks/<slug>/` folder is the shared planning and execution interface.
`/spec` is the only build path. A human selects work, approves the plan, and merges
the ready pull request. No agent selects work or merges automatically.

### 4. Long-lived work must survive a terminal

Interactive agents, tests, and development servers run in Herdr. Cron, gateways,
supervisors, and watchdogs run in named tmux sessions. First Mate resolves its host
through the `herdr → tmux → foreground` runner ladder. A raw shell is a recovery
path, not the normal workspace.

### 5. Code is the source of truth

Do not add explanatory comments to tracked code. Comments create a second,
unverified description that drifts from behavior. Express intent through names,
types, structure, tests, and deterministic probes. Keep only machine-read
directives and comment-shaped data that a verified tool or oracle requires.

## A note from the maintainer

Prefer ambitious outcomes and simple systems. Do not preserve complexity because it
already exists. Do not add machinery because the architecture looks impressive.
Find the real constraint, then choose the smallest model that makes correct behavior
unsurprising.

Measure twice and cut once. Apply YAGNI. Resist scope creep. Preserve the operator's
intent in the smallest realistic change.

The non-negotiables in this file are hard constraints. Other guidance is a default.
An explicit operator instruction can override a default, but it cannot silently
cross the sandbox boundary, create another build path, or remove a human gate.

## A small glossary

- **you** means the root orchestrator reading this file.
- **operator** or **human** means the person who selects work, approves plans, and
  merges pull requests.
- **application agent** means the coding agent that owns implementation inside the
  sandbox.
- **host** means the machine that runs Docker and the root lifecycle commands.
- **sandbox** means the project container and the application agent's workspace.
- **provider** means Claude Code, Codex, Pi, or another coding harness.
- **task folder** means `.oh/tasks/<slug>/`, the interface shared by the three
  `/spec` subcommands.
- **runner** means the component that performs `reset` or `clean` after merge.

## Ways to hurt yourself

- **Do not write application code at the root.** That bypasses the ownership and
  environment boundary. Assign the work to the application agent in the sandbox.
- **Do not patch a provider mirror.** The next provider-link operation can erase the
  change. Edit the canonical `.oh/` primitive, then run the link check.
- **Do not add a second build command.** Two discoverable paths drift and pull agents
  into different workflows. Extend `/spec` instead.
- **Do not run a persistent process in an attached shell.** A disconnect kills or
  hides it. Use Herdr for interactive work and named tmux for headless services.
- **Do not treat the closest context file as the only context.** Context is
  cumulative. Read every applicable file and resolve conflicts by target-path
  specificity.
- **Do not use `.oh/templates/AGENTS.md` as root authority.** The template gives
  application ownership to agents in initialized projects. This file defines the
  opposite root-orchestrator role.
- **Do not explain code with comments.** Improve the code or add a test or probe that
  proves the invariant.

## Think through every affected surface

Before implementation, mark each surface **applied** or **not applicable**. Do not
silently skip a surface.

- **Host and sandbox:** Where must each command and file change occur?
- **Lifecycle doors:** Does behavior stay aligned across `make` and `oh`?
- **Canonical and provider surfaces:** Is the change in `.oh/`, and do symlinks still
  resolve?
- **Root and scaffold:** Does the change affect this orchestrator, initialized
  projects, or both?
- **Interactive and headless processes:** Does the work belong in Herdr, tmux, the
  First Mate runner, or a recovery shell?
- **Local and remote operation:** Does the behavior work after terminal disconnect
  and on a remote VM?
- **Workflow artifacts:** Do the task graph, evidence, pull request, and human gates
  agree?
- **Documentation and verification:** Which docs, tests, probes, and CI paths prove
  the changed behavior?

## How to work in this repository

At the start of every session, read:

- `.oh/context/SOUL.md`
- `.oh/context/IDENTITY.md`
- `.oh/context/TOOLS.md`
- `.oh/context/REPO_MAP.md`
- `.oh/context/USER.md`

Before changing a subtree, read each `AGENTS.md` and `CLAUDE.md` from the root through
the target path. More local instructions win for their subtree. In one directory,
`AGENTS.md` is canonical. If `AGENTS.md` and a real `CLAUDE.md` conflict in the same
directory, stop and report the conflict. Use the ancestor helper in
`.oh/context/REPO_MAP.md` for new or unfamiliar paths.

Use the lifecycle in this order:

1. Run `make sandbox` on the host.
2. Run `make shell`.
3. Run `herdr` inside the sandbox.
4. Run `gh auth login && gh auth setup-git` once from the first Herdr pane.
5. Run `make ps` on the host to verify the container.

Run `make destroy` only for operator-authorized teardown.

In an initialized repository without a Makefile, use the matching `oh` verbs. Both
surfaces call `.oh/scripts/docker-compose.sh`. The canonical mapping is
[`.oh/docs/lifecycle-commands.md`](.oh/docs/lifecycle-commands.md).

Full provider-portable policy lives in `/git`. Create the issue before the branch,
use the detected target branch, include an `[Unreleased]` changelog entry for a
user-visible change, and run `/ci-status` after every push.

Use `/cloudflared <port>` for a public sandbox preview. Keep the development server
in Herdr and the managed tunnel in tmux.

## The Workflow

<!-- workflow-canonical -->
Open Harness has one sole canonical workflow:
`spec-plan → spec-execute → merge → reset|clean`.

There is no automated selection node and no all-in-one composer beside `/spec`.
Each subcommand operates on `.oh/tasks/<slug>/`:

- `/spec plan` turns a topic, plan, or issue into the task folder. Human approval of
  `prd.md` is the commitment gate.
- `/spec execute` creates the issue, branch, and draft pull request; runs
  `build ⇄ audit`; commits `evidence.md`; runs the improve tail; and promotes only a
  qualifying pull request to ready-for-review.
- `/spec retro` captures lessons from the completed build.

```mermaid
flowchart LR
    PLAN["/spec plan"] --> BUILD["build"]
    BUILD --> AUDIT{"audit"}
    AUDIT -->|fix| BUILD
    AUDIT -->|pass| EVID["evidence.md"]
    EVID --> RETRO["/spec retro + improve"]
    RETRO --> MERGE["merge — human"]
    MERGE --> RESET["reset | clean — runner"]
```

The operator vets the plan. The `build ⇄ audit` loop vets the implementation.
`evidence.md` states the plan requirements, build results, reasons for divergence,
and remaining unverified work. `/spec execute` must refuse to mark the pull request
ready when that evidence is absent or uncommitted. The human alone merges.

## Skills that own policy

Load a skill when its trigger matches. Do not copy its procedure into this file.

| Skill | Owns |
|---|---|
| `/spec` | The plan, execute, and retro workflow through a ready-for-review PR. |
| `/firstmate` | The one long-lived build executor and its runner ladder. |
| `/git` | Provider-portable source of truth for issues, branches, commits, PRs, changelogs, worktrees, and releases. |
| `/builder` | Portable agent, skill, command, and rule authoring. |
| `/audit` | Implementation, PR, harness, context, skill, eval, and drift audits. |
| `/eval` | Deterministic regression probes and `.oh/evals/RESULTS.md`. |
| `/health-check` | Resource triage and host-only Docker reclaim guidance. |
| `/herdr` | Interactive workspace, pane, agent, and worktree control. |
| `/t3` | The T3 Code browser UI process. |
| `/cloudflared` | Public sandbox preview tunnels. |
| `/wiki` | Knowledge-corpus ingest, query, and lint. |
| `/ste` | Unambiguous prose in tracked artifacts and GitHub text. |

The complete catalog lives in `.oh/skills/`. Read a skill's `SKILL.md` before using
it.

## How the system fits together

The host calls `make` or `oh`. Both doors reach `.oh/scripts/docker-compose.sh`,
which starts the project sandbox from `.devcontainer/`. Inside that sandbox, Herdr
holds interactive work while named tmux sessions hold unattended infrastructure.
The application agent works on its branch or an isolated worktree. `/spec` turns a
human-approved task folder into a tested, audited, evidence-backed pull request. A
human merges, then the runner resets the workspace.

The control plane has five main areas:

- `.devcontainer/` defines the sandbox image, Compose configuration, and entrypoint.
- `.oh/scripts/`, `.oh/install/`, and `.oh/cli/` implement lifecycle and runtime
  behavior.
- `.oh/skills/`, `.oh/agents/`, and `.oh/hooks/` hold provider-portable primitives.
- `.oh/tasks/` holds plans, task graphs, progress, and execution evidence.
- `.oh/evals/` holds regression probes and capability benchmarks.

Read `.oh/context/REPO_MAP.md` for search routing. Read the nearest directory
`README.md` before changing unfamiliar machinery.

## Taste

- Prefer a smaller truthful model over a complete-looking abstraction.
- Make ownership and execution location obvious.
- Keep one source of truth for each policy and behavior.
- Use code, tests, and probes as evidence. Do not use explanatory code comments.
- Make remote and disconnected operation a normal case.
- Preserve human judgment where automation cannot prove the decision.
- Delete obsolete paths instead of leaving dormant alternatives.
