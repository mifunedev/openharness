# PRD: Retire `oh init` and `oh runtime`; `oh sandbox install docker` owns sandbox configuration

**Issue:** [#950](https://github.com/mifunedev/openharness/issues/950) · **Prefix:** `task` · **Repo:** `mifunedev/openharness` · **Base:** `task/948-one-door` (stacked on #949; retargets to `development` when #949 merges)
**Source plan:** `.claude/plans/happy-watching-sloth.md` (approved by the operator in this session)

## Introduction

`oh init` does five unrelated things: it vendors the `.oh/` + `crons/` payload (shared with `oh update`), copies a consumer-root scaffold (`AGENTS.md`, `CLAUDE.md`, `.gitignore` lines, `.env.example`, `templates/full/**`, provider symlinks), copies `.devcontainer/` and generates `devcontainer.json`, writes `oh.json` through a wizard, and prints next steps. Every lifecycle verb then requires standing inside that equipped checkout (`resolveProjectRoot` walks up to `.oh/`), and `oh runtime` is a catalog report plus one nested installer (`msb` inside the sandbox). The CLI ships no assets, so an installed binary has nothing to run a sandbox from.

Operator decision: each verb owns its own configuration, and creating a sandbox must not depend on being inside a project. The flow becomes

```
oh sandbox install docker   → wizard (name, timezone, git identity, SSH/port/Docker socket)
oh shell <sandbox-name>
oh tool install herdr
```

A sandbox's configuration is a **registry entry** under `${OH_HOME:-~/.oh}/sandboxes/<name>/`. The entry is a root with the exact layout `.oh/scripts/docker-compose.sh` already expects: `oh.json`, `.env`, `.devcontainer/docker-compose.yml` (+ the ssh and docker-sock overlays), `.oh/scripts/docker-compose.sh` and `check-host-port.sh`. The CLI bundles those five files as text at build time and re-materialises them into the entry on every lifecycle call. Without `--repo` the base is today's image-only compose file; with `--repo <dir>` it is today's flavor-A file, which gains `${OH_REPO_DIR:-..}` for the bind mount and build context. `oh update` becomes the bootstrap that equips an empty checkout with `.oh/` + `crons/` and writes no scaffold. `oh init`, `oh runtime`, and `.oh/templates/` are deleted; `microsandbox` becomes `oh tool install microsandbox`; the runtime catalog (docker now, microsandbox planned) lives under `oh sandbox`.

## Goals

- `oh sandbox install docker` works from any directory, writes a registry entry, boots the container, and prints `oh shell <name>`; the default name is `oh-sbx-<n>` (lowest unused); `--yes` prompts zero times.
- `oh shell|stop|restart|logs|ps|destroy [name]` and `oh sandbox list` resolve sandboxes by name from anywhere; `oh destroy <name>` removes the entry after `down -v`.
- `oh config set|show --sandbox <name>` and `oh secret set --sandbox <name>` write the entry; without the flag they behave as today.
- `oh update` equips an empty checkout; `oh init`, `oh runtime`, `.oh/templates/` are gone; `microsandbox` is an installable tool with a pinned digest.
- Probes, docs, root context, and knowledge describe only the new flow; a registry child sandbox booted over the parent's Docker socket proves it end to end.

## Definition of Done

| # | Done means | Proof |
|---|---|---|
| D1 | Before: at the base commit `oh init --help` and `oh runtime --help` exist, `oh sandbox` needs an equipped repo, `oh update` in an empty dir refuses | transcript from the built CLI |
| D2 | After, from inside this parent over its Docker socket (`OH_EXECUTION_TARGET=docker-compose`, `OH_HOME` under the scratchpad): `oh sandbox install docker --name oh-child-after --yes` with `image.ref=openharness:one-door` writes `<OH_HOME>/sandboxes/oh-child-after/{oh.json,.env,.devcontainer/*,.oh/scripts/*}`, boots the container, passes the healthcheck; `oh sandbox list` shows it; `oh ps oh-child-after` and `oh logs oh-child-after` resolve by name; `docker exec … oh tool install herdr && herdr --version` exits 0; `oh destroy oh-child-after` removes container, volume, and the entry; no `oh-child-*` remains | transcript in `evidence.md` and the PR body |
| D3 | `oh sandbox install docker --yes` twice with no `--name` produces `oh-sbx-1` then `oh-sbx-2`; `--repo <equipped dir>` renders `OH_REPO_DIR=<abs>` into `compose.env` and selects the flavor-A base; `--print-argv` writes nothing | `sandbox.test.ts` / `registry.test.ts` |
| D4 | The wizard on a TTY asks exactly name, timezone, git name/email, SSH (y/n, port), Docker socket; seeds defaults from `<repo>/oh.json` when `--repo` points at a checkout that has one; `--yes` prompts zero times | tests with a scripted TTY; D2 transcript |
| D5 | Bare `oh update --from <checkout>` equips an empty directory; second run reports up to date; it writes no `oh.json`, `.env`, `AGENTS.md`, `.gitignore`, `.devcontainer/` | `oh-update-bootstrap.sh` PASS |
| D6 | No `init`/`runtime` surface: `git grep -nE 'oh init|oh runtime|lib/runtimes/catalog|\.oh/templates|runInit|resolveInitSource|parseInitArgs|parseRuntimeArgs' -- . ':!CHANGELOG.md' ':!.oh/tasks' ':!.oh/logs' ':!docs/rfcs'` returns only negative-assertion guards | one grep, allowlist compared |
| D7 | `microsandbox` is an installable tool with a pinned installer digest; `oh sandbox install microsandbox` refuses with the RFC pointer | `oh tool list --json`; `harness-one-door.sh` PASS |
| D8 | `oh config set --sandbox <name>` / `oh secret set --sandbox <name>` write the entry; without `--sandbox` they write the project `oh.json`/`.env` as today | tests |
| D9 | Green locally: typecheck, build, `env -u SANDBOX_SSH pnpm test`, `bash .oh/skills/eval/run.sh` with no new REGRESSION; `compose-args.test.ts` and `execution-target-contract.sh` unchanged and green | exit codes |
| D10 | New probe `sandbox-registry.sh` bites: PASS on the head; REGRESSION when the bundled compose text drifts from `.devcontainer/*.yml`, or when a lifecycle verb builds `docker` argv outside the wrapper | fault-injection transcript |
| D11 | CI green: `sandbox-boot-guard` (flavor A, `..` default), `sandbox-compatibility`, unit suites | `/audit pr` promotable |
| D12 | Docs describe only the new flow; `docs/deployment-prebuilt-image.md` collapses into `oh sandbox install docker`; `docs/runtimes/*` describe `oh tool install microsandbox` and point the selector at the RFC; `AGENTS.md` lifecycle is `oh sandbox install docker` → `oh shell <name>` → `oh tool install herdr` and stays under 9500 B | D6 grep over docs; `context-tier-size-budget.sh` PASS |
| D13 | Knowledge: `oh-cli-portable-lifecycle`, `fresh-machine-setup`, `compose-env-boundary` UPDATED; every other NEEDS-REVIEW page resolved; index regenerated | `knowledge-impact.sh --changed`; `wiki-readme-index.sh` PASS |
| D14 | Untouched: parent `oh.json`, untracked `migrate-dotenv-settings.sh`, `docs/rfcs/` (one-line pointers only), the parent sandbox `oh-sbx-remote` itself | parent `git status`; `docker ps` |
| D15 | Landed per `/git` and `/spec`: issue #950, branch `task/950-sandbox-registry` in `.worktrees/`, draft PR undrafted after `/audit pr`, CHANGELOG, `evidence.md` | PR URL |

## User Stories

### US-001: The registry and `oh sandbox install docker | list`

**Description:** As an operator, I want `oh sandbox install docker` to create and boot a sandbox from any directory, so that a sandbox never depends on a project checkout.

**Acceptance Criteria:**

- [ ] `.oh/cli/src/lib/registry.ts` (new): `registryRoot()` = `${OH_HOME:-<homedir>/.oh}/sandboxes`; `entryRoot(name)`; `listEntries()`; `nextDefaultName()` returns `oh-sbx-<n>` for the lowest unused integer, skipping names that exist as entries or as running containers; `materialize(entry)` writes the bundled texts (image-only base without `repo`, flavor-A base with `repo`; `docker-compose.ssh.yml`; `docker-compose.docker-sock.yml`; `.oh/scripts/docker-compose.sh`; `.oh/scripts/check-host-port.sh`) inside the entry only; `resolveSandboxRoot({ name?, cwd })` resolves explicit name → the single registered entry → the entry whose `repo` contains `cwd` → an error that lists the registered names; names match `[a-z0-9][a-z0-9-]*`
- [ ] `.oh/cli/build.mjs` bundles `.devcontainer/docker-compose.yml`, `docker-compose.image-only.yml`, `docker-compose.ssh.yml`, `docker-compose.docker-sock.yml`, `.oh/scripts/docker-compose.sh`, `.oh/scripts/check-host-port.sh` as text (esbuild `loader`); `dist/oh.js` is still the only artifact
- [ ] `.oh/cli/src/commands/sandbox.ts` (new): `runSandboxInstall({ runtime, name, repo, yes, image, imageRef, noBuild, printArgv })` refuses any runtime other than `docker` (for `microsandbox`: "not a provisionable runtime yet; see docs/rfcs/rfc-runtime-support.md; inside a sandbox run `oh tool install microsandbox`"); runs the wizard only on a TTY without `--yes` (name, timezone, git name, git email, SSH y/n + port, Docker socket y/n), seeding defaults from `<repo>/oh.json` sandbox-level fields when `--repo` names a checkout with one, else from `oh-sbx-<n>`, host `TZ`, `git config --global user.name/user.email`, SSH off, socket off; writes the entry `oh.json` (`runtime: "docker"`, `repo: <abs>` when given, image defaults untouched); materialises the entry; then runs today's `runSandbox` body against the entry root with `--image`, `--no-build`, `--print-argv` semantics kept (`--build` only when `repo` is set and `image.mode` is `build`); prints `next: oh shell <name>`. `runSandboxList({ json })` prints name, runtime, repo, and container status from `target.status()`
- [ ] `.oh/cli/src/lib/oh-config.ts`: `OhConfig` and `OH_CONFIG_FIELDS` gain `runtime?: "docker"` and `repo?: string`; `.oh/cli/src/lib/config-render.ts` renders `OH_REPO_DIR` from `repo` (absolute path) and omits it when unset
- [ ] `.devcontainer/docker-compose.yml`: the bind is `${OH_REPO_DIR:-..}:/home/sandbox/harness` and the build context is `${OH_REPO_DIR:-..}`; no other line changes
- [ ] `.oh/cli/src/lib/runtimes/catalog.ts` holds `docker` (provisionable) and `microsandbox` (planned, `docsPath: "docs/runtimes/microsandbox.md"`); `gvisor` deleted; `DEFAULT_RUNTIME` deleted
- [ ] `.oh/cli/src/cli.ts`: `parseSandboxArgs` accepts `install <runtime>`, `list`, `--name`, `--repo`, `--yes`, `--image[=ref]`, `--no-build`, `--print-argv`, `--json`; bare `oh sandbox` prints help and exits 1; help text names the new flow
- [ ] `OH_HOME=<tmp> node .oh/cli/dist/oh.js sandbox install docker --yes --print-argv` prints the wrapper argv and leaves `<tmp>` without an entry; tests in `.oh/cli/src/__tests__/registry.test.ts` and `sandbox.test.ts` cover D3, D4, materialisation, name resolution order
- [ ] Typecheck passes (`npm --prefix .oh/cli run typecheck`) and `npm --prefix .oh/cli run build` succeeds
- [ ] Tests pass (`env -u SANDBOX_SSH pnpm test`)

### US-002: Lifecycle verbs resolve by name; `--sandbox` on config and secret

**Description:** As an operator, I want `oh shell <name>` and the other lifecycle verbs to find a sandbox by name from anywhere, so that I never have to know the docker or compose command.

**Acceptance Criteria:**

- [ ] `.oh/cli/src/commands/lifecycle.ts`: `runShell`, `runComposeVerb` (`stop|restart|logs|ps|destroy`), `runDestroy`, `runComposeConfig` accept an optional `name` and resolve the root through `resolveSandboxRoot`; `materialize` runs before the wrapper is invoked so the entry always matches the CLI version; `runDestroy` removes the entry directory after `down -v`; `maybePromptDockerSocket`, `withComposeEnvFile`, `namedVolumes`, and the `runShell` attach line (`target.attach({ argv: ["zsh"], user: "sandbox" })`) are byte-unchanged; the old implicit `oh sandbox` = `up` path is gone
- [ ] `.oh/cli/src/cli.ts`: `shell`, `stop`, `restart`, `logs`, `ps`, `destroy` accept an optional positional name; help text updated
- [ ] `.oh/cli/src/commands/config.ts` and `commands/secret.ts` accept `--sandbox <name>`, which selects the entry root; without it `resolveProjectRoot` is used as today; `oh config show --sandbox <name>` reads the entry
- [ ] `oh secret set` appends `.env` to `<root>/.gitignore` when the root contains `.git` and the line is absent (the de-duplicating helper moves from `init.ts` to `.oh/cli/src/lib/`); it never writes `.gitignore` in a registry entry
- [ ] `.oh/cli/src/lib/project.ts` error text reads "not an OpenHarness-equipped repo — run `oh update` first"
- [ ] Tests: `lifecycle.test.ts` (name resolution, destroy removes the entry, no-name error lists names), `config.test.ts` / `secret.test.ts` (D8), `project.test.ts`; `compose-args.test.ts` unchanged and green
- [ ] Typecheck passes
- [ ] Tests pass

### US-003: `oh update` is the bootstrap; `oh init` and the scaffold are gone

**Description:** As an operator, I want `oh update` to equip an empty checkout and nothing to write scaffold files I did not ask for, so that the project stays mine.

**Acceptance Criteria:**

- [ ] `.oh/cli/src/commands/update.ts`: the "not an OpenHarness-equipped repo" guard is deleted; a missing target `.oh/` reads as version `0.0.0` and the run reports `0.0.0 → <version>`; the command writes only `.oh/` and `crons/` per the manifest
- [ ] `.oh/cli/src/cli.ts`: `resolveInitSource` becomes `resolveUpdateSource` with precedence `--from` > `--from-remote [--ref]` > bundled payload (manifest marker) > remote fetch with the one-line notice; `parseUpdateArgs` no longer requires a source flag; target stays `process.cwd()`; `oh update` never prompts and never writes `oh.json`, `.env`, `AGENTS.md`, `.gitignore`, `.devcontainer/`, or provider directories
- [ ] Deleted: `.oh/cli/src/commands/init.ts`, `.oh/cli/src/__tests__/init.test.ts`, the `runInit` describe in `config-repo.test.ts`, `.oh/templates/` (root `.env.example` stays), the `!/.oh/templates/.env.example` line in `.gitignore`, `DEFAULT_TEMPLATES_DIR`
- [ ] `update.test.ts` covers the empty-directory bootstrap and the second-run "up to date"; `cli.remote.test.ts` runs through `runUpdate`
- [ ] `git grep -nE 'runInit|resolveInitSource|parseInitArgs|DEFAULT_TEMPLATES_DIR|\.oh/templates' -- .oh/cli` returns nothing
- [ ] Typecheck passes
- [ ] Tests pass

### US-004: `oh runtime` retired; `microsandbox` is a tool

**Description:** As an operator, I want one catalog per kind of thing, so that a runtime is chosen by `oh sandbox install <runtime>` and `msb` is installed by `oh tool install microsandbox`.

**Acceptance Criteria:**

- [ ] Deleted: `.oh/cli/src/commands/runtime.ts`, `.oh/cli/src/__tests__/runtime.test.ts`, `runtime-catalog.test.ts`; `parseRuntimeArgs`, `runRuntime*` imports and dispatch removed from `cli.ts`; "nor an isolation runtime" dropped from `printToolHelp`
- [ ] `.oh/cli/src/lib/tools/catalog.ts` gains `microsandbox`: `kind: "installable"`, `binary: "msb"`, `installUser: "sandbox"`, `installArgv` downloads `https://get.microsandbox.dev` to a temp file, checks it with `sha256sum -c -` against a pinned digest, runs it with the prefix `${NPM_USER_PREFIX:-$HOME/.local}`; `verifyArgv` is `command -v msb`; `docsPath: "docs/runtimes/microsandbox.md"`; no `doctorArgv`
- [ ] The executor runs the installer once in `docker run --rm --entrypoint bash openharness:one-door` to learn where `msb` lands; the observed prefix (or the failure) is recorded in `progress.txt` for the docs wave
- [ ] `tool-catalog.test.ts` and `tool.test.ts` cover the entry; `.oh/evals/probes/tool-catalog-boundary.sh` accepts two catalogs and keeps the "no `docker` id in the tool catalog" rule; `harness-one-door.sh` PASS
- [ ] `git grep -nE 'oh runtime|parseRuntimeArgs|runRuntime|DEFAULT_RUNTIME|gvisor' -- .oh/cli` returns nothing
- [ ] Typecheck passes
- [ ] Tests pass

### US-005: Probes and scripts prove the registry and bite

**Description:** As a maintainer, I want the probe suite to fail when the bundled compose text drifts from the tracked files or a verb bypasses the wrapper, so that the registry cannot regress silently.

**Acceptance Criteria:**

- [ ] `.oh/evals/probes/sandbox-registry.sh` (new, PASS/REGRESSION/SKIPPED contract): the texts bundled into `dist/oh.js` equal the tracked `.devcontainer/docker-compose*.yml` and `.oh/scripts/{docker-compose,check-host-port}.sh`; `lifecycle.ts` and `sandbox.ts` spawn no `docker` or `docker compose` argv themselves; `sandbox.ts` refuses `microsandbox`; the D10 fault injection (a one-byte drift in a scratch copy of the compose file; a `spawn("docker"` line added to a scratch `lifecycle.ts`) reports REGRESSION, recorded in `progress.txt`
- [ ] `.oh/evals/probes/oh-init-headless-config.sh` replaced by `oh-update-bootstrap.sh` (D5: empty dir → equipped; second run up to date; none of `oh.json`, `.env`, `AGENTS.md`, `.gitignore`, `.devcontainer/` written); `oh-init-scaffold.sh` and `runtime-preflight-gate.sh` deleted
- [ ] One-line edits so they pass against the new tree: `oh-standalone-lifecycle.sh`, `no-project-agent-catalog.sh`, `config-schema-parity.sh`, `worktrees-layout.sh`, `retired-memory-vocabulary.sh`, `audit-stale-references.sh`, `workflow-boundaries.sh`; `compose-env-boundary.sh` adds `OH_REPO_DIR` to the allowed set (no other relaxation); `oh-image-only-deploy.sh` accepts the `${OH_REPO_DIR:-..}` lines
- [ ] `.oh/install/get-oh.sh` next steps read `oh sandbox install docker`, `oh shell <name>`, `oh tool install herdr`; `oh update` is named for an equipped checkout
- [ ] `.github/workflows/*` unchanged (they call the wrapper from the checkout with the `..` default)
- [ ] `bash .oh/skills/eval/run.sh` exits 0 with no new REGRESSION; `git grep -nE 'oh init|oh runtime|lib/runtimes/catalog|\.oh/templates' -- .oh/evals .oh/scripts .oh/install .github` returns only negative-assertion guards
- [ ] Tests pass

### US-006: Docs and root context describe the new flow

**Description:** As a new operator, I want every document to tell me `oh sandbox install docker`, `oh shell <name>`, `oh tool install herdr`, so that I never look for `oh init` or `oh runtime`.

**Acceptance Criteria:**

- [ ] Flow rewritten in `README.md`, `docs/quickstart.md`, `docs/installation.md`, `docs/lifecycle-commands.md` (verb table: `oh sandbox install|list`, `oh shell [name]`, lifecycle verbs `[name]`, `oh update` as bootstrap, `--sandbox` on config/secret), `docs/configuration.md` (registry entry `oh.json` vs project `oh.json`), `docs/deployment-prebuilt-image.md` (the `oh sandbox install docker` page; image-only is the default), `docs/oh-directory-layout.md`, `docs/README.md`, `.oh/README.md`, `.oh/cli/README.md`, `.oh/scripts/README.md`
- [ ] `docs/runtimes/overview.md`, `docker.md`, `microsandbox.md`: `oh sandbox install docker`; `oh tool install microsandbox` with the observed prefix from US-004; the substrate selector points at `docs/rfcs/rfc-runtime-support.md`
- [ ] Onboarding pages state that the CLI writes no `AGENTS.md`, provider config, or `.gitignore` line beyond `.env`; the operator owns those files
- [ ] `AGENTS.md` lifecycle reads: 1 `oh sandbox install docker`, 2 `oh shell <name>`, 3 `oh tool install herdr`, then `herdr`, 4 `gh auth login && gh auth setup-git`, 5 `oh ps <name>`; the `.oh/templates/AGENTS.md` bullet is deleted; `bash .oh/evals/probes/context-tier-size-budget.sh` PASS
- [ ] `CHANGELOG.md` `## [Unreleased]` carries `### Added` (`oh sandbox install docker`, the registry, `oh sandbox list`, `--sandbox`), `### Changed` (`oh update` bootstraps; lifecycle verbs take a name), `### Removed` (`oh init`, `oh runtime`, `.oh/templates`), each entry ≤250 chars linking #950
- [ ] `git grep -nE 'oh init|oh runtime|\.oh/templates|gvisor' -- docs README.md AGENTS.md .oh/README.md .oh/cli/README.md .oh/scripts/README.md .oh/install .oh/skills ':!docs/rfcs'` returns nothing; prose pins in `.oh/scripts/__tests__/*.test.ts` and probes still match
- [ ] Typecheck passes

### US-007: Before and after evidence with a registry child

**Description:** As the reviewer, I want observed output from the built CLI before and after the change, so that the PR proves the flow rather than asserting it.

**Acceptance Criteria:**

- [ ] D1 transcript from the base commit's built CLI: `oh init --help` and `oh runtime --help` exist, `oh sandbox` in an empty dir refuses, `oh update` in an empty dir refuses
- [ ] D2 transcript from this parent with `OH_EXECUTION_TARGET=docker-compose` and `OH_HOME` under the scratchpad: `oh sandbox install docker --name oh-child-after --yes` with `image.ref=openharness:one-door`; the entry layout; healthcheck PASS; `oh sandbox list`; `oh ps oh-child-after`; `oh logs oh-child-after`; `docker exec` door test `oh tool install herdr && herdr --version` exits 0; `oh destroy oh-child-after` removes container, volume, and the entry
- [ ] D5 transcript: `oh update --from <checkout>` in an empty dir, then the second run
- [ ] No `oh-child-*` container or volume remains; `oh-sbx-remote` untouched
- [ ] Excerpts recorded in `.oh/tasks/sandbox-registry/evidence.md` and the PR body
- [ ] Typecheck passes

### US-008: Knowledge pages match the registry

**Description:** As the next planner, I want the knowledge base to describe the registry and `oh update` bootstrap, so that a future plan does not re-derive `oh init`.

**Acceptance Criteria:**

- [ ] `bash .oh/skills/wiki/scripts/knowledge-impact.sh --changed <actual diff>` run; every NEEDS-REVIEW page plus `oh-cli-portable-lifecycle`, `fresh-machine-setup`, `compose-env-boundary` ends in exactly one of UPDATED / REVERIFIED / NOT-AFFECTED (reason), recorded in `evidence.md`
- [ ] `oh-cli-portable-lifecycle` UPDATED: registry root, bundled assets, `oh update` precedence, name resolution, `compose.env` rendering (the page's `.devcontainer/.env` seed claim is repaired); `fresh-machine-setup` UPDATED: host steps 3–4 become `oh sandbox install docker` / `oh shell <name>`; `compose-env-boundary` UPDATED: `OH_REPO_DIR` joins the rendered set, a registry entry is a root; `updated:` and `verified_at:` advanced on every rewritten `kind: repo` page; `verified_at:` alone on REVERIFIED pages
- [ ] Source-backed body shape per `.oh/skills/wiki/references/schema.md` § 3 kept
- [ ] `.oh/knowledge/README.md` regenerated; `bash .oh/evals/probes/wiki-readme-index.sh` PASS
- [ ] Typecheck passes

## Functional Requirements

- FR-1: `oh sandbox install docker [--name n] [--repo d] [--yes] [--image[=ref]] [--no-build] [--print-argv]` writes `${OH_HOME:-~/.oh}/sandboxes/<n>/oh.json`, materialises the compose files and wrapper, and provisions through `ExecutionTarget.provision()`.
- FR-2: `oh sandbox list [--json]` lists registry entries with container status.
- FR-3: `oh shell|stop|restart|logs|ps|destroy [name]` resolve name → single entry → entry containing cwd → error listing names.
- FR-4: `oh config` and `oh secret` accept `--sandbox <name>`.
- FR-5: `oh update [--from d | --from-remote [--ref r]]` equips an empty checkout and writes only the manifest payload.
- FR-6: `oh tool install microsandbox` installs `msb` as the sandbox user under `${NPM_USER_PREFIX:-$HOME/.local}` with a pinned digest.
- FR-7: `sandbox-registry.sh` returns REGRESSION on bundled-text drift or a verb spawning `docker` directly.

## Non-Goals

- Migrating the running parent sandbox `oh-sbx-remote` into the registry (follow-up on #950: `oh sandbox install docker --name oh-sbx-remote --repo <checkout>` adopts the compose project; volumes persist).
- A second provisionable runtime; `microsandbox` stays planned in the catalog.
- Editing `mifunedev/openharness-web`, `docs/rfcs/` beyond one-line pointers, CI workflows.
- Touching the parent checkout's `oh.json`, the untracked `.oh/scripts/migrate-dotenv-settings.sh`.

## Knowledge Context

- **Base commit**: `98e320bd134dbf11b814c4b6436e6c135f7dfba8`
- **Queries**: `cli sandbox lifecycle init update runtime compose` and `cli sandbox lifecycle evals docs --patterns`
- **Knowledge used**: `[[oh-cli-portable-lifecycle]]`, `[[fresh-machine-setup]]`, `[[compose-env-boundary]]`, `[[runtime-isolation-landscape]]`, `[[pattern-evals-prose-literal-pinning]]`, `[[pattern-spec-self-staling-reuse-record]]`, `[[pattern-audit-driver-tool-allowlist]]`, `[[pattern-docs-prohibition-by-example]]`, `[[pattern-evals-unexercised-oracle]]`
- **Grounded against**: `.oh/cli/src/commands/init.ts`, `.oh/cli/src/commands/update.ts`, `.oh/cli/src/commands/runtime.ts`, `.oh/cli/src/commands/lifecycle.ts`, `.oh/cli/src/cli.ts`, `.oh/cli/src/lib/project.ts`, `.oh/cli/src/lib/config-render.ts`, `.oh/cli/src/lib/oh-config.ts`, `.oh/cli/src/lib/runtimes/catalog.ts`, `.oh/cli/src/lib/tools/catalog.ts`, `.oh/cli/build.mjs`, `.oh/cli/package.json`, `.oh/scripts/docker-compose.sh`, `.devcontainer/docker-compose.yml`, `.devcontainer/docker-compose.image-only.yml`, `.oh/evals/probes/execution-target-contract.sh`, `.oh/evals/probes/compose-env-boundary.sh`, `.oh/templates/`, `.gitignore`, `CHANGELOG.md`, `docs/rfcs/rfc-runtime-support.md`
- **Conflicts discovered**: `oh-cli-portable-lifecycle` says `lifecycle.ts` seeds `.devcontainer/.env` and `oh shell` reads `SANDBOX_NAME` from it; the code renders `oh.json` into a temporary `compose.env` passed as `--extra-env-file` (`lifecycle.ts:42-75`) and `oh shell` reads `name` from `oh.json` (`lifecycle.ts:218`). The page is repaired in the knowledge gate. `fresh-machine-setup` step 3 (`oh init writes oh.json`) and `oh-cli-portable-lifecycle`'s `oh init` payload precedence describe the surface this task deletes; both are UPDATED in US-008.

## Expected Knowledge Impact

- **Impact**: REQUIRED
- **Expected entries**: `oh-cli-portable-lifecycle`, `fresh-machine-setup`, `compose-env-boundary`, `sandbox-dependency-installs`, `runtime-isolation-landscape`
- **Affected source paths**: `.oh/cli/src/**`, `.oh/cli/build.mjs`, `.devcontainer/docker-compose.yml`, `.oh/scripts/docker-compose.sh`, `.oh/templates/**`, `.oh/evals/probes/*`, `docs/**`, `README.md`, `AGENTS.md`, `.oh/install/get-oh.sh`
- **Reason**: the task retires two verbs, moves sandbox configuration out of the project checkout into a user-level registry, changes what `oh update` does, and adds one rendered compose variable; every page that names `oh init`, the `.devcontainer/.env` seed, or the rendered set is wrong afterwards.

## Plan Reconciliation

- **Source plan**: `.claude/plans/happy-watching-sloth.md`
- **Intent preserved**: YES
- **Material deviations**: none
- **Constraints discovered during grounding**: the PR stacks on `task/948-one-door` because #949 is open and unmerged; `spawnRunner` lives in `lib/execution/`, not a `runner.ts` (naming only); the wrapper already reads `<root>/.env` before `<root>/.devcontainer/.env` and `<root>/oh.json` for `composeOverrides`, so a registry entry with those files needs no wrapper change; the operator-path guard forbids commands naming `.config/`, which is why the registry lives under `~/.oh`.
