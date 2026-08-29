# .oh/

**OpenHarness's own machinery, grouped as one addressable unit.** The `oh` CLI,
the installer/lifecycle scripts, the container-install inputs, and the
compose config now live together here so a future version (and the `oh` CLI
itself) can address the harness's machinery as a single namespace instead of
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
  `.pi/`, `.hermes/`): the `oh` CLI (`cli/`), installer + lifecycle scripts
  (`scripts/`), container-install inputs (`install/`), the
  regression/capability eval suite (`evals/`), the long-term memory + session
  logs (`memory/`), user-local deploy
  config (`config.json`),
  and the Ralph/spec task workdirs (`tasks/` — ephemeral build scratch, now at
  `.oh/tasks/`). The former top-level `packages/` folder
  was **retired** — its `oh` package moved in here; the Docusaurus docs *site*
  was externalized to [`mifunedev/openharness-web`](https://github.com/mifunedev/openharness-web)
  (#536).
- **repo root** — human-facing Markdown docs live under `docs/`, alongside
  everything forced to root by *external* tooling (`.devcontainer/` for the
  devcontainer spec + Docker COPY, `package.json`, `pnpm-*.yaml`, `.github/`,
  `.husky/`). The scheduled-agent cron definitions live at the repo root in
  `crons/` — operator schedule content, not shipped machinery. The
  eval suite stays under `.oh/evals/`, and the Ralph/spec task workdirs under
  `.oh/tasks/`. The worktree root (`.worktrees/`) and the project-clone root
  (`projects/`) sit at the repo root, because a repository keeps its worktrees at
  its own root and a project clone is a peer repo, not control-plane machinery;
  the rendered docs site and the `blog/` archive
  live in `mifunedev/openharness-web`.

### Relocated into `.oh/` (no back-compat symlinks)

The runtime-machinery directories (`scripts/`, `install/`, `evals/`, `memory/`) moved into `.oh/`
**without** back-compat symlinks at the old root paths — every consumer was
repointed to the real `.oh/…` location:

| Old path | Real location |
|---|---|
| `scripts/` | `.oh/scripts/` |
| `install/` | `.oh/install/` |
| `evals/` | `.oh/evals/` |

Every consumer pinning those literals was updated: the skills and cron bodies that
call `.oh/scripts/locked-append.sh`, the `Makefile`'s `COMPOSE := .oh/scripts/docker-compose.sh`,
the boot-lint shellcheck glob, vitest's `.oh/scripts/__tests__/**`, the eval probes,
in `docker-compose.yml`, `entrypoint.sh`, and `cron-runtime.ts`. Nothing reads
the bare root paths anymore.

The cron definitions went the other way. They briefly lived at `.oh/crons/` and
moved back **out** to the repo root as `crons/`, because a schedule authored per
deployment is operator content, not machinery Open Harness ships. The
`CRONS_DIR` default is `crons`, and `oh init` / `oh update` deliver them through
the manifest's `rootInclude` list rather than the `.oh/` payload.

The relocated task workdirs (`tasks/` → `.oh/tasks/`) moved **without** a
back-compat symlink — every consumer was repointed to the real `.oh/tasks/` path
directly (the `cleanup-tasks` cron, the `/spec execute` task graph, the eval probes, and
the `.mifune` skill/agent references), because git index operations cannot traverse
a symlink and nothing reads the bare `tasks/` path anymore.

The ignored worktree root briefly lived at `.oh/worktrees/` and moved back **out**
to the repo root as `.worktrees/`, with no back-compat symlink in either
direction. Runtime creation is routed through `WORKTREES_DIR` / `paths.worktrees`
(default `.worktrees`), and cron worktree isolation uses `.worktrees/cron/`.
Clones of non-harness repositories, formerly `.oh/worktrees/project/<owner>/<repo>/`,
now live at `projects/<owner>/<repo>/` (`PROJECTS_DIR`, default `projects`), and
each keeps its own worktrees at `projects/<owner>/<repo>/.worktrees/`. Both roots
are gitignored except `.worktrees/AGENTS.md` and `projects/AGENTS.md`.

The **`oh` CLI package** moved *without* a back-compat symlink — the `packages/`
folder is retired, and its consumers were repointed directly to the real `.oh/`
paths:

- **`npm --prefix packages/oh`** → `npm --prefix .oh/cli` (CI typecheck + release).
- **Docker `COPY`** (`.devcontainer/Dockerfile`) — copies from `.oh/cli/` and
  `.oh/install/` (Docker's build context ignores symlinked directories anyway).
- **GitHub Actions `paths:` filters** — keyed on real diff paths, so `.oh/**` was
  added to `ci-harness.yml`/`sandbox-boot-guard.yml`. (The legacy `scripts/**` /
  `install/**` / `packages/oh/**` filters are kept so the path probes stay green.)

The former `packages/docs` Docusaurus **site** is **not** in `.oh/` — it was
externalized to [`mifunedev/openharness-web`](https://github.com/mifunedev/openharness-web)
(#536), which removed the pnpm-workspace member, the `docs:build`/`docs:dev`/`docs:serve`
scripts, and the `docs.yml` workflow. The GitHub-readable Markdown docs live at
root `docs/` (Markdown only — no build machinery; guarded by
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
| `scripts/` | Installer, lifecycle, cron-runtime, and eval-support scripts (`docker-compose.sh`, `cron-runtime.ts`, `locked-append.sh`, `harness-config.sh`, …). Old path: `scripts/` (no symlink — repointed). |
| `evals/` | The fitness-function suite — regression probes (`probes/`), capability benchmark (`capability/`), trajectory datasets (`datasets/`), and the `RESULTS.md` scoreboard. Old path: `evals/` (no symlink — repointed). |
| `patches/` | Vendored pnpm dependency patches (applied at install via `package.json` `patchedDependencies`). |
| `config.json` | User-local, gitignored `composeOverrides[]` source. Read here first; legacy repo-root `config.json` is honored as a fallback. |

## oh init (Phase 2)

`oh init [dir]` scaffolds a fresh harness checkout (defaulting to the current
directory) by materializing the payload under `.oh/templates/` —
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
| OpenHarness's own machinery addressed as a unit: the `oh` CLI, installer/lifecycle scripts, container-install inputs, compose config, the fitness-function eval suite (`.oh/evals/`), and the Ralph/spec task workdirs (`.oh/tasks/`) | Human-facing Markdown docs (`docs/`) plus the scheduled-agent cron definitions (`crons/`), and surfaces **forced to root by external tooling** (`.devcontainer/`, `package.json`, `pnpm-*.yaml`, `.github/`, `.husky/`) |

### Why these specifically stay at root

- `.devcontainer/` — the **full devcontainer**, pinned to root by the devcontainer
  spec / `.dockerignore` / hadolint (which don't honor a symlinked directory). It
  holds the VS Code `devcontainer.json`, the user-owned `.env`, and every build
  asset: `Dockerfile`, `docker-compose.yml` + the hermes-dashboard overlay,
  `entrypoint.sh`, and the two client scripts (`client-slack-supervise.sh` /
  `seed-msg-bridge.sh`). Everything the sandbox boots from lives here, in the one
  conventional location — no split, no compat shim.
- `.devcontainer/.example.env` — the tracked configuration schema. The CI path
  filters and the `harness-ci-core-paths` / `sandbox-boot-guard-ci` probes pin
  it beside the compose files it documents. Its local copy,
  `.devcontainer/.env`, is the one configuration surface; the `harness.yaml`
  layer that used to sit in front of it was removed in 0.4.0.
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

## devcontainer layout

The harness's own devcontainer lives in the one conventional location — top-level
**`.devcontainer/`** — rather than split across `.oh/`. It holds:

- the build/bootstrap assets: `Dockerfile`, `docker-compose.yml` + the
  `docker-compose.hermes-dashboard.yml` overlay, `entrypoint.sh`,
  `client-slack-supervise.sh`, `seed-msg-bridge.sh`;
- the VS Code `devcontainer.json` (hand-maintained; its `dockerComposeFile` points
  at the same-dir `docker-compose.yml`) plus the user-owned `.env`.

The CI hadolint/shellcheck boot-lint, the `.oh/scripts` lifecycle wrappers, and
the `dockerComposeFile` reference all point at `.devcontainer/`. The directory is
pinned to root by the devcontainer spec / `.dockerignore` / hadolint (which don't
honor a symlinked directory), so it is the one harness surface that intentionally
stays outside the `.oh/` control plane. The consolidated layout is guarded by the
`oh-devcontainer-restructure` eval probe.

This is **separate** from `.oh/templates/.devcontainer/`, the downstream scaffold
the `oh` CLI copies into *consumer* repos (which mount at `/home/sandbox/project`)
— not this repo's own boot environment.

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

**The manifest excludes** `.oh/patches/` (repo-specific dependency patches). The
manifest omits `patches/**` from `include`, so the payload never vendors those files
into a consumer repo. The files remain in this repository. The manifest does not
include `docs/**`. Root `docs/` is project-owned source documentation and is not
copied or overwritten by `oh init` or `oh update`. The rendered Docusaurus docs
*site* remains external at
[`mifunedev/openharness-web`](https://github.com/mifunedev/openharness-web) (#536).

- **The manifest ships itself** — `manifest.json` is in `include`, so the policy
  **propagates forward**: a consumer's next `oh update` reads the *source's*
  manifest and inherits the same boundary.
- `templates/**` is pre-declared in `include` for PR #334 (the `oh init`
  templates); on this base it matches **nothing**, harmlessly.

**Back-compat (legacy mode):** a source with **no `.oh/manifest.json`** — or an
empty/invalid one — falls back to overlaying **all of `.oh/`**, exactly as
before, emitting a one-line `legacy mode` warning so the fallback stays visible.

**`rootInclude` — the one payload that lands outside `.oh/`.** A second list,
`rootInclude`, carries globs **relative to the repository root** and writes to
`<target>/` instead of `<target>/.oh/`. It exists for content that belongs at the
root of an equipped repo rather than inside the control plane; today it carries
`crons/**`. It has its own escape guard (`assertDestInRoot`), and it walks only
the top-level directories its own patterns name — never the whole repo root.
`exclude` applies to both lists.

**Boundary is preserved:** the `.oh/` payload **cannot reach outside `.oh/`**. Its
patterns are relative to `.oh/`, and the existing path-escape guard (writes land
only under `<target>/.oh/`) is **unchanged** — the manifest *narrows* the
payload, it never widens the write surface. The vendored skill pack
(`skills/**`, `agents/**`, `hooks/**`, `skills.lock`) ships through this same
manifest, so `oh init`/`oh update` carry it into a target with the rest of `.oh/`.

> **`oh init` seam:** both `oh init` and `oh update` honor this manifest — they
> vendor only the manifest-shipped `.oh/` payload (via `commands/init.ts`'s
> `copyOhPayload`) plus the `rootInclude` payload (`copyRootPayload`), so the
> skill pack arrives in one shot with no submodule step.

## Pointers

- `.oh/skills/harness-context/references/directory-readme.md` — the README-as-directory-anchor convention this file follows.
- `.oh/skills/` — the vendored provider-portable primitive pack (skills/agents/hooks), absorbed from the former `.mifune` submodule.
