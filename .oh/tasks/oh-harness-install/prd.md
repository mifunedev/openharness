# PRD — `oh harness`: install an agent harness from the CLI

- **Branch**: `feat/oh-harness-install`
- **Slug**: `oh-harness-install`
- **Surface**: `.oh/cli` (the `oh` binary)

## Problem

Open Harness ships eight agent harnesses (`.oh/docs/harnesses/`). Three are in the
default image (Claude Code, Codex, Pi). Four are optional image-level installs
(OpenCode, Grok Build, DeepAgents, Hermes). One is on-demand (T3 Code).

To add an optional harness today a user must:

1. know that `harness.yaml` has an `install:` section,
2. find the right key — the key is `install.grok_build` while the doc slug is
   `grok-build`, and the build arg is `INSTALL_GROK_BUILD`,
3. uncomment the line by hand in a file whose parser accepts a two-space indent
   and nothing else,
4. run `make destroy && make sandbox` — a full image rebuild, several minutes,
   and it destroys the container.

Nothing in the `oh` CLI helps. `oh --help` lists `init`, `config`, `update`,
`sandbox`, `shell`, `gateway`, `cloud`. There is no way to ask which harnesses
exist, which are installed, or to add one.

The rebuild is the sharpest edge. Adding a harness is a one-package operation,
but the only supported path throws the container away.

## Goal

One command adds a harness:

```
oh harness install opencode
```

It sets the `harness.yaml` flag so the choice survives a rebuild, and installs
the CLI into the already-running container so the user can use it now.

## Non-goals

- Changing how the image builds. `.devcontainer/Dockerfile`'s `INSTALL_*` build
  args and the `AGENTS` list are untouched. This feature is additive.
- Rebuilding or restarting the sandbox. `oh harness` never calls `docker compose`.
- `oh harness remove`. Uninstall is out of scope.
- Harnesses with no doc under `.oh/docs/harnesses/`.
- `install.agent_browser`. It sits in the same `install:` section but is not a
  harness; `oh harness` must never write it.
- A new `ExecutionTarget` implementation or a target-selector flag.
- A `set` mode on `.oh/scripts/harness-config.sh`. That script is read-only by
  design and stays that way.

## Decisions

### D1 — the catalog is a bundled TypeScript module

`.oh/cli/src/lib/harnesses/catalog.ts` holds one entry per harness.

Rejected alternatives:

- **A data file under `.oh/`.** An installed `oh` binary has no readable `.oh/`
  payload — that is exactly why `resolveInitSource` / `bundledPayloadExists`
  exist in `cli.ts`. A data file would need the same remote-fallback dance for a
  static table.
- **Deriving from the docs.** The docs are already drifted:
  `.oh/docs/harnesses/claude-code.md:18` says `pnpm add -g @anthropic-ai/claude-code`
  while `.devcontainer/Dockerfile:141` runs `npm install -g`. Docs are prose, not
  a source of truth.

**The Dockerfile is ground truth for every `installArgv`**, including version
pins. A drift test enforces that (see FR-8).

### D2 — install persists the flag *and* installs live

`oh harness install <name>`:

1. persists `install.<key>: true` in `harness.yaml` (cheap, always possible), then
2. installs into the running container via the `ExecutionTarget`.

Rejected:

- **Live-only.** A container recreate silently loses the CLI.
- **Flag-only.** That is the rebuild pain this feature removes.

Escape hatches: `--persist-only` (no container work) and `--no-persist`
(ephemeral live install). They conflict with each other.

When the container is absent or stopped, the command **still exits 0** after
persisting, and prints the rebuild hint. Failing there would punish the user for
the normal "not started yet" case.

## Functional requirements

### FR-1 — `oh harness list`

Prints every catalog entry: id, kind (`default` / `optional` / `on-demand`),
whether the `harness.yaml` flag is enabled, and whether the binary is present in
the running container. `--json` emits the same data machine-readably.

### FR-2 — `oh harness status [name]`

Same data as `list`, for one harness when named. Exits 1 on an unknown name.

### FR-3 — `oh harness install <name>`

- Seeds `harness.yaml` from `harness.yaml.example` when absent (same rule as
  `runSandbox`).
- Persists `install.<key>: true` when the entry has a `harnessKey`.
- Entries with no `harnessKey` (`claude-code`, `codex`, `pi`, `t3code`) skip the
  persist step with a one-line note. They never invent a key.
- Runs `verifyArgv` first. Already present → reports `already installed`, still
  ensures the flag is set, runs no installer.
- Runs `installArgv` as `installUser` inside the container, stdio inherited.
- Re-running the whole command is a no-op.

### FR-4 — degraded environments

| Condition | Behavior |
|---|---|
| container `absent` or `stopped` | persist, skip live install, print the `oh sandbox` hint, exit 0, zero `docker exec` calls |
| `docker` not on PATH (`ENOENT`) | persist, report the missing binary in `runShell`'s message style, exit non-zero |
| installer exits non-zero | report the failure, exit non-zero, **leave the flag persisted** — it is still correct for the next rebuild, and the output says so |
| unknown name | list the valid ids, exit 1 (mirrors `oh config`'s unknown-integration shape) |

### FR-5 — the `harness.yaml` writer

New `.oh/cli/src/lib/harness-yaml.ts`.

- Reads go through `sh <root>/.oh/scripts/harness-config.sh get install.<key> <abs harness.yaml>`
  with the path argument **mandatory and explicit** — the script silently exits 0
  on a missing cwd-relative default.
- Writes are a minimal diff. Every `install:` key ships **commented** in
  `harness.yaml.example`, so the writer **uncomments the line in place** and
  preserves its trailing comment. It never appends a duplicate key.
- When the `install:` section is absent, it appends the section.
- Idempotent on an already-`true` key.
- Reuses the `assertInRoot` path-escape invariant; refuses to write outside the
  project root.
- Does not re-implement the parser. `harness-config.sh` stays the reader.

### FR-6 — shared extraction, not forking

`seedHarnessYaml`, `assertInRoot`, and `configuredContainerName` are private in
`lifecycle.ts` today. They move to `lib/harness-yaml.ts` and are re-exported for
back-compat — the precedent is `lib/execution/runner.ts`, which was pulled out of
`lifecycle.ts` the same way.

All container work goes through `resolveExecutionTarget()` → `target.status()` /
`target.exec()`. No direct `docker exec` spawn, and no `kind === "docker-compose"`
check — capability discovery only, per `lib/execution/target.ts`.

### FR-7 — command surface

```
oh harness — Install and inspect agent CLI harnesses

Usage:
  oh harness list                     List known harnesses and their state
  oh harness install <name>           Install a harness into the sandbox
  oh harness status [name]            Show installed/enabled state

Flags:
  --persist-only   Only set the harness.yaml install: flag (no container work)
  --no-persist     Live-install only; leave harness.yaml unchanged
  --json           Machine-readable output (list/status)
```

`printOhHelp()`'s Usage block gains an `oh harness <args...>` line. Parsing uses
the existing `ParseResult<T>` pattern; `main()` stays dispatch-only.

Pipeline installers are stored as a **constant** argv in the catalog
(`["bash", "-lc", "curl -fsSL … | bash -s 0.2.39"]`) with zero interpolation.
Nothing from the user-supplied name ever reaches a shell string.

### FR-8 — the drift test

For every catalog entry carrying a `buildArg`, assert:

- the build arg appears in `.devcontainer/Dockerfile`,
- the `harnessKey` appears in `harness-config.sh`'s `envmap`,
- the key appears in `harness.yaml.example`'s `install:` section,
- any pinned version string in `installArgv` appears verbatim in the Dockerfile.

Drift is caught by a command, not by review.

### FR-9 — docs

`.oh/docs/harnesses/overview.md` and each optional harness's Install section gain
`oh harness install <name>` as the no-rebuild path. `harness.yaml.example`'s
`install:` comment notes that the CLI writes these keys.

## Test plan

Established conventions only: `mkdtempSync` repo fixtures, injected
`LifecycleRunner` fakes, **no real docker/bash subprocess, never the real
worktree root** (its `harness.yaml.example` would fire the seed). The
`vi.mock("../cli.js")` process.exit stub is copied when importing `cli.ts`.

| Test | Asserts |
|---|---|
| catalog drift | FR-8, all four checks |
| writer round-trip | after the TS writer sets `install.opencode: true`, `harness-config.sh get` prints `true` and `env` mode emits `INSTALL_OPENCODE=true`. The only place a real `sh` subprocess is acceptable — it reads a fixture and spawns no docker |
| writer in-place | uncomments in place, line count unchanged, trailing comment preserved |
| writer idempotence | already-`true` key is a no-op |
| writer append | appends `install:` when the section is absent |
| writer escape | refuses a path outside the project root |
| stopped container | exits 0, sets the flag, prints the hint, makes zero `docker exec` calls |
| no-key harness | `oh harness install claude-code` does not write `harness.yaml` |
| already installed | `verifyArgv` succeeding runs no installer |
| unknown name | exit 1, lists valid ids |
| help block | `printOhHelp()` lists `oh harness` |

## Acceptance

`pnpm typecheck` and `pnpm test` pass.
