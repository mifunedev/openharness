# Critique — quote-compose-override-paths

Generated 2026-06-15; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

CRITIC_A — IMPLEMENTER LENS
[SEVERITY: M] [STORY: US-001] Shared helper interface is underspecified for both Make and Bash callers; “using arrays” conflicts with Makefile’s default `/bin/sh` recipe model unless the helper is an executable wrapper or Make switches shells explicitly. | [EVIDENCE: PRD US-001 AC “A harness script constructs Docker Compose arguments using arrays”; Makefile currently expands `$(COMPOSE)` directly] | Define the helper contract: executable command that emits/runs argv safely, or a Bash-only sourced helper with explicit Makefile shell strategy.

[SEVERITY: M] [STORY: US-004] Regression coverage may miss the actual vulnerable entrypoints; AC only says tests cover sources/order/metacharacters, not that `make sandbox`, `make config`, or `scripts/install.sh` are exercised or spy-verified. | [EVIDENCE: PRD US-004 AC; vulnerable code exists in Makefile `COMPOSE_OVERRIDES` and scripts/install.sh `COMPOSE_FILES`] | Require tests that invoke or statically verify each wired entrypoint uses the shared helper and never expands raw override strings.

[SEVERITY: M] [STORY: US-003] Installer path has a hidden working-directory/absolute-path dependency: current install builds `COMPOSE_FILES` relative to `$REPO_DIR` but invokes `docker compose` without `cd "$REPO_DIR"` in the cited block; helper ordering alone may not preserve behavior for paths containing spaces unless cwd and absolute/relative path semantics are specified. | [EVIDENCE: scripts/install.sh compose block uses `$REPO_DIR/harness.yaml` but `COMPOSE_FILES="-f .devcontainer/docker-compose.yml"` and `docker compose $COMPOSE_FILES ...`] | Specify whether helper normalizes to repo-root-relative or absolute paths and require installer to call it from a defined cwd.

[SEVERITY: M] [STORY: US-002] Destructive lifecycle behavior is only partially constrained; `make destroy` currently runs `down -v`, but AC only says lifecycle targets use the safe path and sandbox/shell behavior remains unchanged. | [EVIDENCE: Makefile `destroy: $(COMPOSE) down -v`; PRD US-002 AC omits destroy volume semantics] | Add explicit AC that command verbs and flags remain unchanged for each Make target, especially `destroy` retaining exactly `down -v` and no new destructive behavior.

[SEVERITY: L] [STORY: US-001] Env-file precedence is specified, but config.json override precedence is only in goals/helper ordering, not explicitly tested in US-004. | [EVIDENCE: PRD US-001 AC ordering; US-004 AC “Tests assert literal argument ordering”] | Require expected full argv sequence in tests: base, Hermes, harness.yaml overlays, config.json overlays, with env files `.env` then `.harness.yaml.env`.

[SEVERITY: L] [STORY: *] No protected-path deletion is proposed, but the PRD touches protected `Makefile` without an explicit “edit not deletion” mitigation. | [EVIDENCE: .claude/protected-paths.txt includes `Makefile`; PRD US-002 requires Make target changes] | Add a short implementation note: protected `Makefile` may be edited only by targeted diff; no deletion/rename/deprecation.

## Critic B — User lens

CRITIC_B — USER LENS
[SEVERITY: M] [STORY: US-001] [FINDING] Shared helper contract is underspecified: “constructs Docker Compose arguments using arrays” does not say whether callers execute through a wrapper, source a shell file, or consume printed args, leaving room to reintroduce unsafe eval/string expansion. | [EVIDENCE: PRD US-001 acceptance criteria] | [RECOMMENDATION] Define the helper interface explicitly and require tests that invoke it through each caller path without eval/raw string expansion.
[SEVERITY: M] [STORY: US-001] [FINDING] Relative override path behavior is not pinned. Centralizing compose args can silently change whether `harness.yaml` / `config.json` paths are resolved relative to repo root, config file location, or caller cwd. | [EVIDENCE: PRD Goals; US-001 acceptance criteria] | [RECOMMENDATION] Add acceptance criteria preserving current relative-path resolution for both override sources from Makefile and installer entrypoints.
[SEVERITY: M] [STORY: US-002] [FINDING] Rollback/escape hatch is absent for a change touching lifecycle commands; if the helper breaks, `make sandbox`, `destroy`, `stop`, `logs`, `ps`, `restart`, and `config` can all fail together. | [EVIDENCE: PRD US-002] | [RECOMMENDATION] Require a documented debug/fallback path, e.g. helper prints argv in dry-run mode and preserves a minimal direct compose invocation for recovery.
[SEVERITY: L] [STORY: US-003] [FINDING] Installer audience expectations are broader than startup success: first-run users need actionable diagnostics if an override path is invalid or quoted literally but Docker Compose rejects it. | [EVIDENCE: PRD US-003 acceptance criteria] | [RECOMMENDATION] Add acceptance criteria that installer failures include the offending compose file path and preserve existing first-run messaging.
[SEVERITY: L] [STORY: US-004] [FINDING] Regression coverage focuses on shell metacharacter non-interpretation but does not require tests proving protected lifecycle behavior stays unchanged for normal configs. | [EVIDENCE: PRD US-004 acceptance criteria; context/USER.md “Don’t add features beyond what was asked”] | [RECOMMENDATION] Add focused golden tests for default/no-override compose args and env-file ordering, avoiding broader refactors.

## Synthesis

- **High-severity findings**: 0
- **Medium-severity findings**: 7
- **Low-severity findings**: 3
- **Recommendation**: PROCEED with PRD mitigations: define the helper as an executable Bash wrapper, preserve repo-root-relative resolution, keep target verbs/flags unchanged, add debug argv output, include entrypoint/static wiring tests, and edit protected `Makefile` only by targeted diff with no deletion/rename.
