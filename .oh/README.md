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
  provider-portable *primitives* — `skills/`, `hooks/` (+ `skills.lock`)
  — exported to the four agent providers via symlinks (`.claude/`, `.codex/`,
  `.pi/`, `.hermes/`): the `oh` CLI (`cli/`), installer + lifecycle scripts
  (`scripts/`), container-install inputs (`install/`), the
  regression/capability eval suite (`evals/`), the durable repository-knowledge
  surface (`knowledge/`), user-local deploy
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
  eval suite stays under `.oh/evals/`, durable repository knowledge under
  `.oh/knowledge/`, and the Ralph/spec task workdirs under `.oh/tasks/`. The
  worktree root (`.worktrees/`) and the project-clone root
  (`projects/`) sit at the repo root, because a repository keeps its worktrees at
  its own root and a project clone is a peer repo, not control-plane machinery;
  the rendered docs site and the `blog/` archive
  live in `mifunedev/openharness-web`.

### Relocated into `.oh/` (no back-compat symlinks)

The runtime-machinery directories (`scripts/`, `install/`, `evals/`) moved into `.oh/`
**without** back-compat symlinks at the old root paths — every consumer was
repointed to the real `.oh/…` location:

| Old path | Real location |
|---|---|
| `scripts/` | `.oh/scripts/` |
| `install/` | `.oh/install/` |
| `evals/` | `.oh/evals/` |

Every consumer pinning those literals was updated: the skills and cron bodies that
call `.oh/scripts/locked-append.sh`, the boot-lint shellcheck glob, vitest's `.oh/scripts/__tests__/**`, the eval probes,
in `docker-compose.yml`, `entrypoint.sh`, and `cron-runtime.ts`. Nothing reads
the bare root paths anymore.

The cron definitions went the other way. They briefly lived at `.oh/crons/` and
moved back **out** to the repo root as `crons/`, because a schedule authored per
deployment is operator content, not machinery Open Harness ships. The runtime
always reads `crons/`, and `oh update` delivers them through the manifest's
`rootInclude` list rather than the `.oh/` payload.

The relocated task workdirs (`tasks/` → `.oh/tasks/`) moved **without** a
back-compat symlink — every consumer was repointed to the real `.oh/tasks/` path
directly (the `cleanup-tasks` cron, the `/spec execute` task graph, the eval probes, and
the `.mifune` skill/agent references), because git index operations cannot traverse
a symlink and nothing reads the bare `tasks/` path anymore.

The ignored worktree root briefly lived at `.oh/worktrees/` and moved back **out**
to the repo root as `.worktrees/`, with no back-compat symlink in either
direction. The location is a fixed convention rather than a setting.
Clones of non-harness repositories, formerly `.oh/worktrees/project/<owner>/<repo>/`,
now live at `projects/<owner>/<repo>/`, and
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

The shared skills and hooks are vendored directly under `.oh/` (`.oh/skills`, `.oh/hooks`) and tracked in this repo — there is no submodule and no network fetch. `oh update` lays the pack down with the rest of `.oh/`; `.oh/scripts/link-providers.sh --init` (re)creates the provider symlinks into it, and `--check` verifies the vendored pack is present, the required executables, the protected paths, the provider symlinks, and the Hermes link when enabled.

`.pi/` remains the Pi provider surface in v1; its `.pi/skills` is one of the symlinks into `.oh/skills`.

## Contents

| File / dir | Purpose |
|------|---------|
| `README.md` | This file — the namespace anchor (keeps `.oh/` in a fresh clone) and the surface's documentation. |
| `cli/` | The in-tree `oh` CLI (standalone npm package; built into the image as `/opt/oh`). Old path: `packages/oh/` (no symlink — repointed). |
| `install/` | Container-install inputs (`.zshrc`, `.tmux.conf`, `banner.sh`, `install.sh` prerequisites) consumed by the Dockerfile + entrypoint. Old path: `install/` (no symlink — repointed). |
| `scripts/` | Installer, lifecycle, cron-runtime, and eval-support scripts (`docker-compose.sh`, `cron-runtime.ts`, `locked-append.sh`, `harness-config.sh`, …). Old path: `scripts/` (no symlink — repointed). |
| `evals/` | The fitness-function suite — regression probes (`probes/`), capability benchmark (`capability/`), trajectory datasets (`datasets/`), and the `RESULTS.md` scoreboard. Old path: `evals/` (no symlink — repointed). |
| `knowledge/` | Durable repository knowledge — `source/` and `patterns/` entity pages, `raw/` immutable external snapshots, gitignored `local/` scratch, and the generated `README.md` index. The `/wiki` skill owns the procedure; this directory owns the data. |
| `patches/` | Vendored pnpm dependency patches (applied at install via `package.json` `patchedDependencies`). |
| `config.json` | User-local, gitignored `composeOverrides[]` source. Read here first; legacy repo-root `config.json` is honored as a fallback. |

## What belongs here vs. at root

| Belongs in `.oh/` | Stays at root |
|------|------|
| OpenHarness's own machinery addressed as a unit: the `oh` CLI, installer/lifecycle scripts, container-install inputs, compose config, the fitness-function eval suite (`.oh/evals/`), the durable repository-knowledge surface (`.oh/knowledge/`), and the Ralph/spec task workdirs (`.oh/tasks/`) | Human-facing Markdown docs (`docs/`) plus the scheduled-agent cron definitions (`crons/`), and surfaces **forced to root by external tooling** (`.devcontainer/`, `package.json`, `pnpm-*.yaml`, `.github/`, `.husky/`) |

### Why these specifically stay at root

- `.devcontainer/` — the **full devcontainer**, pinned to root by the devcontainer
  spec / `.dockerignore` / hadolint (which don't honor a symlinked directory). It
  holds the VS Code `devcontainer.json`, the user-owned `.env`, and every build
  asset: `Dockerfile`, `docker-compose.yml` + the docker-socket and sshd
  overlays, `entrypoint.sh`, and the two client scripts (`client-slack-supervise.sh` /
  `seed-msg-bridge.sh`). Everything the sandbox boots from lives here, in the one
  conventional location — no split, no compat shim.
- `oh.json` and `.env.example` — the two authored configuration surfaces, and
  both live at the repository *root*, not here. Tracked `oh.json` holds every
  non-secret setting; tracked `.env.example` documents the secrets-only,
  gitignored root `.env`, to which `.devcontainer/.env` is a symlink. The CI
  path filters and the `harness-ci-core-paths` / `sandbox-boot-guard-ci` probes
  pin both. See [`docs/configuration.md`](../docs/configuration.md).
- `config.json` — relocated *logically* to `.oh/config.json` (now the canonical
  read location); the gitignored file itself is user-local runtime state, and the
  legacy repo-root path still works as a fallback for older installs.

## Project-root seam

`OH_PROJECT_ROOT` is `/home/sandbox/harness`, fixed. It is no longer configurable:
the sandbox home is one mount at `/home/sandbox` and the checkout is nested inside
it, so a relocatable project root buys nothing ([#898](https://github.com/mifunedev/openharness/issues/898)).
The image pins it (`ENV OH_PROJECT_ROOT=/home/sandbox/harness`), and devcontainer
and `.oh/scripts` consumers keep reading `${OH_PROJECT_ROOT:-/home/sandbox/harness}`
rather than the bare literal. `HARNESS` remains a back-compat alias
(`HARNESS="${HARNESS:-$OH_PROJECT_ROOT}"`); prefer `$OH_PROJECT_ROOT` in new code.
The fixed definition is guarded by `.oh/evals/probes/worktrees-layout.sh`.

## devcontainer layout

The harness's own devcontainer lives in the one conventional location — top-level
**`.devcontainer/`** — rather than split across `.oh/`. It holds:

- the build/bootstrap assets: `Dockerfile`, `docker-compose.yml` + the
  `docker-compose.docker-sock.yml` and `docker-compose.ssh.yml` overlays,
  `entrypoint.sh`, `client-slack-supervise.sh`, `seed-msg-bridge.sh`;
- the VS Code `devcontainer.json` (hand-maintained; its `dockerComposeFile` points
  at the same-dir `docker-compose.yml`) plus the user-owned `.env`.

The CI hadolint/shellcheck boot-lint, the `.oh/scripts` lifecycle wrappers, and
the `dockerComposeFile` reference all point at `.devcontainer/`. The directory is
pinned to root by the devcontainer spec / `.dockerignore` / hadolint (which don't
honor a symlinked directory), so it is the one harness surface that intentionally
stays outside the `.oh/` control plane. The consolidated layout is guarded by the
`oh-devcontainer-restructure` eval probe.

The `oh` CLI bundles these compose files as text and re-materialises them into a
sandbox's registry entry (`${OH_HOME:-~/.oh}/sandboxes/<name>/`) on every
lifecycle call, so an installed binary needs no checkout to boot a sandbox. The
copies in an entry are generated; this directory is their source of truth.

## oh update — vendor and upgrade the control plane

`oh update` writes **only the `.oh/` control plane and `crons/`** into the
current directory. It is the single bootstrap *and* upgrade path: an empty
directory is equipped from scratch (a missing target `.oh/` reads as version
`0.0.0`), and an equipped one is upgraded. Project source — anything *outside*
`.oh/` and `crons/` — is left untouched, and it writes no `oh.json`, `.env`,
`AGENTS.md`, `.gitignore`, `.devcontainer/`, or provider directory. It never
prompts.

**Usage:**

```bash
oh update [--from <dir> | --from-remote [--ref <ref>]] [--dry-run] [--force]
```

- Payload precedence: `--from <built-checkout>` > `--from-remote [--ref <ref>]` >
  the CLI's own bundled payload (found by its manifest marker) > a remote fetch
  announced on one line.
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
copied or overwritten by `oh update`. The rendered Docusaurus docs
*site* remains external at
[`mifunedev/openharness-web`](https://github.com/mifunedev/openharness-web) (#536).

- **The manifest ships itself** — `manifest.json` is in `include`, so the policy
  **propagates forward**: a consumer's next `oh update` reads the *source's*
  manifest and inherits the same boundary.
- The manifest declares no scaffold payload. The CLI writes no consumer-root
  files at all, so the operator owns `AGENTS.md`, `.gitignore`, and every
  provider file.

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
(`skills/**`, `hooks/**`, `skills.lock`) ships through this same
manifest, so `oh update` carries it into a target with the rest of `.oh/`. It
vendors only the manifest-shipped `.oh/` payload plus the `rootInclude` payload,
so the skill pack arrives in one shot with no submodule step.

## Pointers

- `.oh/skills/harness-context/references/directory-readme.md` — the README-as-directory-anchor convention this file follows.
- `.oh/skills/` — the vendored provider-portable primitive pack (skills/hooks), absorbed from the former `.mifune` submodule.
