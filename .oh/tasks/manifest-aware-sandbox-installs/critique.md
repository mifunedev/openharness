# Critique — manifest-aware-sandbox-installs

Generated 2026-07-01; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

CRITIC_A — IMPLEMENTER LENS
[SEVERITY: H] [STORY: US-001] [PROTECTED-PATH] PRD requires editing protected boot entrypoint without an override note | [EVIDENCE: /home/sandbox/harness/.claude/protected-paths.txt lists `.devcontainer/entrypoint.sh`; /home/sandbox/harness/.oh/tasks/manifest-aware-sandbox-installs/prd.md US-001 AC targets `.devcontainer/entrypoint.sh`] | Add an explicit protected-path override note explaining why this boot-path edit is required, with a no-delete/no-rename constraint.

[SEVERITY: H] [STORY: US-001] Marker-missing reinstall conflicts with existing sandbox boot CI preseed fast path | [EVIDENCE: /home/sandbox/harness/.github/workflows/sandbox-boot-guard.yml:85-95 says CI pre-seeds `node_modules` so the entrypoint `[ -d node_modules ]` guard skips install; PRD AC says marker missing must run `pnpm install --prefer-offline`] | Add a story/AC to update the boot-guard preseed path to create the same marker, or explicitly accept and budget the CI boot-time reinstall.

[SEVERITY: M] [STORY: US-001] Workspace manifest discovery is underspecified and may include non-root package-local manifests | [EVIDENCE: /home/sandbox/harness/.oh/tasks/manifest-aware-sandbox-installs/prd.md FR-3 says “workspace package manifests discovered from tracked files when possible”; /home/sandbox/harness/.oh/cli/package.json exists but PRD Non-Goals say not to change `.oh/cli` package-local `npm ci` behavior] | Define discovery as pnpm-workspace-pattern-based only; explicitly exclude `.oh/cli/package.json` unless it becomes a pnpm workspace package.

[SEVERITY: M] [STORY: US-001] Fingerprint determinism is not directly verifiable | [EVIDENCE: US-001 AC: “computes a deterministic root install fingerprint” from listed files] | Specify exact algorithm: file set, sort order, path normalization, content hashing, absent-file handling, and hash command.

[SEVERITY: M] [STORY: US-003] Wiki entry may be created but remain untracked, making README/index checks misleading | [EVIDENCE: /home/sandbox/harness/.oh/skills/wiki/SKILL.md says corpus entries are gitignored by default and must be force-added; /home/sandbox/harness/.oh/evals/probes/wiki-readme-index.sh indexes only git-tracked entries; PRD US-003 lacks a tracking AC] | Add AC requiring `git ls-files --error-unmatch .oh/skills/wiki/corpus/sandbox-dependency-installs.md` and README index inclusion for that slug.

[SEVERITY: L] [STORY: US-002] Test AC hard-codes implementation shape without naming the helper contract | [EVIDENCE: US-002 AC: test asserts “manifest fingerprint helper” is present] | Either name the helper function/API in US-001 or make tests assert behavior/observable shell branches instead of an undefined helper presence.

## Critic B — User lens

CRITIC_B — USER LENS
[SEVERITY: H] [STORY: US-001] [FINDING] [PROTECTED-PATH] PRD proposes modifying `.devcontainer/entrypoint.sh`, a protected path, without an override/safety note. | [EVIDENCE: `.claude/protected-paths.txt`; PRD US-001 and Technical Considerations] | Add explicit protected-path override note limiting the change to the pnpm install gate, requiring rollback plan and no deletion/deprecation.

[SEVERITY: M] [STORY: US-001] [FINDING] “Manifest-aware” may not match user expectations: `.npmrc`, pnpm config files, patch directories, and install-affecting env/config are not addressed or explicitly excluded. | [EVIDENCE: PRD Introduction, FR-2/FR-3, Non-Goals] | Either include all install inputs in the fingerprint or add a clear Non-Goal explaining which install-affecting files are intentionally ignored.

[SEVERITY: M] [STORY: US-001] [FINDING] Rollback/escape hatch is incomplete for a boot-path change: `SKIP_PNPM_INSTALL=1` bypasses installs entirely but there is no documented way to reset or invalidate a bad marker without deleting `node_modules`. | [EVIDENCE: US-001 Acceptance Criteria; Non-Goals “Do not delete or prune `node_modules` automatically”] | Document safe manual rollback: remove only the marker file, set skip env, or run manual `pnpm install`, without deleting `node_modules`.

[SEVERITY: M] [STORY: US-003] [FINDING] Wiki alignment is directionally good but still risks becoming a loose note because the PRD does not require line-cited claims after implementation. | [EVIDENCE: Wiki Alignment says “line-cited claims where practical”] | Make line citations mandatory for source-backed behavior in `.devcontainer/entrypoint.sh`, test file, and eval probe.

## Synthesis

- **High-severity findings**: 3 raw; all mitigated in revised `prd.md` by adding an explicit protected-path override/no-delete constraint, preserving the `SKIP_PNPM_INSTALL=1` CI boot-guard preseed path, and documenting rollback.
- **Medium-severity findings**: 6 raw; mitigated by specifying the fingerprint algorithm, narrowing workspace manifest discovery to pnpm workspace package manifests, excluding unhandled install-affecting config from v1, requiring tracked wiki corpus entry, and requiring line-cited wiki claims.
- **Low-severity findings**: 1 raw; mitigated by naming the `pnpm_manifest_fingerprint` helper contract.
- **Recommendation**: PROCEED
