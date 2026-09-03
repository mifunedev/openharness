# Evidence: retire `oh init` and `oh runtime`; `oh sandbox install docker` owns sandbox configuration

**Task:** `.oh/tasks/sandbox-registry/` · **Issue:** #950 · **PR:** #951 (`task/950-sandbox-registry` → `task/948-one-door`, stacked on #949) · **Plan approved:** `.claude/plans/happy-watching-sloth.md`
**Audit run:** `audit-20260903T022532Z-4178951` (`/audit implementation`, AUDIT-PASS, driver `claude -p --allowedTools=Bash,Read,Glob,Grep`; a first run `audit-20260903T021807Z-4129338` also passed at `2c955907` and named the three residuals that simplify round 2 removed) · **Eval record:** `eval-result.json` at `8d610463`, runner exit 0

Every block below is observed output from the built CLI, a child sandbox, or a gate; nothing is argued from the diff alone. Transcripts were taken from inside the parent sandbox `oh-sbx-remote` over its Docker socket with `OH_EXECUTION_TARGET=docker-compose`, `OH_HOME` under the session scratchpad, and `SANDBOX_NAME`/`SANDBOX_SSH` unset.

## 0. Why this is better than not doing it

Before, creating a sandbox required a checkout equipped by `oh init`, which also wrote an `AGENTS.md`, provider configs, `.gitignore` lines, and a `.devcontainer/`; every lifecycle verb refused outside that checkout (D1 below: `oh sandbox`, `oh shell`, and `oh update` all exit non-zero in an empty directory). After, one command from any directory creates and boots a sandbox, and every verb finds it by name:

| Measure | Before (`98e320bd`) | After (`1b13bb1d`) |
|---|---|---|
| Commands from an empty dir to a healthy sandbox | 3 (`git clone`, `oh init` wizard, `oh sandbox`) plus a checkout on disk | 1 (`oh sandbox install docker --yes`), no checkout |
| Time from `install` to healthcheck PASS (image already local) | not measurable without a checkout | 16 s (`02:16:07Z` → `02:16:23Z`) |
| Files the CLI writes into the operator's project | `AGENTS.md`, `CLAUDE.md`, `.gitignore` lines, `.env.example`, `.devcontainer/*`, five provider dirs, `oh.json` | none; `oh update` writes `.oh/` + `crons/` only (D5) |
| Lifecycle verbs | `sandbox`, `shell`, `stop`, `restart`, `logs`, `ps`, `destroy`, `init`, `runtime`, `update` | `sandbox install\|list`, `shell [name]`, `stop\|restart\|logs\|ps\|destroy [name]`, `update` |
| Tracked lines | — | slop metrics at `8d610463`: netAdded 3 335, netRemoved 6 767 (`lizard`, base `task/948-one-door`) |
| Runtime catalog entries / probes | 3 (`docker`, `gvisor`, `microsandbox`) / 137 | 2 / 137 (2 deleted, 2 added) |

Cost: one new probe, one new rendered compose variable (`OH_REPO_DIR`), six files bundled into `dist/oh.js` (152.7 kB, was 172.6 kB), and consumers no longer receive the scaffold files. Claimed, unmeasured: that operators on a remote VM will find `oh sandbox install docker` faster than the old checkout flow.

## 1. What the plan asked for

Each CLI verb owns its own configuration. Creating a sandbox must not depend on standing in a project: `oh sandbox install docker` → wizard → `oh shell <name>` → `oh tool install herdr`. Configuration lives in a user-level registry; a checkout is an optional `--repo` mount; `oh update` equips an empty checkout; `oh init`, `oh runtime`, and `.oh/templates/` go away; `msb` stays a tool; probes, docs, and knowledge describe only the new flow; a registry child over this parent's Docker socket proves it.

## 2. What was built

### D1 — before, built CLI at the base `98e320bd`, empty directory

```
$ oh init --help | head -4
oh init — Equip a repo with OpenHarness
Usage:
  oh init [dir] [--minimal] [--yes] [--from <dir> | --from-remote [--ref <ref>]] [--force] [--dry-run] [--templates <dir>]
exit=0
$ oh runtime --help | head -4
oh runtime — Inspect the sandbox's isolation runtime
exit=0
$ oh sandbox --print-argv
oh: not an OpenHarness-equipped repo — run `oh init` first
exit=2
$ oh shell
oh: not an OpenHarness-equipped repo — run `oh init` first
exit=2
$ oh update --from <checkout>
oh update: not an OpenHarness-equipped repo (no .oh/ at …/d1-aMVz). Run `oh init` / vendor .oh/ first.
exit=1
```

### D2 — after, registry child `oh-child-after` from `openharness:one-door` (`a462096a`), CLI built at `1b13bb1d`

```
$ oh sandbox install docker --name oh-child-after --yes --image=openharness:one-door </dev/null
image mode: openharness:one-door (skipping local build)
 Network oh-child-after_default Created
 Volume oh-child-after_workspace Created
 Container oh-child-after Started
next: oh shell oh-child-after
exit=0
### entry layout (OH_HOME=<scratchpad>/oh-home):
./sandboxes/oh-child-after/.devcontainer/docker-compose.docker-sock.yml
./sandboxes/oh-child-after/.devcontainer/docker-compose.ssh.yml
./sandboxes/oh-child-after/.devcontainer/docker-compose.yml
./sandboxes/oh-child-after/.oh/scripts/check-host-port.sh
./sandboxes/oh-child-after/.oh/scripts/docker-compose.sh
./sandboxes/oh-child-after/oh.json
### entry oh.json (excerpt): "name": "oh-child-after", "timezone": "America/Denver", "access": { "ssh": false, "sshPort": 2222, "dockerSocket": false },
    "image": { "mode": "image", "pullPolicy": "missing", "ref": "openharness:one-door" }, "runtime": "docker"
### healthcheck passed=1 at 2026-09-03T02:16:23Z (started 02:16:07Z)
sandbox healthcheck ok
$ oh sandbox list
oh-child-after  docker  ready  -
$ oh ps oh-child-after
NAME             IMAGE                  … STATUS                    PORTS
oh-child-after   openharness:one-door   … Up 15 seconds (healthy)
exit=0
$ oh ps   (no name, single entry)     → same row, exit=0
$ timeout 5 oh logs oh-child-after | tail -3
oh-child-after  |   │  First command after attaching:                 │
oh-child-after  |   │    oh tool install herdr   # then run herdr     │
$ docker exec -u sandbox oh-child-after bash -lc 'oh --version; oh tool list'
0.6.0
TOOL           KIND         INSTALLED
agent-browser  installable  no
herdr          installable  no
cloudflared    installable  no
docker-cli     baked-in     yes
gh             baked-in     yes
tailscale      installable  no
### door: oh tool install herdr && herdr --version
installing Herdr into the sandbox…
/tmp/tmp.SeEE3ClC9h/herdr: OK
herdr: installed — see https://github.com/mifunedev/openharness/blob/main/docs/installation.md
herdr 0.7.4
exit=0
$ oh stop oh-child-after; oh restart oh-child-after
 Container oh-child-after Stopped
 Container oh-child-after Started
running
$ oh destroy oh-child-after --yes
 Container oh-child-after Removed
 Volume oh-child-after_workspace Removed
removed the sandbox entry <scratchpad>/oh-home/sandboxes/oh-child-after
exit=0
### after destroy: containers/volumes/entry → (nothing)
$ oh sandbox list
no sandbox is registered in <scratchpad>/oh-home/sandboxes — create one with `oh sandbox install docker`
```

`microsandbox` does not appear in `oh tool list` inside the child because the child runs the #949 image, whose baked `oh` predates this catalog; the host-side CLI at this head lists it (below).

### D5 and the retired verbs — after, built CLI at `fc7bb8df`, empty directory

```
$ oh update --from <checkout>
create crons/prompt-miner.md
oh update: 448 created, 0 overwritten, 25 skipped
exit=0
$ ls -A
.oh
crons
$ oh update --from <checkout>   (second run)
oh update: already up to date (v0.6.0)
exit=0
$ scaffold-file check (oh.json .env .env.example AGENTS.md .gitignore .devcontainer .claude .pi .codex .hermes)
unexpected scaffold files: 0
$ oh init --help
oh: unknown command "init"
exit=1
$ oh runtime --help
oh: unknown command "runtime"
exit=1
$ oh sandbox   (bare)
oh sandbox — Create and list sandboxes
exit=1
$ oh sandbox install microsandbox
oh sandbox install: microsandbox is not a provisionable runtime yet; see docs/rfcs/rfc-runtime-support.md. Inside a sandbox run `oh tool install microsandbox`.
exit=1
$ oh tool list --json | jq (microsandbox entry)
{"id":"microsandbox","kind":"installable","binary":"msb","installed":null}
$ OH_HOME=<empty> oh shell
oh: no sandbox is registered in …/oh-home/sandboxes — create one with `oh sandbox install docker`
exit=2
$ OH_HOME=<empty> oh sandbox install docker --yes --print-argv ; ls -A $OH_HOME
… up -d --no-build
ls: cannot access '…/oh-home': No such file or directory
```

### D3, D4, D8 — tests

`registry.test.ts` and `sandbox.test.ts` (wave 1, plus two cases in the fixup): `oh-sbx-1` then `oh-sbx-2` for two `--yes` installs with no `--name`; `--repo <equipped dir>` renders `OH_REPO_DIR=<abs>` and selects the checkout-binding base; `--print-argv` writes nothing; the scripted-TTY wizard asks exactly six questions and `--yes` asks zero; seeding from `<repo>/oh.json`; `--image=<ref>` persists `image.ref`; `--sandbox <name>` on `oh config set` and `oh secret set` writes the entry. `env -u SANDBOX_SSH pnpm test`: 57 files, 895 tests, exit 0 at `1b13bb1d`.

### D7 — `msb` installer in a throwaway container (wave 1)

`docker run --rm -u sandbox --entrypoint bash openharness:one-door` running the catalog's `installArgv` exited 0 and printed `msb 0.6.16`; binary at `$HOME/.local/microsandbox/bin/msb` (`MSB_HOME="${NPM_USER_PREFIX:-$HOME/.local}/microsandbox"`), symlinked by the installer to `$HOME/.local/bin/msb`. `harness-one-door.sh` PASS (11 installable entries, 4 checksummed downloads); `tool-catalog-boundary.sh` PASS.

### D6 — retired surface grep on `1b13bb1d`

```
$ git grep -nE 'oh init|oh runtime|lib/runtimes/catalog|\.oh/templates|runInit|resolveInitSource|parseInitArgs|parseRuntimeArgs' -- . ':!CHANGELOG.md' ':!.oh/tasks' ':!.oh/logs' ':!docs/rfcs' ':!.oh/evals/RESULTS.md' ':!.oh/knowledge'
.oh/cli/src/__tests__/tool-catalog.test.ts:12:import { RUNTIME_CATALOG } from "../lib/runtimes/catalog.js";
.oh/cli/src/cli.ts:43:import { RUNTIME_CATALOG } from "./lib/runtimes/catalog.js";
.oh/cli/src/commands/sandbox.ts:22:import { findRuntime, runtimeIds } from "../lib/runtimes/catalog.js";
```

The three hits are the runtime catalog the plan keeps under `oh sandbox` (docker provisionable, microsandbox planned); the `lib/runtimes/catalog` arm of the grep was over-broad. The `.env.example` `oh init` hint was removed in the fixup.

### D9, D10 — local gates on the merged head

| Gate | Result |
|---|---|
| `npm --prefix .oh/cli run typecheck` / `build` | 0 / 0 (`dist/oh.js` 152.7 kB, only artifact) |
| `env -u SANDBOX_SSH pnpm test` | 57 files, 895 tests, exit 0 |
| `bash .oh/skills/eval/run.sh` at `8d610463` (and at `2c955907`) | exit 0, 137 probes: 133 PASS, 0 REGRESSION, 4 SKIPPED (`cc-safety-net-wiring`, `debugmcp-availability`, `next-dev-prod`, `registry-portability` — all SKIPPED on the base too) |
| `sandbox-registry.sh` fault injection (i) one byte flipped in a scratch `docker-compose.image-only.yml` | `REGRESSION: … the text the CLI bundles for .devcontainer/docker-compose.yml (no --repo) differs from the tracked .devcontainer/docker-compose.image-only.yml` rc=1 |
| `sandbox-registry.sh` fault injection (ii) `spawn("docker", …)` appended to a scratch `lifecycle.ts` | `REGRESSION: … lifecycle.ts builds a \`docker\` argv of its own` rc=1 |
| `execution-target-contract.sh`, `compose-env-boundary.sh`, `oh-image-only-deploy.sh`, `oh-update-bootstrap.sh`, `harness-one-door.sh` | PASS |
| `compose-args.test.ts` | unchanged, green |
| `context-tier-size-budget.sh` | PASS, `AGENTS.md` 9341 B of 9500 |
| `wiki-readme-index.sh`, `knowledge-source-freshness.sh` | PASS at `8d610463` |

### D11 — CI on the pushed head

CI_PLACEHOLDER

### D12 — docs

`git grep -nE 'oh init|oh runtime|\.oh/templates|gvisor' -- docs README.md AGENTS.md .oh/README.md .oh/cli/README.md .oh/scripts/README.md .oh/install .oh/skills ':!docs/rfcs'` returns nothing. `docs/deployment-prebuilt-image.md` is retitled "Creating a sandbox: `oh sandbox install docker`"; `docs/lifecycle-commands.md` carries the `[name]` verb table, `oh sandbox install|list`, `oh update` as bootstrap, and `--sandbox`; `docs/runtimes/*` describe `oh tool install microsandbox` with the observed prefix and point the selector at the RFC; `AGENTS.md` lifecycle is `oh sandbox install docker` → `oh shell <name>` → `oh tool install herdr`.

### D14 — untouched

Parent `git status` still shows only the operator's uncommitted `oh.json` and the untracked `migrate-dotenv-settings.sh`; `oh-sbx-remote` is `Up 7 weeks (healthy)`; `docker ps -a --filter name=oh-child` and `docker volume ls --filter name=oh-child` are empty; no `~/.oh` registry was created on this host (every run used `OH_HOME` under the scratchpad). CI workflows unchanged; `docs/rfcs/` unchanged.

### Actual Knowledge Impact (union of `knowledge-impact.sh --changed` over 129 paths and the plan's prediction)

| Page | State | Why |
|---|---|---|
| `oh-cli-portable-lifecycle` | UPDATED | rewritten around the registry, bundled assets, name resolution, `oh update` precedence; the `.devcontainer/.env` seed claim replaced by the temporary `compose.env`; `verified_at` → `1b13bb1d` |
| `fresh-machine-setup` | UPDATED | host steps become `oh sandbox install docker` / `oh shell <name>`; 14-step walkthrough; `deployment-prebuilt-image.md` added to sources |
| `compose-env-boundary` | UPDATED | `OH_REPO_DIR` joins the rendered set; a registry entry is a root; `sandbox-registry.sh` added as a guard |
| `managed-agents` | REVERIFIED | its sources changed only in compose interpolation (`${OH_REPO_DIR:-..}`) and verb prose; every cited claim still holds; `verified_at` advanced |
| `sandbox-dependency-installs` | NOT-AFFECTED (no declared source changed; it describes in-sandbox installs, which #950 does not touch) | — |
| `runtime-isolation-landscape`, `crabbox-remote-exec-control-plane`, `molt-agentic-reinforcement-learning`, `recursive-language-models`, `recursive-self-improvement-survey`, `wikiskill-experience-compilation` | NOT-AFFECTED (`kind: external`, immutable provenance) | — |
| `audit-architecture`, `document-ingestion`, `plan-vs-built-reconciliation`, `release-versioning` | NOT-AFFECTED (no declared source in the changed set) | — |
| eight `pattern-*` pages | NOT-AFFECTED (`kind: pattern`; step 9 writes patterns) | — |

Index regenerated; `wiki-readme-index.sh` PASS.

### Benchmark

`/benchmark` at `8d610463`: Signal 1 (floor) inherited from `eval-result.json` with `commit == HEAD`, `runnerExit 0`, no new regression; Signal 2 (ceiling) `.oh/evals/capability/RESULTS.md` suite score 1.44 on this branch and 1.44 on `task/948-one-door`, a hold. Verdict **BENEFICIAL (justified hold)**: the change delivered its stated capability (a sandbox from any directory, proven by D2) at a net removal of code (netRemoved 6 767 vs netAdded 3 335) and one new probe. No `SI-nnnn` record: no `/builder` proposal covers this change. The instrument was not groomed this cycle (`/audit eval-quality` is not built). Cycles flat at 1.44: this one and #948; below the 3-cycle redirect window.

## 3. Where they diverged, and why

- **`microsandbox` installer URL.** The plan named `https://get.microsandbox.dev`; the catalog curls `https://raw.githubusercontent.com/superradcompany/microsandbox/refs/heads/main/scripts/install.sh`, which is what that host 302-redirects to, with the same bytes and the pinned sha256. `harness-one-door.sh` derives its no-bake fingerprint from `host/segment`, and the bare redirector has no path segment. Only the installer script is pinned; upstream's script installs the latest `msb` release.
- **`--image=<ref>` is persisted** into the entry's `image.ref` (fixup `1b13bb1d`). The plan said image ref is set with `oh config set`; without persistence a later `oh ps`/`oh restart` rendered the default image into `compose.env` for a container created from another. The explicit flag now writes what it used.
- **D6 grep allowlist.** Three imports of `lib/runtimes/catalog` remain because the plan keeps that catalog under `oh sandbox`; the grep arm was over-broad, not the tree.
- **Probe list.** The plan named nine one-line probe edits; sixteen probes went red after wave 1 (`oh-compose-env-wiring`, `oh-config-surfaces`, `oh-destroy-guard`, `oh-devcontainer-restructure`, `oh-home-mount`, `oh-lifecycle-surface`, `slack-admin-command-surface`, `skills-task-tool-coupling` in addition). All re-pointed; `compose-env-boundary.sh` needed no edit because it derives the allowed set from `config-render.ts`.
- **Registry entry `oh.json` shape.** The entry is written by the existing `oh.json` writer, so it also carries the project-level defaults (`hermesDashboard`, `cron`, `build`, `langfuse`); they are inert for a registry sandbox. The plan's sandbox-level/project-level split was not enforced in the schema.
- **PR base.** Stacked on `task/948-one-door` because #949 is open; the plan said `development`. GitHub retargets when #949 merges.
- **`.env.example` and `.oh/manifest.json`** were touched outside the plan's list (the `oh init` hint; `templates/**` dropped from the manifest). `vitest.config.ts` gained a text-asset plugin so tests can import the bundled files.

## 4. What remains unverified

- The wizard on a real TTY was exercised only through the scripted-prompt tests; every transcript used `--yes`.
- `oh sandbox install docker --repo <dir>` with `image.mode = build` (a local build through the registry) was covered by unit tests and `--print-argv`, not by a booted child.
- `oh tool install microsandbox` was run in a throwaway `openharness:one-door` container by the wave-1 executor; it was not re-run inside the D2 child because that image's baked `oh` predates the catalog entry. `msb self doctor` was not run.
- Adopting the running parent `oh-sbx-remote` into the registry is a follow-up on #950; until then the lifecycle verbs on this host do not find it (the parent was created from the checkout, and this task did not touch it).
- `sandbox-boot-guard.yml:93` still says the devcontainer bind-mounts `..:/home/sandbox/harness` (comment only; CI workflows are a non-goal).
- Simplify sub-loop: two rounds (`simplify-rounds.json`; netAdded 3 360 → 3 335 after inlining the bundled-asset shim and the materialise helper and reading the seed config once). The second audit's `SIMPLICITY-RESIDUAL: 3` are readability refactors left for the operator: `sandbox.ts` `runSandboxInstall` (CCN 21, four `stderr; return 1` guards could become one typed error), `runWizard` (CCN 17, the SSH-port validation could route through `coerceFieldValue`), `registry.ts` `resolveSandboxRoot` (CCN 11, the single-entry shortcut is subsumed by the cwd loop once the zero check moves first). Four functions in the two new files are above the CCN 10 threshold; five pre-existing ones are unchanged or improved.
- Pre-existing SKIPPED probes (`cc-safety-net-wiring`, `debugmcp-availability`, `next-dev-prod`, `registry-portability`) were SKIPPED on the base and carried forward unchanged.
