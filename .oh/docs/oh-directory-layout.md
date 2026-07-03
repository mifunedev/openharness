# `.oh/` directory layout

A map of the `.oh/` control plane **as it exists today** — every real top-level
entry, what it holds, and who reads it. This page is **descriptive**: it
documents the current tree, not the aspirational normalized spec, and introduces
no new requirements.

For *why* `.oh/` exists and what earns a place in it (the governing principle —
"a dotdir namespace is earned by function-class"), see
[`.oh/README.md`](../README.md). This page complements that one: the README is
the rationale, this is the map. It does not restate the governing principle.

> Verify against reality with `ls .oh/`. If this table and the tree disagree,
> the tree wins — update this page.

## Top-level entries

Every entry below is present in a fresh clone unless noted otherwise.

| Entry | Kind | Purpose | Canonical consumer |
|---|---|---|---|
| `README.md` | file | Namespace anchor (keeps `.oh/` in a fresh clone) and the governing-principle doc for the control plane. | Humans; shipped forward via `manifest.json`. |
| `manifest.json` | file | `oh update` payload allowlist — an `{ include, exclude }` document of globs relative to `.oh/` that decides what gets vendored into an equipped repo. | `oh update` (`.oh/cli`). |
| `skills.lock` | file | Pinned lockfile for the vendored skill pack (`skills.v1` schema). | `.oh/scripts/link-providers.sh` (vendored-pack validation). |
| `agents/` | dir | Provider-portable sub-agent definitions (`pm`, `critic`, `implementer`, `auditor`, `skill-builder`, …). | Agent providers via symlinks (`.claude/agents` → `.oh/agents`); the Agent tool. |
| `cli/` | dir | The in-tree `oh` CLI — a standalone npm package built into the image as `/opt/oh`. | `npm --prefix .oh/cli`; the `oh` binary (`oh init` / `oh update`). |
| `context/` | dir | The always-on identity core read at session start (`SOUL.md`, `IDENTITY.md`, `TOOLS.md`, `USER.md`, `REPO_MAP.md`) plus the collapsed `rules/` provider pointers. | Session start per `AGENTS.md`; symlinked provider surfaces. |
| `crons/` | dir | Scheduled-agent cron definitions (`heartbeat.md`, `autopilot.md`, `cleanup-tasks.md`, `eval-weekly.md`, `prompt-miner.md`) plus the gitignored runtime `.cron.log`/`.pid`. | `.oh/scripts/cron-runtime.ts`. |
| `deploy/` | dir | Hosted-platform deploy assets. `deploy/railway/` holds the Railway hosted-smoke `Dockerfile`, `start.sh`, and status server behind the README deploy button. | Railway hosted-smoke deploy. |
| `docs/` | dir | The GitHub-readable markdown docs — this directory. Markdown only; no build machinery (the rendered site lives in [`mifunedev/openharness-web`](https://github.com/mifunedev/openharness-web)). | Humans on GitHub / DeepWiki. **Not** vendored by `manifest.json`. |
| `evals/` | dir | The fitness-function suite — regression `probes/`, the `capability/` benchmark, trajectory `datasets/`, and the `RESULTS.md` scoreboard. | `/eval` and the `.oh/scripts` eval runner. |
| `hooks/` | dir | Provider-portable hook scripts (`deny-env-dump.sh`, `deny-secret-paths.sh`, `notify_slack.sh`, `warn-devtcp.sh`). | Agent providers via symlinks (`.claude/hooks` → `.oh/hooks`). |
| `install/` | dir | Container-install inputs (currently `banner.sh`) consumed while building/booting the sandbox. | `.devcontainer/Dockerfile` + `entrypoint.sh`. |
| `memory/` | dir | The harness's long-term memory (`MEMORY.md` + topic notes, tracked) and gitignored dated session logs (`[0-9]*/log.md`). | `/retro` and the crons (via `locked-append.sh`); session start. |
| `scripts/` | dir | Installer, lifecycle, cron-runtime, and eval-support scripts (`docker-compose.sh`, `cron-runtime.ts`, `ralph.sh`, `locked-append.sh`, `harness-config.sh`, `link-providers.sh`, …). | The `Makefile`, CI, `cron-runtime`, and the provider link step. |
| `skills/` | dir | The vendored provider-portable skill pack (one dir per skill). | Agent providers via symlinks (`.claude/skills`, `.codex/skills`, `.pi/skills` → `.oh/skills`); the Skill tool. |
| `tasks/` | dir | Ralph/spec task workdirs — ephemeral build scratch (`<slug>/prd.md`, `prd.json`, `progress.txt`). | `.oh/scripts/ralph.sh`, the `cleanup-tasks` cron, `/spec` and `/ship-spec`. |
| `templates/` | dir | The `oh init` scaffold payload (`AGENTS.md`, `harness.yaml`, `gitignore`, `.devcontainer/`, `full/`) materialized into a fresh checkout. | `oh init` (`.oh/cli/src/commands/init.ts`). |

## Not in a fresh clone

Referenced by `.oh/README.md`'s Contents table but **not present** in the tracked
tree of a fresh clone:

- **`config.json`** — user-local, **gitignored** `composeOverrides[]` source
  (read by the `docker-compose` wrapper). It only appears once a user creates
  it; the legacy repo-root `config.json` is honored as a fallback.
- **`patches/`** — vendored pnpm dependency patches. Documented in
  `.oh/README.md` but **not currently present** at `.oh/patches/`; it is also
  intentionally omitted from `manifest.json`'s `include`, so it never ships to an
  equipped repo.

## Proposed, not present

The normalized-taxonomy spec (OH-RFC-0003, #532) sketches additional
function-class dirs. **None of these exist today** — they are proposed only, and
must not be treated as real until a change actually creates them:

`loops/` · `policies/` · `tools/` · `traces/` · `sessions/` · `artifacts/` ·
`registries/`

## See also

- [`.oh/README.md`](../README.md) — the governing principle and the `.oh/`-vs-root boundary.
- [Descriptive `.oh/harness.yml` example](harness-manifest.md) — an example-only pointer map over the real `.oh/` surfaces, not a required manifest schema.
- [`.oh/docs/roadmap.md`](roadmap.md) — the primitive-taxonomy migration this layout came out of.
- [`.oh/context/directory-readme.md`](../context/directory-readme.md) — the README-as-directory-anchor convention.
