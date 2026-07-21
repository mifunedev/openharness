# Critique — cc-safety-net

Generated 2026-07-19; reviews `prd.md` post-/prd, pre-/ralph. Round 1.

## Critic A — Implementer lens

CRITIC_A — IMPLEMENTER LENS
[SEVERITY: H] [STORY: US-004] The PRD's core rationale ("RISKY_BASH is interactive-only/no-op headless, so retiring it loses nothing") is materially incomplete: the same top-of-handler `if (!ctx.hasUI) return;` gate in `path-guard.ts` also covers the `SENSITIVE_PATHS` write/edit branch that the "Fate-of-existing-hooks" table marks **KEEP** as "Pi's only secret-path write/edit guard." In headless/autonomous mode that guard is *already* a no-op today — proven by the extension's own test suite. | EVIDENCE: `.pi/extensions/path-guard.ts` single `if (!ctx.hasUI) return;`; `path-guard.test.ts:76-85` "does not call confirm for write on sensitive path in headless mode" | RECOMMENDATION: Correct the decision-table rationale — either scope a companion fix to make SENSITIVE_PATHS enforce headless, or explicitly document the gap in decision.md instead of implying parity is retained.

[SEVERITY: H] [STORY: US-005] Missing dependency: offline-safe fail-loud boot requires warming the npm cache (or vendoring) at **image build time**, but US-005's file list omits `.devcontainer/Dockerfile` — a protected path that must be named explicitly, not discovered mid-implementation. Existing global CLI installs (`pi-coding-agent`, `opencode-ai`) use `RUN npm install -g ...` in Dockerfile lines 90-166. | EVIDENCE: PRD US-005 ACs; `.claude/protected-paths.txt:50`; Dockerfile 90-166 | RECOMMENDATION: Add Dockerfile to US-005's owned files up front; follow the `RUN npm install -g` build-time pattern, not boot-time `npx -y`.

[SEVERITY: H] [STORY: US-005] Reintroduces the failure class fixed 4 days ago (issue #639 / commit 4979b846: retired npm endpoint crash-looped fresh sandbox boots). Boot-time `npx -y` + FR-4 fail-loud turns any npm-registry hiccup into a hard sandbox-boot failure. | EVIDENCE: CHANGELOG [2026.7.14]; PRD FR-4 | RECOMMENDATION: Pin exact version + integrity, install at image-build time; entrypoint check = local presence only, never re-hit the registry at boot.

[SEVERITY: M] [STORY: US-002..US-005] Every Wave-2 AC defers to "the US-001 decision" which doesn't exist yet — not verifiable as written. | RECOMMENDATION: Treat US-001 as a hard plan-amendment gate; rewrite US-002..US-005 ACs concretely after it lands.
[SEVERITY: M] [STORY: US-002,US-005] Disjoint file ownership prevents merge conflicts but not runtime dependency failures: US-002's "doctor passes" needs US-005's installed binary. | RECOMMENDATION: Make US-005 an explicit prerequisite wave, not co-equal parallel.
[SEVERITY: M] [STORY: US-005] `link-providers.sh` `required_execs` checks repo-relative tracked files only, not `$PATH` binaries — a new check-kind is unscoped new work. | RECOMMENDATION: Explicitly scope the new check type.
[SEVERITY: M] [STORY: US-004] AC factually wrong: `path-guard.property.test.ts` has zero RISKY_BASH cases (only `isSensitivePath`/`SENSITIVE_PATHS`). | RECOMMENDATION: Fix the AC.
[SEVERITY: M] [STORY: *] Codex parity overstated: codex wires only `deny-env-dump.sh` (ask→deny wrapper), not all 4 hooks. | RECOMMENDATION: State the real per-provider coverage matrix in PRD/decision.md.
[SEVERITY: M] [STORY: US-004] Scope creep: story bundles install+pin, RISKY_BASH removal, /guard text, and rewriting a 312-line shared-fixture test suite. | RECOMMENDATION: Split into US-004a (install) and US-004b (refactor + tests) or flag as 2 iterations.
[SEVERITY: L] [STORY: US-008] RISKY_BASH also `return`s on `ctx.mode === "tui"` — dead code in BOTH headless and TUI modes. | RECOMMENDATION: decision.md wording: "does not fire in headless or TUI mode today."
[SEVERITY: L] [STORY: US-006] FR-4 (always fail-loud at boot) vs probe SKIPPED state tension — SKIPPED could mask a regression when /eval runs outside full boot. | RECOMMENDATION: Define which circumstance legitimizes SKIPPED vs REGRESSION.
[SEVERITY: L] [STORY: *] FR-1/FR-2 behavioral claims (10-level recursion, fail-closed) are README-level, not source-verified. | RECOMMENDATION: US-001 spike must source-verify before Wave-2.
[PROTECTED-PATH CHECK] No deletions of protected paths proposed. Dockerfile touch (H #2) must be named explicitly given its protected status.

## Critic B — User lens

CRITIC_B — USER LENS
[SEVERITY: H] [STORY: *] [PROTECTED-PATH] No Non-Goal or FR addresses the harness's own destructive-git automation — `.oh/crons/cleanup-tasks.md` worktree/branch grooming, its probe, `/watchdog` stale-branch completion, and the canonical `reset|clean` runner step all legitimately run `git reset --hard`/`git clean -f`/`git worktree remove --force`/`git branch -D` — exactly the classes cc-safety-net blocks. | EVIDENCE: prd.md Non-Goals; CLAUDE.md § The Workflow; protected-paths.txt:54-55 | RECOMMENDATION: Enumerate every harness-internal destructive-git caller; decide allowlist/rulebook/WORKTREE-mode exceptions BEFORE wiring stories land; state the resolution as a Goal or Non-Goal.
[SEVERITY: H] [STORY: *] Missing rollback/escape hatch: no single-point disable for a false-positive storm or registry outage mid-session; disabling would require editing three provider configs plus the boot check. | RECOMMENDATION: Add a kill-switch story/FR (e.g. `CC_SAFETY_NET_DISABLE=1`) that boot validation explicitly honors, documented in US-007.
[SEVERITY: H] [STORY: *] Audience misalignment vs USER.md (solo operator): 8-story program with gating spike, decision table, parallel-worker ceremony. | RECOMMENDATION: Cite the motivating incident or right-size; consider phasing.
[SEVERITY: H] [STORY: US-002/003/004] In-flight session rollout unspecified: does a live autopilot loop pick up the new PreToolUse hook mid-run or need a process restart? | RECOMMENDATION: AC specifying the guard applies to newly-spawned provider processes and expected behavior for live loops.
[SEVERITY: H] [STORY: *] No defined operator override for a false-positive block at the moment it happens; rulebook edit latency (hot-reload vs reprovision) unstated. | RECOMMENDATION: FR documenting the exact override path and its latency before wiring lands.
[SEVERITY: H] [STORY: US-005] [PROTECTED-PATH] US-005 claims all of `.oh/install/` (contains protected `banner.sh`, `cloudflared-tunnel.sh`) and doesn't confirm whether protected `Dockerfile` is touched. | RECOMMENDATION: Name the exact new file (e.g. `.oh/install/cc-safety-net.sh`) and state the Dockerfile touch explicitly.
[SEVERITY: M] [STORY: US-001] Supply-chain trust treated only as a semver-pin problem; no lockfile/checksum/integrity pin or code-review stance for a package with PreToolUse visibility into every bash command; repo's npm-audit posture currently degraded (4979b846). | RECOMMENDATION: US-001 AC: lockfile/integrity pin or vendored/reviewed copy; note npm-audit status for this dep.
[SEVERITY: M] [STORY: *] No motivating incident cited — proactive hardening not labeled as such. | RECOMMENDATION: State reactive-vs-proactive explicitly; right-size rollout.
[SEVERITY: L] [STORY: *] Per-command latency overhead of intercepting every Bash call unaddressed. | RECOMMENDATION: Add a Non-Goal or success-metric bound.
[SEVERITY: L] [STORY: *] No version-bump/update policy once pinned. | RECOMMENDATION: Non-Goals line: manual re-pin only.

## Synthesis
- **High-severity findings**: 9 (A: 3, B: 6)
- **Medium-severity findings**: 8 (A: 6, B: 2)
- **Low-severity findings**: 5
- **Recommendation**: REVISE-PRD

All high findings are addressable by plan revision (no fundamental blocker to adoption): correct the SENSITIVE_PATHS/headless rationale, move install to image build time (Dockerfile named explicitly, protected-path override note), add kill-switch + override-latency FRs, resolve the harness-internal destructive-git question via the US-001 spike (WORKTREE mode / rulebook exceptions) before wiring, name exact owned files, and restate per-provider coverage. Viability of adoption itself hinges on the spike's answer to the destructive-git-automation question.

---

# Round 2 — reviews prd.md v2 + install-decision.md

## Critic A — Implementer lens (round 2)
All 12 round-1 findings RESOLVED (0 partial, 0 unresolved), several verified against source.
New findings:
- [H] [US-006] [PROTECTED-PATH] Crons execute as agent prompts (`cron-runtime.ts` spawns `pi --continue`/`claude -p`), so their Bash calls DO pass through the guard. `.oh/crons/cleanup-tasks.md` (protected) has inline `git worktree remove --force` + `git branch -D` — blocked in all modes; breaks when US-005 lands. → add to US-006 owned files with override note, rewrite to git-maintenance.sh, correct the "crons bypass hooks" AC claim.
- [M] [US-002] Dockerfile AC imprecise: lines 109-129 are one compound RUN with an AGENTS/PKG loop; cc-safety-net must be a NEW standalone unconditional RUN (~line 130), never threaded into the loop.
- [L] pi pinned-package count is 10, not 11.
- [L] sha512 "compensates" claim is documentation-only; soften or add a build-time check.

## Critic B — User lens (round 2)
Ledger: 1,4,6,7,8,9,10 RESOLVED; 2,3,5 PARTIALLY-RESOLVED (pi kill-switch asymmetry; solo-operator weight unchanged but framing now explicit; override is new-process-only).
New findings:
- [H] [US-008] Runbook must state the pi kill-switch exception itself (env var does not affect pi; disable = remove package entry + restart).
- [H] [US-002/008] No AC forces restart of long-lived sessions (cron-system, autopilot-*, client-slack-pi) post-merge — guard otherwise inert on the very sessions it exists for. → add rollout/restart runbook step.
- [M] [US-006] git-maintenance.sh covered 4 of ~9 blocked classes → extended with push-force; remaining classes explicitly no-escape-hatch (kill-switch only), documented.
- [M] [US-008] `~/.cc-safety-net` not in any persisted volume → US-002 now mounts it.
- [L] [US-002] entrypoint.sh/link-providers.sh get additive-only notes matching Dockerfile treatment.

## Synthesis (round 2, post-v2.1 amendments)
- All round-2 findings addressed by v2.1 in-place amendments (cleanup-tasks cron in US-006 with override note; Dockerfile standalone-RUN AC; pi exception + restart step in US-008 runbook; audit-log volume in US-002; count + integrity wording fixed).
- **High-severity findings unmitigated**: 0
- **Recommendation**: PROCEED
