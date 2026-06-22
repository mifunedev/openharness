# Critique — installer-local-host-defaults

Generated 2026-06-16; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

CRITIC_A — IMPLEMENTER LENS
[SEVERITY: M] [STORY: US-002] Docs scope is under-specified; ACs update generated `.env` and `.example.env`, but existing user-facing docs still say `.devcontainer/.env` is secrets-only. | EVIDENCE: `tasks/installer-local-host-defaults/prd.md`; conflicting text at `README.md`, `docs/quickstart.md`, and installer completion text `scripts/install.sh`. | RECOMMENDATION: Add README, quickstart, and installer completion text to US-002 ACs, or explicitly state they are out of scope.

[SEVERITY: M] [STORY: US-001] Quote-safety AC only covers spaces, but `.devcontainer/.env` is both Docker Compose input and shell-sourced; git names can contain apostrophes, `$`, `#`, or backslashes. | EVIDENCE: `tasks/installer-local-host-defaults/prd.md`; `.devcontainer/.example.env` documents shell sourcing. | RECOMMENDATION: Require quote safety for apostrophes/shell metacharacters.

[SEVERITY: M] [STORY: US-003] Regression-test AC is vague enough to permit brittle source-text assertions instead of behavior; `install.sh` has no specified safe test mode despite requiring Docker and unconditionally starting Compose. | EVIDENCE: `tasks/installer-local-host-defaults/prd.md`; installer requires Docker and runs Compose. | RECOMMENDATION: Specify a config-only/dry-run path or a mocked-command fixture strategy.

## Critic B — User lens

CRITIC_B — USER LENS
[SEVERITY: H] [STORY: US-001] Existing `.devcontainer/.env` preservation is underspecified | PRD says generated `.env` will include host defaults and describes it as “local defaults + secrets,” but does not require preserving existing secrets/custom values during installer rewrites | Add acceptance criteria that installer updates/adds only managed host-default keys and never clobbers unrelated existing `.devcontainer/.env` entries.

[SEVERITY: M] [STORY: US-001] Re-run behavior is ambiguous | Summary says “first-install values,” but verification focuses on `install.sh`; users may rerun installer after edits, updates, or machine changes | Specify whether reruns should leave existing `.env` values untouched, refresh missing keys only, or prompt/overwrite, and test that behavior.

[SEVERITY: M] [STORY: *] Rollback/failure behavior for local env mutation is missing | The change moves mutation from tracked `harness.yaml` to local `.devcontainer/.env`, but PRD does not say what happens if install fails mid-write | Require atomic write/backup behavior or a clear rollback note so local secrets/defaults are not corrupted.

## Synthesis

- **High-severity findings**: 1, mitigated in PRD by requiring existing `.devcontainer/.env` preservation and in implementation by retaining the installer’s existing preserve-if-present branch.
- **Medium-severity findings**: 5, mitigated by expanding docs scope, generated-value quote-safety acceptance criteria, and regression-test acceptance criteria.
- **Recommendation**: PROCEED — no unmitigated high-severity findings remain.
