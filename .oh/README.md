# .oh/

**OpenHarness's own machinery, grouped as one addressable unit.** The `oh` CLI,
the installer/lifecycle scripts, the container-install inputs, and the
deploy/compose config now live together here so a future version (and the `oh`
CLI itself) can address the harness's machinery as a single namespace instead of
hunting it across the repo root.

This rescopes the removed `.openharness/` deploy-override directory under the
short name that already matches the `oh` CLI (so `.openharness/` nested inside the
`openharness` repo is no longer redundant), and extends it from "just deploy
config" to "the machinery."

## Governing principle: a dotdir namespace is earned by FUNCTION-CLASS

This **supersedes** the earlier "earned by EXPORT only" rule *and* the later
`.oh/`-vs-`.mifune/` split: the provider-portable primitives were absorbed into
`.oh/`, so there is now **one** machinery namespace (the former `.mifune` submodule
is obsolete):

- **`.oh/`** — *OpenHarness's own machinery* as one unit, including the
  provider-portable *primitives* — `skills/`, `agents/`, `hooks/` (+ `skills.lock`)
  — exported to the four agent providers via symlinks (`.claude/`, `.codex/`,
  `.pi/`, `.hermes/`): the `oh` CLI (`cli/`),
  the GitHub-readable markdown docs (`docs/`, now at `.oh/docs/`), installer +
  lifecycle scripts (`scripts/`), container-install inputs (`install/`), the
  scheduled-agent cron definitions + runtime log (`crons/`), the
  regression/capability eval suite (`evals/`), the long-term memory + session
  logs (`memory/`), the always-on identity core (`context/`), user-local deploy
  config (`config.json`), and the Ralph/spec task workdirs (`tasks/` — ephemeral
  build scratch, now at `.oh/tasks/`). The former top-level `packages/` folder
  was **retired** — its `oh` package moved in here; the Docusaurus docs *site*
  was externalized to [`mifunedev/openharness-web`](https://github.com/mifunedev/openharness-web)
  (#536), and the GitHub-readable markdown it rendered now lives at `.oh/docs/`.
- **repo root** — everything forced to root by *external* tooling
  (`.devcontainer/` for the devcontainer spec + Docker COPY, `harness.yaml`,
  `package.json`, `pnpm-*.yaml`, `.github/`, `.husky/`) **plus** live
  identity/state the harness edits in place (`workspace/`). The GitHub-readable
  markdown docs now live under `.oh/docs/`, the scheduled-agent crons under
  `.oh/crons/`, the eval suite under `.oh/evals/`, long-term memory under
  `.oh/memory/`, the identity core under `.oh/context/`, and the Ralph/spec task
  workdirs under `.oh/tasks/`; the rendered docs site and the `blog/` archive
  live in `mifunedev/openharness-web`.

### Relocated into `.oh/` (no back-compat symlinks)

The runtime-machinery directories (`scripts/`, `install/`, `crons/`, `evals/`, `memory/`, `context/`) moved into `.oh/`
**without** back-compat symlinks at the old root paths — every consumer was
repointed to the real `.oh/…` location:

| Old path | Real location |
|---|---|
| `scripts/` | `.oh/scripts/` |
| `install/` | `.oh/install/` |
| `crons/` | `.oh/crons/` |
| `evals/` | `.oh/evals/` |
| `memory/` | `.oh/memory/` |
| `context/` | `.oh/context/` |

Every consumer pinning those literals was updated: the skills and cron bodies that
call `.oh/scripts/locked-append.sh`, the `Makefile`'s `COMPOSE := .oh/scripts/docker-compose.sh`,
the boot-lint shellcheck glob, vitest's `.oh/scripts/__tests__/**`, the eval probes,
and the `CRONS_DIR` default (`.oh/crons`) in `docker-compose.yml`, `entrypoint.sh`,
and `cron-runtime.ts`. Nothing reads the bare root paths anymore.

The relocated task workdirs (`tasks/` → `.oh/tasks/`) moved **without** a
back-compat symlink — every consumer was repointed to the real `.oh/tasks/` path
directly (the `cleanup-tasks` cron, `ralph.sh` + its vitest, the eval probes, and
the `.mifune` skill/agent references), because git index operations cannot traverse
a symlink and nothing reads the bare `tasks/` path anymore.

The **`oh` CLI package** moved *without* a back-compat symlink — the `packages/`
folder is retired, and its consumers were repointed directly to the real `.oh/`
paths:

- **`npm --prefix packages/oh`** → `npm --prefix .oh/cli` (CI typecheck + release).
- **Docker `COPY`** (`.oh/devcontainer/Dockerfile`) — copies from `.oh/cli/` and
  `.oh/install/` (Docker's build context ignores symlinked directories anyway).
- **GitHub Actions `paths:` filters** — keyed on real diff paths, so `.oh/**` was
  added to `ci-harness.yml`/`sandbox-boot-guard.yml`. (The legacy `scripts/**` /
  `install/**` / `packages/oh/**` filters are kept so the path probes stay green.)

The former `packages/docs` Docusaurus **site** is **not** in `.oh/` — it was
externalized to [`mifunedev/openharness-web`](https://github.com/mifunedev/openharness-web)
(#536), which removed the pnpm-workspace member, the `docs:build`/`docs:dev`/`docs:serve`
scripts, and the `docs.yml` workflow. The GitHub-readable markdown those scripts
rendered now lives at `.oh/docs/` (markdown only — no build machinery; guarded by
`.oh/evals/probes/docs-build-fast-path.sh`).




## How the skill pack is wired

The shared skills, agents, and hooks are vendored directly under `.oh/` (`.oh/skills`, `.oh/agents`, `.oh/hooks`) and tracked in this repo — there is no submodule and no network fetch. `oh init`/`oh update` lay the pack down with the rest of `.oh/`; `.oh/scripts/link-providers.sh --init` (re)creates the provider symlinks into it, and `--check` verifies the vendored pack is present, the required executables, the protected paths, the provider symlinks, and the Hermes link when enabled.

`.pi/` remains the Pi provider surface in v1; its `.pi/skills` is one of the symlinks into `.oh/skills`.

## Contents

| File / dir | Purpose |
|------|---------|
| `README.md` | This file — the namespace anchor (keeps `.oh/` in a fresh clone) and the surface's documentation. |
| `cli/` | The in-tree `oh` CLI (standalone npm package; built into the image as `/opt/oh`). Old path: `packages/oh/` (no symlink — repointed). |
| `install/` | Container-install inputs (`.zshrc`, `.tmux.conf`, `banner.sh`, `install.sh` prerequisites) consumed by the Dockerfile + entrypoint. Old path: `install/` (no symlink — repointed). |
| `scripts/` | Installer, lifecycle, cron-runtime, and eval-support scripts (`docker-compose.sh`, `cron-runtime.ts`, `ralph.sh`, `locked-append.sh`, `harness-config.sh`, …). Old path: `scripts/` (no symlink — repointed). |
| `crons/` | Scheduled-agent cron definitions (`heartbeat.md`, `autopilot.md`, `cleanup-tasks.md`, …) read by `.oh/scripts/cron-runtime.ts`, plus the gitignored runtime `.cron.log`/`.pid`. Old path: `crons/` (no symlink — repointed). |
| `evals/` | The fitness-function suite — regression probes (`probes/`), capability benchmark (`capability/`), trajectory datasets (`datasets/`), and the `RESULTS.md` scoreboard. Old path: `evals/` (no symlink — repointed). |
| `memory/` | The harness's long-term memory (`MEMORY.md` + topic notes, tracked) and gitignored dated session logs (`[0-9]*/log.md`). Old path: `memory/` (no symlink — repointed). |
| `context/` | The always-on identity core read at session start (`SOUL.md`, `IDENTITY.md`, `TOOLS.md`, `USER.md`, `REPO_MAP.md`) + the collapsed `rules/` provider pointers. Old path: `context/` (no symlink — repointed). |
| `patches/` | Vendored pnpm dependency patches (applied at install via `package.json` `patchedDependencies`). |
| `config.json` | User-local, gitignored `composeOverrides[]` source. Read here first; legacy repo-root `config.json` is honored as a fallback. |

## oh init (Phase 2)

`oh init [dir]` scaffolds a fresh harness checkout (defaulting to the current
directory) by materializing the payload under `.oh/templates/` — `harness.yaml`,
`AGENTS.md`, a `gitignore` seed, and a `.devcontainer/devcontainer.json` whose
`workspaceFolder` is pinned to `/home/sandbox/project`. The command is
`runInit` (exported from `cli/src/commands/init.ts`, dispatched from `cli.ts`).

A `--templates <dir>` escape hatch points the command at an alternate template
source instead of the bundled `.oh/templates/`.

**Deferred slices** (Phase 2 slice 2/3, not in this slice):

- **Installed-binary template bundling** — the on-PATH `oh` resolves templates
  to `/opt/templates`, which the `.devcontainer/Dockerfile` does **not** COPY
  yet, so the installed binary has no payload to read. Until then, run `oh init`
  from a built checkout (where `.oh/templates/` resolves locally) or pass
  `--templates <dir>` explicitly.
- **Live-asset restructure** — promoting the template set from a static seed to
  the live harness assets.
- **Full `.oh/` vendoring** — shipping the complete `.oh/` machinery as part of
  the scaffold.

## What belongs here vs. at root

| Belongs in `.oh/` | Stays at root |
|------|------|
| OpenHarness's own machinery addressed as a unit: the `oh` CLI, the GitHub-readable markdown docs (`.oh/docs/`), installer/lifecycle scripts, container-install inputs, deploy/compose config, the scheduled-agent cron definitions (`.oh/crons/`), the fitness-function eval suite (`.oh/evals/`), the long-term memory + session logs (`.oh/memory/`), the always-on identity core (`.oh/context/`), the Ralph/spec task workdirs (`.oh/tasks/`) | Surfaces **forced to root by external tooling** (`.devcontainer/`, `harness.yaml`, `package.json`, `pnpm-*.yaml`, `.github/`, `.husky/`) and **live identity/state** edited in place (`workspace/`) |

### Why these specifically stay at root

- `.devcontainer/` — now a **thin compat layer**, not the build machinery. It
  holds only the VS Code `devcontainer.json` (GENERATED by
  `.oh/scripts/sync-devcontainer.sh` — do not hand-edit) and the user-owned `.env`,
  pinned to root by the devcontainer spec / `.dockerignore` / hadolint (which don't
  honor a symlinked directory). The actual build assets (`Dockerfile`,
  `docker-compose.yml` + the hermes-dashboard overlay, `entrypoint.sh`, and the two
  client scripts `client-slack-supervise.sh` / `seed-msg-bridge.sh`) now live at
  `.oh/devcontainer/`.
- `harness.yaml` — the CI path filters and the `autopilot-preflight-gate` /
  `harness-ci-core-paths` / `sandbox-boot-guard-ci` probes pin it at repo root.
- `config.json` — relocated *logically* to `.oh/config.json` (now the canonical
  read location); the gitignored file itself is user-local runtime state, and the
  legacy repo-root path still works as a fallback for older installs.

## Project-root seam

`OH_PROJECT_ROOT` (default `/home/sandbox/harness`) is the single source of truth for
the container workspace path. All devcontainer and `.oh/scripts` consumers derive their
paths from `${OH_PROJECT_ROOT:-/home/sandbox/harness}` rather than the bare literal.
`HARNESS` is kept as a back-compat alias (`HARNESS="${HARNESS:-$OH_PROJECT_ROOT}"`);
prefer `$OH_PROJECT_ROOT` in new code. This is Phase 1 of [#531](https://github.com/mifunedev/openharness/issues/531) toward `oh init`.
The seam contract is guarded by `.oh/evals/probes/project-root-seam.sh`.

## devcontainer layout (Phase 2 slice 2)

The harness's own devcontainer build assets were relocated from top-level
`.devcontainer/` into **`.oh/devcontainer/`** so the boot machinery rides along
with the rest of the `.oh/` control plane. The split is:

- **`.oh/devcontainer/`** — the build/bootstrap assets: `Dockerfile`,
  `docker-compose.yml` + the `docker-compose.hermes-dashboard.yml` overlay,
  `entrypoint.sh`, `client-slack-supervise.sh`, `seed-msg-bridge.sh`. The CI
  hadolint/shellcheck boot-lint, the `.oh/scripts` lifecycle wrappers, and the
  `dockerComposeFile` reference all point here.
- **root `.devcontainer/`** — a thin compat layer only: the VS Code
  `devcontainer.json` (GENERATED by `.oh/scripts/sync-devcontainer.sh`, repointed
  at `../.oh/devcontainer/docker-compose.yml`) plus the user-owned `.env`. It is
  pinned to root by the devcontainer spec / `.dockerignore` / hadolint.

This is a no-behavior-change relocation validated by the sandbox boot-guard. It
is **separate** from `.oh/templates/.devcontainer/` (Phase 2 slice 1), which is the
downstream scaffold copied into *consumer* repos by the `oh` CLI — not this repo's
own boot environment.

## oh update (Phase 3)

`oh update` upgrades **only the `.oh/` control plane** of an OpenHarness-equipped
repo. It is the **sibling of `oh init`**: where `oh init` seeds *project* files
from `.oh/templates/`, `oh update` refreshes the `.oh/` **infrastructure itself**.
Project source — anything *outside* `.oh/` — is left untouched.

**Usage:**

```bash
oh update --from <dir> [--dry-run] [--force]
```

- `--from <built-checkout>` — the source `.oh/` to upgrade from. This is the MVP
  source surface; **remote-fetch is DEFERRED** (the same precedent as `oh init`'s
  deferred bundling — a built source must be supplied via `--from` in this slice).
- `--dry-run` — report what would change without writing.
- `--force` — override the version gate (see below).

**Safety invariant:** `oh update` writes **only under `<target>/.oh/`**, and every
write path is **path-escape-guarded** (rejected if it would resolve outside
`<target>/.oh/`). Because of this, "project source remains untouched" holds **by
construction** — only files *outside* `.oh/` are guaranteed untouched.

**Version gate:** the version is read from `.oh/cli/package.json#version` — there
is **no separate VERSION file**. `oh update` **no-ops when already current**, and
**refuses a downgrade without `--force`**.

> **Honesty disclosure:** in this MVP, `oh update` **OVERWRITES `.oh/` files in
> place with NO backup**. Any user-modified file *under* `.oh/` (for example a
> local `.oh/config.json`) **is replaced**. Only files **outside** `.oh/` (the
> project source) are guaranteed untouched.

**Contrast with `oh init`:** `oh init` *seeds project files* from `.oh/templates/`
into the repo; `oh update` *refreshes the `.oh/` infrastructure* in place. Do not
confuse the two — init populates the project, update upgrades the control plane.

## Payload manifest

`oh update` does **not** overlay all of `.oh/`. It overlays a **declared
allowlist** read from `.oh/manifest.json` — an `{ "include": [...], "exclude":
[...] }` document whose globs are **POSIX paths relative to `.oh/`** (e.g.
`cli/**`, `README.md`, `manifest.json`). A path ships **iff** it matches at least
one `include` pattern and zero `exclude` patterns (exclude wins).

**What is intentionally NOT shipped:** `.oh/patches/` (repo-specific dependency
patches) is **omitted from `include`**, so it is never vendored into a consumer
repo. It is **not deleted** — it stays physically in this repo; it is simply not
part of the payload. (The Docusaurus docs *site* formerly under `.oh/docs/` was
migrated out to [`mifunedev/openharness-web`](https://github.com/mifunedev/openharness-web)
(#536); `.oh/docs/` now holds the GitHub-readable markdown docs, which the manifest
also does not ship — `docs/**` is absent from `include`.)

- **The manifest ships itself** — `manifest.json` is in `include`, so the policy
  **propagates forward**: a consumer's next `oh update` reads the *source's*
  manifest and inherits the same boundary.
- `templates/**` is pre-declared in `include` for PR #334 (the `oh init`
  templates); on this base it matches **nothing**, harmlessly.

**Back-compat (legacy mode):** a source with **no `.oh/manifest.json`** — or an
empty/invalid one — falls back to overlaying **all of `.oh/`**, exactly as
before, emitting a one-line `legacy mode` warning so the fallback stays visible.

**Boundary is preserved:** the manifest **cannot reach outside `.oh/`**. Its
patterns are relative to `.oh/`, and the existing path-escape guard (writes land
only under `<target>/.oh/`) is **unchanged** — the manifest *narrows* the
payload, it never widens the write surface. The vendored skill pack
(`skills/**`, `agents/**`, `hooks/**`, `skills.lock`) ships through this same
manifest, so `oh init`/`oh update` carry it into a target with the rest of `.oh/`.

> **`oh init` seam:** both `oh init` and `oh update` honor this manifest — they
> vendor only the manifest-shipped `.oh/` payload (via `commands/init.ts`'s
> `copyOhPayload`), so the skill pack arrives in one shot with no submodule step.

## Pointers

- `.oh/context/directory-readme.md` — the README-as-directory-anchor convention this file follows.
- `.oh/docs/roadmap.md` — the B-state primitive-taxonomy migration; `.oh/` machinery grouping.
- `.oh/skills/` — the vendored provider-portable primitive pack (skills/agents/hooks), absorbed from the former `.mifune` submodule.
