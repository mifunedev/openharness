# .oh/

OpenHarness machinery that is still part of the core repo. The rendered docs
site was migrated to [`mifunedev/openharness-web`](https://github.com/mifunedev/openharness-web); this namespace now holds only runtime/installer machinery.

## Contents

| File / dir | Purpose |
|---|---|
| `README.md` | This namespace anchor. |
| `cli/` | The in-tree `oh` CLI (standalone npm package; built into the image as `/opt/oh`). |
| `install/` | Container-install inputs consumed by the Dockerfile and entrypoint. Old root path: `install/` symlink. |
| `scripts/` | Installer, lifecycle, cron-runtime, eval-support, and Ralph helper scripts. Old root path: `scripts/` symlink. |
| `config.json` | User-local, gitignored compose override source. Legacy repo-root `config.json` remains a fallback. |

## What belongs here vs. elsewhere

| Belongs in `.oh/` | Stays at repo root | Moved out |
|---|---|---|
| OpenHarness runtime machinery addressed as a unit: CLI, installer/lifecycle scripts, container-install inputs, deploy/compose config | External-tooling-forced surfaces (`.devcontainer/`, `harness.yaml`, `package.json`, `pnpm-*.yaml`, `.github/`, `.husky/`) and live identity/state (`context/`, `evals/`, `crons/`, `memory/`, `tasks/`, `workspace/`, `docs/`) | Docusaurus site app, theme/assets, and blog archive → `mifunedev/openharness-web` |

## Pointers

- `README.md` — concise user entrypoint.
- `docs/README.md` — GitHub-readable docs index.
- `context/directory-readme.md` — README-as-directory-anchor convention.
