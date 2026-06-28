# PRD: Mifune Repository Extraction

## 1. Introduction/Overview

Extract the tracked `.mifune/` portable primitive pack from the Open Harness core repository into a dedicated Mifune repository while keeping Open Harness v1 bootable, deterministic, and provider-compatible. Today `.mifune/` is the source of truth for shared skills, agents, hooks, wiki corpus, and skill lock state; `.pi/skills`, `.claude/skills`, `.codex/skills`, `.claude/agents`, and `.claude/hooks` resolve through symlinks into it. The extraction must reduce core repo surface area without breaking those existing provider-facing paths or the canonical `select → spec-plan ⇄ spec-critique → spec-execute → merge → reset|clean` workflow.

Assumption: the target public repository is `mifunedev/mifune` unless the operator chooses a different destination before execution.

## 2. Goals

- Move the `.mifune/` source tree to a dedicated repository with a clear README and a pinned revision consumed by Open Harness.
- Keep the in-core path `.mifune/` present as a deterministic checkout/submodule so existing provider symlinks continue to work unchanged.
- Ensure fresh clones, devcontainers, CI, cron jobs, and agent startup initialize and validate Mifune before any skill, hook, eval, or autopilot path is used.
- Add regression coverage for broken Mifune checkout/symlink state.
- Update docs and references so humans and agents understand that Mifune is now external but mounted at `.mifune/` in the core checkout.

## 3. User Stories

### US-001: Seed the external Mifune repository

**Description:** As a maintainer, I want the current `.mifune/` tree checkpointed into its own repository so no skills, agents, hooks, wiki entries, or lock metadata are lost during extraction.

**Acceptance Criteria:**

- [ ] Create or use `mifunedev/mifune` as the external repository for the Mifune primitive pack.
- [ ] Copy the full tracked `.mifune/` tree into that repo, preserving file contents, executable bits, symlinks if any, and relative layout (`skills/`, `agents/`, `hooks/`, `skills.lock`, `README.md`).
- [ ] Add a repository README explaining that Open Harness consumes the repo at checkout path `.mifune/` and that provider symlinks target subpaths below it.
- [ ] Commit and push the checkpoint; record the resulting Mifune commit SHA in the Open Harness implementation notes.
- [ ] Verify `git -C <mifune-repo> status --short` is clean after the push.

### US-002: Replace vendored `.mifune/` with a pinned external checkout

**Description:** As an Open Harness operator, I want `.mifune/` to remain present at the same path while its contents come from the external repository so provider symlinks keep resolving.

**Acceptance Criteria:**

- [ ] Remove tracked in-core `.mifune/**` file contents from Open Harness without deleting the external checkpoint.
- [ ] Add a deterministic pin for `mifunedev/mifune` at path `.mifune/` (preferred: Git submodule/gitlink plus `.gitmodules`; otherwise an explicit pinned bootstrap manifest with equivalent reproducibility).
- [ ] Preserve these tracked provider symlinks and their existing targets unless a stronger compatibility reason is documented: `.pi/skills -> ../.mifune/skills`, `.claude/skills -> ../.mifune/skills`, `.codex/skills -> ../.mifune/skills`, `.claude/agents -> ../.mifune/agents`, `.claude/hooks -> ../.mifune/hooks`, `.codex/agents -> ../.claude/agents`.
- [ ] Verify `test -f .mifune/skills/git/SKILL.md`, `test -x .mifune/hooks/deny-env-dump.sh`, and `test -f .mifune/skills/wiki/references/schema.md` pass after a clean checkout/init.
- [ ] Verify `find .pi .claude .codex -maxdepth 2 -type l -exec sh -c 'for p; do test -e "$p" || exit 1; done' sh {} +` exits 0.

### US-003: Initialize Mifune before workflows use it

**Description:** As a fresh-clone user, I want setup, devcontainer, CI, release, cron, and agent startup paths to initialize Mifune before invoking any skill, hook, or eval runner.

**Acceptance Criteria:**

- [ ] Update install/bootstrap/devcontainer entry points so `.mifune/` is initialized before provider CLIs or hooks load skills.
- [ ] Update GitHub Actions checkout/setup steps so CI and release jobs have `.mifune/` populated before running `bash .mifune/skills/eval/run.sh`, boot-path lint, skill-path probes, or provider skill checks.
- [ ] Update any script that assumes tracked `.mifune/` contents exist in a shallow clone to either call the shared initializer or fail with a clear remediation command.
- [ ] Document the manual recovery command for a broken/missing Mifune checkout.
- [ ] `pnpm run build`, `pnpm run typecheck`, and `pnpm test:scripts` pass.

### US-004: Update references and regression probes for the external Mifune boundary

**Description:** As a maintainer, I want docs, context, evals, and DeepWiki-facing explanations to describe Mifune as an external primitive pack mounted at `.mifune/` so future agents do not re-vendor or break it.

**Acceptance Criteria:**

- [ ] Update `.mifune` references in root docs/context/skills/evals only where the ownership model changes; preserve path references where runtime still uses `.mifune/...`.
- [ ] Add or update a Tier-A eval probe that fails when `.mifune/` is missing, not initialized to the pinned external repo, or provider symlinks are broken.
- [ ] Update `context/REPO_MAP.md` to route Mifune source-of-truth questions to the external repo while still explaining the local mount path.
- [ ] Update `AGENTS.md` and relevant skill docs only enough to keep the core workflow accurate; do not rewrite individual skill behavior.
- [ ] Wiki Alignment requirements in this PRD are satisfied by a source-backed update or new entry that explains Mifune's external-repo relationship and references the DeepWiki comparison below.
- [ ] `bash .mifune/skills/eval/run.sh --probe <new-or-updated-mifune-probe>` passes.

### US-005: Verify end-to-end core workflow compatibility

**Description:** As the orchestrator, I want the extracted Mifune setup to pass the same green path as the vendored setup so the v1 core split does not regress normal operation.

**Acceptance Criteria:**

- [ ] From a clean Open Harness checkout with submodules/external Mifune initialized, provider symlinks resolve and `ls .pi/skills/git/SKILL.md .claude/skills/spec/SKILL.md .codex/skills/git/SKILL.md` succeeds.
- [ ] `bash .mifune/skills/eval/run.sh --probe skill-paths` and `bash .mifune/skills/eval/run.sh --probe spec-family-contract` pass.
- [ ] `bash .mifune/skills/eval/run.sh` completes without a Mifune-path regression.
- [ ] Existing cron preflight paths for autopilot and prompt-miner resolve to executable files under `.mifune/skills/...`.
- [ ] Open Harness PR checks are green before the PR is marked ready.

## 4. Functional Requirements

- **FR-1:** Open Harness must keep `.mifune/` as the local runtime path for the primitive pack even after extraction.
- **FR-2:** Provider symlinks must remain valid from a clean checkout after the documented Mifune initialization step.
- **FR-3:** The Mifune revision consumed by Open Harness must be pinned and reviewable in git history.
- **FR-4:** Setup and CI must fail early with clear instructions if Mifune is missing or uninitialized.
- **FR-5:** The extraction must preserve executable bits for hook and cap scripts.
- **FR-6:** The implementation must add a regression guard for missing/broken Mifune checkout or symlink drift.

## 5. Non-Goals (Out of Scope)

- Redesigning or rewriting individual Mifune skills, agents, hooks, or wiki entries.
- Removing Claude, Codex, Pi, or Hermes provider support.
- Changing the canonical spec/autopilot workflow.
- Replacing the public `mifunedev/skills` registry workflow tracked by `.mifune/skills.lock`.
- Auto-merging downstream PRs or force-pushing unrelated branches.

## 6. Design Considerations

Prefer a Git submodule/gitlink for `.mifune/` because it preserves the local path and existing provider symlink targets while making the external boundary explicit and pinned. If execution chooses a non-submodule bootstrap clone, it must provide equivalent reproducibility, CI initialization, and clean-checkout ergonomics.

## 7. Technical Considerations

- Current symlink topology: `.pi/skills`, `.claude/skills`, and `.codex/skills` point to `../.mifune/skills`; `.claude/agents` and `.claude/hooks` point to `../.mifune/agents` and `../.mifune/hooks`; Codex agents chain through `.claude/agents`.
- Critical consumers include `AGENTS.md`, cron preflight files, CI eval runner invocations, Tier-A eval probes, and provider settings/hooks.
- GitHub Actions checkout may need `submodules: true` or an explicit initializer before running commands that read `.mifune`.
- The external repo must be public or otherwise accessible to CI and new users without private credentials.

## 8. Success Metrics

- Open Harness core repository no longer tracks bulk `.mifune/**` file contents, only a pinned external reference and provider symlinks/configuration.
- Fresh clone setup documents one clear command to initialize or repair Mifune.
- CI catches a missing Mifune checkout before provider skills are used.
- Core PR checks remain green after extraction.

## 9. Open Questions

- Should the destination repo be exactly `mifunedev/mifune`, or should it use a more explicit name such as `mifunedev/openharness-mifune`?
- Should the external repo preserve full file history via a filter-repo split, or is a clean checkpoint commit sufficient for v1?
- Should GitHub Dependabot or release automation track Mifune submodule updates automatically, or should updates remain manual/pinned only?

## Wiki Alignment

**Impact:** REQUIRED

**Local entries:** No dedicated curated wiki entry for Mifune extraction exists today. The implementation should add or update a source-backed wiki entry if the wiki corpus remains part of the Mifune pack, and should keep `.mifune/skills/wiki/references/schema.md` reachable through the local mount path.

**Spec alignment:** The spec treats Mifune as an external repository mounted at `.mifune/` inside Open Harness. Runtime paths stay stable; ownership and update workflow change.

**DeepWiki comparison:** The public DeepWiki page `https://deepwiki.com/mifunedev/openharness/4-skills-system` currently describes the Skills System primarily through provider-facing `.claude/skills/` paths while listing `.mifune/README.md` and `.mifune/skills.lock` as relevant source files. This extraction must preserve the provider-facing `.claude/skills` behavior DeepWiki describes, while updating local docs/wiki to clarify that `.mifune/` is now an external primitive pack mounted into the core checkout.

**Wiki acceptance criteria:** US-004 must include a source-backed wiki/docs update that explains the external Mifune boundary, the stable `.mifune/` mount path, and the provider symlink relationship.
