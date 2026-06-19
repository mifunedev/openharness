# Critique — docs-build-decoupling

Generated 2026-06-19; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

CRITIC_A — IMPLEMENTER LENS

[SEVERITY: M] [STORY: US-001] `@openharness/oh` is not currently in `pnpm-workspace.yaml`, so a pnpm workspace filter alone could fail or silently skip the intended non-docs build. | [EVIDENCE: `pnpm-workspace.yaml`; `packages/oh/package.json`; US-001 AC] | Mitigated in PRD: fast build must include future non-docs pnpm workspace packages except `@openharness/docs`, plus explicit `npm --prefix packages/oh run build` for the standalone package.

[SEVERITY: M] [STORY: US-001] `setup` wording could conflate the post-install build script with lifecycle hooks. | [EVIDENCE: root `setup`; `packages/oh` `prepare`] | Mitigated in PRD: setup must not run `@openharness/docs` / Docusaurus by default, while install lifecycle behavior is allowed.

[SEVERITY: M] [STORY: US-003] The probe semantics were vague; static grep checks can false-positive or false-negative unless the contract is explicit. | [EVIDENCE: US-003 AC; `.claude/skills/eval/run.sh`] | Mitigated in PRD: US-003 now names exact forbidden patterns and required positive checks.

[SEVERITY: M] [STORY: US-002] Release could accidentally call the newly-fast build command and lose docs coverage. | [EVIDENCE: `.github/workflows/release.yml` Build step; US-002 AC] | Mitigated in PRD: release validation must call `pnpm run build:all`.

[SEVERITY: L] [STORY: US-004] Wiki schema requires a `sources:` entry with raw provenance. | [EVIDENCE: `context/rules/wiki.md`; US-004 AC] | Mitigated in PRD: US-004 now requires `wiki/raw/<date>-ci-build-gates.md` provenance.

[SEVERITY: L] [STORY: US-004] `wiki/README.md` should be regenerated using the canonical deterministic behavior, not manually approximated. | [EVIDENCE: `context/rules/wiki.md` README index freshness] | Mitigated in PRD: US-004 requires canonical `/wiki-lint`-equivalent deterministic ordering.

[SEVERITY: L] [STORY: US-001] Root docs aliases were preserved, but package-local docs scripts were not explicitly protected. | [EVIDENCE: root `package.json`; `packages/docs/package.json`; US-001 AC] | Mitigated in PRD: US-001 requires `packages/docs` build/start/serve scripts remain intact.

## Critic B — User lens

CRITIC_B — USER LENS

[SEVERITY: M] [STORY: US-001] Fast build scope was under-specified for future non-doc packages and could hard-code today's package set. | [EVIDENCE: US-001 AC] | Mitigated in PRD: fast build is defined as all buildable pnpm workspace packages except `@openharness/docs`, plus the current npm-standalone `packages/oh` build.

[SEVERITY: M] [STORY: US-002] Full-build command name and migration points were ambiguous. | [EVIDENCE: Goals; US-001/US-002 AC] | Mitigated in PRD: full build is explicitly `pnpm run build:all`; release must call it.

[SEVERITY: M] [STORY: *] No rollback or escape hatch was specified if docs failures become invisible for non-doc PRs that still affect docs indirectly. | [EVIDENCE: Goals/Non-Goals] | Mitigated in PRD: US-002 documents `pnpm docs:build`, `pnpm build:all`, and the rollback path.

[SEVERITY: L] [STORY: US-003] Probe could become grep-based false confidence without precise forbidden commands/files. | [EVIDENCE: US-003 AC] | Mitigated in PRD: US-003 now names exact detection contract.

[SEVERITY: L] [STORY: US-004] Wiki usefulness needed an operator-facing quick reference. | [EVIDENCE: US-004 and Wiki Alignment] | Mitigated in PRD: US-004 requires a command/gate table.

## Synthesis

- **High-severity findings**: 0
- **Medium-severity findings**: 7, all mitigated in the PRD before issue/implementation.
- **Low-severity findings**: 5, all mitigated in the PRD before issue/implementation.
- **Recommendation**: PROCEED
