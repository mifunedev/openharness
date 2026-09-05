# PRD: Hermes child-container layout

## Introduction

Reproduce and correct Hermes runtime-home and shared-skill integration after supported installation. The operator approved `.claude/plans/hermes-child-container-layout.md` through `/spec`.

Issue: #969. Repository: `mifunedev/openharness`. Remote: `origin`. Base: `development`.

## Goals

- Capture the failure before changing behavior.
- Keep the program in `~/.local/lib/hermes-agent` and runtime state in `~/harness/.hermes`.
- Discover shared and native skills together immediately after installation.
- Preserve credentials, user skills, and canonical content.
- Produce measured evidence and a reviewed PR; never merge automatically.

## Execution amendment

The operator explicitly authorizes `docker run` from latest, with no host bind mounts, and copy-in of fixes from this harness. This replaces the plan's host-only provisioning requirement for the disposable experiment only. Product lifecycle guards remain unchanged.

Use fresh Docker-managed volumes, no socket, no inherited credentials, and no published ports. Use copied-checkout fixtures instead of host binds. Disclose real host-bind coverage as unverified. Retain exact named test resources until teardown consent.

Latest currently reports Open Harness 0.7.0 and boots through its normal entrypoint with sleep as PID 1. This is not current-source systemd evidence. Record both source and image identities.

## User Stories

### US-001: Capture latest-image failure

As an operator, I want exact baseline evidence before correction.

- Record immutable image digest, installed Hermes revision, installer checksum, UID, cwd, selected home variables, and executable path.
- Prove absence of host binds, socket, credentials, and published ports.
- Run `oh harness install hermes` as sandbox; observe actual home and actual upstream skill listing/read behavior before manual repair or restart.
- If baseline passes, stop and request missing reproduction details rather than invent a fix.
- Tests pass. Typecheck passes.

### US-002: Establish a consistent home

As an operator, I want one default home for config and shared skills.

- Preserve program installation under `~/.local/lib/hermes-agent`.
- Set project-local `HERMES_HOME` in image environment and before the managed installer runs, without adding Compose or install configuration keys.
- Verify direct launches and fresh shells; add shell reconciliation only when a failing test requires it.
- Preserve explicit overrides or report a managed-home conflict before mutation.
- Tests pass. Typecheck passes.

### US-003: Reconcile additive skills safely

As an operator, I want canonical skills alongside native skills without data loss.

- Keep one additive `skills/openharness` link to `.oh/skills`; never replace the whole skills directory.
- Reuse the canonical provider linker and retire duplicate bootstrap linking.
- Provide a Hermes-only operation that needs no Claude scaffold and anchors to the selected project rather than unrelated cwd.
- Preserve foreign symlinks, files, and directories; reject parent-link escape. Correct links are no-ops; normalize recognized legacy links only after proving target identity.
- Verify actual upstream discovery, duplicate behavior, native creation, and unchanged canonical content.
- Tests pass. Typecheck passes.

### US-004: Verify install postconditions

As an operator, I want success only after integration succeeds.

- Reconcile on fresh and already-installed paths through the existing execution target.
- Verify the executable after installation and propagate integration failures.
- Cover fresh, repeated, failed, conflicting, and non-Hermes operations in CLI tests.
- Tests pass. Typecheck passes.

### US-005: Exercise runtime and persistence

As an operator, I want state and discovery to survive fresh launches and restart.

- Copy candidate artifacts only into disposable test containers and record their identities.
- Actual Hermes loader lists and reads shared and native fixtures; native creation leaves canonical hashes unchanged.
- Fresh interactive/noninteractive launches and restart preserve synthetic config/auth/skill sentinels.
- Verify same-filesystem atomic auth replacement with synthetic files, not live credentials.
- Exercise image-seeded, copied-checkout, and payload-only contexts without host binds. Record actual mount coverage limits.
- Tests pass. Typecheck passes.

### US-006: Add repeatable regression coverage

As a maintainer, I want automation to detect the original defect.

- Add focused integration assertions and safety tests; reuse the same scenario in relevant CI.
- Baseline or fault injection fails the new assertion and candidate passes.
- Run relevant build, typecheck, tests, provider probes, and CI. Missing infrastructure is blocked, not PASS.
- Do not replace normal boot evidence with a sleep-entrypoint override; distinguish the old image's native topology.
- Tests pass. Typecheck passes.

### US-007: Align documentation and knowledge

As an operator, I want onboarding to match measured behavior.

- Correct `docs/harnesses/hermes.md`, `.hermes/README.md`, and canonical Hermes reference pages; add a linked changelog entry.
- Derive actual knowledge impact from the diff. Update/reverify affected pages or record NOT-AFFECTED with source-backed reasons.
- Use source-backed page structure, advance `verified_at` for reread repo pages, regenerate the index, and pass `wiki-readme-index.sh`.
- Record the matching public-doc artifact in `mifunedev/openharness-web` when needed; do not claim unverified publication.
- Tests pass. Typecheck passes.

### US-008: Review evidence and finalize

As an operator, I want a PR whose readiness describes measured results.

- Map D1–D11 to commands, exit codes, artifact identities, and observations.
- Evidence answers benefit, requested behavior, built behavior, divergence, and unverified gates.
- Pass independent read-only implementation review, eval delta, knowledge gate, benchmark, and exact-head PR audit before undrafting.
- Keep the PR draft when any required gate remains unresolved. Never merge or perform unapproved teardown.
- Tests pass. Typecheck passes.

## Functional Requirements

- FR-1: Separate the program installation from config, state, auth, and skills.
- FR-2: Make the project-local default independent of cwd and shell startup.
- FR-3: Reconcile additive integration on fresh and repeated installation without overwriting user paths.
- FR-4: Verify real upstream discovery and persistence, not only a symlink or version command.

## Non-Goals

No model calls, live auth, gateway/dashboard activation, nested Docker daemon, host mounts, socket mounts, parent-runtime mutation, broad state migration, copied skill pack, new provider framework, or persistent advisor process. Keep auth local; do not restore cross-device auth symlinks.

## Architecture and affected surfaces

Restore the existing documented contract. The active owner implements coupled changes; bounded advisors are read-only. Disjoint writers require isolated worktrees. If upstream cannot discover additive links, obtain approval before changing the storage contract.

All nine surfaces apply: host/sandbox isolation, lifecycle door, canonical/provider ownership, root/scaffold behavior, interactive/headless launches, local/remote operation, parallel isolation, public docs, and verification. The explicit docker-run amendment governs test provisioning only.

## Definition of Done

- D1: Actual baseline failure with source, image, installer and upstream identities.
- D2: Supported installation succeeds as sandbox in the disposable container.
- D3: Intended config/state/skill paths across cwd and shell modes; no new runtime state at `/.hermes`, `/root/.hermes`, or unintended `~/.hermes`.
- D4: Real Hermes discovery lists and reads both shared and native fixtures.
- D5: Repeat operations, conflicts and native creation preserve user state and canonical hashes.
- D6: Fresh processes and restart preserve behavior; current headless contracts have evidence.
- D7: Image-only and copied-checkout/payload contexts pass. Actual host-bind coverage remains explicitly unverified under the operator's prohibition.
- D8: No live homes, credentials, registry or workspace sharing; other providers remain valid; teardown requires consent.
- D9: New assertions detect the baseline or injected defect and pass on the candidate.
- D10: Tests, probes, builds, CI and applicable documentation evidence complete.
- D11: Independent reviewer finds no unresolved required failure in D1–D10.

## Advisor strategy

Use the three completed read-only architecture reports as research. Keep integration changes with the active owner. Delegate only bounded disjoint work in isolated worktrees. Run an independent read-only evidence review and return failures to the same owner. No recursive delegation or additional executor.

## Knowledge Context

- **Base commit**: `372581cd96ba2931b8328cff59cbdeeae9a9043f`
- **Queries**: `hermes provider container`; repeat with `--patterns` (five entity matches, three read; one pattern match, read).
- **Knowledge used**: `[[compose-env-boundary]]`, `[[fresh-machine-setup]]`, `[[oh-cli-portable-lifecycle]]`, `[[pattern-cli-bundled-asset-relative-import]]`.
- **Grounded against**: `AGENTS.md`, `.oh/cli/src/commands/harness.ts`, `.oh/cli/src/lib/harnesses/catalog.ts`, `.oh/cli/src/lib/execution/detect.ts`, `.oh/cli/src/commands/lifecycle.ts`, `.oh/cli/src/lib/project.ts`, `.oh/scripts/link-providers.sh`, `.devcontainer/entrypoint.sh`, `.devcontainer/docker-compose.image-only.yml` and the approved plan's previously inspected source list.
- **Conflicts discovered**: Docs claim a home export missing from sources; current installer does not perform post-install verification. Latest image uses an older boot topology than current source. Fetched origin/development equals planning HEAD.

## Expected Knowledge Impact

- **Impact**: REQUIRED
- **Expected entries**: `compose-env-boundary`, `fresh-machine-setup`, `oh-cli-portable-lifecycle`.
- **Affected source paths**: Installer, Dockerfile/boot, provider linker, tests, and Hermes docs.
- **Reason**: The correction changes observable onboarding and provider integration. Derive the final union from the actual diff and dependency metadata.

## Plan Reconciliation

- **Source plan**: `.claude/plans/hermes-child-container-layout.md`, approved through `/spec`.
- **Intent preserved**: YES
- **Material deviations**: Operator explicitly approved direct docker run with no host binds; use copy-in fixtures and disclose mount coverage limits.
- **Constraints discovered during grounding**: Latest 0.7.0 is not the current-source systemd image. No current-source boot claim follows from the latest baseline.
