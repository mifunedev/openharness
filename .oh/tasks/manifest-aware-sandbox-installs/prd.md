# PRD: Manifest-Aware Sandbox Installs

## Introduction

Fix issue #521 by making devcontainer root dependency installation sensitive to package manifest drift instead of only checking whether `node_modules` exists. The sandbox should keep the fast boot path when dependency inputs are unchanged and automatically reinstall when `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, or declared pnpm workspace package manifests change.

**Protected-path override:** `.devcontainer/entrypoint.sh` is listed in `.claude/protected-paths.txt`; this task is explicitly authorized to edit only the root pnpm install gate in that file. The task must not delete, rename, deprecate, or relocate the entrypoint. Rollback is to restore the previous pnpm install block or set `SKIP_PNPM_INSTALL=1` while diagnosing.

## Goals

- Preserve fast sandbox boot when the installed dependency tree matches current manifests.
- Detect root install drift caused by changed dependency manifests or lockfiles.
- Reinstall deterministically when the install marker is absent or stale.
- Keep `SKIP_PNPM_INSTALL=1` and install failure behavior unchanged.
- Guard the behavior with tests and a Tier-A probe so future edits cannot regress to an existence-only check.

## User Stories

### US-001: Add manifest-aware pnpm install gate

**Description:** As a sandbox operator, I want the entrypoint to detect dependency manifest drift so a long-lived `node_modules` directory cannot hide stale JavaScript dependencies.

**Acceptance Criteria:**

- [ ] `.devcontainer/entrypoint.sh` computes a deterministic root install fingerprint from `$HARNESS/package.json`, `$HARNESS/pnpm-lock.yaml`, `$HARNESS/pnpm-workspace.yaml`, and `package.json` files that are declared as pnpm workspace packages when present.
- [ ] Fingerprinting uses normalized relative paths sorted bytewise, hashes file contents with `sha256sum`, treats absent optional files as absent (not empty), and hashes the ordered `path + content hash` manifest list into one final digest.
- [ ] Manifest discovery excludes dependency/runtime/vendor directories including `node_modules`, `.git`, `.worktrees`, `.pi/npm/node_modules`, `.oh/cli/node_modules`, and `.hermes/lsp/node_modules`; `.oh/cli/package.json` is excluded unless it becomes a pnpm workspace package.
- [ ] The marker is stored under `$HARNESS/node_modules/` with an Open Harness-specific filename so it is coupled to the installed dependency tree.
- [ ] Boot still runs `pnpm install --prefer-offline` when `node_modules` is missing.
- [ ] Boot runs `pnpm install --prefer-offline` when the marker is missing or differs from the current fingerprint, and logs `manifest drift detected; reinstalling`.
- [ ] Boot skips install when `node_modules` exists and the marker matches, and logs `dependencies current`.
- [ ] A successful install atomically refreshes the marker; a failed install still aborts sandbox boot with the existing `/tmp/pnpm-install.log` diagnostic.
- [ ] The `.github/workflows/sandbox-boot-guard.yml` preseed path remains safe because it explicitly sets `SKIP_PNPM_INSTALL=1`; update stale comments/tests if they still describe an existence-only guard as the CI contract.
- [ ] `SKIP_PNPM_INSTALL=1` still bypasses this root install block.
- [ ] Typecheck passes.
- [ ] Tests pass.

### US-002: Guard the entrypoint contract with tests and probes

**Description:** As a harness maintainer, I want automated guards for the pnpm install drift behavior so future boot-path edits do not silently return to a `node_modules` existence-only fast path.

**Acceptance Criteria:**

- [ ] `.oh/scripts/__tests__/entrypoint-pnpm-install.test.ts` asserts the named marker filename, the `pnpm_manifest_fingerprint` contract, drift reinstall branch, current-dependencies skip branch, and atomic marker refresh are present.
- [ ] The tests assert the previous install-failure boot abort behavior remains intact.
- [ ] Add `.oh/evals/probes/entrypoint-pnpm-manifest-fingerprint.sh` or equivalent Tier-A probe that checks the same boot-path contract from the eval suite.
- [ ] The new probe is discoverable by `bash .oh/skills/eval/run.sh --probe entrypoint-pnpm-manifest-fingerprint`.
- [ ] The targeted Vitest file passes.
- [ ] The new eval probe passes.

### US-003: Document the boot behavior and release note

**Description:** As a future maintainer or agent, I want the manifest-aware install behavior documented in the codebase so I can understand why the marker exists and when reinstall happens.

**Acceptance Criteria:**

- [ ] `CHANGELOG.md` adds a `### Fixed` entry for issue #521 under `[Unreleased]`.
- [ ] Create or update `.oh/skills/wiki/corpus/sandbox-dependency-installs.md` with the final behavior, relevant source files, system relationship flow, and See Also links.
- [ ] The wiki entry includes line-cited claims for `.devcontainer/entrypoint.sh`, `.oh/scripts/__tests__/entrypoint-pnpm-install.test.ts`, and the new eval probe.
- [ ] The wiki entry cites the local source files and preserves this PRD’s non-goals: no global package install changes, no deletion of `node_modules`, no changes to optional agent-browser install, no package-manager migration.
- [ ] The wiki entry is force-added/tracked (`git ls-files --error-unmatch .oh/skills/wiki/corpus/sandbox-dependency-installs.md` succeeds after staging) because wiki corpus entries are gitignored by default.
- [ ] Refresh `.oh/skills/wiki/corpus/README.md` so the new wiki entry is indexed.
- [ ] `bash .oh/evals/probes/wiki-readme-index.sh` passes.
- [ ] Typecheck passes.
- [ ] Tests pass.

## Functional Requirements

- FR-1: The entrypoint must derive a stable fingerprint from root pnpm install inputs before deciding whether to skip installation.
- FR-2: The fingerprint must include existing root files `package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml`.
- FR-3: The fingerprint must include existing package manifests only when they are part of pnpm workspace packages declared by `pnpm-workspace.yaml`; package-local manifests outside the pnpm workspace (such as `.oh/cli/package.json` today) are excluded.
- FR-4: The fingerprint must exclude dependency outputs and runtime/vendor directories so generated `node_modules` content does not affect the decision.
- FR-5: The install block must distinguish three boot log states: missing `node_modules`, manifest drift, and dependencies current.
- FR-6: The install block must refresh the marker only after `pnpm install --prefer-offline` succeeds.
- FR-7: Marker refresh must be atomic within the `node_modules` directory.
- FR-8: The existing `SKIP_PNPM_INSTALL=1` opt-out must remain effective.
- FR-9: The existing boot-abort behavior on failed required pnpm install must remain effective.
- FR-10: Tests and an eval probe must assert the drift gate contract.

## Non-Goals

- Do not change the package manager or pnpm install command.
- Do not delete or prune `node_modules` automatically.
- Do not alter optional global installs such as agent-browser.
- Do not change `.oh/cli` package-local `npm ci` behavior.
- Do not add network-dependent verification beyond the existing install command.
- Do not modify sandbox application code or agent-owned workspace files.
- Do not include `.npmrc`, pnpm config files beyond `pnpm-workspace.yaml`, patch directories, or install-affecting environment variables in this v1 fingerprint; future issues may expand the manifest input set.

## Technical Considerations

- The implementation surface is `.devcontainer/entrypoint.sh`, especially the root pnpm install block currently guarded by `[ ! -d "$HARNESS/node_modules" ]`.
- The existing test surface is `.oh/scripts/__tests__/entrypoint-pnpm-install.test.ts`.
- The eval suite discovers probes under `.oh/evals/probes/*.sh`; probe naming should match the `--probe` basename.
- Prefer deriving workspace package manifests from `pnpm-workspace.yaml` package globs. Root `pnpm-workspace.yaml` currently declares `packages: []`, so the v1 implementation should include root manifest files and be future-safe without accidentally fingerprinting `.oh/cli/package.json`.
- `git ls-files` may still be useful for fallback filtering when git metadata is available; a `find` fallback keeps boot usable when git metadata is unavailable.
- Marker writes can use a temp file in `node_modules` followed by `mv -f`.

## Success Metrics

- A sandbox with unchanged manifests logs `dependencies current` and skips root install.
- A sandbox with changed manifest inputs logs `manifest drift detected; reinstalling`, runs pnpm install, and refreshes the marker.
- A maintainer can safely invalidate the fast path by removing only the marker file, or can bypass the root install with `SKIP_PNPM_INSTALL=1` while diagnosing boot issues.
- Targeted tests and eval probe pass locally.
- Existing install failure handling and skip opt-out are unchanged.

## Wiki Alignment

- **Impact**: REQUIRED
- **Local entries**: `.oh/skills/wiki/corpus/sandbox-dependency-installs.md` to create or update.
- **Spec alignment**: The wiki entry must explain the manifest-fingerprint marker, the three boot states, marker refresh semantics, the manual marker-removal rollback, and the non-goals listed above.
- **DeepWiki comparison**: No dedicated DeepWiki page for the pnpm boot install gate was available from local context; use the DeepWiki-style shape from `.oh/skills/wiki/references/schema.md`: relevant source files, mandatory line-cited claims for changed source/test/probe files, system relationships, and `## See Also`.
- **Acceptance criteria**: US-003 includes the wiki creation/update and README index freshness checks.

## Open Questions

- None for implementation. The issue body and `/imagine` sketch resolve the scope as a root pnpm install drift fix with inline behavior and wiki documentation.
