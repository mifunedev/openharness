# Open Harness — Structure Spec

**Version:** 0.7
**Status:** Draft
**Repository:** github.com/ryaneggz/open-harness
**Builds on:** [`structure-spec-v0.6.md`](structure-spec-v0.6.md)

## Purpose of this version

v0.7 is **additive only** — no folder renames, no removed contracts, no breaking
frontmatter changes from v0.6. It resolves seven conflicts that surfaced
between v0.6 prose and shipped code, and it adds first-class sections for
harness packs, orchestrator-vs-workspace skill scope, the `oh` CLI's
deprecation, the canonical docs path, the canonical image name, the croner
runtime, the hook-execution mechanism, the memory directory format, and the
`tasks/<taskdesc>/` ↔ `.ralph/` distinction.

Where a v0.7 section restates a v0.6 topic in shorter form (`apps/web/`
Docusaurus config, eval-flakiness budget, wiki-sync rubric, blog authorship,
weekly cleanup), the v0.7 prose **supersedes** the v0.6 prose for that topic.
Everything else in v0.6 stands.

## Conflicts resolved by v0.7

| # | v0.6 said | Reality | v0.7 resolution |
|---|---|---|---|
| 1 | `wiki/` is at root | Docs live in `docs/wiki/` after #178 | §"Documentation source" |
| 2 | Devcontainer base = `ghcr.io/ruska-ai/sandboxes` | Image is `ghcr.io/ryaneggz/openharness` | §"Image name" |
| 3 | `oh` CLI is the substrate | `docker compose -f .devcontainer/docker-compose.yml` is canonical | §"oh CLI" |
| 4 | Hook mechanism unspecified | GitHub Actions for CI; local git hooks for pre-commit | §"Hook execution mechanism" |
| 5 | Skills set = 10 lifecycle commands | Orchestrator has its own skill set (`/release`, `/ci-status`, …) distinct from workspace skills | §"Orchestrator vs workspace agent skills" |
| 6 | Croner mentioned but not specified | Croner runtime now owned by a tiny `scripts/cron-runtime.ts` | §"Croner runtime" |
| 7 | Memory paths shown as `memory/YYYY-MM-DD/` and as flat `memory/<date>.md` | Directory-per-day is canonical; flat files deprecated | §"Memory structure" |

## Resolved in this version (v0.7 amendments)

- **Harness packs** → 10-key `harness.json` contract with three source modes
  (npm / git / local), registry at `.openharness/harnesses.json`. See
  §"Harness Packs" below.
- **Orchestrator vs workspace skill scope** → two-tier model. SPEC's named
  skills are workspace-agent scope; orchestrator has its own small set.
  See §"Orchestrator vs workspace agent skills".
- **`oh` CLI** → deprecated in v0.7; `docker compose` is canonical. See
  §"oh CLI".
- **Documentation source** → `docs/wiki/` is canonical (not bare `wiki/`).
  See §"Documentation source".
- **Image name** → `ghcr.io/ryaneggz/openharness` is the only image name
  any workflow writes. See §"Image name".
- **Croner runtime** → a single `scripts/cron-runtime.ts` reads
  `crons/*.md` frontmatter and runs each cron's body as an agent prompt.
  Started by `entrypoint.sh` in a `system-cron` tmux session. See
  §"Croner runtime".
- **Hook execution mechanism** → GitHub Actions for CI-side hooks; local
  git hooks (via `.pre-commit-config.yaml`) for pre-commit / pre-push.
  See §"Hook execution mechanism".
- **Memory structure** → directory-per-day (`memory/YYYY-MM-DD/`) is
  canonical; flat `memory/*.md` files are deprecated. See §"Memory structure".
- **Tasks vs `.ralph/`** → `tasks/<taskdesc>/` is canonical; `.ralph/`
  is deprecated. See §"Tasks vs .ralph".

## Harness Packs

A **harness pack** is an installable extension bundle that adds
agents, skills, crons, compose overlays, or workspace seed files to an
existing harness. Packs let third parties ship coherent configurations
(e.g., `@ryaneggz/mifune` ships the Pi/Mom Slack agent) without
forking the harness.

### `harness.json` contract

Every pack root contains a `harness.json` manifest. The manifest is a
small flat object — exactly these ten keys, no nesting beyond what
each value requires:

| Key | Type | Purpose |
|---|---|---|
| `name` | string | Pack identifier; matches npm package name when published |
| `version` | semver string | Pack version |
| `description` | string | One-line summary; surfaced by `oh harness list` (or successor) |
| `agents` | string[] | Subagent definitions to merge into `.claude/agents/` |
| `skills` | string[] | Skill directories to merge into `.claude/skills/` |
| `crons` | string[] | Cron files to merge into `crons/` |
| `composeOverlays` | string[] | Docker Compose files merged into `.openharness/config.json` `composeOverrides` |
| `hooks` | string[] | Lifecycle hook files (GitHub Actions YAML or git-hook scripts) |
| `workspace_seed` | string \| null | Optional path inside the pack containing files to copy into `workspace/` on first install only |
| `postInstall` | string \| null | Optional shell command run inside the sandbox once after merge |

All array values are paths *relative to the pack root*. The installer
resolves them to absolute paths inside the harness checkout.

### Source modes

A pack reference can be installed from any of three sources:

- **npm** — `@scope/name` or `name`. Resolved via the npm registry; the
  installer does `npm pack` (no install) and unpacks the tarball into
  `~/.openharness/packs/<name>@<version>/`.
- **git** — `git+https://…` or `git+ssh://…`. Cloned into
  `~/.openharness/packs/<name>@<sha>/`.
- **local** — `file:./relative/path` or absolute path on the host.
  Symlinked (not copied) so iterative pack development sees changes
  immediately.

### Registry

Installed packs are tracked in `.openharness/harnesses.json` at the
harness root:

```json
{
  "packs": [
    {
      "name": "@ryaneggz/mifune",
      "version": "0.4.2",
      "source": "npm",
      "installedAt": "2026-04-29T18:14:00Z"
    }
  ]
}
```

The registry is the source of truth for which packs are active. Removing
a pack means removing its entry and re-running the merge step (which
removes orphaned files the pack previously contributed). Hand-editing
the registry is permitted but should be followed by a re-merge.

### `workspace_seed` semantics

`workspace_seed` is **first-install-only**. The installer copies the
seed directory's contents into `workspace/` *if and only if* the
target file does not already exist. Updating a pack does not overwrite
existing workspace files — packs that need to ship a workspace evolution
must use a migration script (out of scope for v0.7).

### Pack mechanism status in v0.7

The original CLI-driven pack installer (`oh harness add …`) is removed
along with `packages/sandbox/` (see §"oh CLI"). For v1, mifune
installation reverts to `git clone` + manual `cp` of the documented
files into `crons/`, `.claude/agents/`, etc. A standalone pack-add
script (~50 LOC) may return in v0.8 once the security gaps in the
original installer (command injection in `fetchGitPack`, path
traversal in `registerComposeOverlays`) are addressed.

## Orchestrator vs workspace agent skills

The harness has **two agent contexts** with **different skill sets**:

- **Workspace agent** — runs *inside* the sandbox in
  `workspace/`, building the user's project. Loads the SPEC's
  ten lifecycle skills (`/spec`, `/plan`, `/build`, `/test`, `/review`,
  `/ship`, `/ralph`, `/promote`, `/post`, `/wiki-sync`). Skills here are
  about *making the project*.
- **Orchestrator** — runs at the harness root, managing
  sandbox lifecycle, releases, CI status, and infra. Loads its own
  small set (`/release`, `/ci-status`, `/cloudflared-tunnel`,
  `/agent-browser`). Skills here are about *running the harness*.

The two sets do not overlap and should not be merged. A skill that
belongs to one context but is useful in the other should be either
duplicated (rare) or moved to a pack that ships it to both (preferred).

The orchestrator skill set is intentionally small (≤5) and defensible.
Skills that grew up at root but belong elsewhere — `delegate`,
`harness-audit`, `strategic-proposal`, `skill-lint`, `prd`, `ralph`,
`heartbeat` — are removed in v0.7 (see corresponding migration PRs).

## oh CLI

**Status: deprecated.** The `@openharness/sandbox` package and the `oh`
binary it shipped are removed in v0.7. The canonical substrate is
`docker compose` against `.devcontainer/docker-compose.yml`.

| Old | New |
|---|---|
| `oh sandbox` | `docker compose -f .devcontainer/docker-compose.yml up -d --build` |
| `oh shell` | `docker exec -it -u sandbox openharness zsh` |
| `oh clean` | `docker compose -f .devcontainer/docker-compose.yml down -v` |
| `oh expose <name> <port>` | manually edit `.openharness/config.json` `composeOverrides` to include `docker-compose.gateway.yml`; document in `docs/operations/` |
| `oh harness add <pack>` | manual `git clone` + copy per pack's README (see §"Harness Packs") |

`.openharness/config.json` is preserved — it still supplies
`composeOverrides` to the base compose file. It becomes a manually-
edited file.

`install.sh` is rewritten to a docker-only flow: clone repo → `docker
compose up -d --build` → print next-steps. The `--cli`, `--with-cli`,
and `--install-node` branches are removed.

## Documentation source

The canonical documentation path is **`docs/`**, with `docs/wiki/` for
agent-tended durable knowledge and `docs/` (the parent) for
human-curated entry-point pages (`intro.md`, `quickstart.md`,
`installation.md`, etc.). v0.6 said `wiki/` at root and listed `docs/`
under "deliberately omits"; that statement is **superseded** — `docs/`
is the source of truth (see #178).

`apps/docs/` is a Docusaurus site that builds *from* `docs/` via
`path: '../../docs'`. The site adds blog rendering and theme; it does
not own content.

`wiki/internal/` and `wiki/public/` from the v0.6 wording map to
`docs/wiki/` (single tree; the public/internal split was not adopted).

## Image name

The canonical image name is **`ghcr.io/ryaneggz/openharness`** (no
hyphen). This is the only name any workflow writes. The v0.6 reference
to `ghcr.io/ruska-ai/sandboxes` is **removed**. The hyphenated
`ghcr.io/ryaneggz/open-harness` produced by the legacy `build.yml`
workflow is also removed when that workflow is deleted (see migration
PR for US-007).

`release.yml` is the sole image producer; it tags both `<version>` and
`latest`.

## Croner runtime

**Owner.** `scripts/cron-runtime.ts` (≤120 LOC). It is the harness's
only scheduler. The previous heartbeat daemon (~1,900 LOC across
`packages/sandbox/src/lib/heartbeat/`, the `heartbeat-daemon` binary,
and per-task watchdogs) is removed.

**Substrate.** `croner` (npm). One process, file-driven, no DB.

**Inputs.** Every file matching `crons/*.md`. Frontmatter shape is
the v0.6 contract (`id`, `schedule`, `timezone`, `enabled`, `overlap`,
`catchup`, optional `maxRuns`). Files with `enabled: false` are
skipped. The body of the markdown is the prompt handed to the agent
when the cron fires.

**Agent invocation.** Default is `claude -p`. Configurable via env
var `CRON_AGENT_BIN` (e.g., `codex`, `gemini`).

**Logging.** Single append-only file at `crons/cron-runtime.log`,
formatted as `<ISO timestamp>\t<cron id>\t<status>\t<elided body or
error>`.

**Concurrency / restart.**

- Single-instance enforced via PID lock at `crons/.pid`. Startup
  refuses to run a second copy if the PID is alive.
- Per-cron `overlap: false` means a fire is dropped if the previous
  invocation is still running.
- Catchup defaults to `false` — missed jobs during downtime do not
  fan out as a burst.
- `SIGTERM` flushes the in-flight invocations and releases the PID
  lock cleanly.

**Startup.** Launched by `.devcontainer/entrypoint.sh` in a tmux
session named `system-cron` per `.claude/rules/sandbox-processes.md`:

```bash
tmux new-session -d -s system-cron \
  'node scripts/cron-runtime.ts 2>&1 | tee /tmp/system-cron.log'
```

**Restart policy.** If the tmux session dies, the entrypoint
relaunches it on the next container start. Within a running container,
restart is manual (`tmux kill-session -t system-cron && tmux new-session
…`). A future supervisor (out of scope for v0.7) may auto-relaunch.

## Hook execution mechanism

Hooks fire on lifecycle events. v0.7 is explicit about which mechanism
runs which hook.

| Hook category | Mechanism | Location |
|---|---|---|
| Pre-commit (deterministic test subset, lint) | git hooks via `.pre-commit-config.yaml` (`pre-commit` framework) | `.pre-commit-config.yaml` at root |
| Pre-push (optional fast guards) | git hooks via `pre-commit` framework | same file, `default_stages: [pre-push]` |
| PR checks (full test suite, wiki-sync gate, build verification) | GitHub Actions | `.github/workflows/*.yml` |
| Cron-driven hooks (heartbeat, weekly cleanup) | croner (see §"Croner runtime") | `crons/*.md` |
| Post-PR hooks (e.g., `wiki-sync` scoring) | GitHub Actions, run after PR creation | `.github/workflows/post-pr-*.yml` |

Mix-and-match per hook type. The rule: **CI work runs in GitHub
Actions; local-developer work runs in git hooks; recurring background
work runs in croner**. A hook that doesn't fit any of these three
buckets is probably mis-categorized.

## Memory structure

**Canonical: `memory/YYYY-MM-DD/` directory per day.**

Each day's directory contains the v0.6 file set (`log.md`,
`decisions.md`, `artifacts/`, `tasks/`). This is the format the
agent must use; it survives across SPEC versions.

**Deprecated: flat `memory/<date>.md` files.** Some legacy code paths
created flat per-day markdown files at the harness root; these are
not canonical and should be migrated to `memory/<date>/log.md` when
encountered. New code MUST NOT create flat files.

The harness root holds only the *orchestrator's* memory; workspace
agents have their own `workspace/memory/YYYY-MM-DD/` (when present).
Both follow the directory-per-day rule.

## Tasks vs .ralph

**Canonical: `tasks/<taskdesc>/`.** This is the v0.6 contract and
remains the single source of truth for active Ralph loop state
(`prd.md`, `prd.json`, `prompt.md`, `progress.txt`).

**Deprecated: `.ralph/`.** Earlier scaffolds placed Ralph state under a
hidden `.ralph/` directory (often inside `workspace/`). This is
deprecated — agents should not write to `.ralph/`. When migrating an
existing `.ralph/<taskdesc>/` folder, move its contents to
`tasks/<taskdesc>/` at the appropriate root (orchestrator: harness
root; workspace agent: `workspace/`).

The reason for one canonical path: `scripts/ralph.sh` and the SPEC's
`/ralph` skill both expect the same place; two paths means two
implementations.

## Shrunk sections (supersede v0.6)

These topics were over-specified in v0.6. v0.7 keeps the contract and
drops the rationale (rationale lives in `docs/wiki/decisions/` if
needed).

### `apps/web/` Docusaurus config

Docusaurus is configured to load docs from `docs/` (relative path
`../../docs` from `apps/docs/docusaurus.config.ts`) and blog from
`blog/`. Sidebar generation is autogenerated from folder structure
and frontmatter `sidebar_position`. Specific JS snippet lives in
the Docusaurus config file, not in this spec.

### Eval flakiness

Eval tests are property-based; expected pass rates are documented per
test in `tests/skills/<name>/FLAKINESS.md`. Persistent failure below
the documented threshold is a regression. Flakiness above 10% means
the test is too brittle.

### Wiki-sync rubric

`/wiki-sync` produces a 1–5 score plus a one-line justification,
written to `memory/<today>/decisions.md`. Scoring details live in
`.claude/skills/wiki-sync/SKILL.md` (when the skill is implemented),
not in this spec.

### Blog authorship

Default: project owner authors; agent ghostwrites from `memory/`
decisions and milestones; owner reviews and ships. Subject to revision
in a future blog-authorship decision doc.

### Weekly cleanup cron

`crons/cleanup-tasks.md` runs Sunday 23:00 local. For each
`tasks/<taskdesc>/` whose `progress.txt` ends with `STATUS: COMPLETE`,
it kills the matching tmux session (if any) and moves the folder to
`memory/<today>/tasks/<taskdesc>/`. Incomplete tasks are left alone
with a note appended to `memory/<today>/log.md`.

## Open questions for v0.8

- **Standalone pack installer.** Is a 50-LOC bash `oh harness add` worth
  rebuilding once the security gaps are addressed (URL allowlisting,
  signature verification, sandboxed install, command-injection-safe
  spawn, path-traversal validation)?
- **Workspace agent skill set source.** SPEC names ten lifecycle
  skills but they are not yet implemented. Who builds them, and where
  do they live (`.claude/skills/` at workspace root, or shipped as a
  pack)?
- **Pack manifest evolution.** Does `harness.json` need a `dependencies`
  field for packs that depend on other packs?
- **Cron supervisor.** A `system-cron` tmux session that crashes mid-
  run currently requires manual restart. Worth adding a supervisor?
- **Memory archive policy.** With directory-per-day canonical, the
  `memory/` tree grows unbounded. Compression / archive policy?
- **Cross-tool adapter generator.** Cursor/`.cursor/rules/` and Gemini
  CLI/`GEMINI.md` still need adapters generated from canonical `SKILL.md`.

## Versioning

Same convention as v0.6: breaking changes to folder names, file
contracts, or required frontmatter warrant a major bump; additive
changes warrant a minor bump. v0.7 is a minor bump — every section is
either new (additive) or shorter prose for an existing v0.6 section
(supersedes; no contract change).
