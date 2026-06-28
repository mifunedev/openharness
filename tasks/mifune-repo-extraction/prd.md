# PRD: Mifune Repository Extraction

## 1. Introduction/Overview

Extract the tracked `.mifune/` portable primitive pack from the Open Harness core repository into the dedicated public repository `ryaneggz/mifune` while keeping Open Harness v1 bootable, deterministic, and provider-compatible. Today `.mifune/` is the source of truth for shared skills, agents, hooks, wiki corpus, and skill lock state; `.pi/skills`, `.claude/skills`, `.codex/skills`, `.claude/agents`, `.claude/hooks`, and Hermes' project-local skill symlink resolve through it. The extraction must reduce core repo surface area without breaking those existing provider-facing paths or the canonical `select → spec-plan ⇄ spec-critique → spec-execute → merge → reset|clean` workflow.

**Destination decision:** `ryaneggz/mifune` is the required destination for v1. It already exists and its default branch is expected to be replaced by the extracted Open Harness Mifune pack. Prefer the safe path: stage the replacement on a feature branch in `ryaneggz/mifune`, open/merge a PR into that repo's default branch, then consume the resulting default-branch SHA from Open Harness. If repository access, default-branch replacement, or public readability fails, stop and ask the operator; do not silently switch names.

**Critical invariant:** tracked contents may leave Open Harness only after the same runtime paths are restored by the pinned external checkout. Removing tracked core blobs is not permission to remove, rename, or deprecate any protected `.mifune/...` path.


## How Mifune gets added to an Open Harness checkout

The extraction must make the Mifune ingress path obvious and repeatable:

1. Open Harness carries a pinned Git submodule/gitlink at the repo-relative mount path `.mifune/`, declared in `.gitmodules` with URL `https://github.com/ryaneggz/mifune.git` and pinned to the recorded `ryaneggz/mifune` SHA. No non-submodule manifest alternative is allowed for v1.
2. A fresh clone may use either `git clone --recurse-submodules <openharness-url>` or a plain clone followed by `bash .oh/scripts/ensure-mifune.sh --init`. Both paths must initialize the same `.mifune/` submodule tree pinned to the recorded `ryaneggz/mifune` SHA.
3. `.oh/scripts/ensure-mifune.sh --init` is the canonical repair/add command. It initializes or repairs `.mifune/`, verifies the remote URL and pinned SHA, refuses branch-head drift, restores required executable bits, and then runs the protected-path and provider-symlink checks.
4. Provider exposure is not a second copy: tracked provider symlinks (`.pi/skills`, `.claude/skills`, `.codex/skills`, `.claude/agents`, `.claude/hooks`, `.codex/agents`) and the Hermes runtime symlink point at the initialized `.mifune/` mount.
5. Setup surfaces (`README.md`, `docs/README.md`, `.oh/README.md`, devcontainer/entrypoint docs, and `context/REPO_MAP.md`) must show this path in one short “How Mifune is added” block so operators can diagnose an empty `.mifune/` directory without reading implementation code.


## Scope guard and v2 follow-up

This implementation stays deliberately v1-simple: Open Harness mounts `ryaneggz/mifune` at `.mifune/` as the mandatory pinned submodule. Do not pivot this PR to make `.pi/` the submodule, move `.mifune` to a compatibility symlink, or absorb Pi runtime state into the Mifune pack.

A possible v2 follow-up may evaluate consolidating Mifune under `.pi/`, with `.mifune -> .pi` as a protected compatibility alias. That v2 needs its own spec/critique because `.pi/` currently mixes source/config with runtime-local state (`npm`, bridge installs, caches, generated files), and because Claude/Codex/Hermes protected paths would depend on a provider-named mount. v2 must first separate runtime state from versioned pack state, define ignore rules, and prove `.mifune/...` continuity through the alias.

## 2. Goals

- Move the `.mifune/` source tree to `ryaneggz/mifune` with a clear README and a pinned revision consumed by Open Harness at the same `.mifune/` mount path for v1.
- Keep the in-core runtime path `.mifune/` present as a deterministic external checkout/submodule so existing provider symlinks continue to work unchanged.
- Add a root-owned initializer/checker so fresh clones, devcontainers, CI, cron jobs, release jobs, and agent startup initialize and validate Mifune before any skill, hook, eval, or autopilot path is used.
- Make the Mifune ingress path explicit: Open Harness adds Mifune by initializing the pinned `.mifune/` mount, not by copying ad hoc files during setup.
- Add regression coverage for missing Mifune checkout, wrong pin, executable-bit loss, protected-path drift, Hermes drift, and provider symlink breakage.
- Update docs and references so humans and agents understand that Mifune is external but mounted at `.mifune/` in the core checkout.

## 3. User Stories

### US-001: Seed and verify the external Mifune repository

**Description:** As a maintainer, I want the current `.mifune/` tree checkpointed into `ryaneggz/mifune` so no skills, agents, hooks, wiki entries, or lock metadata are lost during extraction.

**Acceptance Criteria:**

- [ ] Preflight the destination before copying: `gh repo view ryaneggz/mifune --json visibility,defaultBranchRef,viewerPermission` succeeds, reports `visibility: PUBLIC`, and grants maintainer push/admin rights.
- [ ] Record the current `ryaneggz/mifune` default branch name and HEAD SHA in `tasks/mifune-repo-extraction/progress.txt` before replacing contents, so rollback can restore the previous default if needed.
- [ ] Verify public/fresh-clone readability with `git ls-remote https://github.com/ryaneggz/mifune.git HEAD`, without relying on local credentials.
- [ ] Copy the full tracked `.mifune/` tree into a replacement branch in `ryaneggz/mifune`, preserving file contents, executable bits, symlinks if any, and relative layout (`skills/`, `agents/`, `hooks/`, `skills.lock`, `README.md`).
- [ ] The replacement branch intentionally removes/replaces existing default-branch contents that are not part of the extracted Open Harness Mifune pack; this is a planned overwrite, not accidental data loss.
- [ ] Prefer branch-and-PR flow for `ryaneggz/mifune`: open a PR from the replacement branch to the repo default branch, merge it, and use the resulting default-branch merge SHA as the Open Harness pin. If execution chooses direct default-branch push, document the operator-confirmed reason in `progress.txt`.
- [ ] Add or revise the Mifune repository `README.md` explaining that Open Harness consumes the repo at checkout path `.mifune/` and that provider symlinks target subpaths below it.
- [ ] Commit and push the checkpoint/replacement; record the resulting final `ryaneggz/mifune` default-branch SHA in `tasks/mifune-repo-extraction/progress.txt` and the Open Harness PR body.
- [ ] Verify `git -C <mifune-repo> status --short` is clean after the push.

### US-002: Replace vendored `.mifune/` with a pinned external checkout without protected-path loss

**Description:** As an Open Harness operator, I want `.mifune/` to remain present at the same repo-relative path while its contents come from the external repository so provider symlinks and protected skill references keep resolving.

**Acceptance Criteria:**

- [ ] Remove tracked in-core `.mifune/**` file contents only after US-001 has a pushed/merged `ryaneggz/mifune` replacement and a recorded final default-branch Mifune commit SHA.
- [ ] Add a deterministic Git submodule/gitlink pin for `ryaneggz/mifune` at path `.mifune/` via `.gitmodules`; v1 does not allow a non-submodule bootstrap manifest because `git clone --recurse-submodules` is a required ingress path.
- [ ] Preserve these tracked provider symlinks and their current targets unless a stronger compatibility reason is documented: `.pi/skills -> ../.mifune/skills`, `.claude/skills -> ../.mifune/skills`, `.codex/skills -> ../.mifune/skills`, `.claude/agents -> ../.mifune/agents`, `.claude/hooks -> ../.mifune/hooks`, `.codex/agents -> ../.claude/agents`.
- [ ] Preserve protected explicit `.mifune/...` paths at the same repo-relative runtime locations after initialization; the implementation must run exact-path checks for:
  - `.mifune/skills/git/SKILL.md`
  - `.mifune/skills/t3/references/sandbox-processes.md`
  - `.mifune/skills/advisor/SKILL.md`
  - `.mifune/skills/advisor/references/recursive-delegation.md`
  - `.mifune/skills/retro/references/memory-protocol.md`
- [ ] Add a protected-path continuity check that reads `.claude/protected-paths.txt` and verifies every explicit `.mifune/...` entry exists after `.oh/scripts/ensure-mifune.sh --check`; for provider-backed protected skill/agent entries, verify the provider symlink target resolves to the initialized `.mifune/` tree or document an existing legacy alias.
- [ ] Verify smoke paths after a clean checkout/init: `test -f .mifune/skills/git/SKILL.md`, `test -x .mifune/hooks/deny-env-dump.sh`, `test -f .mifune/skills/wiki/references/schema.md`, and `test -f .mifune/skills/eval/run.sh`.
- [ ] Verify `find .pi .claude .codex -maxdepth 2 -type l -exec sh -c 'for p; do test -e "$p" || exit 1; done' sh {} +` exits 0 after initialization.
- [ ] Preserve executable bits for all executable files under `.mifune/hooks/` and any executable Mifune scripts/cap files; compare before/after mode lists in `tasks/mifune-repo-extraction/progress.txt`.
- [ ] Add rollback instructions and validate them in a disposable clone/worktree before deleting tracked contents: pre-merge rollback restores the Open Harness vendored tree or previous gitlink from the base commit and abandons the `ryaneggz/mifune` replacement branch; post-merge rollback reverts the Open Harness pin-removal commit or pins `.mifune/` back to the last known-good `ryaneggz/mifune` SHA, and restores the recorded pre-extraction `ryaneggz/mifune` default HEAD if the external repo replacement itself must be rolled back.

### US-003: Initialize Mifune before workflows use it

**Description:** As a fresh-clone user, I want setup, devcontainer, CI, release, cron, and agent startup paths to initialize Mifune before invoking any skill, hook, or eval runner.

**Acceptance Criteria:**

- [ ] Add a root-owned initializer/checker outside `.mifune/`, named `.oh/scripts/ensure-mifune.sh`, that supports at least `--init` and `--check` modes, initializes the pinned `.mifune/` checkout, validates the expected SHA/path/executables, and prints the manual remediation command on failure.
- [ ] Add `.oh/scripts/ensure-mifune.sh` to `.claude/protected-paths.txt` in the same PR because it becomes load-bearing bootstrap infrastructure.
- [ ] Document the manual recovery command in root docs: `bash .oh/scripts/ensure-mifune.sh --init` (or, if the implementation uses a pure submodule path, the wrapper may delegate to `git submodule update --init --recursive .mifune`).
- [ ] Update all required call sites to run the initializer/checker before provider CLIs or Mifune-hosted files are used: `Makefile` sandbox/setup targets if applicable, `.devcontainer/entrypoint.sh`, `.devcontainer/Dockerfile` or install scripts that assume skills exist, GitHub Actions CI checkouts, release workflow checkouts, cron runtime/preflight paths, and provider startup paths.
- [ ] Update GitHub Actions checkout/setup steps so CI and release jobs have `.mifune/` populated before running `bash .mifune/skills/eval/run.sh`, boot-path lint, skill-path probes, or provider skill checks.
- [ ] Update workflow path filters so Mifune pin changes trigger validation after extraction, including `.mifune`, `.gitmodules`, `.oh/scripts/ensure-mifune.sh`, the new/updated root-level Mifune probe, `.github/workflows/ci-harness.yml`, and `.github/workflows/release.yml` where relevant.
- [ ] Update any script that assumes tracked `.mifune/` contents exist in a shallow clone to either call `.oh/scripts/ensure-mifune.sh --check` or fail with a clear remediation command.
- [ ] `pnpm run build`, `pnpm run typecheck`, and `pnpm test:scripts` pass.

### US-006: Make the Mifune ingress path explicit for Open Harness

**Description:** As an Open Harness operator, I want to clearly see how Mifune gets added into an Open Harness checkout or generated harness so setup, repair, and debugging are obvious.

**Acceptance Criteria:**

- [ ] Document the canonical ingress model: Open Harness carries a pinned `.mifune/` Git submodule reference to `ryaneggz/mifune`; initialization populates that mount path, and provider surfaces are symlinks into it.
- [ ] Document the two supported fresh-clone flows: `git clone --recurse-submodules <openharness-url>` and plain clone followed by `bash .oh/scripts/ensure-mifune.sh --init`; both must initialize the same submodule pin.
- [ ] Ensure `bash .oh/scripts/ensure-mifune.sh --init` is idempotent and can add/repair Mifune in an Open Harness checkout where `.mifune/` is absent, empty, uninitialized, or at the wrong SHA.
- [ ] Ensure `bash .oh/scripts/ensure-mifune.sh --check` prints a concise diagnostic that names the expected `ryaneggz/mifune` URL/SHA, current state, and exact remediation command.
- [ ] Add one concise “How Mifune is added” block to all required operator-facing surfaces: `README.md`, `docs/README.md`, `.oh/README.md`, devcontainer/entrypoint docs or comments, and `context/REPO_MAP.md`.
- [ ] Add or update a clean-clone test/probe that starts from a checkout without initialized `.mifune/`, runs the documented init command, and verifies `.mifune/skills/git/SKILL.md`, provider symlink resolution, protected-path continuity, and Hermes symlink behavior when enabled.
- [ ] Include the ingress flow in the Open Harness PR body so reviewers can see exactly how Mifune enters the repo after extraction.

### US-004: Update references, regression probes, and maintainer workflow docs

**Description:** As a maintainer, I want docs, context, evals, and DeepWiki-facing explanations to describe Mifune as an external primitive pack mounted at `.mifune/` so future agents do not re-vendor or break it.

**Acceptance Criteria:**

- [ ] Update `.mifune` references in root docs/context/skills/evals only where the ownership model changes; preserve path references where runtime still uses `.mifune/...`.
- [ ] Add a root-level Tier-A smoke/probe outside `.mifune/` (for example `.oh/evals/probes/mifune-checkout.sh` or equivalent) that runs before the Mifune-hosted eval runner and fails clearly when `.mifune/` is missing, uninitialized, pinned to the wrong repo/SHA, missing protected paths, missing executable bits, or has broken provider symlinks.
- [ ] Keep the Mifune-hosted eval runner path valid and also run `bash .mifune/skills/eval/run.sh --probe <new-or-updated-mifune-probe>` after `.oh/scripts/ensure-mifune.sh --init` succeeds.
- [ ] Update `context/REPO_MAP.md` to route Mifune source-of-truth questions to `ryaneggz/mifune` while still explaining the local mount path `.mifune/`.
- [ ] Update `AGENTS.md` and relevant skill docs only enough to keep the core workflow accurate; do not rewrite individual skill behavior.
- [ ] Add or update source-backed docs/wiki material explaining the external Mifune boundary, stable `.mifune/` mount path, provider symlink relationship, and DeepWiki comparison in the Wiki Alignment section.
- [ ] If any US-004 docs/wiki/skill reference edits touch `.mifune/**`, make those edits in `ryaneggz/mifune`, commit and push a final Mifune SHA, update the Open Harness `.mifune` pin to that final SHA, and record it in `tasks/mifune-repo-extraction/progress.txt` and the PR body before validation.
- [ ] Add maintainer workflow docs for future Mifune edits: change Mifune in `ryaneggz/mifune`, merge/push there first, then open an Open Harness pin-bump PR that runs the Mifune checkout probe and provider symlink checks.
- [ ] Add a `CHANGELOG.md` entry under `## [Unreleased]` because the extraction changes fresh-clone/setup behavior.

### US-005: Verify end-to-end provider and workflow compatibility

**Description:** As the orchestrator, I want the extracted Mifune setup to pass the same green path as the vendored setup so the v1 core split does not regress normal operation.

**Acceptance Criteria:**

- [ ] From a clean Open Harness checkout with `.oh/scripts/ensure-mifune.sh --init` run, provider symlinks resolve and `ls .pi/skills/git/SKILL.md .claude/skills/spec/SKILL.md .codex/skills/git/SKILL.md` succeeds.
- [ ] Verify Hermes compatibility when `INSTALL_HERMES=true`: sandbox boot or an entrypoint-level check creates `.hermes/skills/openharness -> ../../.mifune/skills`, and `test -f .hermes/skills/openharness/git/SKILL.md` succeeds after Mifune init.
- [ ] `bash .mifune/skills/eval/run.sh --probe skill-paths` and `bash .mifune/skills/eval/run.sh --probe spec-family-contract` pass.
- [ ] `bash .mifune/skills/eval/run.sh` completes without a Mifune-path regression.
- [ ] Existing cron preflight paths for autopilot and prompt-miner resolve to executable/readable files under `.mifune/skills/...` after initialization.
- [ ] Open Harness PR checks are green before the PR is marked ready.

## 4. Functional Requirements

- **FR-1:** Open Harness must keep `.mifune/` as the local runtime path for the primitive pack even after extraction.
- **FR-2:** Provider symlinks must remain valid from a clean checkout after `bash .oh/scripts/ensure-mifune.sh --init`.
- **FR-3:** The Mifune revision consumed by Open Harness must be pinned and reviewable in git history.
- **FR-4:** Setup and CI must fail early with clear instructions if Mifune is missing or uninitialized.
- **FR-5:** The extraction must preserve executable bits for hook and cap scripts.
- **FR-6:** The implementation must add a root-owned regression guard for missing/broken Mifune checkout or symlink drift so the oracle still runs when `.mifune/` itself is missing.
- **FR-7:** Protected `.mifune/...` paths listed in `.claude/protected-paths.txt` must remain reachable at the same repo-relative runtime paths after initialization.
- **FR-8:** Open Harness documentation and bootstrap output must clearly show how Mifune is added: pinned `.mifune/` reference plus `bash .oh/scripts/ensure-mifune.sh --init`, followed by provider symlink validation.

## 5. Non-Goals (Out of Scope)

- Redesigning or rewriting individual Mifune skills, agents, hooks, or wiki entries.
- Removing Claude, Codex, Pi, or Hermes provider support.
- Changing the canonical spec/autopilot workflow.
- Replacing the public `mifunedev/skills` registry workflow tracked by `.mifune/skills.lock`.
- Adding automatic Dependabot/release automation for Mifune pin bumps in v1; updates are manual and pinned.
- Auto-merging downstream PRs or force-pushing unrelated branches.
- Switching the destination repository away from `ryaneggz/mifune` without an explicit operator decision.
- Consolidating `.pi/` and `.mifune/` into a single `.pi`-mounted Mifune submodule; that is a v2 follow-up requiring a separate spec, runtime-state split, and protected-path alias proof.

## 6. Design Considerations

Use a Git submodule/gitlink for `.mifune/` because it preserves the local path and existing provider symlink targets while making the external boundary explicit, pinned, and compatible with `git clone --recurse-submodules`. A non-submodule bootstrap manifest is out of scope for v1.

**Scope lock:** If implementation pressure suggests moving the mount from `.mifune/` to `.pi/`, stop and open a v2 planning pass instead of broadening this PR. The v1 acceptance criteria, CI probes, docs, and PR body must continue to describe `.mifune/` as the real submodule mount.

The safe migration sequence is: record current `ryaneggz/mifune` default HEAD → stage extracted Mifune on a replacement branch → merge/overwrite the repo default through a PR unless direct overwrite is explicitly documented → record final `ryaneggz/mifune` SHA → add root initializer/checker → add CI/probe/docs changes → replace vendored tree with pinned external checkout → run clean-clone/provider/Hermes/eval validation → only then mark the PR ready.

## 7. Technical Considerations

- Current symlink topology: `.pi/skills`, `.claude/skills`, and `.codex/skills` point to `../.mifune/skills`; `.claude/agents` and `.claude/hooks` point to `../.mifune/agents` and `../.mifune/hooks`; Codex agents chain through `.claude/agents`; Hermes creates `.hermes/skills/openharness -> ../../.mifune/skills` when enabled.
- Critical consumers include `AGENTS.md`, cron preflight files, CI eval runner invocations, Tier-A eval probes, provider settings/hooks, `.hermes/README.md`, and protected paths in `.claude/protected-paths.txt`.
- GitHub Actions checkout needs `submodules: true` or an explicit initializer before running commands that read `.mifune`.
- The external repo must be public and accessible to CI and fresh clones without private credentials.
- Because the eval runner lives under `.mifune/`, at least one root-level smoke check must validate/initialize `.mifune/` before invoking the Mifune-hosted runner.

## 8. Success Metrics

- Open Harness core repository no longer tracks bulk `.mifune/**` file contents, only a pinned external reference and provider symlinks/configuration.
- Fresh clone setup documents one clear command to initialize or repair Mifune.
- Operators can answer “how does Mifune get added to Open Harness?” from README/docs without inspecting scripts.
- CI catches a missing or broken Mifune checkout before provider skills are used.
- Every protected `.mifune/...` path remains reachable at the same repo-relative runtime path after initialization.
- Core PR checks remain green after extraction.

## 9. Resolved Questions

- **Destination repo:** `ryaneggz/mifune` for v1; intentionally replace its current default-branch contents with the extracted Open Harness Mifune pack, preferably through a feature branch and PR into that repo. Stop and ask if unavailable.
- **History shape:** a clean checkpoint commit is sufficient for v1 unless the operator explicitly requests filter-repo history preservation.
- **Pin updates:** manual/pinned Open Harness PRs only for v1; no automatic Dependabot/release pin-bump automation in this task.
- **`.pi` consolidation:** Deferred to v2. This PR keeps `.mifune/` as the mandatory submodule mount and does not move Mifune ownership to `.pi/`.

## Wiki Alignment

**Impact:** REQUIRED

**Local entries:** No dedicated curated wiki entry for Mifune extraction exists today. The implementation should add or update a source-backed wiki/docs entry if the wiki corpus remains part of the Mifune pack, and should keep `.mifune/skills/wiki/references/schema.md` reachable through the local mount path.

**Spec alignment:** The spec treats Mifune as an external repository mounted at `.mifune/` inside Open Harness. Runtime paths stay stable; ownership and update workflow change. Protected `.mifune/...` paths are continuity requirements, not removable implementation details.

**DeepWiki comparison:** The public DeepWiki page `https://deepwiki.com/mifunedev/openharness/4-skills-system` currently describes the Skills System primarily through provider-facing `.claude/skills/` paths while listing `.mifune/README.md` and `.mifune/skills.lock` as relevant source files. This extraction must preserve the provider-facing `.claude/skills` behavior DeepWiki describes, while updating local docs/wiki to clarify that `.mifune/` is now an external primitive pack mounted into the core checkout.

**Wiki acceptance criteria:** US-004 must include a source-backed wiki/docs update that explains the external Mifune boundary, the stable `.mifune/` mount path, the provider symlink relationship, the protected-path continuity contract, the Mifune ingress/addition flow, and the future Mifune edit/pin-bump workflow.
