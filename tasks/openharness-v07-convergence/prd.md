# PRD: OpenHarness v0.7 Convergence

## 1. Introduction

OpenHarness has accumulated structural slop over 552 commits in the last quarter — a CLI surface that wraps `docker compose` thinly, a 1,900 LOC heartbeat daemon, marketing that doesn't match the product, and a workspace template carrying prior-agent state. The pi/Slack/heartbeat extraction to `@ryaneggz/mifune` (#208/#209) forced the question: what is the harness's substrate, separate from any pack?

SPEC v0.6 (`.claude/specs/structure-spec-v0.6.md`) sketched a single-project, agent-tended scaffold as the answer — but predates the pack mechanism and contradicts shipped decisions (`docs/` consolidation #178, image name `ryaneggz/openharness`). Three critic reports converged on a single sequence: SPEC v0.7 must land first as additive amendments; then strip the project to that target.

This PRD covers the convergence work in six phases: SPEC v0.7, croner runtime, atomic CLI deletion, marketing rewrite, skill triage and workspace alignment, security closure and release.

## 2. Goals

- Land SPEC v0.7 as additive-only amendments resolving the 7 conflicts identified by critics
- Replace the 1,900 LOC heartbeat daemon with a ≤120 LOC croner runtime
- Delete `packages/sandbox/` (the `oh` CLI) atomically with all dependent surfaces
- Rewrite README, archive multi-agent blogs, commit to single-project framing
- Triage 14 orchestrator skills to a defensible set of ≤5
- Empty pi-coupled workspace template; migrate memory to per-day directories
- Close pack-mechanism security gaps (or formally defer them)
- Tag a release that ships the post-pi state to GHCR `:latest`

## 3. User Stories

Stories are sized for one focused PR. Sequencing matters: stories within a phase are independent; phases must land in order (Phase 0 → 1 → 2 → 3 → 4 → 5 → 6).

### Phase 0 — SPEC v0.7

#### US-001: Draft SPEC v0.7 amendments

**Description:** As a maintainer, I want SPEC v0.7 to resolve the 7 conflicts so subsequent PRs have a single source of truth.

**Acceptance Criteria:**

- [ ] New file `.claude/specs/structure-spec-v0.7.md` (additive only; no breaking changes)
- [ ] §"Harness Packs" added: 10-key `harness.json` contract, 3 source modes (npm/git/local), registry path `.openharness/harnesses.json`, `workspace_seed` semantics or removal
- [ ] §"Orchestrator vs workspace agent skills" added: clarifies SPEC's 10 are workspace-agent scope; orchestrator skills (`/release`, `/ci-status`, etc.) are a separate scope
- [ ] §"oh CLI" added: declares CLI deprecated in v0.7; `docker compose` is the canonical substrate
- [ ] §"Documentation source" added: clarifies `docs/wiki/` is the path (not bare `wiki/`); `docs/` is not omitted
- [ ] §"Image name" added: `ghcr.io/ryaneggz/openharness` is canonical; `ruska-ai/sandboxes` reference removed
- [ ] §"Croner runtime" added: contract for runtime owner, startup mechanism (tmux session), restart policy
- [ ] §"Hook execution mechanism" added: GitHub Actions for CI hooks; git hooks for local
- [ ] §"Memory structure" decision: directory-per-day (`memory/YYYY-MM-DD/`) is canonical; flat files deprecated
- [ ] §"Tasks vs .ralph" decision: `tasks/<taskdesc>/` per SPEC; `.ralph/` deprecated
- [ ] Over-specified sections shrunk: `apps/web/` JS config snippet, eval flakiness budget rubric, wiki-sync 1-5 rubric, blog authorship model, weekly cleanup cron
- [ ] Markdown lint passes
- [ ] CHANGELOG `[Unreleased]` entry under `### Added`

### Phase 1 — Croner runtime

#### US-002: Implement croner runtime script

**Description:** As an orchestrator, I want a tiny croner script that reads `crons/*.md` markdown frontmatter and schedules tasks, replacing the 1,900 LOC heartbeat daemon.

**Acceptance Criteria:**

- [ ] New file `scripts/cron-runtime.ts` (≤120 LOC) using `croner` npm package
- [ ] Parses YAML frontmatter from `crons/*.md`: `id`, `schedule`, `timezone`, `enabled`, `overlap`, `catchup`
- [ ] Skips files where `enabled: false`
- [ ] On cron fire, runs the body of the `.md` as a prompt to `claude -p` (or configurable agent binary via env var)
- [ ] Logs to `crons/cron-runtime.log` with timestamp + cron id + status
- [ ] Uses file-based PID lock (`crons/.pid`) to prevent double-firing on restart
- [ ] Exits cleanly on SIGTERM
- [ ] Vitest unit tests: frontmatter parsing, skip-when-disabled, PID-lock collision
- [ ] Typecheck passes

#### US-003: Wire croner into devcontainer entrypoint

**Description:** As a sandbox user, I want the croner runtime to start automatically in a tmux session per `.claude/rules/sandbox-processes.md`.

**Acceptance Criteria:**

- [ ] `.devcontainer/entrypoint.sh` launches `tmux new-session -d -s system-cron 'node scripts/cron-runtime.ts 2>&1 | tee /tmp/system-cron.log'`
- [ ] Old `heartbeat-daemon` startup block removed from entrypoint
- [ ] `tmux ls` from inside the sandbox shows `system-cron` session
- [ ] Container restart cleanly relaunches the tmux session
- [ ] Manual smoke test: `docker compose down && docker compose up -d` results in croner running on first boot

#### US-004: Seed reserved crons

**Description:** As an orchestrator, I want the two SPEC-reserved crons (`heartbeat.md`, `cleanup-tasks.md`) seeded as canonical examples.

**Acceptance Criteria:**

- [ ] `crons/heartbeat.md` exists with frontmatter `schedule: "0 * * * *"`, `enabled: true`, body per SPEC §crons reserved
- [ ] `crons/cleanup-tasks.md` exists with frontmatter `schedule: "0 23 * * 0"` (Sunday 23:00), body archives completed tasks per SPEC §"Weekly task cleanup"
- [ ] No other crons seeded — substrate stays empty for users to add

#### US-005: Delete the heartbeat daemon

**Description:** As a maintainer, I want the 1,900 LOC heartbeat daemon gone now that croner replaces it.

**Acceptance Criteria:**

- [ ] `rm -r packages/sandbox/src/lib/heartbeat/` (8 files, ~1,752 LOC)
- [ ] `rm packages/sandbox/src/cli/heartbeat-daemon.ts` (73 LOC)
- [ ] `rm packages/sandbox/src/tools/heartbeat.ts` (52 LOC)
- [ ] `rm packages/sandbox/src/__tests__/heartbeat*.ts` (all related tests)
- [ ] Removed from `cli/index.ts`, `tools/index.ts`, `bin` entry in package.json
- [ ] `rm -r .claude/skills/heartbeat/`
- [ ] All references to `heartbeat-daemon` binary removed from `.claude/skills/repair/SKILL.md`
- [ ] Heartbeat env block stripped from `.devcontainer/docker-compose.yml`
- [ ] Heartbeat watchdog stripped from `install/banner.sh`
- [ ] CI green
- [ ] Typecheck passes

### Phase 2 — Atomic CLI deletion

#### US-006: Delete `packages/sandbox/` and update all dependent surfaces

**Description:** As a maintainer, I want the CLI gone in a single atomic PR that updates every public-facing reference simultaneously, so no user is stranded between commits.

**Acceptance Criteria:**

- [ ] `rm -rf packages/sandbox/`
- [ ] `pnpm-workspace.yaml` updated (remove `packages/sandbox`)
- [ ] Root `package.json` workspace deps updated
- [ ] `install.sh` lines 388, 628, 630, 635: replace `oh sandbox/shell/clean` next-steps with `docker compose -f .devcontainer/docker-compose.yml up -d --build`, `docker exec -it -u sandbox openharness zsh`, `docker compose -f .devcontainer/docker-compose.yml down -v`
- [ ] `install.sh` `packages/sandbox` detection at line 388 removed
- [ ] `install.sh` `pnpm link --global ./packages/sandbox` step removed; `--cli` / `--with-cli` flags removed
- [ ] `README.md` Quickstart section rewritten to lead with `docker compose -f .devcontainer/docker-compose.yml up -d --build`
- [ ] `docs/quickstart.md`, `docs/intro.md`, `docs/installation.md`, `docs/onboarding.md`, `docs/sandbox-lifecycle.md`, `docs/connecting.md` rewritten to remove `oh` references
- [ ] All remaining `.claude/skills/*/SKILL.md` files: `oh` references replaced with `docker compose` equivalents (per US-009 triage; deleted skills don't need updates)
- [ ] `CLAUDE.md` and `workspace/AGENTS.md`: `oh` references removed
- [ ] `.openharness/` directory: kept (still used by docker-compose overlays); `config.json` becomes a manually-edited file
- [ ] Cloudflare Worker at `oh.mifune.dev/install.sh` 302 target verified to point at `main` install.sh after merge (coordinated with infra owner)
- [ ] CI green
- [ ] Manual smoke test: fresh laptop, `curl -fsSL https://oh.mifune.dev/install.sh | bash` results in working sandbox in <10 min

#### US-007: Delete `build.yml` workflow

**Description:** As a maintainer, I want only one Docker image build path (`release.yml`), eliminating the dual-image drift between `ghcr.io/ryaneggz/open-harness` and `ghcr.io/ryaneggz/openharness`.

**Acceptance Criteria:**

- [ ] `rm .github/workflows/build.yml`
- [ ] No remaining workflow pushes to `ghcr.io/ryaneggz/open-harness` (with hyphen)
- [ ] `release.yml` is the sole image producer; pushes only to `ghcr.io/ryaneggz/openharness`
- [ ] Release notes for next tag mention deprecation of the hyphenated image name

### Phase 3 — Marketing kill

#### US-008: Rewrite README and archive multi-agent blogs

**Description:** As Critic A demanded, I want the multi-agent comparison-shopping narrative actively killed across all public artifacts so v1's single-project framing is the only voice.

**Acceptance Criteria:**

- [ ] `README.md` first paragraph rewritten: replaces "run Claude, Codex, Gemini, and Pi side-by-side" with single-project framing (e.g., "OpenHarness is a Docker-based agent harness for one project, agent-tended over time")
- [ ] README "What you get" section: drops multi-agent CLI list; adds packs as the multi-agent answer (e.g., `@ryaneggz/mifune` for Slack/heartbeats)
- [ ] README "Quickstart" leads with `docker compose` (per US-006)
- [ ] `blog/2026-04-29-worktree-per-agent.md` deleted (still `draft: true`, costs nothing)
- [ ] `blog/2026-04-28-byoh.md` moved to `blog/archive/2026-04-28-byoh.md` with frontmatter `archived: true` and a one-line top-of-post note that v1 framing differs
- [ ] `docs/intro.md` rewritten: removes "Run Claude, Codex, Gemini, and Pi side-by-side"; reflects single-project framing
- [ ] Anti-ICP added to `.claude/ICP.md` (or README): not multi-tenant SaaS, not non-developers, not production agent operators, not comparison-shopping tinkerers
- [ ] `grep -ri "side-by-side\|comparison-shop\|14 Node versions" README.md docs/ blog/ | grep -v archive/` returns zero hits

### Phase 4 — Skills triage

#### US-009: Triage orchestrator skills per Critic B's table

**Description:** As an orchestrator, I want a defensible 5-skill set, not a 14-skill grab bag.

**Acceptance Criteria:**

- [ ] **Drop**: `delegate`, `harness-audit`, `strategic-proposal`, `skill-lint`, `heartbeat`, `prd` (existing — replaced by SPEC's `/spec` flow in a future PRD), `ralph` (existing — replaced by SPEC's `/ralph` task scaffolder in a future PRD). Remove their `.claude/skills/<name>/` directories.
- [ ] **Convert to docs**: `provision`, `destroy`, `repair`. Each becomes a `docs/` page documenting the equivalent `docker compose` commands. Skill directories removed.
- [ ] **Keep + conform**: `release` (becomes `/ship` flow per SPEC), `ci-status`, `cloudflared-tunnel` (until moved to mifune), `agent-browser` (until moved to mifune)
- [ ] **Track for pack migration**: open issues in `@ryaneggz/mifune` for `cloudflared-tunnel` and `agent-browser` to receive their orchestrator-side counterparts. Out of scope for this PRD.
- [ ] CLAUDE.md skills table updated to reflect new set
- [ ] All deleted skill references purged from `CLAUDE.md`, `workspace/AGENTS.md`, README

### Phase 5 — Workspace alignment

#### US-010: Empty pi-coupled workspace template

**Description:** As an orchestrator, I want the `workspace/` template to be agent-runtime-agnostic so packs (not the harness) supply identity.

**Acceptance Criteria:**

- [ ] `rm workspace/{HEARTBEAT,IDENTITY,MEMORY,SOUL,TOOLS,USER}.md` (pi-runtime identity files)
- [ ] `rm -r workspace/heartbeats/` (replaced by `crons/` at root per SPEC)
- [ ] `rm -r workspace/.ralph/`, `workspace/.codex/`, `workspace/.openharness/` (agent-state in template)
- [ ] `rm -r workspace/memory/` (instance state in template)
- [ ] `rm -r workspace/.claude/skills/{compress,content-gate,eval-conciseness,quality-gate,wiki-*,ralph,prd,ci-status}/`
- [ ] `rm -r workspace/.claude/agents/{council,critic,implementer,pm,agent-builder,command-builder,rule-builder,skill-builder}.md`
- [ ] `rm workspace/.claude/hooks/notify_slack.sh`
- [ ] **Keep**: `workspace/AGENTS.md` (rewritten as a generic ~20-line agent-runtime stub), `workspace/startup.sh`, `workspace/.claude/.example.env.claude`, `workspace/.claude/rules/{code-quality,git,token-conservation}.md`, `workspace/.claude/settings.local.json`, `workspace/.claude/screenshots/.gitkeep`
- [ ] CLAUDE.md project-structure block updated to match what remains
- [ ] CHANGELOG entry under `[Unreleased]` `### Removed` documents the workspace template emptying as BREAKING

#### US-011: Migrate memory structure to directory-per-day

**Description:** As per SPEC v0.7's memory-structure decision, `memory/YYYY-MM-DD/` directories are canonical.

**Acceptance Criteria:**

- [ ] After US-010, no flat memory files remain in `workspace/`
- [ ] If any flat memory files survive (root-level `memory/*.md`), migrate to `memory/YYYY-MM-DD/log.md`
- [ ] `.claude/skills/repair/SKILL.md` and `CLAUDE.md` reference directory format

#### US-012: Archive `tasks/install-prereq-detection/`

**Description:** This folder is functionally complete (all 7 stories `passes: true`) but missing `prompt.md` + `progress.txt` — archive cleanly per SPEC's weekly cleanup convention.

**Acceptance Criteria:**

- [ ] `mkdir -p memory/2026-05-02/tasks && mv tasks/install-prereq-detection/ memory/2026-05-02/tasks/install-prereq-detection/`
- [ ] No broken references in CHANGELOG or open issues

### Phase 6 — Security & release

#### US-013: Close pack-mechanism security gaps (or defer)

**Description:** Per Critic B and C, pack install pipeline has command injection in `fetchGitPack` and path-traversal in `registerComposeOverlays`.

**Acceptance Criteria:**

- [ ] **Caveat**: `packages/sandbox/` is deleted in US-006. Pack mechanism currently lives there.
- [ ] Decision: pack mechanism is **not preserved in v0.7**. Mifune installation reverts to `git clone` + manual install for v1.
- [ ] Open tracking issue "v0.8 pack contract redesign" capturing security requirements (URL allowlisting, signature verification, sandboxed install)
- [ ] CHANGELOG `[Unreleased]` `### Removed` entry: `oh harness add` deprecated; mifune install via `git clone`

#### US-014: Tag release after convergence lands

**Description:** Currently `:latest` GHCR image still contains pi/mom code (CHANGELOG `[Unreleased]`). Tag a release once US-001 through US-013 land.

**Acceptance Criteria:**

- [ ] All prior stories merged to `development` then to `main`
- [ ] CHANGELOG `[Unreleased]` promoted to versioned section
- [ ] `release/<VERSION>` branch + tag pushed; `release.yml` builds and pushes GHCR image
- [ ] `docker run --rm ghcr.io/ryaneggz/openharness:latest which pi` returns non-zero (pi removed)
- [ ] `docker run --rm ghcr.io/ryaneggz/openharness:latest which oh` returns non-zero (CLI removed)
- [ ] GitHub Release published with body matching CHANGELOG section

## 4. Functional Requirements

- FR-1: SPEC v0.7 must be additive only — no breaking changes from v0.6 to v0.7
- FR-2: Croner runtime ≤ 120 LOC; no in-memory state that doesn't survive restart
- FR-3: Croner runtime starts via tmux session named `system-cron` per `sandbox-processes.md` rule
- FR-4: CLI deletion is atomic — install.sh, README, all docs, all skills, Cloudflare Worker target update in one PR
- FR-5: Image name is `ghcr.io/ryaneggz/openharness`; no other image name written by any workflow
- FR-6: README first paragraph reflects single-project framing; the phrase "side-by-side" does not appear
- FR-7: Anti-ICP is documented in `.claude/ICP.md` or README
- FR-8: Final orchestrator skill set is ≤ 5 skills (per Phase 4 triage)
- FR-9: Workspace template contains zero pi-coupled identity files post-US-010
- FR-10: Memory structure is directory-per-day (`memory/YYYY-MM-DD/`); flat files are deprecated
- FR-11: `tasks/<taskdesc>/` is canonical Ralph task path; `.ralph/` is deprecated
- FR-12: Pack-mechanism security gaps either closed or formally deferred to a tracked v0.8 issue
- FR-13: Release tagged with CHANGELOG promoted; `:latest` reflects post-convergence state

## 5. Non-Goals (Out of Scope)

- Net-new SPEC skills (`/spec`, `/plan`, `/build`, `/test`, `/review`, `/ship` content): defer to a follow-up PRD once substrate lands
- Wiki-sync enforcement (depends on `/wiki-sync` skill not yet built)
- Multi-project nesting (`workspace/<project-name>/`): SPEC explicitly defers
- Cursor / Gemini cross-tool adapters: v0.7 open question
- Pi pack (`@ryaneggz/mifune`) internal changes: separate repo, separate PRD
- New Caddy gateway features: gateway becomes documented `-f` overlay flow
- Test-suite-as-backpressure infrastructure (deterministic + eval): SPEC describes; building is a separate PRD
- Pre-commit hook setup (`.pre-commit-config.yaml`): defer
- Templates dispatcher (`scripts/scaffold.sh`): defer
- Cross-repo coordination of mifune-side skill migration (tracked as issues only)

## 6. Technical Considerations

- **Pack mechanism fate**: When `packages/sandbox/` is deleted in US-006, the pack mechanism (`packages/sandbox/src/harness/{registry,pack}.ts`) goes with it. Mifune installation reverts to `git clone` + manual install. Acceptable for v1 given mifune is the only known pack. v0.8 may reintroduce a 50-LOC standalone pack-add script.
- **Cloudflare Worker**: 302 redirect at `oh.mifune.dev/install.sh` must update simultaneously with US-006. The Worker is in a separate repo — coordinate with infra owner.
- **install.sh end-to-end**: live-download paths (nvm SHA-256, Node-absent prompt) are not exercised in CI. Manual smoke test on a fresh host is acceptance criteria for US-006.
- **GHCR `:latest` pollution**: until US-014 ships, anyone pulling `:latest` gets pi/mom pre-installed. Minor issue if release happens within ~1 week.
- **Phase ordering enforced**: Phase 0 (SPEC) before Phase 1 (croner) before Phase 2 (CLI delete). Phase 1 must complete before Phase 2 because heartbeat skill references `heartbeat-daemon` binary; if CLI is deleted first, the skill is broken without a replacement runtime.
- **CHANGELOG discipline**: every story adds a `[Unreleased]` entry per `.claude/rules/git.md` § Changelog.

## 7. Success Metrics

- **Phase completion**: all 14 user stories landed and merged within 4 weeks
- **Slop reduction**: net LOC delta is large negative (estimate: -3,500 LOC from heartbeat daemon + CLI removal + workspace template trimming)
- **Onboarding clarity**: a fresh user reading README v1 can run `docker compose` and have a sandbox in <10 min (manual test on cold-cache laptop)
- **Marketing alignment**: `grep -ri "side-by-side\|comparison-shop\|14 Node versions" README.md docs/ blog/ | grep -v archive/` returns zero hits
- **CI stability**: no workflow failures in the 2 weeks following US-014 release
- **ICP fit signals**: new install survives past day-7 (manual user research, not measured in this PRD)

## 8. Open Questions

- After CLI deletion, should `.openharness/config.json` be renamed to clarify it's a manual file (e.g., `.openharness/overlays.json`)? Defer to user.
- The Cloudflare Worker repo is not in this monorepo — who has commit rights, and is the redirect update part of US-006's PR or a separate coordinated change?
- Is there appetite for a tiny standalone `oh harness add` script (~50 LOC bash) that survives CLI deletion to keep mifune installation a one-liner? Or is `git clone` + manual install acceptable for v1?
- Should SPEC v0.7 be authored in this repo (`.claude/specs/structure-spec-v0.7.md`) or upstream in the gist where v0.6 lives? Affects diff workflow.
- Container restart watchdog: tmux `system-cron` session dies if `node scripts/cron-runtime.ts` crashes. Who relaunches? Entrypoint-level supervisor, or accept manual restart for v1?
- Does the empty workspace template need a `README.md` explaining "this is bind-mounted; packs supply identity"?
