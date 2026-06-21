# Critique — compose-dry-run-env-files

Generated 2026-06-20; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

CRITIC_A — IMPLEMENTER LENS
[SEVERITY: M] [STORY: US-001] Read-like detection could become too broad if every `--print-argv` use is treated as non-lifecycle, including tests that want to inspect lifecycle argv. | [EVIDENCE: US-001 names `--print-argv`; existing tests use `--print-argv up -d --build`.] | Treat `--print-argv` as diagnostic by design and add a separate fake-docker lifecycle test for persistent behavior.
[SEVERITY: L] [STORY: US-001] Temporary env files can leak if the helper `exec`s docker. | [EVIDENCE: US-001 temporary env requirement.] | Avoid `exec` when the temp env path is used so shell traps can clean up.
[SEVERITY: L] [STORY: US-003] Wiki alignment could be overkill for a small helper change. | [EVIDENCE: Wiki Alignment requires a new page.] | Keep the entry short and source-backed.

## Critic B — User lens

CRITIC_B — USER LENS
[SEVERITY: M] [STORY: US-002] Users may reasonably expect `make sandbox` and other lifecycle flows to remain byte-compatible. | [EVIDENCE: Goal says preserve lifecycle commands.] | Explicitly test lifecycle path via a fake docker executable rather than relying on `--print-argv`.
[SEVERITY: L] [STORY: *] Non-goals should avoid changing harness.yaml schema. | [EVIDENCE: Non-Goals section.] | Already covered.

## Synthesis

- **High-severity findings**: 0
- **Medium-severity findings**: 2
- **Low-severity findings**: 3
- **Recommendation**: PROCEED

Medium findings are mitigated by keeping `--print-argv` diagnostic-only, adding fake-docker lifecycle coverage, and preserving the lifecycle persistent-env path.
