# Critique — context-fitness-evals

Generated 2026-06-10; reviews `prd.md` post-/prd, pre-/ralph. Two critics, distinct lenses, both cross-checked `.claude/protected-paths.txt`.

## Critic A — Implementer lens

CRITIC_A — IMPLEMENTER LENS

[SEVERITY: H] [US-006] /context-audit Tier-2 engine runs LLM probes (`claude -p` on markdown, scores text vs `markers:`) — fundamentally incompatible with exit-code shell probes; "reuse without forking" is unsatisfiable across two oracle types. | EVIDENCE: runner.sh `claude -p ... --output-format text` + extract_markers vs PRD FR-5 | RECOMMENDATION: define the reuse boundary concretely — shared piece is the file backup/restore/trap block, not the oracle.

[SEVERITY: H] [US-002] protected-paths entry format ambiguous (bare `eval` vs path); AGENTS.md-via-readlink edit target ambiguous. | EVIDENCE: protected-paths bare names vs FR-9 | RECOMMENDATION: AC must state add bare entry `eval` under Orchestrator skills block.

[SEVERITY: H] [US-006] Ablation race: if `/eval --ablate` runs inside a claude session that already loaded the target file, ablation is vacuous; semantics ambiguous if "reused" from claude -p runner. | EVIDENCE: SKILL.md "Do not apply Tier-2 to CLAUDE.md"; runner.sh claude -p | RECOMMENDATION: clarify ablation is shell-probe-only; NOT the claude -p runner.

[SEVERITY: M] [US-003] "degrades gracefully" exit code undefined; exit 0 on absent sandbox masks the regression. | RECOMMENDATION: exit 2 = SKIPPED, distinct from 0=pass / non-zero=regression; runner handles third state.

[SEVERITY: M] [US-001+US-002] RESULTS.md append-vs-overwrite policy unresolved (also Open Q §9); US-002 delta logic depends on it. | RECOMMENDATION: resolve in US-001 — overwrite current-status + git history as time series.

[SEVERITY: M] [US-007] cron runs `/eval` (a skill) — unclear if scripts/cron-runtime.ts supports skill delegation vs inline steps. | RECOMMENDATION: read cron-runtime.ts first; inline if delegation unsupported.

[SEVERITY: M] [US-004] No evidence a PreToolUse hook wiring convention exists; unwired hook does nothing. | RECOMMENDATION: specify registration mechanism; verify it exists.

[SEVERITY: M] [US-008] /retro triage + probe-proposal + recurrence-check + loop-preservation = 4 non-trivial changes in one story; no atomic unit. | RECOMMENDATION: split; ship triage tag alone in v1.

[SEVERITY: M] [US-006] "clean git status" not mechanically checkable; conflates no-tracked-mutation with no-side-effects. | RECOMMENDATION: assert `git diff --exit-code HEAD`.

[SEVERITY: L] [US-001] header-extraction grep contract undefined. | RECOMMENDATION: define exact grep pattern in US-001, cross-ref in US-002.

[SEVERITY: L] [US-007] crons/README.md exists; "or equivalent" escape hatch is vague. | RECOMMENDATION: hard-require a README row.

## Critic B — User lens

CRITIC_B — USER LENS

[SEVERITY: H] [US-002] First-run delta undefined — FR-3 mandates delta vs previous but no RESULTS.md on run #1. | RECOMMENDATION: AC — first run emits new-pass/new-fail, no REGRESSION without prior state.

[SEVERITY: H] [US-006] Restore guarantee weaker than it appears — `trap … EXIT` does not fire on kill -9/OOM; hard crash leaves tracked file mutated. | RECOMMENDATION: document signal boundary + manual `git restore` escape hatch.

[SEVERITY: H] [US-002] `/eval` added to protected-paths in the same change that creates it — self-referential gate, only closed after merge. | RECOMMENDATION: treat PRD as authorization to pre-register `eval` (+ RESULTS.md path).

[SEVERITY: M] [US-006] reuse boundary left as Open Question yet AC says "reuses, does NOT fork" — direct tension; implementer may quietly fork. | RECOMMENDATION: resolve before impl — extract shared ablate lib or define exact invocation.

[SEVERITY: M] [US-003] graceful-degrade exit code unspecified; exit 0 masks regression. | RECOMMENDATION: exit 2 = SKIPPED, rendered distinctly; forbid exit 0 on absent sandbox.

[SEVERITY: M] [US-007] log-only regression is buried in daily log — depends on operator reading it, the behavior it was meant to replace. | RECOMMENDATION: make log-only an explicit accepted Non-Goal, or add minimal escalation.

[SEVERITY: M] [US-005] /health-check modified but not in protected-paths — no gate against later removal. | RECOMMENDATION: add `health-check`, or rely on the doc-lint probe as guard.

[SEVERITY: M] [US-008] /retro modified but not in protected-paths — same gap. | RECOMMENDATION: add `retro`, or add a doc-lint probe as guard.

[SEVERITY: M] [*] No probe timeout / hung-probe policy; an unattended weekly probe can block the cron indefinitely. | RECOMMENDATION: hard timeout; /eval kills + marks TIMEOUT.

[SEVERITY: L] [US-001] RESULTS.md append-vs-overwrite unresolved; `last-run` column implies overwrite, "benchmark over time" implies append. | RECOMMENDATION: overwrite current-state row, git history as time series.

[SEVERITY: L] [*] `.claude/ICP.md` not found at the listed path — protected-paths references a phantom file. | RECOMMENDATION: verify; if missing, file as a separate issue.

## Synthesis

- **High-severity findings**: 6 (A: 3, B: 3)
- **Medium-severity findings**: 11
- **Low-severity findings**: 4
- **`[PROTECTED-PATH]` violations**: 0
- **Recommendation**: **PROCEED** — all High findings are AC-tightening with no protected-path violations or orchestrator-boundary crossings, mitigated in-place per the MEMORY.md 2026-05-24 pattern. Mitigations bound in `prd.md` §10.

### Each High finding → mitigation (§10)

| # | High finding | Mitigation |
|---|---|---|
| A-H1 | ablation "reuse engine" unsatisfiable (LLM oracle vs shell exit) | M-1: reuse only the swap/restore/trap mechanics into shared `scripts/ablate.sh`; oracle is the shell exit code |
| A-H2 | protected-paths entry format ambiguous | M-3: add bare entry `eval` (+ `health-check`, `retro`) |
| A-H3 | ablation may be vacuous if reusing claude -p runner | M-1: ablation is shell-probe-only; NOT the claude -p runner |
| B-H1 | first-run delta undefined | M-4: first run = new-pass/new-fail, no REGRESSION without prior state |
| B-H2 | trap doesn't fire on kill -9/OOM | M-2: orphaned-`.bak` recovery on startup + `git restore` escape hatch + `git diff --exit-code HEAD` |
| B-H3 | self-referential protected-paths gate | M-3: PRD authorizes pre-registration of `eval` |

### Verified factual claims (against the repo)

- A-H1/A-H3: confirmed — `/context-audit` Tier-2 uses `claude -p` (SKILL.md:236,263) and a reusable swap/restore trap (255-268).
- A-M (US-004): confirmed — `.claude/settings.json` wires `hooks.PreToolUse` (deny-env-dump/secret-paths/notify_slack), so the hook is implementable.
- B-L: confirmed — `.claude/ICP.md` is MISSING at root (only worktree copies); pre-existing protected-path integrity bug, filed separately, does not block.
