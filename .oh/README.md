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

This **supersedes** the earlier "earned by EXPORT only" rule. Two peer machinery
namespaces, split by what *kind* of thing they hold:

- **`.mifune/`** — provider-portable *primitives* (skills, agents, hooks),
  exported to the four agent providers via symlinks (`.claude/`, `.codex/`,
  `.pi/`, `.hermes/`).
- **`.oh/`** — *OpenHarness's own machinery* as one unit: the `oh` CLI (`cli/`),
  the Docusaurus docs-site builder (`docs/`, the sole pnpm-workspace member),
  installer + lifecycle scripts (`scripts/`), container-install inputs
  (`install/`), and user-local deploy config (`config.json`). The former
  top-level `packages/` folder was **retired** — its `oh` and `docs` packages
  moved in here.
- **repo root** — everything forced to root by *external* tooling
  (`.devcontainer/` for the devcontainer spec + Docker COPY, `harness.yaml`,
  `package.json`, `pnpm-*.yaml`, `.github/`, `.husky/`) **plus** live
  identity/state the harness edits in place (`context/`, `evals/`, `crons/`,
  `memory/`, `tasks/`, `workspace/`, and the markdown `docs/`+`blog/` content
  the `.oh/docs` site renders).

### Back-compat symlinks (the `.mifune` precedent)

The runtime-machinery directories (`scripts/`, `install/`) moved into `.oh/` but
keep **tracked back-compat symlinks at the old root paths** — exactly how
`.claude/skills` → `.mifune/skills` works:

| Old path (symlink) | Real location |
|---|---|
| `scripts/` | `.oh/scripts/` |
| `install/` | `.oh/install/` |

Every consumer pinning those literals — the ~7 skills and 2 cron bodies that call
`scripts/locked-append.sh`, the `Makefile`'s `COMPOSE := scripts/docker-compose.sh`,
the boot-lint shellcheck glob (`scripts/*.sh`), vitest's `scripts/__tests__/**`,
and the eval probes — keeps resolving through the symlink unchanged. Boot scripts
that self-resolve via `cd "$(dirname "$0")" && pwd` land on the repo root through
the symlink (bash logical `pwd`), so no path-resolution rewiring was needed.

The **package** directories (`cli/`, `docs/`) moved *without* a back-compat
symlink — the `packages/` folder is retired, and their consumers were repointed
directly to the real `.oh/` paths:

- **`npm --prefix packages/oh`** → `npm --prefix .oh/cli` (CI typecheck + release).
- **pnpm workspace** — `pnpm-workspace.yaml` now declares `.oh/docs`; the
  `pnpm --filter './packages/**'` selectors became `--filter './.oh/**'`, and the
  `docs:build`/`docs:dev`/`docs:serve` scripts use `--dir .oh/docs`.
- **Docker `COPY`** (`.devcontainer/Dockerfile`) — copies from `.oh/cli/` and
  `.oh/install/` (Docker's build context ignores symlinked directories anyway).
- **GitHub Actions `paths:` filters** — keyed on real diff paths, so `.oh/**` was
  added to `ci-harness.yml`/`sandbox-boot-guard.yml` and `docs.yml`'s filter +
  `working-directory` repointed to `.oh/docs`. (The legacy `scripts/**` /
  `install/**` / `packages/oh/**` filters are kept so the path probes stay green.)

## Contents

| File / dir | Purpose |
|------|---------|
| `README.md` | This file — the namespace anchor (keeps `.oh/` in a fresh clone) and the surface's documentation. |
| `cli/` | The in-tree `oh` CLI (standalone npm package; built into the image as `/opt/oh`). Old path: `packages/oh/` (no symlink — repointed). |
| `docs/` | The Docusaurus documentation site (sole `pnpm-workspace.yaml` member; `@openharness/docs`). Renders the markdown in root `docs/`+`blog/`. Old path: `packages/docs/` (no symlink — repointed). |
| `install/` | Container-install inputs (`.zshrc`, `.tmux.conf`, `banner.sh`, `install.sh` prerequisites) consumed by the Dockerfile + entrypoint. Old path: `install/` (back-compat symlink kept). |
| `scripts/` | Installer, lifecycle, cron-runtime, and eval-support scripts (`docker-compose.sh`, `cron-runtime.ts`, `ralph.sh`, `locked-append.sh`, `harness-config.sh`, …). Old path: `scripts/` (back-compat symlink kept). |
| `config.json` | User-local, gitignored `composeOverrides[]` source. Read here first; legacy repo-root `config.json` is honored as a fallback. |

## What belongs here vs. at root

| Belongs in `.oh/` | Stays at root |
|------|------|
| OpenHarness's own machinery addressed as a unit: the `oh` CLI, the docs-site builder, installer/lifecycle scripts, container-install inputs, deploy/compose config | Surfaces **forced to root by external tooling** (`.devcontainer/`, `harness.yaml`, `package.json`, `pnpm-*.yaml`, `.github/`, `.husky/`) and **live identity/state** edited in place (`context/`, `evals/`, `crons/`, `memory/`, `tasks/`, `workspace/`, and the `docs/`+`blog/` markdown content) |

### Why these specifically stay at root

- `.devcontainer/` — the devcontainer spec + `.dockerignore`/hadolint pin it, and
  Docker COPY / the devcontainer resolver don't honor a symlinked directory.
- `docs/` + `blog/` — the markdown **content** (vs. the `.oh/docs` Docusaurus site
  that renders it); the Docusaurus config reaches them via `../../docs` /
  `../../blog`, which resolves identically because `.oh/docs` sits at the same
  depth `packages/docs` did.
- `harness.yaml` — the CI path filters and the `autopilot-preflight-gate` /
  `harness-ci-core-paths` / `sandbox-boot-guard-ci` probes pin it at repo root.
- `config.json` — relocated *logically* to `.oh/config.json` (now the canonical
  read location); the gitignored file itself is user-local runtime state, and the
  legacy repo-root path still works as a fallback for older installs.

## Pointers

- `context/directory-readme.md` — the README-as-directory-anchor convention this file follows.
- `docs/roadmap.md` — the B-state primitive-taxonomy migration; `.oh/` machinery grouping.
- `.mifune/` — the peer machinery namespace (provider-portable primitives), the relocation pattern this dir follows.
