# `.oh/` directory layout

A map of the `.oh/` control plane **as it exists today** — every real top-level
entry, what it holds, and who reads it. This page is **descriptive**: it
documents the current tree, not the aspirational normalized spec, and introduces
no new requirements.

For *why* `.oh/` exists and what earns a place in it (the governing principle —
"a dotdir namespace is earned by function-class"), see
[`.oh/README.md`](../.oh/README.md). This page complements that one: the README is
the rationale, this is the map. It does not restate the governing principle.

> Verify against reality with `ls .oh/`. If this table and the tree disagree,
> the tree wins — update this page.

## Top-level entries

Every entry below is present in a fresh clone unless noted otherwise.

| Entry | Kind | Purpose | Canonical consumer |
|---|---|---|---|
| `README.md` | file | Namespace anchor (keeps `.oh/` in a fresh clone) and the governing-principle doc for the control plane. | Humans; shipped forward via `manifest.json`. |
| `manifest.json` | file | `oh update` payload allowlist — an `{ include, rootInclude, exclude }` document. `include` globs are relative to `.oh/` and land in `<target>/.oh/`; `rootInclude` globs are relative to the repo root and land in `<target>/` (today: `crons/**`). | `oh update` (`.oh/cli`). |
| `skills.lock` | file | Pinned lockfile for the vendored skill pack (`skills.v1` schema). | `.oh/scripts/link-providers.sh` (vendored-pack validation). |
| `agents/` | dir | Provider-portable sub-agent definitions, one `<name>.md` per agent. Currently empty — no sub-agent ships with the harness. Audit routing belongs to `/audit`, not an agent registry. | Agent providers via symlinks (`.claude/agents` → `.oh/agents`); the Agent tool. |
| `cli/` | dir | The in-tree `oh` CLI — a standalone npm package built into the image as `/opt/oh`. | `npm --prefix .oh/cli`; the `oh` binary (`oh init` / `oh update`). |
| `evals/` | dir | The fitness-function suite — regression `probes/` (incl. `cc-safety-net-wiring.sh`, the destructive-command guard wiring probe), the `capability/` benchmark, trajectory `datasets/`, and the `RESULTS.md` scoreboard. | `/eval` and the `.oh/scripts` eval runner. |
| `hooks/` | dir | Provider-portable **secret-exposure** hook scripts (`deny-env-dump.sh`, `deny-secret-paths.sh`, `notify_slack.sh`, `warn-devtcp.sh`). The complementary **destructive-command** guard (cc-safety-net) is not a script here — it is a global binary baked into the image plus guard-wrapped entries in the provider configs (`.claude/settings.json`, `.codex/hooks.json`, the `npm:cc-safety-net` package in `.pi/settings.json`); see [security-considerations.md §3](security-considerations.md). | Agent providers via symlinks (`.claude/hooks` → `.oh/hooks`). |
| `install/` | dir | Container-install inputs (currently `banner.sh`) consumed while building/booting the sandbox. | `.devcontainer/Dockerfile` + `entrypoint.sh`. |
| `scripts/` | dir | Installer, lifecycle, cron-runtime, and eval-support scripts (`docker-compose.sh`, `cron-runtime.ts`, `locked-append.sh`, `migrate-harness-yaml.sh`, `link-providers.sh`, `git-maintenance.sh` — the file-invoked destructive-git shim the cc-safety-net guard permits by design, …). | The `oh` CLI, CI, `cron-runtime`, and the provider link step. |
| `skills/` | dir | The vendored provider-portable skill pack (one dir per skill). | Agent providers via symlinks (`.claude/skills`, `.codex/skills`, `.pi/skills` → `.oh/skills`); the Skill tool. |
| `tasks/` | dir | Spec task workdirs — ephemeral build scratch (`<slug>/prd.md`, `prd.json`, `prompt.md`, `progress.txt`). | `/spec execute`, the `cleanup-tasks` cron, and `/spec`. |
| `templates/` | dir | The `oh init` scaffold payload (`AGENTS.md`, `gitignore`, `.env.example`, `.devcontainer/`, `full/`) materialized into a fresh checkout. | `oh init` (`.oh/cli/src/commands/init.ts`). |

The root `docs/` directory is project-owned documentation, outside the `.oh/`
control plane and the `oh init`/`oh update` payload. The manifest omits
`patches/**` and `docs/**`.

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

- [`.oh/README.md`](../.oh/README.md) — the governing principle and the `.oh/`-vs-root boundary.
- [Descriptive `.oh/harness.yml` example](harness-manifest.md) — an example-only pointer map over the real `.oh/` surfaces, not a required manifest schema.
- [`.oh/skills/harness-context/references/directory-readme.md`](../.oh/skills/harness-context/references/directory-readme.md) — the README-as-directory-anchor convention.
