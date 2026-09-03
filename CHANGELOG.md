# Changelog

All notable changes to this project are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions use [SemVer](https://semver.org/) (`MAJOR.MINOR.PATCH`), read from root `package.json`, and ship as `v`-prefixed git tags.

Update policy and release automation live in [`/git`](.claude/skills/git/SKILL.md) § Changelog.

## [Unreleased]

### Added

- Add `oh sandbox install docker`: a wizard writes a sandbox registry entry under `${OH_HOME:-~/.oh}/sandboxes/<name>/` and boots it from any directory, with no project checkout. ([#950](https://github.com/mifunedev/openharness/issues/950))
- Add `oh sandbox list [--json]`, reporting each registry entry's name, runtime, container status, and bound repo. ([#950](https://github.com/mifunedev/openharness/issues/950))
- Add `--sandbox <name>` to `oh config show|set` and `oh secret set|list`, which read and write a registry entry instead of the project root. ([#950](https://github.com/mifunedev/openharness/issues/950))
- Add `microsandbox` to the tool catalog: `oh tool install microsandbox` installs `msb` under `${NPM_USER_PREFIX:-$HOME/.local}` from a pinned installer. ([#950](https://github.com/mifunedev/openharness/issues/950))

### Changed

- **BREAKING:** `oh update` is the bootstrap: it equips an empty checkout with `.oh/` and `crons/`, writes nothing else, and never prompts. ([#950](https://github.com/mifunedev/openharness/issues/950))
- **BREAKING:** `oh shell|stop|restart|logs|ps|destroy` take an optional sandbox name, resolving name, then the single entry, then the entry containing the cwd. ([#950](https://github.com/mifunedev/openharness/issues/950))
- `oh destroy <name>` removes the registry entry after `down -v`, so the sandbox name becomes free again. ([#950](https://github.com/mifunedev/openharness/issues/950))
- `docs/deployment-prebuilt-image.md` becomes the `oh sandbox install docker` page: running the published image is now the default, and `--repo` is the bind-mounted-checkout case. ([#950](https://github.com/mifunedev/openharness/issues/950))

### Removed

- Remove boot provisioning and every install switch: `oh harness install <id>` and `oh tool install <id>` are the only door. A fresh sandbox has no harness and no `herdr`. ([#948](https://github.com/mifunedev/openharness/issues/948))
- **BREAKING:** Remove `oh init`. `oh sandbox install docker` owns sandbox configuration and `oh update` owns the control-plane payload. ([#950](https://github.com/mifunedev/openharness/issues/950))
- **BREAKING:** Remove `oh runtime`. The runtime catalog lives under `oh sandbox`, and `msb` is installed with `oh tool install microsandbox`. ([#950](https://github.com/mifunedev/openharness/issues/950))
- **BREAKING:** Remove the `.oh/templates/` scaffold payload. The CLI writes no `AGENTS.md`, provider config, or `.gitignore` line beyond `.env`. ([#950](https://github.com/mifunedev/openharness/issues/950))
- Remove `gvisor` from the runtime catalog; the isolation-tier landscape lives in `docs/rfcs/rfc-runtime-support.md`. ([#950](https://github.com/mifunedev/openharness/issues/950))

## [0.6.0] - 2026-08-31

### Added
- Add `spec-no-agent-handoff`, `spec-no-advisor-session-coupling`, `cleanup-no-agent-session-coupling`, `headless-tmux-preserved`; rename `advisor-monitored-loop` to `spec-single-owner` ([#928](https://github.com/mifunedev/openharness/issues/928)).
- Add `.oh/skills/wiki/scripts/knowledge-impact.sh`, the single dependency-aware invalidation primitive: `--verified` for `/wiki lint`, `--changed` for the `/spec execute` knowledge gate. ([#926](https://github.com/mifunedev/openharness/issues/926))
- Add `evals-20260901-suite-tree-clean` and `docs-20260901-followup-artifact-cited`: no probe may redirect into the repository, and a criterion met by a follow-up must cite its URL. ([#926](https://github.com/mifunedev/openharness/issues/926))
- Add ten tier-A probes covering the knowledge surface, the planning recall and reconciliation gates, the RUNNING contract, structured completion, and the retired vocabulary. ([#926](https://github.com/mifunedev/openharness/issues/926))
- Add `/escalate`: an unattended session delivers a human-addressed escalation to the operator's Slack channel. An unavailable channel no-ops loudly rather than failing the session. ([#919](https://github.com/mifunedev/openharness/issues/919))
- Add `.oh/logs/`, gitignored by default with a tracked README, for records that outlive the session that wrote them; `/escalate` appends every attempt to `escalations.jsonl`. ([#919](https://github.com/mifunedev/openharness/issues/919))
- Add `escalate-contract.sh`, a tier-A probe: a no-op names its reason, is recorded, and `--dry-run` makes no network call. ([#919](https://github.com/mifunedev/openharness/issues/919))
- Add gate 5 to `/audit implementation`: fail a promotable change while its diff can still be smaller. Measures net lines and per-function CCN on changed TypeScript via `uvx lizard`. ([#912](https://github.com/mifunedev/openharness/issues/912))
- Add `audit-slop-gate.sh`, a tier-A probe holding gate 5's termination contract: a finding needs a concrete smaller alternative, and the loop ends on the cap or a non-reducing round. ([#912](https://github.com/mifunedev/openharness/issues/912))
- Add `/wiki compile`, a `kind: pattern` corpus layer, and an append-only `skill-impact.md` ledger, so a `/retro` lesson becomes a page `/builder` reads before proposing. ([#916](https://github.com/mifunedev/openharness/pull/916))
- Add a `--patterns` mode to `/wiki query` that filters on `kind:`, reads up to five pattern entries, and ranks them by term-hit count before recency. ([#916](https://github.com/mifunedev/openharness/pull/916))
- Add a fault-injection requirement to the probe contract: a probe is not green until its REGRESSION branch has been driven against a broken input. ([#916](https://github.com/mifunedev/openharness/pull/916))
- Add capability task `CB-005` scoring whether a lesson reaches a validated skill change; two runs score 0.67 then 1.33, moving the suite mean to 1.44 over a changed task set. ([#916](https://github.com/mifunedev/openharness/pull/916))
- Add `/architect`, an inline architecture-decision skill that classifies significance, grounds analysis in repository sources, and returns one Architecture Brief ([#929](https://github.com/mifunedev/openharness/issues/929)).
- Add six tier-A probes covering the `/architect` contract, roles-as-skills, the retired builder agent type, the `/delegate` worker boundary, the absent agent catalog, and RFC/ADR reuse ([#929](https://github.com/mifunedev/openharness/issues/929)).

### Changed
- **BREAKING:** Move durable repository knowledge to a tracked `.oh/knowledge/` surface — `source/`, `patterns/`, `raw/` tracked, `local/` ignored — with no compatibility alias. ([#926](https://github.com/mifunedev/openharness/issues/926))
- **BREAKING:** Make `/spec plan` recall tracked knowledge and re-ground it before the PRD; `prd.md` carries Knowledge Context, Expected Knowledge Impact, and Plan Reconciliation. ([#926](https://github.com/mifunedev/openharness/issues/926))
- **BREAKING:** Derive final knowledge impact in `/spec execute` from the actual diff plus page dependencies, resolving every impacted page to UPDATED, REVERIFIED, or NOT-AFFECTED. ([#926](https://github.com/mifunedev/openharness/issues/926))
- **BREAKING:** Replace age-based wiki staleness with source-change freshness: a `kind: repo` page pins `verified_at` and goes needs-review when a declared source changed after it. ([#926](https://github.com/mifunedev/openharness/issues/926))
- **BREAKING:** Model `/spec execute` as PLANNED -> RUNNING -> READY | DRAFT-BLOCKED(gate), with RUNNING derived from `prd.json` and mirrored into `/tmp/spec-<slug>.state`. ([#926](https://github.com/mifunedev/openharness/issues/926))
- Re-open `/spec execute`'s promotable gate when a push lands after `gh pr ready`: the verdict binds to one head, so a moved head is re-audited or returned to draft. ([#926](https://github.com/mifunedev/openharness/issues/926))
- Reduce `/wiki lint` to six correctness checks and demote `/compact` to an optional non-gating step that runs only after evidence, retro, and pattern compilation. ([#926](https://github.com/mifunedev/openharness/issues/926))
- Reduce `/spec retro` to an explicit wrapper around `/retro --task <slug>`, which `/retro` now accepts; `/retro` stays report-only and `/wiki compile` stays the durable pattern writer. ([#926](https://github.com/mifunedev/openharness/issues/926))
- **BREAKING:** Move eleven settings out of the compose `environment:` block into oh.json, read through the `oh` CLI; a hand-edited `.devcontainer/.env` no longer carries them ([#920](https://github.com/mifunedev/openharness/issues/920)).
- Make `/spec` ship by default: an unrecognized first token routes to a new `ship` node that runs `plan` then `execute`, so `/spec <plan-path>` produces a ready-for-review PR ([#914](https://github.com/mifunedev/openharness/issues/914)).
- **BREAKING:** Persist the sandbox home through one `/home/sandbox` mount, not eleven per-tool volumes; set `storage.homePath` for a host path, else `<name>_workspace` ([#898](https://github.com/mifunedev/openharness/issues/898)).
- Shrink the sandbox image ~540 MB: drop build caches from the baked home seed, stage the seed once via a builder stage, and keep untracked build output out of the build context ([#900](https://github.com/mifunedev/openharness/issues/900)).
- **BREAKING:** Stop baking Claude Code, Codex, and Pi into the image; boot installs them into the home mount, so a first boot needs network and runs 60-180s longer ([#904](https://github.com/mifunedev/openharness/issues/904)).
- **BREAKING:** Stop baking Herdr and cloudflared into the image; both become `kind: "default"` tools installed into `~/.local/bin` at boot from a pinned, checksum-verified binary ([#906](https://github.com/mifunedev/openharness/issues/906)).
- **BREAKING:** Stop baking OpenCode, Hermes, and Grok Build into the image; `oh harness install <id>` installs them into `~/.local` as the sandbox user ([#908](https://github.com/mifunedev/openharness/issues/908)).
- `.oh/logs/` carries an `AGENTS.md` with a `CLAUDE.md` symlink instead of a `README.md`, matching the directories whose contents are produced apart from the root context. ([#924](https://github.com/mifunedev/openharness/issues/924))
- **BREAKING:** `/spec execute` no longer launches a coding agent; the agent that runs it is the single implementation owner through the final PR gates ([#928](https://github.com/mifunedev/openharness/issues/928)).
- Task identity and `RUNNING` state depend on `.oh/tasks/<slug>/` alone, never on a terminal session, tab, or pane ([#928](https://github.com/mifunedev/openharness/issues/928)).
- `/delegate` keeps work in the active session when phases share substantial context and spawns provider-native workers only for self-contained, isolated, or parallel work ([#929](https://github.com/mifunedev/openharness/issues/929)).
- `/spec plan` judges architecture significance once and routes a significant topic through `/architect` before planning ([#929](https://github.com/mifunedev/openharness/issues/929)).
- `docs/glossary.md` defines coding agent, skill, worker/subagent, rule, and RFC/ADR as five distinct terms ([#929](https://github.com/mifunedev/openharness/issues/929)).
- `/t3` launches the headless `t3 serve` instead of the local-GUI `t3`, and gains `--tailscale`, a `pair` action for a second device, and a `doctor` preflight ([#858](https://github.com/mifunedev/openharness/issues/858)).

### Fixed
- Fix `/wiki lint` generating the corpus index from the working tree instead of the git-tracked set, which made any untracked scratch entry a `wiki-readme-index.sh` regression. ([#916](https://github.com/mifunedev/openharness/pull/916))
- Fix three unresolved `related:` and `[[slug]]` links in the `recursive-language-models` wiki entry, and add the `/wiki lint` check that would have caught them. ([#916](https://github.com/mifunedev/openharness/pull/916))
- Provision the default harnesses into `/home/sandbox/.local` at boot, gated by `OH_PROVISION_HARNESSES`, so `oh harness install` also works from inside the sandbox ([#902](https://github.com/mifunedev/openharness/issues/902)).
- Add `oh-home-mount.sh`, a tier-A probe holding the single-`$HOME`-mount contract: one mount per compose file, the baked `/opt/home-seed`, and the checkout prune that replaces `-xdev` ([#898](https://github.com/mifunedev/openharness/issues/898)).
- Assert boot-provisioned harnesses in the boot smoke and reject a baked default harness in `verify-sandbox-image.sh`, so CI exercises the install path ([#904](https://github.com/mifunedev/openharness/issues/904)).
- Add `oh tool list --defaults` and generalize the boot provisioner over both catalogs as `provision-defaults.sh` (`OH_PROVISION_DEFAULTS`) ([#906](https://github.com/mifunedev/openharness/issues/906)).
- Fix `oh harness install` hanging on a sudo password prompt inside the sandbox: every harness now installs as the sandbox user, so no install path needs root ([#908](https://github.com/mifunedev/openharness/issues/908)).
- Add `skills-task-tool-coupling.sh`, a tier-A probe holding the canonical skill pack and the sandbox in agreement about the Claude-Code-only task tools ([#886](https://github.com/mifunedev/openharness/issues/886)).
- Add `install.tailscale` and `oh tool install tailscale`, an opt-in userspace Tailscale client installed into `~/.local/bin` as the sandbox user, granting no capability ([#858](https://github.com/mifunedev/openharness/issues/858)).
- Give the five probes that shipped without one a `# source:` header, so every probe records the lesson it closes and the `source` column in `RESULTS.md` is fully populated ([#889](https://github.com/mifunedev/openharness/issues/889)).
- `/delegate` no longer instructs the Claude-Code-only `TaskCreate`/`TaskUpdate` from the provider-shared skill pack; its wave graph persists to a `.oh/tasks/<slug>/` run ledger ([#886](https://github.com/mifunedev/openharness/issues/886)).

### Removed
- **BREAKING:** Retire the `/spec ship` node; an unrecognized first token is an approved plan path that runs `plan` then `execute`, so `/spec <plan-path>` is unchanged. ([#926](https://github.com/mifunedev/openharness/issues/926))
- **BREAKING:** Retire the generated `.oh/tasks/<slug>/prompt.md`; the task prompt is rendered at execution time from its template and never persisted. ([#926](https://github.com/mifunedev/openharness/issues/926))
- **BREAKING:** Retire the `STATUS: COMPLETE` sentinel; task completion derives from `prd.json` story state, which the `cleanup-tasks` cron now reads. ([#926](https://github.com/mifunedev/openharness/issues/926))
- **BREAKING:** Move the skill-impact ledger to `.oh/evals/decisions/skill-impact.md`; it is a decision record, not a knowledge page. ([#926](https://github.com/mifunedev/openharness/issues/926))
- Retire orphan detection and the 90-day rule as `/wiki lint` health failures; age survives as informational `last-reviewed` telemetry only. ([#926](https://github.com/mifunedev/openharness/issues/926))
- Finish retiring `.oh/memory` from current architecture docs; the surviving `.gitignore` rule is labelled a compatibility tombstone with a 0.7.0 removal horizon. ([#926](https://github.com/mifunedev/openharness/issues/926))
- **BREAKING:** Retire cron worktree isolation — the `worktree:` frontmatter key, `.worktrees/cron/` per-fire worktrees, the `CRON_WORKTREE` export, and every `*_WORKTREE*` log state are gone; crons fire in the shared root under the id lock.
- **BREAKING:** Retire the `OH_IMAGE_ONLY` flag; `entrypoint.sh` detects the sandbox flavor from whether `/home/sandbox/harness` is a bind mount holding `.oh/`, and logs the detected mode ([#920](https://github.com/mifunedev/openharness/issues/920)).
- **BREAKING:** Retire `docker-compose.hermes-dashboard.yml` and its published `127.0.0.1:9119`; the dashboard now binds container loopback, reachable over cloudflared or Tailscale ([#920](https://github.com/mifunedev/openharness/issues/920)).
- Remove the duplicate agent-browser and Tailscale installers from `entrypoint.sh`; the tool catalog is the sole owner of both pins and Tailscale's two checksums ([#920](https://github.com/mifunedev/openharness/issues/920)).
- Remove the `BAKE_HARNESSES` and `AGENTS` build args along with the image bake they gated; the harness catalog is the only source of truth for what gets installed ([#904](https://github.com/mifunedev/openharness/issues/904)).
- Remove Cloudflare's apt repository and its bookworm-suite pin from the image; Docker's is now the only third-party apt source ([#906](https://github.com/mifunedev/openharness/issues/906)).
- Remove the four optional-harness build args and the dead `buildArg` catalog field; the `install.*` keys keep working and now drive boot provisioning ([#908](https://github.com/mifunedev/openharness/issues/908)).
- **BREAKING:** Retire the DeepAgents harness — `deepagents-cli` is deprecated upstream. `install.deepagents` is no longer a settable oh.json field ([#910](https://github.com/mifunedev/openharness/issues/910)).
- **BREAKING:** Retire Prime Agent and its `.prime/agent/` provider surface; `oh harness install prime-agent` is no longer available ([#918](https://github.com/mifunedev/openharness/issues/918)).
- **BREAKING:** Retire the `projectRoot` / `OH_PROJECT_ROOT` config knob — the checkout is fixed at `/home/sandbox/harness`, nested inside the home mount ([#898](https://github.com/mifunedev/openharness/issues/898)).
- **BREAKING:** Retire `.oh/agents/` with its `.claude/agents` and `.codex/agents` provider symlinks; the `oh` payload manifest no longer ships an `agents/**` pack ([#929](https://github.com/mifunedev/openharness/issues/929)).
- **BREAKING:** Retire `/builder agent` and its authoring reference; `/builder` now dispatches `skill`, `command`, and `rule` only ([#929](https://github.com/mifunedev/openharness/issues/929)).
- Remove the stale `implementer`/`critic`/`pm`/`council` worker types from `/delegate` and the dangling expert, council, and critic agent paths from `/strategic-proposal` ([#929](https://github.com/mifunedev/openharness/issues/929)).
- Retire `rl-delegation-write-worker.sh`; `delegate-worker-boundary.sh` carries its read-only-worker lesson forward ([#929](https://github.com/mifunedev/openharness/issues/929)).
- Retire the last `Advisor` role noun from `/blog`, which told the reader to "use Advisor" for a role that no longer exists; the briefing is `/delegate`'s ([#929](https://github.com/mifunedev/openharness/issues/929)).
- **BREAKING:** Retire the automated `/spec` Advisor handoff — detached tmux launch, `agent-spec-*` sessions and their sweep kill, pane logging, runner fallbacks ([#928](https://github.com/mifunedev/openharness/issues/928)).

## [0.5.1] - 2026-08-29

### Fixed
- `tsconfig.build.json` excluded only `src/__tests__/**`, so `prepublishOnly` typechecked `src/lib/__tests__/` and failed on the absent `vitest`, blocking the npm publish after the image had shipped.

## [0.5.0] - 2026-08-29

### Added
- `oh destroy` (a name-typing confirmation, `--yes` for non-TTY) and `oh compose config` close the last two `make`-only verbs, so `oh` is the single lifecycle door ([#879](https://github.com/mifunedev/openharness/issues/879)).
- Tracked `oh.json` holds every non-secret setting; a gitignored 0600 root `.env` holds only secrets. Adds `oh config show/set`, `oh secret set/list`, and an opt-in `oh config repo` ([#880](https://github.com/mifunedev/openharness/issues/880)).
- Restore `.oh/agents/` as an empty pack with its `.claude/agents` and `.codex/agents` provider symlinks; no agent is defined in it ([#866](https://github.com/mifunedev/openharness/pull/866)).

### Removed
- Delete the root `Makefile`. `oh` is the only lifecycle door on the host and inside the sandbox, and every verb runs `.oh/scripts/docker-compose.sh` through the CLI ([#881](https://github.com/mifunedev/openharness/issues/881)).
- Retire the "host dependencies: Docker, Git, and make — no Node" promise. Host prerequisites are now Docker, Git, and Node >= 20; `get-oh.sh` installs Node when it is missing ([#881](https://github.com/mifunedev/openharness/issues/881)).
- Retire `.devcontainer/.example.env`, `.oh/config.json`, `~/.config/openharness/`, and the `WORKTREES_DIR`/`PROJECTS_DIR`/`CRONS_DIR` knobs. The layout is now fixed convention ([#880](https://github.com/mifunedev/openharness/issues/880)).
- Delete the `.oh/context/` always-on tier in full, leaving `AGENTS.md` as the only always-on context. No `SessionStart` hook ever loaded it — prose in `AGENTS.md` asked for it ([#868](https://github.com/mifunedev/openharness/issues/868)).
- Retire `repo-map-contract.sh`, `CB-004`, `repo-orientation/`, and its scorer. `REPO_MAP.md` goes as **unproven**, not disproven: its A/B landed 2026-07-03 and was never run ([#868](https://github.com/mifunedev/openharness/issues/868)).
- Retire the ablation subsystem — `ablate.sh`, `ablate-state-machine.sh`, `context-audit-runner.sh`, `--ablate`. Its allowlist took only the five context files ([#868](https://github.com/mifunedev/openharness/issues/868)).
- Retire `CB-003-retro-identity-cycle.md` and the `DS-020-lens-diversity` dataset, which scored the identity-promotion cycle that no longer exists ([#868](https://github.com/mifunedev/openharness/issues/868)).
- Delete the canonical agent definitions (`.oh/agents/`), `.oh/plans/`, `.oh/handoffs/`, and the accumulated `.oh/tasks/` folders and archive ([#865](https://github.com/mifunedev/openharness/pull/865)).

### Changed
- Lock the `oh` CLI's npm version to the harness release version. `oh` is the only lifecycle door now, so its version is the only one a user sees, and `version-parity.sh` keeps the two package.json files and the CHANGELOG heading in agreement.
- `docs/lifecycle-commands.md` becomes the `oh`-only verb reference, and the `make ...` instructions are swept out of `README.md`, `AGENTS.md`, and `docs/` ([#881](https://github.com/mifunedev/openharness/issues/881)).
- Collapse the README install fan-out to three paths — npm, the `get-oh.sh` curl bootstrap, and from source. `docs/intro.md` no longer claims there is no host CLI ([#881](https://github.com/mifunedev/openharness/issues/881)).
- Document the VS Code divergence: "Reopen in Container" applies no compose overlay — no SSH, no docker socket, no Hermes dashboard, no `composeOverrides` ([#881](https://github.com/mifunedev/openharness/issues/881)).
- Base the sandbox image on `node:22-trixie-slim` and drop the NodeSource vendor script; the `sandbox` user is now pinned to `-u 1000`, the uid the Node image already claims ([#878](https://github.com/mifunedev/openharness/issues/878)).
- `crons/` carries its operating contract as `AGENTS.md` instead of `README.md`, documenting which cron edits apply at the next fire and which need a SIGHUP reschedule ([#874](https://github.com/mifunedev/openharness/issues/874)).
- Move cron definitions from `.oh/crons/` to `crons/` at the repo root; `oh init`/`oh update` deliver them through the manifest's new `rootInclude` payload ([#874](https://github.com/mifunedev/openharness/issues/874)).
- Add `CLAUDE.md` provider-compatibility symlinks beside every nested `AGENTS.md` — `.worktrees/`, `projects/`, and `crons/` — created by `oh init` for equipped repos ([#872](https://github.com/mifunedev/openharness/issues/872)).
- Move git worktrees to `.worktrees/` at each repository's own root and non-harness clones to `projects/<owner>/<repo>/`, each tracking only an `AGENTS.md` guide ([#872](https://github.com/mifunedev/openharness/issues/872)).
- `/retro` is now strictly report-only and writes no file; `IDENTITY.md` was its only write target. A graduated lesson is nominated as a candidate probe under `.oh/evals/probes/` instead ([#868](https://github.com/mifunedev/openharness/issues/868)).
- `/prompt-miner` loses its `IDENTITY.md` proposal target and proposes a probe instead ([#868](https://github.com/mifunedev/openharness/issues/868)).
- Rewrite `context-tier-size-budget.sh` as an `AGENTS.md`-only 9,500 B ratchet, dropping `SINGLE_FILE_SHARE_MAX` — one file in the tier is necessarily 100% of it ([#868](https://github.com/mifunedev/openharness/issues/868)).
- Lower the `capability-benchmark-schema` and `datasets-schema` floors to `>= 2`, matching the retired CB and DS artifacts ([#868](https://github.com/mifunedev/openharness/issues/868)).
- `oh init` no longer ships `context/**`, so new projects stop scaffolding a directory nothing loads ([#868](https://github.com/mifunedev/openharness/issues/868)).
- Update the `.oh/agents/` references in `docs/glossary.md` and `docs/oh-directory-layout.md` to describe an empty pack and drop the links to deleted agent files ([#867](https://github.com/mifunedev/openharness/pull/867)).
- Refocus root agent guidance on product identity, glossary, hazards, and code as truth; move build workflow authority into its task skill ([#854](https://github.com/mifunedev/openharness/issues/854)).
- Upgrade the sandbox base image to `debian:trixie-slim` and move Docker's apt suite to `trixie`; Cloudflare's suite stays on `bookworm` ([#807](https://github.com/mifunedev/openharness/issues/807)).
- Strip explanatory comments from all tracked code — `.ts`/`.mjs`/`.sh`/`.py` plus `oh-path`, the Dockerfile, the Makefile and `.zshrc` — leaving only machine-read directives ([#837](https://github.com/mifunedev/openharness/pull/837)).

### Fixed
- Repoint the eight skill surfaces that still cited the deleted `.oh/agents/advisor.md`; `/delegate` now owns the recursion-budget triple and `skill-paths.sh` guards the dead path ([#870](https://github.com/mifunedev/openharness/issues/870)).
- Amend `rfc-rsi-survey-mapping.md`, which still cited the deleted `.oh/memory/` tier as a live rung-4 instrument and as the harness's capital account ([#870](https://github.com/mifunedev/openharness/issues/870)).
- `oh harness install` and `oh tool install` now install live when run inside the sandbox instead of skipping with "sandbox not running"; `list`/`status` report real values instead of `?` ([#861](https://github.com/mifunedev/openharness/issues/861)).
- The `development` issue closer never fired: `pull_request_target` resolves the workflow from the **default** branch (`main`), where the file does not exist. Swapped to `pull_request` ([#841](https://github.com/mifunedev/openharness/issues/841)).
- **`uv python install` now works as the `sandbox` user without `sudo`.** `install -d -o sandbox -g sandbox .../uv/tools` chowns the final component only, so the intermediate `.../share/uv` stayed `root:root`.
- Root cause detail: `uv python install` writes `.../uv/python`, a sibling of `tools` inside that root-owned directory, so it failed with `Permission denied`. Every level is now named explicitly, parents first.
- The boot-time ownership repair now covers the uv tree. The UID-sync sweep only rewrites paths owned by the *old* sandbox UID, so a root-owned uv directory was never repaired. Existing containers self-heal on restart.

### Added
- `oh` detects in-sandbox execution (`OH_EXECUTION_TARGET=local|docker-compose` overrides); `oh sandbox` and `oh runtime install` refuse in-box as host-only ([#861](https://github.com/mifunedev/openharness/issues/861)).
- `.oh/scripts/verify-sandbox-image.sh` — reusable image verifier for the base, apt suites, sandbox UID/GID, Node/pnpm pins, the Herdr checksum, and required tool versions ([#807](https://github.com/mifunedev/openharness/issues/807)).
- `.github/workflows/sandbox-compatibility.yml` — Dockerfile-scoped CI that builds and verifies arm64 and one amd64 image with every optional installer ([#807](https://github.com/mifunedev/openharness/issues/807)).
- `.oh/scripts/provision-python.sh` — idempotent, user-scoped uv/Python provisioning. Drops from root to the target user with `HOME` pinned, installs a managed interpreter and an `ipykernel` venv, and verifies the kernel.
- The script writes `PRIME_AGENT_KERNEL_PYTHON` to `~/.local/share/oh/python-env.sh`, which login shells source. Modes: `--verify`, `--print-env`.
- Provisioning failures print the exact repair command instead of a bare permission denial, and refuse to suggest `sudo uv` — that installs under `/root/.local`, unreadable by the agent user.
- `ENV UV_PYTHON_INSTALL_DIR` and `ENV UV_CACHE_DIR` pin uv's managed-interpreter and cache trees under `/home/sandbox`, so nothing falls back to `/root`.
- `ARG INSTALL_PYTHON_KERNEL=true` (with `ARG OH_PYTHON_VERSION=3.11`) bakes the interpreter and kernel venv into the image as `sandbox`, so a fresh boot needs no network.
- The entrypoint re-runs the same idempotent script every boot behind `OH_PROVISION_PYTHON` (default `true`), non-fatally.
- Close linked issues on merge into `development`: `.github/workflows/close-issues-on-development.yml` reads closing keywords from a merged PR and closes each issue ([#841](https://github.com/mifunedev/openharness/issues/841)).
- Add `.github/pull_request_template.md` — title format, closing-keyword reminder, CHANGELOG checkbox ([#841](https://github.com/mifunedev/openharness/issues/841)).
- Add the `close-issues-on-development` eval probe: the closer stays merged-only, development-only, and capped at `contents: read` + `issues: write` ([#841](https://github.com/mifunedev/openharness/issues/841)).

### Removed
- Remove the standalone `firstmate` concept, runner, prompt, ladder, and active references; `/spec execute` now owns implementation and gates in one Advisor session ([#856](https://github.com/mifunedev/openharness/issues/856)).
- Remove the default `pi-autoresearch` package and its integration documentation; Pi no longer reports its conflicting dashboard shortcut at startup ([#852](https://github.com/mifunedev/openharness/issues/852)).
- **Remove the `.oh/memory` tier entirely.** Code is the source of truth. The directory, its tracked `README.md`, the `MEMORY.md` ledger, and dated session logs are gone as a concept — not relocated.
- **Remove file logging from the harness.** No skill, cron, or script writes a run log under `.oh/`. Runs report to the terminal; the only durable trail left is `.oh/crons/.cron.log`, the cron liveness line.
- Remove the seeder `.oh/scripts/ensure-memory-file.sh`, its boot pre-create block, `MEMORY_DIR` from both compose files and both `.example.env` templates, and the `memory` name from `.oh/scripts/oh-path`.
- Remove `AUDIT_LOG_ROOT` entirely. It existed only to resolve a shared log root, so `audit-run.sh` now validates and exports one root, and `route-driver.sh` scrubs one fewer variable.
- Remove `.oh/skills/retro/references/memory-protocol.md`, `.oh/skills/retro/scripts/{render-log-entry.sh,memory-audit.py}`, and `.oh/skills/prompt-miner/scripts/render-log-entry.sh`.
- Remove the Memory-Improvement-Protocol log step from 20 skills. `oh init` no longer seeds `.oh/memory/`.
- Remove 9 eval probes whose subject no longer exists, plus the `probe-memory.md` context-ablation probe. See the PR body for the list.
- **Remove the `workspace/` template directory.** It held two tracked files (`AGENTS.md` and a `CLAUDE.md` symlink) and never was the container's working directory — `workspaceFolder` is and stays the repo root.
- Remove the Dockerfile `COPY workspace/`, the `workspace/**` CI path filters, the eight `workspace/*` gitignore rules, and the `workspace/README.md` stub `oh init` used to scaffold.
- Remove the `workspace` scope from `/audit skills`; `all` now means the root scope alone.

### Changed
- Default Claude Code to concise replies, no memory of its own (`autoMemoryEnabled` + `autoDreamEnabled`), the harness `/git` policy instead of the built-in one, and no spinner tips ([#834](https://github.com/mifunedev/openharness/issues/834)).
- **`/retro` becomes report-only.** It keeps the scientific pass and promotes only to `.oh/context/IDENTITY.md` behind its propose-then-confirm gate. It writes no log.
- A supported `/retro` lesson that does not generalize is now reported and dropped; an anti-pattern forbids inventing a file to hold it. The subsystem lens drops from six to five.
- Rename `check-memory-duplicates.sh` to `check-identity-duplicates.sh`; it consults `IDENTITY.md` alone. The `GATE-PENDING` / `--resolves` contract from #767 retires with the log it wrote.
- **`/prompt-miner` becomes report-only.** `mine-traces.mjs` is unchanged apart from its output root; all 36 engine tests pass. Descriptive markers are reported, not promoted.
- **`/audit` reports its run record on stderr** instead of appending it to a file, as one `audit -- run-id=… target=… state=… verdict=… exit=…` line per outer run.
- `/render-html`, `/prompt-miner`, `/weigh`, `/rlm`, `/audit context --baseline`, and wiki drafts write to ephemeral `$TMPDIR` scratch outside the repo. Nothing under `.oh/` persists a run.
- `.oh/scripts/oh-path` now resolves every name against the repo root, so `_ablate_log_root` and the memory special cases in `ablate.sh` and `context-audit-runner.sh` go too.
- The heartbeat, cleanup-tasks, eval-weekly, and prompt-miner crons stop logging to memory. `.oh/crons/.cron.log` is now each cron's only durable per-pulse signal, and `locked-append.sh` survives as its writer.
- Rewrite `heartbeat-logging-contract.sh` and `audit-run-root-contract.sh` around the liveness line and the stderr run record. Retarget `CB-003` and `DS-020` from `MEMORY.md` to `IDENTITY.md`.
- Remove the `conciseness.yml` workflow. It scored `workspace/*.md` seeds; `SOUL.md`/`TOOLS.md`/`USER.md`/`HEARTBEAT.md` left that directory in `d6751b66`, so it has passed on a near-empty set ever since.
- Retarget `repo-map-contract.sh`'s ancestor-helper fixture to `.oh/templates/`, and move its symlink de-dupe assertion onto the root `CLAUDE.md`.

## [0.4.0] - 2026-08-26

### Removed
- **Remove `harness.yaml` entirely.** Configuration collapses to `.devcontainer/.env` plus the `oh` CLI. Deleted: `harness.yaml.example`, `.oh/templates/harness.yaml`, the 163-line awk parser `.oh/scripts/harness-config.sh`, the 251-line `.oh/cli/src/lib/harness-yaml.ts`, their two test files, the `harness-yaml-schema-parity` probe, and the `make harness-config` target. The layer never earned its place: every key it mapped already existed as a compose env var with a default, and it was **invisible on the VS Code "Reopen in Container" path**, which names `.devcontainer/docker-compose.yml` directly and so reads only `.devcontainer/.env`. A key set in `harness.yaml` silently did nothing there.
- Remove the derived `.devcontainer/.harness.yaml.env` artifact and the second `--env-file` that carried it. The wrapper now passes exactly one env-file — the same one compose auto-loads on the VS Code path — so the two doors cannot disagree by construction.

### Added
- Add `.oh/scripts/migrate-harness-yaml.sh`: a **one-shot automatic migration** so no existing install silently loses a setting. It runs from `.oh/scripts/docker-compose.sh` and `.oh/scripts/install.sh`, so it fires on every lifecycle verb; it translates the 21 allowlisted keys into `.env` (uncommenting template lines in place), moves `compose.overrides` into `.oh/config.json` `composeOverrides[]`, renames the file to `harness.yaml.migrated`, and prints every value it carried over — including both sides of any value it replaced. Absent a `harness.yaml` it exits 0 immediately. It is **self-contained**, carrying its own copy of the deleted parser, so the whole compatibility story is one file to delete in a later release.
- Add `.oh/cli/src/lib/env-file.ts` — the one `.env` reader/writer, replacing `lib/harness-yaml.ts`. Reads go through the existing `loadEnvInto`, so no fifth env parser was added; writes carry over the uncomment-in-place discipline. Config reads are now plain filesystem reads: `oh sandbox` and `oh shell` spawn **zero** subprocesses to resolve configuration, where every read used to shell out to the vendored parser.
- Add three probes replacing the deleted parity probe: `env-schema-parity.sh` (the two `.example.env` templates carry the same keys, and every var any `docker-compose*.yml` interpolates is documented — this closes a real gap: `DOCKER_SOCKET`, `SANDBOX_SSH`, `SANDBOX_SSH_PORT`, `OH_SANDBOX_IMAGE`, `OH_PULL_POLICY` and `SKIP_PNPM_INSTALL` were consumed but documented nowhere), `harness-yaml-migration.sh` (append / uncomment-in-place / preserve / overwrite, plus a silent second run), and `compose-config-path-parity.sh` (**the wrapper path and the VS Code path resolve the same service** — the parity `harness.yaml` made impossible).

### Changed
- **`.devcontainer/.example.env` is now the schema document**, carrying all 25 keys with their defaults and prose, lifted from `harness.yaml.example`. Its "Migrated to harness.yaml" block is gone. `.oh/templates/.devcontainer/.example.env` is brought to key parity — an `oh init` repo shipped a template documenting three vars.
- **The installer's config writes always run.** `install.sh` put its entire config block inside `if [ ! -f .devcontainer/.env ]`, so re-running it over an existing install wrote nothing; with `.env` as the only surface that would have become a total no-op. `.env` is now seeded when absent and the writes always follow, each idempotent and one line wide. Host detections (timezone, git identity) still only seed a fresh file, so a re-run never silently overwrites a hand-edited value.
- `.oh/scripts/docker-compose.sh` drops five `harness.yaml` resolution ladders (hermes-dashboard, docker-socket, ssh.enabled, ssh.port, sandbox.name) and the `compose-overrides` loop; each collapses onto the `.env` fallback that was already the next line. The overlay `-f` list is byte-identical before and after, verified against a recorded baseline.
- `.oh/scripts/oh-path` loses its `paths.<name>` ladder: the precedence is now `<NAME>_DIR` env → `.oh/<name>`.
- `oh init`'s wizard writes **one** file. It used to split non-secret answers to `harness.yaml` and secrets to `.env`; both now land in `.env` in a single write, through the same line editor, so the operator's answers appear as uncommented lines inside the documented template.
- CI path filters and their probes move from `harness.yaml.example` to `.devcontainer/.example.env` (`ci-harness.yml`, `sandbox-boot-guard.yml`, `harness-ci-core-paths.sh`, `sandbox-boot-guard-ci.sh`). `oh-init-headless-config.sh` retargets to the `.example.env` template and additionally asserts `--yes` writes no `.env` at all.
- `.gitignore` keeps `/harness.yaml` and `.devcontainer/.harness.yaml.env` for one more release so a stale local artifact from a pre-0.4.0 checkout is never committed, and adds `/harness.yaml.migrated`.


## [0.3.0] - 2026-08-25

### Removed
- Remove the `autopilot` self-improvement loop entirely: the `/autopilot` skill, the hourly `.oh/crons/autopilot.md` cron (already `enabled: false`), the `autopilot-caps.sh` PR-cap gate, the `autopilot-runs` eval dataset, and eight `autopilot-*` probes. The loop had not run in some time and is better rebuilt than maintained.
- Remove the `/watchdog` skill and its three probes. It existed to babysit autopilot's unattended draft PRs and stuck `autopilot-*` tmux sessions; with no unattended runner producing them there is nothing to watch. **`cron-watchdog` — the tmux supervisor that restarts `cron-system` — is unrelated and untouched.**
- Remove `.oh/docs/roadmap.md` and stop `/strategic-proposal` writing it. The pinned GitHub roadmap issue is the live surface; the in-repo copy went stale and only cost context to read.
- Remove `prompt-miner-caps.sh` (both copies), which wrapped the deleted cap gate. **`.oh/crons/prompt-miner.md` is now uncapped and stays `enabled: false`** — re-add a cap gate before enabling it; see its § Caps.
- Remove the `autopilot:` section from `harness.yaml.example` and `.oh/templates/harness.yaml`, and the `owned-surface-guard`, `clean-restore`, and `locked-append-critical-path` probes, whose subject was the deleted skill.

### Changed
- `AGENTS.md` § The Workflow: the canonical operative path is now `spec-plan → spec-execute → merge → reset|clean`. The `select` node and its designated sole runner are gone — a human enters at `/spec plan`. `workflow-boundaries.sh` asserts the new shape.
- The harness-infra self-edit surface (`OWNED_PATHS`) moves from the deleted skill to `.oh/docs/repair-operator-registry.md` § Tier 1, which is now its source of truth. `security-considerations.md` § 6 is downgraded from ENFORCED to DOCTRINE to say so honestly.
- Capability tasks CB-001 and CB-002 record a **baseline reset**: pre-0.3.0 scores are not comparable on the `unattended` axis, since the unattended runner no longer exists.

- Rename the cron runtime's per-cron environment exports to match what they actually are: `AUTOPILOT_REPO` -> `CRON_REPO`, `AUTOPILOT_REMOTE` -> `CRON_REMOTE`, `AUTOPILOT_LOG_ROOT` -> `CRON_LOG_ROOT`. They are generic plumbing for any cron declaring `repo:` or `worktree: true`, never autopilot-specific, and joining the existing `CRON_WORKTREE`/`CRON_AGENT_BIN`/`CRON_KEEP_MARKER` family leaves no vestigial vocabulary behind. **Breaking for any out-of-tree consumer that sets the old names** — in-tree there are none.

## [0.2.0] - 2026-08-26

### Added
- Add `oh harness <list|install|status>` to install optional harnesses into a running sandbox without a rebuild, persisting the choice to `install.<key>` for the next build ([#821](https://github.com/mifunedev/openharness/pull/821)).
- Add `oh runtime <list|install|status>`, reporting the container runtime in use and gating a MicroSandbox install on the measured glibc and `/dev/kvm` blockers. It selects no runtime ([#823](https://github.com/mifunedev/openharness/pull/823)).
- Add `oh tool <list|install|status>` for sandbox tooling that is neither an agent CLI nor a runtime, making `agent-browser` installable without a rebuild behind a ~1 GB download gate ([#824](https://github.com/mifunedev/openharness/pull/824)).
- Add `oh stop|restart|logs|ps`, closing the lifecycle gap where `make` had verbs the CLI did not, and publish one `make` vs `oh` mapping doc that the other docs link to ([#825](https://github.com/mifunedev/openharness/pull/825)).
- Document running Open Harness on MicroSandbox by pointing `msb` at the published image, and re-scope the microsandbox blockers as devcontainer measurements that say nothing about the reader's host.
- Add a "which door am I?" table plus two guard probes: `harness-yaml-schema-parity.sh` and `oh-init-headless-config.sh`.
- Add `ssh.enabled`/`ssh.port` and `sandbox.docker_socket` prompts to the `oh init` wizard, the two settings most likely to need hand-editing.
- Require `.oh/tasks/<slug>/evidence.md` before `/spec execute` undrafts a PR, and refuse an untracked one, so the reviewer gets the build's answer back to the plan they approved ([#817](https://github.com/mifunedev/openharness/pull/817)).
- Add a "why this is better" question to the reviewer evidence contract, ahead of the four correctness questions, with unmeasured benefits labelled as such ([#817](https://github.com/mifunedev/openharness/pull/817)).
- Add `protected-path-deletion.sh`, which reads `.claude/protected-paths.txt` at the merge base and fails when a listed path is deleted without a justification in a committed `evidence.md` ([#817](https://github.com/mifunedev/openharness/pull/817)).
- Add `memory-probe-claims-resolve.sh` and `context-tier-size-budget.sh` to hold the memory ledger's enforcement claims and the always-on context budget ([#817](https://github.com/mifunedev/openharness/pull/817)).

### Changed
- Run `/eval` once per cycle instead of three times: `/spec execute` publishes a commit-keyed `eval-result.json` the downstream gates read, cutting 318 probe executions to 110 ([#817](https://github.com/mifunedev/openharness/pull/817)).
- Promote `progress.txt` into the PR body, so the build narrative reaches the reviewer instead of ending at the `STATUS: COMPLETE` sentinel ([#817](https://github.com/mifunedev/openharness/pull/817)).
- Write `install.sh`'s non-secret answers to `harness.yaml` rather than the lower-precedence `.devcontainer/.env`, keeping `DOCKER_SOCKET` in `.env` as a documented exception.
- Lead the README and quickstart with the two scripted installers and demote the untested manual clone sequence into the collapsed section, merging its two duplicate copies into one.

### Fixed
- Match the release-notes heading with `index()` instead of a regex built by string concatenation, so extraction does not depend on whether the runner's `awk` is mawk or gawk ([#820](https://github.com/mifunedev/openharness/pull/820)).
- Fix the build session launching headless: the prompt travels as argv instead of stdin and no arm carries `--print`, so the child no longer answers once and exits ([#817](https://github.com/mifunedev/openharness/pull/817)).
- Stop `| tee` in the launch path taking the child's TTY; tmux attaches `pipe-pane` after the pane exists and foreground mode inherits the caller's stdio ([#817](https://github.com/mifunedev/openharness/pull/817)).
- Fix `firstmate.sh --kill` exiting 1 silently while leaving the session running, the lock claimed, and no `FIRSTMATE-INCOMPLETE` line appended ([#817](https://github.com/mifunedev/openharness/pull/817)).
- Stop the `/audit` boundary exporting its lifecycle identity to the agent it launches, which made probes grade their caller and flipped one tree's verdict between runs ([#817](https://github.com/mifunedev/openharness/pull/817)).
- Rewrite 76 unbacked `probe:` claims in the memory ledger to explicit `probe: none` via a tracked idempotent script ([#817](https://github.com/mifunedev/openharness/pull/817)).
- Correct the MicroSandbox runner walkthrough: set `entrypoint:` explicitly, without which the seed and provider linking never run; drop the unsubstituted `GH_TOKEN`; and re-rank the untested inferences so the boot-breaking one leads.
- Collapse the two disagreeing `harness.yaml` line editors into one `setKeyInSection` in `lib/harness-yaml.ts`; the wizard's section-blind copy silently dropped answers for keys absent from the template.
- Reconcile `.oh/templates/harness.yaml` with `harness.yaml.example`, restoring the `sandbox.docker_socket`/`image`/`pull_policy`, `paths.worktrees`, `crons`, `autopilot`, `slack`, and `compose` keys that had no home to be written into.
- Correct `harness.yaml.example`'s claim that `pull_policy` reaches the VS Code "Reopen in Container" path — it does not, and no key in the file does.

### Removed
- Remove the critique/approve gate; the operator's approval of `prd.md` is the commitment gate, and no critic agents are spent per plan ([#817](https://github.com/mifunedev/openharness/pull/817)).
- Collapse three build executors to one, deleting `.oh/scripts/ralph.sh` and every executor toggle rather than reducing them to a single accepted value ([#817](https://github.com/mifunedev/openharness/pull/817)).
- Absorb `/ship-spec` into `/spec execute` and delete the skill, so the build mechanics read top to bottom in one file with no deferral ([#817](https://github.com/mifunedev/openharness/pull/817)).
- Delete `.oh/prompts/`, `.pi/prompts/advisor/`, and the First Mate charter, leaving `.oh/skills/firstmate/templates/session-prompt.md` as the only description of the build workflow ([#817](https://github.com/mifunedev/openharness/pull/817)).
- Delete `/teach` and its pipeline step; `evidence.md` carries the model to the reviewer, and the wiki half was already a gate in step 5 ([#817](https://github.com/mifunedev/openharness/pull/817)).
- Delete the DeepWiki comparison from the wiki gate, which regenerates on no schedule the gate can depend on, and rename the schema section to state its own requirements ([#817](https://github.com/mifunedev/openharness/pull/817)).
- Delete four `STATUS: SPEC-*` tokens with no executable consumer and drop the groom triad from the per-cycle path ([#817](https://github.com/mifunedev/openharness/pull/817)).

## [0.1.0] - 2026-08-23

### Fixed
- Emit `scoreUncapped` alongside the clamped `score` in `/prompt-miner`, and report as `UNSTABLE` any marker whose capped and uncapped effect sizes disagree ([#778](https://github.com/mifunedev/openharness/issues/778)).
- Anchor the `memory` name in `oh-path` to the main worktree ([#152](https://github.com/mifunedev/openharness/issues/152), [#693](https://github.com/mifunedev/openharness/issues/693), [#768](https://github.com/mifunedev/openharness/issues/768)).
- Make `/retro` append a `GATE-PENDING` log entry before the approval gate and a resolving entry with the real counts after it ([#767](https://github.com/mifunedev/openharness/issues/767)).
- Make the `/ste` checker's exit-`0` line name the two defects it cannot see — a condition placed after the action it guards, and a sentence opening on a pronoun with no antecedent — and point at `SKILL.md`.
- Keep the firstmate execution-context probe pane alive across its own read, so the runner gate can admit herdr instead of refusing it in every environment ([#761](https://github.com/mifunedev/openharness/issues/761)).
- Make assertion (d) of `cc-safety-net-wiring.sh` assert the resolved cc-safety-net version instead of the declared dependency range ([#759](https://github.com/mifunedev/openharness/issues/759)).
- Repair seven `.claude/protected-paths.txt` entries that resolved to nothing and add a probe so a rename cannot silently disarm a guard again ([#753](https://github.com/mifunedev/openharness/issues/753)).

### Security

- Pin transitive `nanoid` to the patched `^3.3.17` range to close GHSA-2v37-7h3g-55p8 through the Vitest → Vite → PostCSS dependency path.
- Deny the `docker`/`podman`/`nerdctl` inspect shapes that expose environment variables — any template naming `env` or expanding the whole object — while keeping narrow field reads ([#723](https://github.com/mifunedev/openharness/issues/723)).
- Block agent reads and writes to operator-owned `settings.local.json` files across Claude, Codex, and shared Open Harness hooks ([#710](https://github.com/mifunedev/openharness/issues/710)).

### Removed
- Remove the `/caveman` token-compression skill and its four subcommands after 743 session traces showed zero invocations ([#752](https://github.com/mifunedev/openharness/issues/752)).

### Added
- Add `.oh/docs/rfcs/rfc-rsi-survey-mapping.md`, a decision-only RFC mapping a recursive-self-improvement survey onto this repository ([#525](https://github.com/mifunedev/openharness/issues/525)).
- Add `.oh/scripts/registry-portability.sh` and two portability probes ([#758](https://github.com/mifunedev/openharness/issues/758), [#645](https://github.com/mifunedev/openharness/issues/645), [skills#7](https://github.com/mifunedev/skills/pull/7)).
- Add `/ste`, a Simplified-Technical-English standard for artifact prose: 53 rules, a 198-word dictionary, 24 examples, and a dependency-free `ste-check.sh` ([#750](https://github.com/mifunedev/openharness/issues/750)).
- Add `firstmate`, an opt-in third build executor (`--executor=firstmate`) running one long-lived session over a whole `.oh/tasks/<slug>/` graph ([#746](https://github.com/mifunedev/openharness/issues/746)).
- Add `.oh/docs/rfcs/rfc-brain-hands-boundary.md` as the authoritative Phase-0 brain/hands contract ([#733](https://github.com/mifunedev/openharness/issues/733), Refs [#731](https://github.com/mifunedev/openharness/issues/731)).
- Record the audit's proof as a committed `.oh/tasks/<slug>/evidence.md` during the `.oh/prompts/advisor/pr.yml` flow ([#719](https://github.com/mifunedev/openharness/issues/719)).
- Deny agents read and write access to the operator-only `.config/` directory, at the repo root and in `$HOME`, as a first-class tier in both `PreToolUse` guards ([#707](https://github.com/mifunedev/openharness/issues/707)).
- Add `lsof`, `htop`, and the `inetutils-telnet` plaintext diagnostic client to the default sandbox image ([#703](https://github.com/mifunedev/openharness/issues/703)).
### Changed
- **Release versioning moves from CalVer to SemVer.** Root `package.json` now holds the only copy of the version, and an unbumped push to `main` is a clean no-op run instead of a failure ([#814](https://github.com/mifunedev/openharness/issues/814)).
- Rehome `/health-check` Docker triage host-side ([#762](https://github.com/mifunedev/openharness/issues/762), Refs [#756](https://github.com/mifunedev/openharness/issues/756), [#731](https://github.com/mifunedev/openharness/issues/731)).
- Ship `.oh/docs/**` through the payload manifest while retaining the `.oh/patches/**` exclusion ([#738](https://github.com/mifunedev/openharness/issues/738)).
- Retire the five `KNOWN` entries from `.oh/scripts/registry-portability.md`, leaving 8 `ALLOW` entries and a clean lint ([#758](https://github.com/mifunedev/openharness/issues/758), [#751](https://github.com/mifunedev/openharness/issues/751)).
- Route `oh sandbox` and `oh shell` through the `ExecutionTarget` contract with no operator-visible behavior change ([#733](https://github.com/mifunedev/openharness/issues/733), Refs [#731](https://github.com/mifunedev/openharness/issues/731)).
- Enable Pi subagent FleetView by pinning `@tintinweb/pi-subagents@0.12.0`, with the navigable agent list on by default.
- Set the default Pi driver to `openai-codex/gpt-5.6-luna` with `max` reasoning while retaining Sol, Terra, and Luna in the model selector ([#700](https://github.com/mifunedev/openharness/issues/700)).
- Release every validated push to `main` or `master` with retry-safe CalVer reservations, immutable GHCR tags, `latest` digest promotion, gated CLI publication, and Release finalization ([#689](https://github.com/ryaneggz/openharness/issues/689)).
- Expose the supported GPT-5.6 variants in Pi's model selector ([#684](https://github.com/mifunedev/openharness/issues/684)).
- Expand Advisor planning with a designer lens and make implementation/PR prompts explicitly finish with delegated audits and retrospectives ([#680](https://github.com/mifunedev/openharness/issues/680)).
### Fixed
- Install the pinned `ryaneggz/pi-langfuse` commit carrying the upstream shutdown fix ([gooyoung/pi-langfuse#14](https://github.com/gooyoung/pi-langfuse/pull/14), [#715](https://github.com/mifunedev/openharness/issues/715)).
- Stop the cron reaper from reading a `git status` failure as uncommitted work, adding a `WORKTREE_ORPHANED` outcome that removes the orphaned directory ([#694](https://github.com/mifunedev/openharness/issues/694)).
- Resolve the `prompt-miner` daily-log write root to the main worktree via `AUTOPILOT_LOG_ROOT` → `CRON_WORKTREE` → toplevel, so Step 5 entries survive the cron reaper ([#693](https://github.com/mifunedev/openharness/issues/693)).
- Admit sessions whose activity span overlaps the `prompt-miner` window, exclude subagent turns from every signal, and widen the daily cron window to `--hours 336` ([#692](https://github.com/mifunedev/openharness/issues/692)).
- Make the `prompt-miner` engine run through the `.claude/skills` symlink with a symlink-safe entrypoint guard ([#692](https://github.com/mifunedev/openharness/issues/692), [#663](https://github.com/mifunedev/openharness/issues/663)).
- Index `.oh/docs/rfcs/rfc-runtime-support.md` from `.oh/docs/README.md` and repoint the dangling `.claude/rules/` bullet in the `critic` and `implementer` agents ([#686](https://github.com/mifunedev/openharness/issues/686)).
- Declare `/help`, `/trusted`, `/channels`, `/enable`, `/disable`, `/revoke`, and `/toggletools` in `.pi/install/slack-manifest.json` ([#354](https://github.com/ryaneggz/openharness/issues/354)).
### Removed
### Deprecated
### Security
## [2026.7.26] - 2026-07-26

### Added
- Install Herdr by default as a persistent multi-agent terminal workspace ([#651](https://github.com/mifunedev/openharness/issues/651)).
- Add bounded local PDF, DOCX, PPTX, and XLSX normalization to `/wiki ingest` through Microsoft MarkItDown's pinned CLI, preserving immutable source provenance ([#650](https://github.com/mifunedev/openharness/pull/650)).
- Add the explicit nine-target `/audit` dispatcher, deterministic focused/queue PR classifier, correlated full campaigns, and shared locked ablation recovery ([#646](https://github.com/mifunedev/openharness/pull/646)).
- Adopt `cc-safety-net@1.0.6` as the destructive-command guard for claude, codex, and pi, baked into the image with a `CC_SAFETY_NET_OFF=1` kill-switch ([#654](https://github.com/mifunedev/openharness/issues/654)).
- Add the First Mate role charter at `.oh/context/rules/first-mate.md`, the git-tracked `.oh/prompts/advisor/` prompt pack, and an `architect` crew agent ([#660](https://github.com/mifunedev/openharness/issues/660)).
### Changed
- Default agent-browser desktop sessions to a 1280×720 viewport ([#674](https://github.com/mifunedev/openharness/issues/674)).
- Refresh the default Claude model, durable review-loop guidance, and Cloudflared public-surface verification instructions ([#672](https://github.com/mifunedev/openharness/issues/672)).
- Relicense from MIT to Apache License 2.0 with patent grants and trademark clarity; prior MIT releases remain available under MIT and the hosted Console stays proprietary ([#666](https://github.com/mifunedev/openharness/issues/666)).
- Make Herdr the canonical first interactive workspace after sandbox entry, with setup and agents organized inside persistent panes and a pinned, checksum-verified CLI ([#653](https://github.com/mifunedev/openharness/issues/653)).
- Protect the consolidated `/audit` owner in place of the superseded `harness-audit`, `skill-lint`, `eval-lint`, and `drift-check` entry points ([#647](https://github.com/mifunedev/openharness/issues/647)).
- **BREAKING:** Consolidate artifact authoring under `/builder <agent|skill|command|rule> <name-or-request>` with one authoritative reference per type ([#643](https://github.com/mifunedev/openharness/issues/643)).
### Fixed
- Harden audit consolidation with real GitHub CI normalization, executable run/log lifecycle, focused watchdog classification, and non-mutating implementation gates ([#646](https://github.com/mifunedev/openharness/pull/646)).
### Removed
- **BREAKING:** Remove the superseded audit-family entry points and the `auditor` agent; migrate `/pr-audit`, `/harness-audit`, `/skill-lint`, and peers to their `/audit` subcommands ([#646](https://github.com/mifunedev/openharness/pull/646)).
- Remove the legacy `agent-builder`, `skill-builder`, `command-builder`, and `rule-builder` agents and the superseded `/skill-builder` entry point; migrate callers to `/builder` ([#643](https://github.com/mifunedev/openharness/issues/643)).
- Retire the dead `RISKY_BASH` array and its bash branch from pi's `.pi/extensions/path-guard.ts`, now superseded by cc-safety-net; `SENSITIVE_PATHS` and `/guard` are retained ([#654](https://github.com/mifunedev/openharness/issues/654)).
### Deprecated
### Security
- Add a reproducible, audit-gated `pi-langfuse@1.5.7` installer that overrides its vulnerable OpenTelemetry SDK tree to patched `@opentelemetry/sdk-node@0.220.0` ([#664](https://github.com/mifunedev/openharness/issues/664)).
- Pin the transitive `postcss` dependency to the patched `^8.5.18` via `pnpm.overrides`, clearing GHSA-r28c-9q8g-f849 and unblocking `pnpm run security:audit` on every PR ([#668](https://github.com/mifunedev/openharness/issues/668)).
- Move every pinned GitHub Action off the deprecated Node 20 runtime and unpin the major in the `pnpm-audit-ci-gate` probe so future runtime bumps do not read as regressions ([#670](https://github.com/mifunedev/openharness/issues/670)).
## [2026.7.15] - 2026-07-15

### Added
### Changed
### Fixed
- Keep `/tmp/cron-watchdog.sh` root-owned and make the optional cron supervisor non-fatal under `set -e`, so a container restart no longer crash-loops the node ([#640](https://github.com/mifunedev/openharness/issues/640)).
### Removed
### Deprecated
### Security

## [2026.7.14] - 2026-07-14

### Added
- Document optional Pi-to-Langfuse observability, configuration precedence, privacy controls, and sandbox network boundaries ([#480](https://github.com/mifunedev/openharness/issues/480)).
- Document optional Claude Code-to-Langfuse observability through the official marketplace plugin, including the user-scope privacy boundary and local sandbox endpoint setup ([#480](https://github.com/mifunedev/openharness/issues/480)).
### Changed
- Make `/delegate` inherit the session model by default and select the Agent tool's `thinking` level from task complexity ([#637](https://github.com/mifunedev/openharness/issues/637)).
### Fixed
- Pass `--ignore-registry-errors` to the `pnpm audit` preinstall hook so npm's retired audit endpoint (HTTP 410) no longer aborts `pnpm install` on fresh sandbox boots ([#639](https://github.com/mifunedev/openharness/pull/639)).
### Removed
### Deprecated
### Security

## [2026.7.10] - 2026-07-10

### Added
- Add `oh cloud` commands for securely storing the current provisioner credential and managing OpenHarness Cloud SSH keys and node lifecycles without hand-written API requests ([#625](https://github.com/mifunedev/openharness/issues/625)).
- Add an opt-in sshd compose overlay with loopback binding, public-key-first auth, host-port collision checks, and direct-SSH/nginx multi-tenant docs ([#599](https://github.com/mifunedev/openharness/pull/599)).
### Changed
- Route `/delegate` worker selection through version-agnostic Luna, Terra, and Sol tiers with compatible legacy fallbacks ([#627](https://github.com/mifunedev/openharness/issues/627)).
### Fixed
### Removed
### Deprecated
### Security

## [2026.7.6] - 2026-07-06

### Added
### Changed
### Fixed
- Fix the `OH_IMAGE_ONLY=1` (no-bind) boot crash-loop by re-including the tracked `.claude/` control-plane config in `.dockerignore` and self-healing already-seeded volumes that are missing those files.
### Removed
- Remove the Railway hosted smoke deployment surface, including the root Railway config, deploy assets, documentation, README button, and eval guard.
### Deprecated
### Security

## [2026.7.5-5] - 2026-07-05

### Added
### Changed
- Move the canonical ignored worktree root into `.oh/worktrees/`, including `WORKTREES_DIR`/`paths.worktrees` plumbing and updated runtime/docs/skill references.
### Fixed
### Removed
### Deprecated
### Security

## [2026.7.5-4] - 2026-07-05

### Added
- **`oh sandbox` can pull the published GHCR image instead of rebuilding locally.** Adds `--image[=<ref>]`, `--no-build`, `harness.yaml` image/pull-policy wiring, docs, and an eval guard ([#610](https://github.com/mifunedev/openharness/pull/610)).
- **Open Harness can run in image-only mode without a repo checkout.** Adds `docker-compose.image-only.yml`, `OH_IMAGE_ONLY=1` volume seeding from `/opt/oh-seed`, and an eval guard ([#611](https://github.com/mifunedev/openharness/pull/611)).
- **`@mifune/openharness` now ships a README and LICENSE on its npm page.** Adds `.oh/cli/README.md` and `.oh/cli/LICENSE` and bumps the CLI to `0.1.1` ([#564](https://github.com/mifunedev/openharness/issues/564)).
### Changed
- **Move the `oh` CLI npm publish into its own `publish-cli.yml` workflow,** triggered by `workflow_dispatch` and CalVer tags, so a CLI-only change can publish without a harness release ([#564](https://github.com/mifunedev/openharness/issues/564)).
### Fixed
### Removed
### Deprecated
### Security

## [2026.7.5-3] - 2026-07-05

### Added
### Changed
### Fixed
- **The CLI's `prepublishOnly` typecheck no longer needs workspace-root test dependencies:** it now uses `tsconfig.build.json`, which excludes `src/__tests__/**` ([#564](https://github.com/mifunedev/openharness/issues/564)).
### Removed
### Deprecated
### Security

## [2026.7.5-2] - 2026-07-05

### Added
### Changed
### Fixed
- **The `publish-npm` CI job now publishes the CLI from `.oh/cli` instead of the repository root,** so the `dist`-only bundle ships instead of the private root package ([#564](https://github.com/mifunedev/openharness/issues/564)).
### Removed
### Deprecated
### Security

## [2026.7.5] - 2026-07-05

### Security
- **The host Docker socket is no longer mounted by default — it is now an explicit, prompted opt-in.** Enable it with `sandbox.docker_socket: true` or `DOCKER_SOCKET=true` to apply the docker-sock compose overlay.

### Fixed
- **Equipped-project sandbox no longer crash-loops on boot.** `link-providers.sh` now falls back to `${OH_PROJECT_ROOT:-$PWD}` when the project is not a git checkout, instead of failing the entrypoint.

### Added
- **Publish the standalone `oh` CLI to npm as `@mifune/openharness`**, so Node.js ≥ 20 users can `npm install -g` or `npx` it instead of the `get-oh.sh` bootstrap ([#564](https://github.com/mifunedev/openharness/issues/564)).
- Add `.oh/scripts/get-oh.sh`, a curl|bash installer that puts the self-contained `oh` binary in `~/.local/bin/oh` with no repo clone, offering nvm + Node 22 when Node.js ≥ 20 is missing.
- Add ADR-0001 recording #532's disposition: the lightweight RFC/ADR convention is sufficient, and taxonomy, registries, lifecycle, and conformance stay deferred ([#532](https://github.com/mifunedev/openharness/issues/532)).
- Add a descriptive, example-only `.oh/harness.yml` manifest reference pointing at today's `.oh/agents/`, `.oh/skills/`, `.oh/hooks/`, `.oh/crons/`, and `.oh/tasks/` surfaces ([#532](https://github.com/mifunedev/openharness/issues/532)).
- Add `.oh/docs/rfcs/rfc-selfimprove-roadmap.md`, a curated self-improving-harness roadmap decomposing the epic into dependency-ordered proposed child issues for human filing ([#525](https://github.com/mifunedev/openharness/issues/525)).
- Add `.oh/docs/rfcs/rfc-trace-ledger.md`, an RFC for an append-only normalized trace/event ledger with proposed `.oh/traces/` and `.oh/sessions/` storage, redaction rules, and event set ([#525](https://github.com/mifunedev/openharness/issues/525)).
- Add the `oh-cli-portable-lifecycle` wiki entry on the standalone CLI's payload precedence and lifecycle verbs, plus a "Standalone CLI (`oh`)" section in `.oh/docs/installation.md` ([#564](https://github.com/mifunedev/openharness/issues/564)).
- Add the `oh-standalone-lifecycle` eval probe guarding the `sandbox`/`shell`/`gateway` + `--from-remote` registrations and the consumer `/home/sandbox/project` path mapping ([#564](https://github.com/mifunedev/openharness/issues/564)).
- **Add `oh sandbox`, `oh shell`, and `oh gateway` lifecycle verbs** — wrappers over the vendored `.oh/scripts/` that resolve the equipped-project root from any subdirectory ([#564](https://github.com/mifunedev/openharness/issues/564)).
- Add `.oh/docs/security-considerations.md` documenting the security boundaries the harness enforces today, each path-cited to its mechanism and labelled ENFORCED vs RECOMMENDED ([#568](https://github.com/mifunedev/openharness/issues/568)).
- Add a lightweight RFC/ADR index at `.oh/docs/rfcs/README.md`: `RFC:`/`ADR:` issues moving Draft → Accepted → Superseded ([#532](https://github.com/mifunedev/openharness/issues/532)) ([#567](https://github.com/mifunedev/openharness/issues/567)).
- Add an agent-browser X.com login snippet for dashboard-observed human login, persistent profiles, 2FA/CAPTCHA handling, Google OAuth fallback, and credential safety.
- Add a Railway one-click hosted smoke deploy path from the README, with config-as-code, deploy assets, docs, and an eval drift guard ([#553](https://github.com/mifunedev/openharness/issues/553)).
- **Add the `OH_PROJECT_ROOT` project-root seam** as the single source of truth for the container workspace path (default `/home/sandbox/harness`), with `HARNESS` kept as an alias ([#531](https://github.com/mifunedev/openharness/issues/531)).
- **Add `oh init [dir]` to scaffold a fresh harness checkout** from a `.oh/templates/` payload, with a `--templates <dir>` escape hatch and the `oh-init-scaffold` eval probe ([#531](https://github.com/mifunedev/openharness/issues/531)).
- Add `oh update`, which upgrades only the `.oh/` control plane of an equipped repo from a `--from <checkout>` source, leaving project source untouched ([#531](https://github.com/mifunedev/openharness/issues/531)).
- Add `.oh/manifest.json`, a payload manifest `oh update` honors so it overlays a declared allowlist and no longer vendors `.oh/docs/` or `.oh/patches/` ([#531](https://github.com/mifunedev/openharness/issues/531)).
- **Add two Recursive Language Model skills** — `/weigh` (weighted-trajectory scoring) and `/rlm` (context-as-environment decomposition), plus two eval probes ([#533](https://github.com/mifunedev/openharness/issues/533)).
- **Teach `oh init`/`oh update` `--from-remote [--ref <ref>]`** to materialize the payload and templates from a shallow clone of the public repo ([#564](https://github.com/mifunedev/openharness/issues/564)).
- Add `.oh/docs/oh-directory-layout.md`, a descriptive map of every real `.oh/` top-level entry with its purpose and canonical consumer, linked from the docs index ([#566](https://github.com/mifunedev/openharness/issues/566)).
- Add a descriptive [`.oh/docs/glossary.md`](.oh/docs/glossary.md) defining Open Harness's core vocabulary as the repo uses each term, with a canonical source pointer per entry ([#565](https://github.com/mifunedev/openharness/issues/565)).
- Add `rfc-runtime-support.md` with the runtime-support taxonomy and contract for epic [#591](https://github.com/mifunedev/openharness/issues/591), plus two wiki entries ([#592](https://github.com/mifunedev/openharness/issues/592)).
### Changed
- `oh init`-scaffolded sandboxes now mount the workspace at `/home/sandbox/harness` instead of `/home/sandbox/project`, matching the harness's own devcontainer.
- `get-oh.sh` can now be run with `source <(curl … )` to install and put `oh` on the PATH in the current shell, and prints the same-shell `export PATH="$HOME/.local/bin:$PATH"` instruction.
- Improve `/health-check` performance by caching baseline snapshots, gating verbose Docker/process probes, and reusing one-pass diagnostics for ranked reclaim reports ([#576](https://github.com/mifunedev/openharness/issues/576)).
- Resolve the #532 RFC-index disposition as accepted-lightweight, cross-linking ADR-0001 and keeping the standards-body scope deferred ([#532](https://github.com/mifunedev/openharness/issues/532)).
- Clarify the glossary's model / agent CLI / harness / loop / policy / trace layer separation without introducing conformance machinery ([#532](https://github.com/mifunedev/openharness/issues/532)).
- Clarify the #525 docs/RFC indexes so the roadmap curation and trace/event ledger RFC are discoverable ([#525](https://github.com/mifunedev/openharness/issues/525)).
- `oh init`'s "Next steps" now recommends `oh sandbox` and `oh shell`, keeping raw `docker compose` only as a parenthetical fallback ([#564](https://github.com/mifunedev/openharness/issues/564)).
- **Replace the `/advisor` skill with an `advisor` agent** at `.oh/agents/advisor.md` that returns the 5-field delegation briefing for the caller to hand off, with every reference to the deleted skill repointed in lockstep.
- Treat root `harness.yaml` as local gitignored state generated from tracked `harness.yaml.example`; `make harness-config` creates it on demand and `make sandbox` runs that guard before building.
- **Consolidate the harness's own devcontainer back into the conventional root `.devcontainer/`**, superseding the `.oh/devcontainer/` relocation from this same unreleased cycle and retiring the `sync-devcontainer.sh` compat generator.
- **Relocate the Ralph/spec task workdirs from `tasks/` to `.oh/tasks/`** with no back-compat symlink, repointing the git-mutating consumers directly ([#531](https://github.com/mifunedev/openharness/issues/531)).
- **Relocate the Ralph/spec cron definitions from `crons/` to `.oh/crons/`** with no back-compat symlink, repointing every consumer including the `CRONS_DIR` default.
- **Relocate the fitness-function eval suite from `evals/` to `.oh/evals/`** with no back-compat symlink, repointing the runner walk-up, all 68 probes' `ROOT`, and the benchmark scorer's `repoRoot`.
- **Relocate the harness's long-term memory and session logs from `memory/` to `.oh/memory/`** with no back-compat symlink; tracked files move and the gitignored dated logs stay ignored at the new path.
- **Relocate the always-on identity core from `context/` to `.oh/context/`** with no back-compat symlink, repointing the `AGENTS.md`/`CLAUDE.md` session-start reads, protected paths, and the affected probes and benchmarks.
- Route hardcoded `/home/sandbox/harness` container-path literals in the devcontainer layer and `.oh/scripts` through `${OH_PROJECT_ROOT:-/home/sandbox/harness}` ([#531](https://github.com/mifunedev/openharness/issues/531)).
- **Relocate the harness's devcontainer build assets to `.oh/devcontainer/`**, leaving root `.devcontainer/` as a thin generated compat layer ([#531](https://github.com/mifunedev/openharness/issues/531)).
- **Absorb the shared primitive pack into `.oh/`, retiring the `.mifune` submodule** — skills, agents, and hooks are vendored under `.oh/` and shipped in the payload, so `oh init`/`oh update` need no submodule fetch.
- Move the rendered Docusaurus docs site and blog archive to `mifunedev/openharness-web`; the core repo now points readers to `docs/README.md` and DeepWiki ([#536](https://github.com/mifunedev/openharness/issues/536)).
- Dedupe Docusaurus-site leftovers after the `openharness-web` move by stripping dead frontmatter from `docs/**/*.md` and dropping stale in-repo docs-site references ([#536](https://github.com/mifunedev/openharness/issues/536) follow-up).
- Relocate the GitHub-readable markdown docs from `docs/` to `.oh/docs/` and repoint every live pointer; `oh update` still excludes them from equipped repos ([#536](https://github.com/mifunedev/openharness/issues/536) follow-up).
- **Default the build executor to ralph** — Stage 10 launches `.oh/scripts/ralph.sh` and watches for `STATUS: COMPLETE`; `/delegate` becomes optional fan-out ([ryaneggz/openharness#338](https://github.com/ryaneggz/openharness/pull/338)).
### Fixed
- Make Hermes gateway startup repeatable by pinning `HERMES_HOME`/`terminal.cwd` to the harness checkout and self-healing Microsoft Teams webhook dependencies.
- Refresh the devcontainer root `pnpm install` gate when package manifest inputs change, preserving fast boot when dependencies are current ([#521](https://github.com/mifunedev/openharness/issues/521)).
- Cron runtime entries now store canonical absolute source paths, so body hot-reload keeps working after cwd changes instead of logging `BODY_RELOAD_ERR` and using stale cached prompts ([#517](https://github.com/mifunedev/openharness/issues/517)).
- Release publishing now smoke-tests the locally built sandbox image before pushing GHCR tags, ensuring the published release image boots and passes the sandbox healthcheck first ([#515](https://github.com/mifunedev/openharness/issues/515)).
- Remove obsolete top-level `wiki-ingest`, `wiki-query`, and `wiki-lint` skill directories, preventing Pi startup from reporting `description is required` on reference-only `SKILL.md` files.
### Removed
- Remove the in-repo `.oh/docs` Docusaurus package, docs deploy workflow, docs build scripts, and docs-only pnpm dependency graph from Open Harness core ([#536](https://github.com/mifunedev/openharness/issues/536)).
### Deprecated
### Security
## [2026.6.25-3] - 2026-06-25

### Added
### Changed
### Fixed
### Removed
### Deprecated
### Security
- Patch Dependabot security alerts for `dompurify`, `http-proxy-middleware`, `undici`, and `webpack-dev-server` via pnpm overrides and lockfile refresh ([#527](https://github.com/mifunedev/openharness/issues/527)).

## [2026.6.25-2] - 2026-06-25

### Added
### Changed
### Fixed
- Restore the GitHub Pages docs workflow after the docs app relocation by pointing the build and artifact paths at `.oh/docs` and guarding the path in `docs-build-fast-path`.
### Removed
### Deprecated
### Security

## [2026.6.25] - 2026-06-25

### Added
- Add the `/sync` dispatcher skill with `publish`, `catchup`, and `status` subcommands for gated origin↔upstream synchronization, plus topology docs and the `sync-skill-contract` eval probe ([#526](https://github.com/mifunedev/openharness/pull/526)).
- Forward-sync `ryaneggz/openharness:development` into `mifunedev/openharness:development`, bringing the `auditor` agent, `.oh/` grouping, and `/spec`+`/wiki` consolidation ([ryaneggz#327](https://github.com/ryaneggz/openharness/issues/327)).
- Add the `/t3` skill to start, inspect, and stop T3 Code (`npx t3`) in a sandbox tmux session, with pairing-URL discovery and log/status helpers ([#509](https://github.com/mifunedev/openharness/issues/509)).
- Add the `/prompt-miner` skill and `mine-traces.mjs` engine to score session traces, rank initiating prompts, and mine prompt **markers** behind a confirm gate ([#503](https://github.com/mifunedev/openharness/issues/503)).
- Enable Pi `fff` file search by default, pinning `npm:@ff-labs/pi-fff@0.9.5` for `ffgrep`/`fffind` and `@`-mention autocomplete while keeping `grep`/`find` as fallback ([#499](https://github.com/mifunedev/openharness/issues/499)).
- Add the `autopilot-merged-pr-reference-dedupe` eval probe guarding that `/autopilot` skips completed-but-still-open tickets whose development PRs already merged ([#468](https://github.com/mifunedev/openharness/issues/468)).
- Codify the canonical operative path in `AGENTS.md § The Workflow` (`select → spec-plan ⇄ spec-critique → spec-execute → merge → reset|clean`), guarded by the `workflow-boundaries` probe ([#493](https://github.com/mifunedev/openharness/issues/493)).
- Add the `spec-*` skill family (`/spec-plan`, `/spec-critique`, `/spec-execute`, `/spec-retro`) decomposing `/ship-spec` into folder-pointed nodes, guarded by `spec-family-contract` ([#493](https://github.com/mifunedev/openharness/issues/493)).
- Codify the advisor-monitored ralph-loop variant in `context/rules/advisor-model.md`, guarded by the `advisor-monitored-loop` eval probe ([#493](https://github.com/mifunedev/openharness/issues/493)).
- Add `context/REPO_MAP.md` giving session-start agents a source-map command plus keep/disregard paths, guarded by `repo-map-contract` and the CB-004 benchmark manifest ([#464](https://github.com/mifunedev/openharness/issues/464)).
- Ship `pi-dynamic-workflows` as a default project-local Pi package pinned to upstream `v1.0.1`, with docs for the `workflow` tool's fan-out model and package-pin tests ([#451](https://github.com/mifunedev/openharness/issues/451)).
- Add the `heartbeat-logging-contract` eval probe guarding that heartbeat runs keep structured memory logs and locked liveness appends ([#447](https://github.com/mifunedev/openharness/issues/447)).
- Add the `sandbox-boot-guard` CI workflow validating sandbox compose config and locally building the devcontainer image for boot-path changes, guarded by `sandbox-boot-guard-ci` ([#449](https://github.com/mifunedev/openharness/issues/449)).
- Add the `retro-deterministic-contract` eval probe guarding `/retro` schema-backed output, self-contained helpers, and synchronized `.pi`/`.claude` skill copies ([#443](https://github.com/mifunedev/openharness/issues/443)).
### Changed
- Clarify oh.mifune.dev copy so "harness" means the repo and "agent" means the CLI, stating one-repo-per-sandbox, tracked state, and sandbox isolation across the site and docs ([#466](https://github.com/mifunedev/openharness/pull/466)).
- Move the shared skill source of truth from `.claude/skills/` to `.mifune/skills/`, with `.claude`, `.codex`, `.pi`, and Hermes now symlinking to it and CI path filters updated ([#501](https://github.com/mifunedev/openharness/issues/501)).
- Skip the Pi path-guard risky-bash confirmation in interactive TUI sessions while keeping sensitive-path write prompts and all headless/cron/autopilot confirmations ([#495](https://github.com/mifunedev/openharness/issues/495)).
- Replace the in-tree Slack Pi extension with the [`pi-messenger-bridge`](https://github.com/tintinweb/pi-messenger-bridge) npm package, loaded only in the `client-slack` tmux session ([#481](https://github.com/mifunedev/openharness/issues/481)).
- Run docs builds only from the docs workflow on `main`/`master` pushes, keeping root build, Harness CI, release validation, and `/eval` on the fast non-docs path ([#455](https://github.com/mifunedev/openharness/issues/455)).
- Clarify docs copy on product framing (one developer, one project, one agent) across the intro, installation, harnesses overview, and landing pages ([#493](https://github.com/mifunedev/openharness/issues/493)).
- Give `/retro` a report schema plus skill-local helper scripts for deterministic hypothesis validation, duplicate-memory checks, and log rendering ([#443](https://github.com/mifunedev/openharness/issues/443)).
### Fixed
- Hash canonical absolute append targets in `scripts/locked-append.sh` so relative and absolute spellings of the same log serialize through one lock ([#513](https://github.com/mifunedev/openharness/issues/513)).
- Re-inject non-Slack Pi turns once on the Codex `previous_response_not_found` error via an auto-loaded `.pi/extensions/codex-stale-response-retry.ts` extension ([#506](https://github.com/mifunedev/openharness/issues/506)).
- Re-enable the default `@narumitw/pi-codex-usage` Pi package at `0.6.2`, restoring `/codex-status` without the replacement-context crash ([#419](https://github.com/mifunedev/openharness/issues/419)).
- Preserve dirty, untracked, unpushed, or suspicious stale worktrees during weekly cleanup instead of deleting by age alone, with eval coverage for the gate ([#478](https://github.com/mifunedev/openharness/issues/478)).
- Route cron runtime and weekly cron prompt liveness `.cron.log` writes through `scripts/locked-append.sh`, extending the locked shared-log contract beyond autopilot and heartbeat ([#474](https://github.com/mifunedev/openharness/issues/474)).
- Preserve path-qualified cron file paths on fire-time metadata reload, preventing body hot-reload from falling back to stale cached prompts with `BODY_RELOAD_ERR` ([#472](https://github.com/mifunedev/openharness/issues/472)).
- Skip open tickets with merged PR references in `/autopilot` issue selection, avoiding duplicate rebuilds when `Closes #N` landed but GitHub left the issue open ([#468](https://github.com/mifunedev/openharness/issues/468)).
- Use temporary `harness.yaml` env files for compose helper diagnostics so `--print-argv` and `config` no longer overwrite `.devcontainer/.harness.yaml.env` ([#470](https://github.com/mifunedev/openharness/issues/470)).
- Route `/context-audit` and `/health-check` Memory Protocol examples through `scripts/locked-append.sh`, guarded by `memory-log-locked-append` ([#476](https://github.com/mifunedev/openharness/issues/476)).
- Make `/prd` consistently write PRDs to `tasks/<feature-name>/prd.md`, guarded by the `prd-output-path-contract` eval probe ([#483](https://github.com/mifunedev/openharness/issues/483)).
- Boot the built sandbox image and verify the in-container healthcheck in the sandbox boot guard, catching entrypoint regressions in CI ([#485](https://github.com/mifunedev/openharness/issues/485)).
- Post Slack bot replies in a thread anchored to the triggering channel message (group chats only, so DMs stay flat), temporarily pinning the bridge to a fork branch carrying the patch ([#481](https://github.com/mifunedev/openharness/issues/481)).
- Run the `client-slack` bridge under a self-healing supervisor (`.devcontainer/client-slack-supervise.sh`) that restarts pi on the stale-ctx failure and on crashes ([#481](https://github.com/mifunedev/openharness/issues/481)).
- Run the `client-slack` bridge attached to the tmux pane's TTY instead of `--mode rpc … | tee`, eliminating the `extension_ui_request` JSON flood while capturing logs out-of-band ([#481](https://github.com/mifunedev/openharness/issues/481)).
- Add a standalone `.pi/bridge-recovery/` extension that re-injects a failed Slack-originated turn once on the Codex `previous_response_not_found` error ([#481](https://github.com/mifunedev/openharness/issues/481)).
- Preserve a live early-run tmux session whose name matches its cron worktree basename during cron worktree pruning, keeping active autopilot checkouts alive before branch rename ([#445](https://github.com/mifunedev/openharness/issues/445)).
- Compute memory-log timestamps explicitly in heartbeat instructions and route memory and liveness writes through `scripts/locked-append.sh` ([#447](https://github.com/mifunedev/openharness/issues/447)).
- Stop stale legacy `system-cron` tmux sessions at devcontainer boot before starting `cron-watchdog`/`cron-system`, avoiding unhealthy migrated sandboxes ([#453](https://github.com/mifunedev/openharness/issues/453)).
- Seed `~/.pi/msg-bridge.json` only when absent and otherwise jq-merge it, so container boot no longer clobbers the operator's `auth.trustedUsers`/`auth.channels` trust grants ([#493](https://github.com/mifunedev/openharness/issues/493)).
### Removed
- Remove stale Pi authentication and port-forward docs now that Pi supports device auth ([#528](https://github.com/mifunedev/openharness/issues/528)).
- Remove the deprecated executable-loop framework — `context/rules/loop.md`, the `/orchestrate` skill, and four loop-coupling probes — leaving the former loop-node skills standalone ([#497](https://github.com/mifunedev/openharness/issues/497)).
### Deprecated
### Security
- Default `/post-bridge` post creation to draft/dry-run previews and require `POST BRIDGE LIVE CONFIRMED` before live or scheduled publishing ([#523](https://github.com/mifunedev/openharness/issues/523)).
- Keep Slack token values out of the tmux command string on `client-slack` restore by sourcing a permission-restricted runtime env file before launching `pi` ([#461](https://github.com/mifunedev/openharness/issues/461)).

## [2026.6.18] - 2026-06-18

### Added
- `pr-audit-duplicate-issue-refs` eval probe guards that `/pr-audit` keeps duplicate open-PR issue references visible as a read-only triage flag ([#439](https://github.com/mifunedev/openharness/issues/439)).
- `harness-audit` wiki entry and Context Snapshot memory load-status diagnostics preserve the shared-memory model salvaged from duplicate #432 PRs ([#441](https://github.com/mifunedev/openharness/issues/441)).
- `autopilot-open-pr-reference-dedupe` eval probe guards that issue selection checks open PR metadata, branch names, titles, and bodies before launching duplicate autopilot work ([#437](https://github.com/mifunedev/openharness/issues/437)).
- Add the `harness-audit-shared-memory` eval probe guarding that `/harness-audit` reads durable memory from `AUDIT_LOG_ROOT` in cron worktrees ([#432](https://github.com/mifunedev/openharness/issues/432)).
### Changed
- Document a duplicate issue-reference flag in `/pr-audit` so open PRs closing the same issue are grouped for human canonical-PR selection ([#439](https://github.com/mifunedev/openharness/issues/439)).
### Fixed
- Dedupe autopilot issue selection against open PR metadata, branch names, titles, and bodies before starting work, preventing repeated PRs for the same issue ([#437](https://github.com/mifunedev/openharness/issues/437)).
### Removed
### Deprecated
### Security

## [2026.6.17] - 2026-06-17

### Added
- `retro-deterministic-contract` eval probe guards that `/retro` keeps schema-backed output, self-contained helper scripts, and synchronized `.pi`/`.claude` skill copies ([#443](https://github.com/mifunedev/openharness/issues/443)).
### Changed
- Sync `ryaneggz/openharness:development` changes after `e863676` into canonical development, including Pi autoresearch support, cron/watchdog hardening, and Slack startup fixes ([#430](https://github.com/mifunedev/openharness/issues/430)).
### Fixed
### Removed
### Deprecated
### Security

## [2026.6.16] - 2026-06-16

### Added
- Add the `/git` skill promoting the former `context/rules/git.md` conventions into a provider-portable command skill ([#422](https://github.com/mifunedev/openharness/issues/422), [#424](https://github.com/mifunedev/openharness/issues/424)).
- Replace the autopilot-specific watchdog with the generic `/watchdog` stuck/stale automation skill, whose first action completes stale autopilot draft PRs and removes draft only after verification.
- Add the `autopilot-upstream-default` eval probe guarding that `/autopilot` and `/ship-spec` default GitHub/git operations to upstream `mifunedev/openharness` via `upstream/development`.
- Add the `/teach` skill, a post-implementation pass that revises the wiki model then teaches the operator the mental model, evidence, and caveats ([#214](https://github.com/ryaneggz/openharness/issues/214)).
- Add the tokenmaxxing Open Harness blog post explaining frontier-token spend as a harness-building pattern, not a productivity leaderboard ([#212](https://github.com/ryaneggz/openharness/issues/212)).
- Add `wiki-ingest` GitHub-repo-study and social-image research patterns with a worked example, route three crons to `agent: pi`, and add `/ci-status` and `/pr-audit` triage guidance ([#208](https://github.com/ryaneggz/openharness/pull/208)).
- Add `scripts/locked-append.sh` to serialize shared-runtime-log writes with `flock`, route autopilot/caps appends through it, and guard it with a probe ([#204](https://github.com/ryaneggz/openharness/issues/204)).
- Add a deterministic `preflight:` cron field running `scripts/autopilot-caps.sh` before any worktree, tmux, or agent is created, so a capped hour logs `SKIPPED-CAP-*` and spawns nothing ([#194](https://github.com/ryaneggz/openharness/issues/194)).
- Ignore `js-yaml` for Dependabot security updates in `.github/dependabot.yml`, since its fix is unreachable through the Docusaurus dependency chain and the job failed every retry ([#200](https://github.com/ryaneggz/openharness/issues/200)).
- Add the `evals/datasets/` verifiable trajectory corpus of real issue→shipped-PR trajectories with provenance, prompt, oracle, and `verify.sh` ([#196](https://github.com/ryaneggz/openharness/issues/196)).
- Wire the executable-loop `benchmark` node with a new `/benchmark` skill composing `/eval` and the capability-benchmark ceiling delta into a verdict ([#179](https://github.com/ryaneggz/openharness/issues/179)).
- Add the capability benchmark instrument (`evals/capability/`) as the harness progress ceiling, with a spec, three seed tasks, and a baseline scoreboard ([#167](https://github.com/ryaneggz/openharness/issues/167)).
- Wire the executable-loop `repeat` node with its `CYCLE-CONTINUE` token, applied by `/orchestrate` via `--max-iters` and caps ([#173](https://github.com/ryaneggz/openharness/issues/173), [#175](https://github.com/ryaneggz/openharness/issues/175)).
- Add the `/orchestrate` skill, a standalone walker of the executable-loop decision tree with STATUS-tail routing, `--dry-run`/`--start`/`--max-iters`, and honest halt at unwired nodes ([#160](https://github.com/ryaneggz/openharness/issues/160)).
- Wire the `compress` loop node so `/context-audit` emits `STATUS: COMPRESS-DONE` → `benchmark` ([#160](https://github.com/ryaneggz/openharness/issues/160)).
- Add the `orchestrate-contract` tier-A eval probe guarding the `/orchestrate` contract literals ([#160](https://github.com/ryaneggz/openharness/issues/160)).
- Wire the `implement` node by giving `/delegate` a `## Handoff` emitting `STATUS: IMPL-COMPLETE` → `audit` or `IMPL-INCOMPLETE` → `implement` ([#156](https://github.com/ryaneggz/openharness/issues/156)).
- Add the `/critique` skill running two adversarial critic agents against `tasks/<slug>/prd.md` and writing SEVERITY-tagged findings to `tasks/<slug>/critique.md` ([#156](https://github.com/ryaneggz/openharness/issues/156)).
- Add the `/approve` decision gate that reads `tasks/<slug>/critique.md` and emits `STATUS: APPROVED` → `implement` or `DENIED` → `plan` ([#156](https://github.com/ryaneggz/openharness/issues/156)).
- Add the read-only `/audit` per-unit verdict gate composing task-graph conformance, `/eval`, `/pr-audit`, and `/agent-browser` into a pass/fail verdict ([#156](https://github.com/ryaneggz/openharness/issues/156)).
- Add the `loop-handoff-consistency` tier-A eval probe guarding that every skill's `## Handoff` emits a `STATUS:` token known to `context/rules/loop.md` § 2 and routes only to real loop nodes.
- Add `context/rules/loop.md` as the single source of truth for the executable harness loop, defining the `STATUS:` terminal-status convention, the per-skill `## Handoff` convention, and six load-bearing invariants.
- Trigger Harness CI on `Makefile` and `harness.yaml` changes, guarded by the `harness-ci-core-paths` eval probe so core sandbox config path-filter coverage cannot silently drift ([#165](https://github.com/ryaneggz/openharness/issues/165)).
- Add `scripts/sandbox-healthcheck.sh` verifying `cron-watchdog`/`cron-system` and configured Slack/Hermes sessions, with docker-compose reporting failures through container health status ([#150](https://github.com/ryaneggz/openharness/issues/150)).

### Changed
- Give `/retro` a report schema plus skill-local helper scripts for deterministic hypothesis validation, duplicate-memory checks, and log rendering ([#443](https://github.com/mifunedev/openharness/issues/443)).
### Fixed
### Removed
### Deprecated
### Security

## [2026.6.14] - 2026-06-14

### Added
- `/ship-spec` now compacts around implement, hands the build to a worktree Advisor in a tmux session, and undrafts the PR only via a `/pr-audit` promotable gate ([#140](https://github.com/ryaneggz/openharness/issues/140)).
- Add the `ship-spec-ready-finalization` probe guarding that `/ship-spec` treats the draft PR as a checkpoint and ready-for-review as the terminal state ([#134](https://github.com/ryaneggz/openharness/issues/134)).
- Add the `autopilot-pi-agent` eval probe guarding that the `autopilot` cron sets `agent: pi` and that `cron-runtime` honors per-cron agent overrides ([#116](https://github.com/ryaneggz/openharness/issues/116)).
- Add the `autopilot-executor-toggle` probe guarding `/autopilot`'s default executor, Ralph fallback, `/goal` phrase, session naming, and non-mutating dry-runs.
- Pin `npm:@tifan/pi-recap@0.4.2` in `.pi/settings.json`, adding `/recap` plus automatic idle/resume session recaps for long-running Pi sessions ([#138](https://github.com/ryaneggz/openharness/issues/138)).
- Pin `npm:@narumitw/pi-codex-usage@0.4.2` in `.pi/settings.json`, adding `/codex-status` and an `openai-codex` statusline for 5-hour and weekly usage ([#108](https://github.com/ryaneggz/openharness/issues/108)).
- Pin `npm:@tintinweb/pi-tasks@0.7.0` in `.pi/settings.json`, adding the `/tasks` menu and persistent task widget and ignoring `.pi/tasks/` runtime state ([#105](https://github.com/ryaneggz/openharness/issues/105)).
- Add an independent `eval-probes` CI job that runs the probe suite on every PR and push to `development`/`main`, failing the pipeline on a new green→red regression ([#103](https://github.com/ryaneggz/openharness/issues/103)).
- Add the `drift-check-cron-staleness-glob` probe, which runs `/drift-check`'s live Step C-2 block against fixtures to pin the schedulable-cron predicate ([#98](https://github.com/ryaneggz/openharness/issues/98)).
- Pin `npm:@narumitw/pi-goal@0.4.2` in `.pi/settings.json`, adding the `/goal` command and `goal_complete` tool to Pi sessions by default ([#97](https://github.com/ryaneggz/openharness/issues/97)).
- Add a `SIGHUP` handler to `scripts/cron-runtime.ts` that re-reads every `crons/*.md` and re-arms schedules without restarting the `cron-system` session ([#88](https://github.com/ryaneggz/openharness/issues/88)).
- Add the `/pr-audit` skill, which triages the open-PR queue in one bulk query, separates drafts from ready PRs, and assigns each a single primary state ([#76](https://github.com/ryaneggz/openharness/issues/76)).
- Add a Hermes web dashboard opt-in: set `hermes.dashboard: true` in `harness.yaml` to launch it in the `app-hermes-dashboard` tmux session, loopback-only ([#376](https://github.com/mifunedev/openharness/issues/376)).
- Add an `ERR_JOB` cron-runtime status line so a synchronous cron job-callback throw is recorded in `crons/.cron.log` instead of being silently swallowed ([#49](https://github.com/ryaneggz/openharness/issues/49)).
- Add the context fitness-function eval corpus (`evals/`) — deterministic probes with a PASS/REGRESSION/SKIPPED exit oracle and a `RESULTS.md` scoreboard ([#1](https://github.com/ryaneggz/openharness/issues/1)).
- Add the `/eval` runner skill, which runs the probe suite against real state, writes the benchmark, and surfaces green→red regressions naming the lesson each closes ([#1](https://github.com/ryaneggz/openharness/issues/1)).
- Add the `warn-devtcp` PreToolUse hook, which warns non-blockingly when a Bash command uses `/dev/tcp` ([#1](https://github.com/ryaneggz/openharness/issues/1)).
- Add the seed probes `next-dev-prod`, `devtcp-hook`, and `health-check-docker-stats` ([#1](https://github.com/ryaneggz/openharness/issues/1)).
- Add shared ablation mechanics (`scripts/ablate.sh`) and `/eval --ablate <file> --probe <id>`, reporting `LOAD-BEARING` or `PRUNABLE` ([#1](https://github.com/ryaneggz/openharness/issues/1)).
- Add a weekly `eval-weekly` cron that runs the probe suite and logs regressions ([#1](https://github.com/ryaneggz/openharness/issues/1)).
- Add the `eval-gate` probe pinning that autopilot's §6 gate keys on the green→red delta and runner exit code rather than any `REGRESSION` row ([#22](https://github.com/ryaneggz/openharness/issues/22)).
- Add the autopilot loop: an hourly cron plus `/autopilot` skill that selects the next harness-infra item, builds it, and finalizes a ready-for-review PR ([#4](https://github.com/ryaneggz/openharness/issues/4)).
- Add the `/drift-check` skill for read-only detection of framework, branch-behind, and cron-staleness drift, with a remediation per finding ([#7](https://github.com/ryaneggz/openharness/issues/7)).
- Add a `boot-lint` CI job running shellcheck on the boot shell scripts and hadolint on the `Dockerfile`, so a broken boot path can no longer merge with a green CI badge ([#26](https://github.com/ryaneggz/openharness/issues/26)).
- Add a heartbeat autopilot-health nudge that kills `cron-autopilot-*` tmux sessions frozen at a usage-limit or resume prompt and sweeps orphaned keep-markers ([#41](https://github.com/ryaneggz/openharness/issues/41)).
- Add the `clean-restore` probe pinning autopilot's scoped branch-restore ([#45](https://github.com/ryaneggz/openharness/issues/45), rescoped by [#63](https://github.com/ryaneggz/openharness/issues/63)).
- Add a `Typecheck` step to harness CI running `tsc --noEmit` across both TypeScript packages, with a matching root `pnpm typecheck` script for local-dev parity ([#51](https://github.com/ryaneggz/openharness/issues/51)).
- Add `wiki/repo2rlenv.md` on Hugging Face Repo2RLEnv as an RL/evaluation-environment layer alongside `evals/`, and regenerate the wiki index ([#75](https://github.com/ryaneggz/openharness/pull/75)).
- Harden `/wiki-ingest` to regenerate the `wiki/README.md` index when a tracked entry ships, and document the isolated-worktree pattern for concurrent ingests ([#75](https://github.com/ryaneggz/openharness/pull/75)).

### Changed
- `/autopilot` now **defers the whole build to `/ship-spec`**: it runs `/ship-spec --issue` and reconciles the outcome, keeping only selection, caps, and cleanup ([#140](https://github.com/ryaneggz/openharness/issues/140)).
- Align `/ship-spec` guidance with the ready-for-review contract: the draft PR stays an observability checkpoint and successful runs continue to `gh pr ready` ([#134](https://github.com/ryaneggz/openharness/issues/134)).
- Mirror CI's boot-path lint and eval-probe gates in `release.yml`, so tagged releases require `validate`, `boot-lint`, and `eval-probes` to pass before publishing ([#111](https://github.com/ryaneggz/openharness/issues/111)).
- Sandbox onboarding banner status markers now prefer emoji (`✅` / `❌` / `⬜`) and fall back to the legacy bracket markers outside UTF-8 locales or when `OH_BANNER_STATUS_STYLE=legacy` is set.
- Cron frontmatter can set `agent: <binary>` per job, and Pi cron runs now use an attachable TUI invocation ([#116](https://github.com/ryaneggz/openharness/issues/116), [#118](https://github.com/ryaneggz/openharness/issues/118)).
- `/autopilot` now defaults to the `delegate-advisor` executor and leaves its `autopilot-<branch>` session alive; `AUTOPILOT_EXECUTOR=ralph` keeps the old fallback.
- Replace the local Pi plan-mode extension with the upstream `npm:@narumitw/pi-plan-mode@0.4.2` package pinned in `.pi/settings.json` ([#107](https://github.com/ryaneggz/openharness/issues/107)).
- Rename cron tmux sessions to the category-prefix convention (`cron-system` and `cron-<id>-<MMDD>-<HHMM>`), with a guarded migration path from the legacy names ([#95](https://github.com/ryaneggz/openharness/issues/95)).
- Cron agent runs now write `AGENT_START`, `AGENT_FALLBACK`, and `AGENT_DONE` lines to `crons/.cron.log`, showing which agent started a task and which completed it ([#94](https://github.com/ryaneggz/openharness/pull/94)).
- A non-zero cron child exit now appends a bounded (≤200 char) tail of the failing job's log to its `EXIT_<code>` line in `crons/.cron.log` ([#73](https://github.com/ryaneggz/openharness/issues/73)).
- Scope autopilot's clean-state check and branch restore to an explicit `OWNED_PATHS` surface, with a dirty owned path skipping as `BLOCKED-OWNED-WIP` ([#63](https://github.com/ryaneggz/openharness/issues/63)).
- Default cron agent execution now falls back from Claude to Codex on usage/session-limit output, and Ralph's fallback order is `claude→codex` with required `Submitted-by:` commit trailers.
- Autopilot §5 now implements tickets with the resumable Ralph runner, polling `progress.txt` for `STATUS: COMPLETE` and leaving `RALPH-INCOMPLETE` runs draft ([#55](https://github.com/ryaneggz/openharness/issues/55)).
- Upgrade Docusaurus `3.7.0` → `3.10.1` and add the `@mermaid-js/layout-elk` peer, clearing the remaining `webpack` and `webpack-dev-server` Dependabot alerts ([#37](https://github.com/ryaneggz/openharness/issues/37)).
- Replace the placeholder `SECURITY.md` with a real policy covering private vulnerability reporting, a triage SLA, and the sandbox trust boundary ([#33](https://github.com/ryaneggz/openharness/issues/33)).
- Autopilot §6's eval gate now keys on the green→red **delta** plus the `/eval` exit code, so only a new regression keeps the PR draft ([#22](https://github.com/ryaneggz/openharness/issues/22)).
- Make `/ci-status` repo-agnostic by deriving the target repo at runtime, and add a PR-first status path ([#20](https://github.com/ryaneggz/openharness/issues/20)).
- A kept per-run cron tmux session now resumes the run's own conversation as an attachable agent (`claude --continue`, falling back to a shell) instead of a bare `bash` ([#18](https://github.com/ryaneggz/openharness/issues/18)).
- Autopilot v2: issue-queue-first selection, per-run tmux sessions, an `/eval` gate before ready, a 10-PR ceiling, and `/ship-spec --issue <N>` ([#14](https://github.com/ryaneggz/openharness/issues/14)).
- Replace the cap of 2 open `autopilot` PRs with 6 created per UTC day, and tighten the `/harness-audit` fallback throttle from 6h to 4h tracked by an `AUDIT-RUN` marker ([#9](https://github.com/ryaneggz/openharness/issues/9)).
- `/health-check` gains an in-container RAM-reclaim step using per-container `docker stats` ([#1](https://github.com/ryaneggz/openharness/issues/1)).
- `/retro` gains a correction-surface triage tag (harden/proceduralize/eval) routing each promotable lesson to its cheapest closing artifact ([#1](https://github.com/ryaneggz/openharness/issues/1)).
- `/context-audit` Tier-2 ablation now sources the shared `scripts/ablate.sh` mechanics, with observable behavior unchanged ([#1](https://github.com/ryaneggz/openharness/issues/1)).
- The release pipeline now validates (lint, format check, build, test, root tests) before building or pushing the Docker image or creating the GitHub Release ([#24](https://github.com/ryaneggz/openharness/issues/24)).
- Extend the typecheck gate to `release.yml`'s validate job for both the workspace packages and the standalone `oh` CLI, mirroring `ci-harness.yml` ([#53](https://github.com/ryaneggz/openharness/issues/53)).
- Warn in `/delegate` that the `implementer`/`pm`/`critic` sub-agent types are read-only and recommend `general-purpose` for workers that must write files ([#57](https://github.com/ryaneggz/openharness/issues/57)).
### Fixed
- Fail sandbox boot when the root `pnpm install` step fails, preventing a false-healthy container with missing cron/Pi/Slack dependencies ([#136](https://github.com/ryaneggz/openharness/issues/136)).
- Regenerate the wiki index and add a `wiki-readme-index` eval probe so `wiki/README.md` cannot silently list missing entries or omit tracked `wiki/*.md` pages ([#132](https://github.com/ryaneggz/openharness/issues/132)).
- Add a `cron-watchdog` tmux supervisor to the devcontainer entrypoint so `cron-system` restarts automatically if the cron runtime session dies after boot ([#130](https://github.com/ryaneggz/openharness/issues/130)).
- Correct the devcontainer first-boot and interactive shell banners to reference the installed `oh` CLI (`oh config slack`) instead of stale command names ([#124](https://github.com/ryaneggz/openharness/issues/124)).
- Validate cron ids before scheduling, skipping unsafe ids, unsafe filename basenames, and id/filename mismatches with `ID_INVALID`/`ID_MISMATCH` liveness lines ([#128](https://github.com/ryaneggz/openharness/issues/128)).
- Release the autopilot cron overlap lock on terminal kept Pi sessions, so a retained review pane no longer causes hourly `SKIPPED_OVERLAP` stalls ([#126](https://github.com/ryaneggz/openharness/issues/126)).
- Remove the stale `workspace/startup.sh` auto-start hook from the entrypoint and docs, and have `/harness-audit` check for such hooks instead ([#120](https://github.com/ryaneggz/openharness/issues/120)).
- Correct the false claim in `context/rules/memory.md` that daily `log.md` files are tracked in git, and add a `memory-gitignore-claim` probe guarding the correction ([#101](https://github.com/ryaneggz/openharness/issues/101)).
- `/drift-check` cron-staleness now qualifies each `crons/*.md` as schedulable before the mtime check, so `crons/README.md` is no longer false-flagged ([#98](https://github.com/ryaneggz/openharness/issues/98)).
- Scope the weekly `cleanup-tasks` cron to `tasks/` and isolate its archive commit in a crash-safe worktree, skipping with `BLOCKED-TASKS-WIP` when `tasks/` is dirty ([#85](https://github.com/ryaneggz/openharness/issues/85)).
- `/eval` now writes `evals/RESULTS.md` atomically and carries forward untouched rows from a pre-write snapshot, so a filtered run no longer erases them ([#83](https://github.com/ryaneggz/openharness/issues/83)).
- Expand autopilot's `OWNED_PATHS` guard as a shell array so it word-splits correctly under zsh, with both coupled eval probes updated to assert the array form ([#81](https://github.com/ryaneggz/openharness/issues/81)).
- `scripts/ralph.sh` now detects `STATUS: COMPLETE` in the agent's output and self-closes its tmux session instead of spinning to `MAX_ITER` ([#79](https://github.com/ryaneggz/openharness/issues/79)).
- Fix the autopilot one-PR stall: shipped items are checked off after finalize, and dedupe advances to the next candidate instead of ending the run ([#9](https://github.com/ryaneggz/openharness/issues/9)).
- Remove the dangling `.claude/ICP.md` entry from `.claude/protected-paths.txt`, so critic gates no longer flag a protected path that no longer exists.
- De-reference the deleted `.claude/ICP.md` from its two live consumers: `/ship-spec` critic-B now reads `context/USER.md`, and `context/USER.md` drops the dangling citation while keeping the fact.
- Add a `pull_request` trigger and expanded `paths:` filter to `ci-harness.yml` so autopilot PRs touching skills, crons, or context get a real CI status check ([#12](https://github.com/ryaneggz/openharness/issues/12)).
- `/eval` now exits non-zero when any green→red regression is detected, so CI and autopilot gates receive an unambiguous failure signal ([#29](https://github.com/ryaneggz/openharness/issues/29)).
- Fix autopilot loop starvation: with no actionable ticket the run now falls through to `/harness-audit` research instead of exiting ([#41](https://github.com/ryaneggz/openharness/issues/41)).
- Correct stale `docs/wiki/` and `workspace/heartbeats/` paths in `/harness-audit` and `/skill-lint`, and add a `skill-paths.sh` guard probe ([#43](https://github.com/ryaneggz/openharness/issues/43)).
- Fix the autopilot dirty-tree deadlock: the §5/§6/§7 restores now force a clean restore with an assertion, while a dirty tree at §1 still hard-fails ([#45](https://github.com/ryaneggz/openharness/issues/45)).
- Cron definitions now hot-reload their body at fire time, with an unreadable file falling back to the cached body and logging `BODY_RELOAD_ERR` ([#47](https://github.com/ryaneggz/openharness/issues/47)).
- Cron scheduling is now fault-isolating: a malformed `schedule:` is skipped and logged `SCHED_INVALID` instead of crashing the runtime, and boot logs a `BOOT` summary ([#67](https://github.com/ryaneggz/openharness/issues/67)).
- Correct stale `apps/` and `src/data/roadmap` paths across four skills after the `apps/→packages/` rename, and guard the rename tokens in `skill-paths.sh` ([#69](https://github.com/ryaneggz/openharness/issues/69)).
- Extend `boot-lint` shellcheck coverage to `scripts/*.sh` alongside `.devcontainer/*.sh` and `install/*.sh`, guarded by a `boot-lint-glob` probe ([#90](https://github.com/ryaneggz/openharness/issues/90)).
- Pin the devcontainer's corepack pnpm to the declared `pnpm@10.33.0` and add a CI guard against Dockerfile/`package.json` drift ([#114](https://github.com/ryaneggz/openharness/issues/114)).
### Removed
- Remove the curated autopilot backlog (`crons/autopilot-backlog.md`) and the 4h `/harness-audit` throttle, since autopilot is now steered via GitHub `autopilot` issues ([#14](https://github.com/ryaneggz/openharness/issues/14)).
### Deprecated
### Security
- Resolve all open critical and high Dependabot alerts in the root `pnpm-lock.yaml` via `pnpm.overrides` ([#28](https://github.com/ryaneggz/openharness/pull/28), [#30](https://github.com/ryaneggz/openharness/issues/30)).
- Resolve moderate and low Dependabot alerts compatible with the Docusaurus 3.7 bundler via `pnpm.overrides` and a `packages/oh` `esbuild` bump; `webpack` alerts deferred ([#35](https://github.com/ryaneggz/openharness/issues/35)).
- Override `joi` →18.2.1 in the root `pnpm-lock.yaml` to resolve GHSA-q7cg-457f-vx79, validated against Docusaurus 3.10 with `docs:build` ([#39](https://github.com/ryaneggz/openharness/issues/39)).
## [2026.6.13] - 2026-06-13

### Added
- Add an `Eval Probe Regression Gate` CI job, new eval self-guard probes, and atomic `/eval` scoreboard writes so green→red probe regressions block public harness changes ([#415](https://github.com/mifunedev/openharness/issues/415)).
- Load `@tintinweb/pi-goal` and `@tintinweb/pi-tasks` by default in Pi, document their usage, and ignore Pi task runtime state ([#415](https://github.com/mifunedev/openharness/issues/415)).
- Add the public-safe `/pr-audit` skill for one-shot bulk PR triage; read-only by default with optional deep review, proof comments, label application, and stale close actions ([#415](https://github.com/mifunedev/openharness/issues/415)).

### Changed

### Fixed
- Tighten `/drift-check` cron-staleness detection to compare only schedulable cron files and skip README, disabled, unscheduled, empty, and invalid cron docs ([#415](https://github.com/mifunedev/openharness/issues/415)).
- Correct `context/rules/memory.md` so daily `memory/YYYY-MM-DD/log.md` files are documented as local/gitignored journals unless force-added ([#415](https://github.com/mifunedev/openharness/issues/415)).
- Expand boot-path shellcheck coverage to `scripts/*.sh` and `workspace/*.sh` while preserving the intentional literal `~/.openharness` installer message ([#415](https://github.com/mifunedev/openharness/issues/415)).

### Removed
### Deprecated
### Security

## [2026.6.12] - 2026-06-12

### Added
- Add the `/autopilot` skill and hourly `crons/autopilot.md` loop: issue-queue-first selection, `/ship-spec --issue`, Ralph implementation, `/eval` gate, PR caps, no auto-merge ([#412](https://github.com/mifunedev/openharness/issues/412)).
- Heartbeat autopilot nudge logic surfaces green/mergeable autopilot PRs, long-lived sessions, and kills only sessions frozen at an unambiguous interactive/usage prompt ([#412](https://github.com/mifunedev/openharness/issues/412)).
- Autopilot-specific eval probes guard the forced clean branch restore and the corrected eval-gate decision rule ([#412](https://github.com/mifunedev/openharness/issues/412)).
- Add the `/eval` skill and `evals/` probe corpus: deterministic probes with a 3-state oracle, an `evals/RESULTS.md` benchmark, and non-zero exit only on new regressions ([#410](https://github.com/mifunedev/openharness/issues/410)).
- `scripts/ablate.sh` provides shared swap/restore/trap mechanics for evaluating whether a context file is load-bearing under a deterministic probe ([#410](https://github.com/mifunedev/openharness/issues/410)).
- `/drift-check` detects framework drift, branch/append-file drift, and cron-staleness drift without mutating local state; the heartbeat now surfaces its findings when present ([#410](https://github.com/mifunedev/openharness/issues/410)).
- Run `CI: Harness` on pull requests and harness infrastructure paths, add workspace and `packages/oh` typecheck gates, cancel superseded runs, and lint boot paths ([#408](https://github.com/mifunedev/openharness/issues/408)).
- `release.yml` now validates lint, format, typecheck, build, package tests, and root script tests before publishing release artifacts ([#408](https://github.com/mifunedev/openharness/issues/408)).
- `SECURITY.md` documents supported versions, private vulnerability reporting, automated hardening, and the sandbox trust boundary ([#408](https://github.com/mifunedev/openharness/issues/408)).
- Add Hermes web dashboard opt-in via `hermes.dashboard: true` in `harness.yaml`, auto-launching it in the `app-hermes-dashboard` tmux session, loopback-only on port 9119 ([#376](https://github.com/mifunedev/openharness/issues/376)).

### Changed

### Fixed
- Reload cron bodies at fire time, record synchronous job callback failures as `ERR_JOB`, and support opt-in tmux-backed cron runs ([#408](https://github.com/mifunedev/openharness/issues/408)).
- Gate the `Docs: build & deploy` Pages steps to `mifunedev/openharness` so forks build-validate docs without attempting a Pages deploy ([#404](https://github.com/mifunedev/openharness/issues/404)).
- Make `/release` resolve the canonical remote (`upstream`, else `origin`) for `REPO` and all release pushes, so a release can't land on a private fork ([#402](https://github.com/mifunedev/openharness/issues/402)).
- Point `/ship-spec` Stage 7 at `.claude/skills/ship-spec/templates/prompt.md` instead of the deleted archived task prompt, and repoint two other dead references ([#402](https://github.com/mifunedev/openharness/issues/402)).

### Removed

### Deprecated

### Security
- Dependency manifests and lockfiles are refreshed with Docusaurus/Vitest upgrades and scoped `pnpm.overrides` for current transitive advisory remediation ([#408](https://github.com/mifunedev/openharness/issues/408)).

## [2026.6.10] - 2026-06-10

### Changed
- Separate the maintainer's personal state from the public template: empty `MEMORY.md` and `IDENTITY.md` lessons, genericized `USER.md`, and an `America/Los_Angeles` heartbeat ([#400](https://github.com/mifunedev/openharness/issues/400)).
- Change the default sandbox timezone from `America/Denver` to `America/Los_Angeles` across image, compose, install script, and cron config, overridable via `harness.yaml` ([#400](https://github.com/mifunedev/openharness/issues/400)).

### Fixed
- `.gitignore` now ignores `tasks/archive/` — the prior `tasks/*/archive/` pattern never matched the real path ([#400](https://github.com/mifunedev/openharness/issues/400)).

### Removed
- Remove the maintainer's research wiki (11 `wiki/*.md` entries plus `wiki/raw/` snapshots) and task history (`tasks/archive/**`) from the public template ([#400](https://github.com/mifunedev/openharness/issues/400)).
- Personal agent-fleet docs (`docs/agents/`) and their matching `agent/*` workspace branches from the public template — moved to the private fork ([#400](https://github.com/mifunedev/openharness/issues/400)).

## [2026.6.9] - 2026-06-09

### Added
- Preinstall `cron` in the sandbox base image so scheduled jobs work without a manual `apt-get install` ([#312](https://github.com/mifunedev/openharness/issues/312)).
- Document "compound engineering" and how the harness embodies it, via `wiki/compound-engineering.md`, a public blog post, and pointers in `docs/intro.md` and `docs/resources.md` ([#378](https://github.com/mifunedev/openharness/issues/378)).
- Add the `/health-check` skill to triage host memory, swap, disk, CPU, and Docker usage, rank reclaim levers by safety×yield, and report a RAG verdict naming the binding constraint ([#380](https://github.com/mifunedev/openharness/issues/380)).
- Add `wiki/rubricrefine-agent-reliability.md` on training-free pre-execution refinement for tool-use agent reliability ([#391](https://github.com/mifunedev/openharness/issues/391)).
- Add `wiki/turbovec-turboquant-rag.md` on compressed-vector RAG retrieval ([#391](https://github.com/mifunedev/openharness/issues/391)).
- Add the blog post `blog/2026-06-07-containers-microvms-vms.md` comparing container, microVM, and full-VM isolation for AI agent execution as a trust × tenancy choice ([#384](https://github.com/mifunedev/openharness/issues/384)).
- Add reference docs for the `harness-audit`, `strategic-proposal`, and `wiki-ingest` skills, each a new `references/*.md` linked from its `SKILL.md` ([#393](https://github.com/mifunedev/openharness/issues/393)).
- Add the blog post `blog/2026-05-19-four-words-multi-agent.md` defining the Operator / Sandbox / Orchestrator / Harness vocabulary, with a mermaid diagram and a worked example ([#320](https://github.com/mifunedev/openharness/issues/320)).
- Add the `harness.yaml` master config for non-secret settings, converted by `scripts/harness-config.sh` into an `--env-file` that takes precedence over `.devcontainer/.env` ([#395](https://github.com/mifunedev/openharness/issues/395)).

### Changed
- Move the canonical repo to `mifunedev/openharness` and publish release images to `ghcr.io/mifunedev/openharness`, updating docs, install script, and skills; old URLs redirect ([#397](https://github.com/mifunedev/openharness/issues/397)).
- Exempt `/.hermes/hooks/` from the `/.hermes/*` `.gitignore` rule so Hermes hook scripts are trackable ([#393](https://github.com/mifunedev/openharness/issues/393)).
- Promote `development` → `main` by fast-forward before cutting the release branch and tag, keeping `main` the authoritative release line and aborting if `main` has diverged.
- Rename the top-level `apps/` directory to `packages/` and update workspace, docs, Dockerfile, CI, and test discovery paths to match.
- Require an explicit `--slug` in `/wiki-ingest` for social/share URLs, long share/activity IDs, and slugs over 60 chars ([#373](https://github.com/mifunedev/openharness/issues/373)).
- Rename and rewrite `/reflect` as `/retro`, a scientific-method session-closing pass with falsifiable hypotheses, verdicts, and confidence across six learning subsystems, keeping the propose-then-confirm gate.
- Reduce `.devcontainer/.env` to a secrets-only surface (`GH_TOKEN`, `SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`), migrating all non-secret env vars to `harness.yaml` ([#395](https://github.com/mifunedev/openharness/issues/395)).
### Fixed
- Target autopilot caps at the canonical `mifunedev/openharness` repo via a declared `repo:` and exported `AUTOPILOT_REPO`/`AUTOPILOT_REMOTE`, instead of the checkout's implicit GitHub remote.
- Ship `harness.yaml` fully commented again so a fresh clone no longer forces `SANDBOX_NAME`/`TZ`, restoring the defaults-stay-authoritative invariant ([#398](https://github.com/mifunedev/openharness/pull/398)).
- Rename three LinkedIn-sourced wiki entries to short semantic slugs, fix their cross-links, and regenerate the stale `wiki/README.md` index ([#373](https://github.com/mifunedev/openharness/issues/373)).
- Pass `CRONS_DIR`, `CRON_AGENT_BIN`, `SLACK_ALLOW_USERS`, and `SLACK_ALLOW_CHANNELS` into the container via compose `environment:` and `harness.yaml`; they never reached it before ([#395](https://github.com/mifunedev/openharness/issues/395)).
### Removed
### Deprecated
### Security
- Bump root test tooling and the `@openharness/oh` CLI build dependency to clear the remaining `esbuild <0.28.1` Dependabot alerts ([#92](https://github.com/ryaneggz/openharness/issues/92)).

## [2026.5.29] - 2026-05-29

### Added
- Add optional Hermes agent CLI (`INSTALL_HERMES=true`) with project-local runtime state and isolated auth, plus documented optional OpenCode and DeepAgents installs ([#364](https://github.com/mifunedev/openharness/issues/364)).
- Add `wiki/sequoia-capital-the-next-1t-company.md` capturing the Sequoia AI Opportunities thesis that AI-native winners may sell completed services work rather than software tools ([#362](https://github.com/mifunedev/openharness/issues/362)).
- Add `wiki/learn-harness-engineering.md` for the Walking Labs *Learn Harness Engineering* course, linked from `docs/resources.md` and `docs/intro.md` ([#341](https://github.com/mifunedev/openharness/issues/341)).
- Add `fast-check` ^4.8.0 and extend the vitest include glob to `apps/**/__tests__/**/*.test.ts`, enabling property-based tests across all TypeScript surfaces ([#354](https://github.com/mifunedev/openharness/issues/354)).
- Add the `/imagine` skill, a one-shot draft PRD sketch generator that writes a 7-section spec to gitignored `.claude/specs/<slug>/spec.md` as input for `/ship-spec --plan <path>`.
- Add a never-throw property test for `parseCronFile` in `scripts/__tests__/cron-runtime.property.test.ts` ([#354](https://github.com/mifunedev/openharness/issues/354)).
- Add a forward-compatibility property test asserting `parseCronFile` parses valid frontmatter carrying 1–5 unknown keys ([#354](https://github.com/mifunedev/openharness/issues/354)).
- Add an ordering-stability property test asserting `loadCrons` returns entries in ascending alphabetical order regardless of write order ([#354](https://github.com/mifunedev/openharness/issues/354)).
- Add `.pi/extensions/__tests__/path-guard.property.test.ts`, a no-false-positives property test asserting `isSensitivePath` returns `false` for non-matching paths ([#354](https://github.com/mifunedev/openharness/issues/354)).
- Add `apps/oh/src/__tests__/cli.property.test.ts` with determinism and no-throw property tests for `isHelpFlag` and `isVersionFlag` ([#354](https://github.com/mifunedev/openharness/issues/354)).
- Document the property-based testing convention in `docs/property-testing.md`, including arbitrary patterns, numRuns defaults, a decision tree, and a surface ledger ([#354](https://github.com/mifunedev/openharness/issues/354)).
### Changed
- Expose `SENSITIVE_PATHS` and a new `isSensitivePath(p: string): boolean` as named exports from `.pi/extensions/path-guard.ts`, leaving default-export behavior unchanged ([#354](https://github.com/mifunedev/openharness/issues/354)).
- Export `isHelpFlag` and `isVersionFlag` from `apps/oh/src/cli.ts` for testability (#354).
- Let `make shell [container]` take an optional running container name via `docker exec`, defaulting to `$(SANDBOX_NAME)`; pair with `SHELL_USER=<user>` for containers without a `sandbox` user.
- Ship Hermes with the Slack messaging extra (`hermes-agent[slack]`) by default so the gateway's Slack adapter works without a manual install; requires an image rebuild ([#364](https://github.com/mifunedev/openharness/issues/364)).
### Fixed
- Point runtime `UV_TOOL_DIR`/`UV_TOOL_BIN_DIR` at sandbox-owned home paths and chown the optional Hermes install directory, so fresh images no longer leak root-owned uv tool paths into the `sandbox` user's runtime.
- Re-chown `/usr/local/lib/hermes-agent` and `/opt/uv` on every boot so ad-hoc `uv pip install` into the Hermes venv no longer fails with `Permission denied` after a UID sync ([#364](https://github.com/mifunedev/openharness/issues/364)).
- Store Hermes `auth.json` directly in `HERMES_HOME` and heal legacy symlinks on boot, fixing cross-device-link (`EXDEV`) failures on credential saves; requires an image rebuild ([#364](https://github.com/mifunedev/openharness/issues/364)).
- Allow secret-exposure hooks to operate on tracked template env files (`.env.example` and peers) while real `.env` files still deny; the Codex wrapper inherits the fix ([#356](https://github.com/mifunedev/openharness/issues/356)).
### Removed
### Deprecated
### Security

## [2026.5.24] - 2026-05-24

### Added
- Add a `wiki/` directory and the `context/rules/wiki.md` schema implementing the Karpathy LLM Wiki pattern ([#351](https://github.com/mifunedev/openharness/pull/351)).
- Add the `/wiki-ingest` skill, which captures `WebFetch` snapshots and authors or updates wiki entries from a URL, path, or `--from-draft` promotion ([#351](https://github.com/mifunedev/openharness/pull/351)).
- Add the `/wiki-query` skill, a frontmatter-only grep over `wiki/*.md` with multi-word OR semantics that reads the top 3 entries by `updated:` descending ([#351](https://github.com/mifunedev/openharness/pull/351)).
- Add the `/wiki-lint` skill, a manual corpus health check with five finding types, atomic `wiki/README.md` regeneration, and a `--dry-run` flag ([#351](https://github.com/mifunedev/openharness/pull/351)).
- Add the `/reflect` skill, a whole-session Improve pass that scans the conversation for durable patterns and proposes `memory/MEMORY.md` / `context/IDENTITY.md` additions ([#337](https://github.com/mifunedev/openharness/issues/337)).
- Add the [`/caveman`](https://github.com/JuliusBrussee/caveman) token-compression skill and subcommands, compressing agent prose 65–75% while preserving code and error strings verbatim ([#335](https://github.com/mifunedev/openharness/issues/335)).
- Add the `/context-audit` skill, scoring each default-loaded context file with KEEP/TRIM/DEMOTE/CUT verdicts plus a Tier-2 ablation harness measuring behavior degradation ([#333](https://github.com/mifunedev/openharness/issues/333)).
- Add the `/render-html` skill for rendering an artifact as a self-contained HTML file under gitignored `memory/<UTC-date>/<slug>.html` for one-shot human review ([#314](https://github.com/mifunedev/openharness/issues/314)).
- Add the `/interview` skill, an adaptive pre-work clarifier that batches 2–4 questions through `AskUserQuestion`, echoes a scope brief, and skips trivial tasks with an announcement ([#316](https://github.com/mifunedev/openharness/issues/316)).
- Add the blog post `blog/2026-05-19-statusline-context-rot.md` with a copy-pasteable statusline script surfacing context-window and rate-limit usage percentages ([#318](https://github.com/mifunedev/openharness/issues/318)).

### Changed
- Register `/wiki-ingest`, `/wiki-query`, and `/wiki-lint` in the `AGENTS.md` skills table ([#351](https://github.com/mifunedev/openharness/pull/351)).
- Source and version-pin all 15 skills in `.claude/skills/` to `github.com/mifunedev/skills` via `.mifune/skills.lock`, adding the upstreamed `interview` and `render-html` ([#327](https://github.com/mifunedev/openharness/issues/327)).
- Restructure `README.md`, `docs/installation.md`, and `docs/quickstart.md` to surface fork-and-clone and clone-and-own as first-class install paths alongside the upstream one-liner ([#331](https://github.com/mifunedev/openharness/issues/331)).
- Update skill `LICENSE` files to `Copyright (c) 2026 Mifune Dev (mifune.dev)` to match the upstream correction.
- Re-sync `context-audit` to the portable upstream form: drop `argument-hint`, repin the lock, add the missing `LICENSE` ([mifunedev/skills#6](https://github.com/mifunedev/skills/pull/6)) ([#339](https://github.com/mifunedev/openharness/issues/339)).
- Rename the Slack-bridge tmux session from `agent-pi` to `client-slack` and restore it on container start when Slack tokens are present, so the bridge survives `docker compose restart` without a manual relaunch.
### Fixed
- Install `pi-coding-agent` under the sandbox user's npm prefix and put that bin directory ahead of `/usr/bin`, so `pi update` self-updates without sudo on fresh builds.
### Removed
- Remove `config.example.json` and its install-time seeding step, since the base ships zero compose overlays and all readers tolerate a missing `config.json` ([#323](https://github.com/mifunedev/openharness/issues/323)).
### Deprecated
### Security

## [2026.5.18] - 2026-05-18

### Added
- `OH_GITHUB_REPO` and `OH_GITHUB_REF` env vars for fork-friendly installs ([#309](https://github.com/mifunedev/openharness/pull/309)).
- `/worktrees` skill (`.claude/skills/worktrees/SKILL.md`) — orchestrator skill for managing `.worktrees/` lifecycle: create, list, remove, clean, stale audit, project clones.

### Changed
- README and `docs/installation.md` add a "For forks / self-host" section; canonical upstream `oh.mifune.dev` URL unchanged ([#309](https://github.com/mifunedev/openharness/pull/309)).
- Make `/release` push the source branch back to origin right after the CHANGELOG promotion commit, so promotions no longer live only on `release/*` ([#297](https://github.com/mifunedev/openharness/issues/297)).

### Fixed
- Repair `CHANGELOG.md` drift by restoring the `2026.5.14`–`2026.5.16` sections to `development` and trimming `[Unreleased]` to genuinely new entries ([#297](https://github.com/mifunedev/openharness/issues/297)).

### Removed
### Deprecated
### Security

## [2026.5.16] - 2026-05-16

### Added
- Add `docs/connecting.md`, a runbook for the VS Code Attach + port-forwarding workflow for remote dev servers. ([#300](https://github.com/mifunedev/openharness/issues/300)).
- **Agents catalog**: add a `docs/agents/` section (later renamed `docs/harnesses/`) with `_category_.json`, an `overview.md` hub page, and five per-branch playbook pages. ([#300](https://github.com/mifunedev/openharness/issues/300)).

### Changed
- Rename `docs/agents/` to `docs/harnesses/` to match the sidebar label and add seven `/docs/agents/*` → `/docs/harnesses/*` redirects preserving the old URLs. ([#300](https://github.com/mifunedev/openharness/issues/300)).
- Cross-link `docs/connecting.md` from `intro.md`, `quickstart.md`, `harnesses/overview.md`, `harnesses/t3code.md`, and `integrations/slack.md`. ([#300](https://github.com/mifunedev/openharness/issues/300)).
- Fix `apps/README.md` script-name drift: `pnpm --filter @openharness/docs dev` → `start`, matching the actual script in `apps/docs/package.json`. ([#300](https://github.com/mifunedev/openharness/issues/300)).
- Frame the orchestrator-via-VS-Code-attach as the canonical workflow across `docs/quickstart.md`, `docs/intro.md` (with a Mermaid architecture diagram), and `harnesses/overview.md`. ([#302](https://github.com/mifunedev/openharness/issues/302)).
- Reserve `.worktrees/project/<owner>/<repo>/` for standalone repo clones and narrow `.worktrees/agent/` to agent branches. ([#295](https://github.com/mifunedev/openharness/issues/295), [#298](https://github.com/mifunedev/openharness/issues/298)).

### Fixed
- Raise dark-mode inline `code` pill contrast in `apps/docs/src/css/custom.css` (background `0.06`→`0.12`, border `0.1`→`0.22`, pure-white text); light mode untouched. ([#302](https://github.com/mifunedev/openharness/issues/302)).

### Removed
### Deprecated
### Security

## [2026.5.15] - 2026-05-15

### Added
- `retro-deterministic-contract` eval probe guards that `/retro` keeps schema-backed output, self-contained helper scripts, and synchronized `.pi`/`.claude` skill copies ([#443](https://github.com/mifunedev/openharness/issues/443)).
### Changed
- Overhaul the `oh config slack` wizard UX with masked token input, four numbered steps, per-input validation, and a confirmation summary. ([#290](https://github.com/mifunedev/openharness/issues/290)).
### Fixed
### Removed
### Deprecated
### Security

## [2026.5.14] - 2026-05-14

### Added
- Publish container port 1455 on the host loopback (`127.0.0.1:1455:1455`) so the Pi harness OAuth callback completes over VS Code Remote SSH port-forwarding ([#287](https://github.com/mifunedev/openharness/issues/287)).

### Removed
- Remove every in-tree `.devcontainer/` compose overlay except `docker-compose.postgres.yml` now that the entrypoint syncs the sandbox UID/GID to the repo owner ([#283](https://github.com/mifunedev/openharness/issues/283)).
- Remove the orphaned `.pi/onboard-steps/slack.ts` and its empty directory; the wizard now lives at `apps/oh/src/config/slack.ts` with the original port's bugs fixed ([#281](https://github.com/mifunedev/openharness/issues/281)).
- Delete the stale onboarding, lifecycle, connecting, operations, and architecture docs pages, trimming the site to intro, quickstart, installation, and the guides ([#279](https://github.com/mifunedev/openharness/issues/279)).
- Remove `.pi/overlays/docker-compose.slack.yml` and all references to it, since the in-tree Slack Pi extension reads its tokens straight from `process.env`.

### Changed
- Migrate `.pi/extensions/slack/{index,tools}.ts` off the deprecated `@mariozechner/pi-coding-agent` to `@earendil-works/pi-coding-agent` ([#281](https://github.com/mifunedev/openharness/issues/281)).
- Lead `docs/integrations/slack.md` § 5 with the `oh config slack` wizard, which now starts the Slack bridge for you ([#281](https://github.com/mifunedev/openharness/issues/281)) ([`ryaneggz/mifune`](https://github.com/ryaneggz/mifune)).
- Rename the docs sidebar `Agents` → `Harnesses`, link each harness from quickstart including the new T3 Code, and give every harness page an Authentication section ([#281](https://github.com/mifunedev/openharness/issues/281)).
- Render prose links in Docusaurus `.markdown` content in terminal green with an underline so they no longer blend into body text ([#281](https://github.com/mifunedev/openharness/issues/281)).
- Add a "Configuration wizards" section to `make help` surfacing `oh config slack` and `oh --help` as in-sandbox commands ([#281](https://github.com/mifunedev/openharness/issues/281)).
- Document the working Slack env flow: put the tokens in `.devcontainer/.env`, then run `set -a; source .devcontainer/.env; set +a` before launching `pi` in the `agent-pi` tmux session.
- Rewrite `docs/integrations/slack.md` for ID allowlist semantics, the Socket Mode smoke test, and migration off `@ryaneggz/mifune` ([#279](https://github.com/mifunedev/openharness/issues/279)).

### Fixed
- Fix the docs landing-page hero quickstart to `cd ~/.openharness && make shell`, matching the installer rename ([#200](https://github.com/mifunedev/openharness/issues/200), [#210](https://github.com/mifunedev/openharness/issues/210)).
- Fix `pi` failing on a fresh sandbox with `Cannot find module '@slack/socket-mode'`: the entrypoint now runs `pnpm install --prefer-offline` on first boot when `node_modules/` is missing, opt out with `SKIP_PNPM_INSTALL=1`.
- Add DeepAgents, with a matching icon tile, to the docs landing-page supported-agent copy and agent grid.
- Fix `opencode` failing with `EACCES` on `~/.config/opencode` by extending the entrypoint's parent-chown loop to `~/.config` ([#247](https://github.com/mifunedev/openharness/issues/247)).
- Fix `opencode` failing with `EACCES` on `~/.local/state` by chowning its parent dirs to `sandbox:sandbox` ([#241](https://github.com/mifunedev/openharness/pull/241), [#245](https://github.com/mifunedev/openharness/issues/245)).

### Added
- Add `oh config slack`, an in-sandbox wizard that validates tokens and allowlist IDs, merges `.devcontainer/.env` atomically, and restarts the `agent-pi` session ([#281](https://github.com/mifunedev/openharness/issues/281)).
- Add `docs/agents/t3code.md` documenting the T3 Code browser harness on port 3773, with its pairing-URL auth and `npx t3` launch ([#281](https://github.com/mifunedev/openharness/issues/281)).
- Add `build-essential` to the default sandbox image ([#263](https://github.com/mifunedev/openharness/issues/263), [#271](https://github.com/mifunedev/openharness/issues/271), [t3code#2621](https://github.com/pingdotgg/t3code/issues/2621)).
- Add `context/rules/recursive-delegation.md` encoding bounded recursive delegation with a `/delegate` recursion gate ([#269](https://github.com/mifunedev/openharness/issues/269), [#270](https://github.com/mifunedev/openharness/pull/270)).
- Add the Slack integration as a Pi extension at `.pi/extensions/slack/` ([#261](https://github.com/mifunedev/openharness/issues/261)).
- Add a project-local Pi single-line footer extension showing cwd/branch, context usage, model and thinking state, extension statuses, token usage, and session name, under a plain `MIFUNE` wordmark header.
- Add project-local Pi config under `.pi/`: OpenAI-default `settings.json`, banner and `path-guard` extensions, a `/review` prompt, and a test suite wired into CI ([#255](https://github.com/mifunedev/openharness/issues/255)).
- Add a project-local Pi plan-mode extension at `.pi/extensions/plan-mode/` with `/plan`, `--plan`, read-only tool gating, approval prompts, and `[DONE:n]` progress tracking.
- Add tracked `README.md` files to `apps/`, `crons/`, `scripts/`, `tasks/`, and `.worktrees/`, codified by the new `.claude/rules/directory-readme.md` rule.
- Add OpenCode as a core sandbox agent: install `opencode-ai` in the base image, persist `~/.local/share/opencode`, add the `opencode-host` overlay, and support `scripts/ralph.sh --harness=opencode`.
- Add DeepAgents CLI as a first-class sandbox runtime: installed in the image, auth persisted in a `deepagents-auth` volume, plus `scripts/ralph.sh --harness=deepagents` ([#237](https://github.com/mifunedev/openharness/issues/237)).
- Add a `docs/agents/pi.md` stub and a Pi entry in the home-page agent grid, matching Pi's restoration as a default-installed CLI ([#233](https://github.com/mifunedev/openharness/pull/233)).
- Add a top-level `Makefile` wrapping the compose invocations with `sandbox`, `shell`, `destroy`, `stop`, `logs`, `ps`, `restart`, and a self-documenting `help` default target.

### Changed
- Flip the sandbox image name from `<name>-sandbox` to `sandbox-<name>` so harness images group together in `docker images` ([#265](https://github.com/mifunedev/openharness/issues/265)).
- Move project rules to the canonical `context/rules/`, keeping `.claude/rules` as a symlink and dropping the inert `.codex/rules` and `.pi/rules` links ([#257](https://github.com/mifunedev/openharness/issues/257)).
- **BREAKING**: Clone the installer to `~/.openharness/` (was `~/openharness/`); `scripts/install.sh` auto-migrates existing checkouts in place.
- **BREAKING**: Remove the in-repo `.openharness/` subdirectory entirely.
- **BREAKING**: Move `composeOverrides[]` config from `.openharness/config.json` to a gitignored repo-root `config.json` seeded from tracked `config.example.json`.
- **BREAKING**: Drop `pi-host.yml` from the default `composeOverrides`; Pi users add it back manually in `config.json`.
- Make `/cloudflared-tunnel` reconstruct a missing `<tunnel-id>.json` from `cloudflared tunnel token` instead of failing ([#249](https://github.com/mifunedev/openharness/issues/249)).
- Collapse the quickstart in `README.md` and `docs/quickstart.md` to one linear flow, demote manual setup to a `<details>` block, and add a Configuration section for `.devcontainer/.env`.
- Move `install.sh` to `scripts/install.sh` per the orchestrator-scripts convention; the `https://oh.mifune.dev/install.sh` redirect must be repointed at the new raw URL.
- Make `scripts/install.sh` detect the host `gh auth token`, auto-populate `.devcontainer/.env` with timezone and git identity, drop the `SANDBOX_PASSWORD` prompt, and preserve an existing env file on re-runs.
- Use the new `make` targets in the `CLAUDE.md` Lifecycle section, keeping docker-native commands for deeper inspection.
- Rewrite the `.devcontainer/.example.env` header as the single customization surface and flip `INSTALL_AGENT_BROWSER` to `false` by default.
- Consolidate repo-layout documentation into `docs/architecture/container-runtime.md#repo-layout`, add `.claude/rules/repo-layout-source.md` against drift, and remove phantom heartbeat env vars.

### Added
- Restore `@mariozechner/pi-coding-agent` as a default-installed CLI alongside Claude Code and Codex, with the `pi-host.yml` overlay back in `composeOverrides` and `.pi` added to the entrypoint's skip-chown loop.
- Add `"type": "module"` to the root `package.json` to silence the Node `MODULE_TYPELESS_PACKAGE_JSON` warning on every `cron-runtime.ts` invocation.
- Add an `## Active items` watchlist to `crons/heartbeat.md` that the hourly heartbeat reads to validate deferred follow-ups ([#224](https://github.com/mifunedev/openharness/issues/224)).
- Add the memory concept: long-term `memory/MEMORY.md`, daily `memory/YYYY-MM-DD/log.md` logs, and the write-side protocol in `context/rules/memory.md`, auto-loaded at session start.

### Removed
- Remove `oh` CLI references and the multi-agent copy from the marketing landing page, rewriting it around "we provide the sandbox, you choose the harness" ([#233](https://github.com/mifunedev/openharness/pull/233)).
- Hide Gemini from the docs sidebar and sitemap with `unlisted: true` — the page stays reachable by direct URL — and swap its home-page tile for Pi ([#233](https://github.com/mifunedev/openharness/pull/233)).
- Delete stale files missed in #223: `.devcontainer/tests/cli-binaries.sh`, `.devcontainer/init-env.sh`, `.claude/posts/*`, and `tsconfig.base.json` ([#228](https://github.com/mifunedev/openharness/issues/228)).
- Prune four orphaned `.openharness/` files left over from the v0.7 convergence and add `.openharness/README.md`; the `composeOverrides` role is unchanged ([#222](https://github.com/mifunedev/openharness/issues/222)).
- Remove 0 eligible stale remote branches after critic-gated review — no branch met the >60-day deletion gate ([#213](https://github.com/mifunedev/openharness/issues/213)).
- Remove five stale or corrupted `.worktrees/` agent directories and their worktree registrations, cutting the ignored worktree footprint below 100 MB ([#213](https://github.com/mifunedev/openharness/issues/213)).
- Remove the dead legacy install-side setup, entrypoint, and tmux wrapper scripts now that the Dockerfile wires `.devcontainer/entrypoint.sh` directly ([#213](https://github.com/mifunedev/openharness/issues/213)).
- Remove the empty untracked `packages/web-ui/` and `packages/slack/` husks, plus the stale Slack workspace and entrypoint references ([#213](https://github.com/mifunedev/openharness/issues/213)).
- Remove the obsolete on-disk SPEC v0.6 artifact so `.claude/specs/` exposes only canonical tracked specs ([#213](https://github.com/mifunedev/openharness/issues/213)).
- **BREAKING**: Deprecate `oh harness add` — packs install via `git clone` plus manual `cp` for v1 ([#211](https://github.com/mifunedev/openharness/issues/211), [#210](https://github.com/mifunedev/openharness/issues/210)).
- **BREAKING**: Empty the workspace template of pi-coupled scaffolding, leaving a generic ~22-line agent-runtime stub ([#210](https://github.com/mifunedev/openharness/issues/210)).
- **BREAKING**: Triage the orchestrator skills to `/release`, `/ci-status`, `/cloudflared-tunnel`, and `/agent-browser` ([#210](https://github.com/mifunedev/openharness/issues/210)).
- **BREAKING**: Archive the multi-agent comparison narrative — delete the worktree-per-agent draft and move the BYOH post to `blog/archive/` with `archived: true` ([#210](https://github.com/mifunedev/openharness/issues/210)).
- **BREAKING**: Remove the `@openharness/sandbox` CLI and its package, making `docker compose` the canonical substrate ([#210](https://github.com/mifunedev/openharness/issues/210)).
- **BREAKING**: Remove the heartbeat daemon and its CLI, tests, env vars, and skill; `scripts/cron-runtime.ts` replaces it ([#210](https://github.com/mifunedev/openharness/issues/210)).
- **BREAKING**: Drop `@mariozechner/pi-coding-agent` as a dependency — the pi CLI and Mom Slack bot move to the separate `@ryaneggz/mifune` harness pack ([#208](https://github.com/mifunedev/openharness/pull/208)).

### Added
- Add a root `context/` orchestrator identity layer (`SOUL.md`, `IDENTITY.md`, `TOOLS.md`, `USER.md`) read at session start ([#220](https://github.com/mifunedev/openharness/issues/220)).
- Add `.claude/protected-paths.txt` listing load-bearing paths critics must not propose deleting without an explicit override note ([#218](https://github.com/mifunedev/openharness/issues/218)).
- **`/ship-spec` v1.1**: run the critics before the GitHub issue is opened, so a halted spec no longer leaves a dangling issue behind ([#218](https://github.com/mifunedev/openharness/issues/218)).
- Add the `/ship-spec` skill composing `/prd` → 2 critics → critique gate → `/ralph` → `gh issue` → branch → draft PR in one invocation ([#215](https://github.com/mifunedev/openharness/issues/215)).
- Add a v1 Ideal Customer Profile statement at `.claude/ICP.md` with the primary persona, top jobs-to-be-done and needs, and an explicit anti-ICP ([#210](https://github.com/mifunedev/openharness/issues/210)).
- Seed the two SPEC-reserved crons: `crons/heartbeat.md` (hourly) and `crons/cleanup-tasks.md` (Sunday 23:00) ([#210](https://github.com/mifunedev/openharness/issues/210)).
- Start `scripts/cron-runtime.ts` in a `system-cron` tmux session on container boot, replacing the legacy `heartbeat-daemon` watchdog block ([#210](https://github.com/mifunedev/openharness/issues/210)).
- Add `scripts/cron-runtime.ts`, a croner runtime that schedules `crons/*.md` from frontmatter and runs each body through `claude -p` ([#210](https://github.com/mifunedev/openharness/issues/210)).
- Add SPEC v0.7 amendments at `.claude/specs/structure-spec-v0.7.md` resolving seven v0.6 conflicts and adding harness-pack and skill-scope sections ([#210](https://github.com/mifunedev/openharness/issues/210)).
- Add a README "Docker only (no installer)" section with a compose-based deploy path for hosts that have only Docker and git.
- Add per-page OpenGraph and canonical link tags via the `theme.config.tsx` head function ([#140](https://github.com/mifunedev/openharness/issues/140)).
- Add a Worktree-per-agent blog post draft, staged for Wednesday publish ([#145](https://github.com/mifunedev/openharness/pull/145)).
- Add a blog section at /blog and an About page nav entry (#143).
- Add the BYOH blog post — stop installing agent CLIs on your laptop (#144).
- Add a root `CHANGELOG.md` and document the Keep-a-Changelog workflow in `.claude/rules/git.md`; `/release` now promotes `[Unreleased]` to the new version section at tag time.
- Generate `sitemap.xml` and `robots.txt` during the docs build via `next-sitemap` ([#141](https://github.com/mifunedev/openharness/issues/141)).
- Add a launch runbook consolidating the manual cutover steps (DNS, GitHub settings, OG validation, GSC, promotion).
- Add a Docusaurus v3 docs site at `apps/docs`, deployed to oh.mifune.dev ([#164](https://github.com/mifunedev/openharness/issues/164)).

### Changed
- Consolidate the cron runtime log onto `crons/.cron.log`; the daemon no longer writes `crons/cron-runtime.log` ([#228](https://github.com/mifunedev/openharness/issues/228)).
- Align the remaining flat-format memory references in tracked docs to the `memory/YYYY-MM-DD/log.md` directory-per-day form ([#210](https://github.com/mifunedev/openharness/issues/210)).
- **BREAKING**: Rewrite `CLAUDE.md` for `docker compose`-only orchestrator instructions and a four-skill table ([#210](https://github.com/mifunedev/openharness/issues/210)).
- **BREAKING**: Rewrite the installation, onboarding, lifecycle, and connecting docs without `oh` CLI references, deleting `docs/cli/` ([#210](https://github.com/mifunedev/openharness/issues/210)).
- **BREAKING**: Rewrite `README.md`, `docs/intro.md`, and `docs/quickstart.md` for single-project framing, dropping the side-by-side tagline ([#210](https://github.com/mifunedev/openharness/issues/210)).
- **BREAKING**: Rewrite `install.sh` as a docker-compose-only installer, removing the `--cli` / `--with-cli` / `--install-node` flags and the Node/nvm/pnpm bootstrap ([#210](https://github.com/mifunedev/openharness/issues/210)).
- Rename the `install.sh` curl-pipe target from `~/.openharness` to `~/openharness` so it no longer collides with the in-repo `.openharness/` config dir ([#200](https://github.com/mifunedev/openharness/issues/200)).
- Revert to the `sandbox` in-container user name ([#170](https://github.com/mifunedev/openharness/issues/170), [#172](https://github.com/mifunedev/openharness/issues/172), [#198](https://github.com/mifunedev/openharness/issues/198)).
- Consolidate documentation so `/docs/` is the single source served by Docusaurus from `apps/docs/`, and enable the blog at `/blog/` ([#178](https://github.com/mifunedev/openharness/pull/178)).
- Auto-detect Node 20+ in the installer and add `--cli` / `--docker-only` / `--install-node` flags; `--with-cli` is deprecated ([#176](https://github.com/mifunedev/openharness/pull/176)).
- Use the short `https://oh.mifune.dev/install.sh` URL in the README and installation docs instead of the long `raw.githubusercontent.com` URL.
- Make `/release` execute the `[Unreleased]` → `[$VERSION]` promotion and have `release.yml` source the GitHub Release body from the promoted section, so release notes match the changelog byte-for-byte.
- Revert the prior secondary product name; "Open Harness" is the sole brand across README, docs, and onboarding ([#157](https://github.com/mifunedev/openharness/issues/157)).
- Require an explicit public hostname in the Cloudflare onboarding step, with no default domain ([#157](https://github.com/mifunedev/openharness/issues/157)).
- Slim the README to ~110 lines and lead with the oh CLI flow (#139).
- Promote the wiki from `workspace/wiki/` to `docs/wiki/` with the same structure, now top-level alongside human-curated docs.
- Convert 26 docs pages from Nextra MDX to plain markdown rendered by GitHub.

### Fixed
- Expand `.openharness/config.json` `composeOverrides` into `-f` flags in `make sandbox` and `scripts/install.sh` so the default claude/codex/pi host-auth bind-mounts actually apply on a fresh install, and pre-create `~/.pi`.
- Fix the dim Pi icon on the home-page agent grid by restoring the inline `PiIcon` React component so `currentColor` inverts cleanly between the light and dark themes ([#233](https://github.com/mifunedev/openharness/pull/233)).
- Stop `.claude/hooks/deny-env-dump.sh` false-denying `gh` heredoc bodies whose prose mentions `history` or `cat .env`, and drop the over-broad Tier-2 `echo|printf` ASK rule. (commit `3ec98fe`).
- Correct the container runtime docs to show `ENTRYPOINT ["entrypoint.sh"]` invoking `.devcontainer/entrypoint.sh` directly ([#213](https://github.com/mifunedev/openharness/issues/213)).
- Restore six orchestrator skills removed in error during the v0.7 convergence: `/ralph`, `/prd`, `/harness-audit`, `/skill-lint`, `/delegate`, and `/strategic-proposal`.
- Auto-disable the `*-host.yml` overlays in `.openharness/config.json` when the host UID is not 1000, using `jq` to filter them out of `composeOverrides` ([#202](https://github.com/mifunedev/openharness/issues/202)).
- Share host auth (`~/.claude`, `~/.codex`, `~/.pi`) into the sandbox again by pre-creating the auth dirs before bring-up ([#196](https://github.com/mifunedev/openharness/issues/196)).
- Stop `oh` / `claude` / `codex` failing with `EACCES` on fresh installs by dropping the host overlays from the default `composeOverrides` ([#194](https://github.com/mifunedev/openharness/issues/194)).
- Stop `oh sandbox` failing on fresh installs with a Caddyfile bind-mount error by removing the gateway and cloudflared overlays from the defaults ([#192](https://github.com/mifunedev/openharness/issues/192)).
- Lead the `install.sh` next-steps with a numbered "source your shell rc" step that detects `$SHELL`, so users pick up `oh` / `node` / `pnpm` without reopening their shell.
- Bootstrap `PNPM_HOME` in `install.sh` before `pnpm link --global` so the CLI install no longer dies with `ERR_PNPM_NO_GLOBAL_BIN_DIR` on fresh nvm-installed Node.
- Stop `install.sh` silently exiting when sourcing a pre-existing `~/.nvm/nvm.sh` under `set -euo pipefail`, add an `ERR` trap that names the failing command, and pin pnpm to `10.33.0`.
- Stop the Slack bot dropping oversized replies with `msg_too_long` errors: the main message caps at 2,900 chars and spills into thread replies ([#135](https://github.com/mifunedev/openharness/issues/135)).

### Removed
- Remove the legacy `/docs/{plans,wiki,launch-runbook,blog}/` and `apps/docs/docs/` trees, consolidated into `/docs/` ([#178](https://github.com/mifunedev/openharness/pull/178)).
- Remove the Nextra docs site and the `.github/workflows/docs.yml` deployment; documentation is now plain markdown in `docs/`, read in the GitHub UI.
- Remove the reference Next.js application at `workspace/projects/next-app/`, its CI jobs, and the release pre-flight gate referencing it.
- Remove the root `package.json` scripts `dev`, `docs:dev`, `docs:build`, and `docs:preview`.

### Deprecated
### Security

---

Release history prior to this file: see [git tags](https://github.com/mifunedev/openharness/tags) and [GitHub Releases](https://github.com/mifunedev/openharness/releases). Most recent pre-changelog tag: `2026.4.22`.
