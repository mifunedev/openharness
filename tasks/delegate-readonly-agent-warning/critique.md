# Critique — delegate-readonly-agent-warning

Generated 2026-06-11; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

Overall: REVISE. No protected-path violations; no destructive operations.

- [M] US-003 — probe PASS uses whole-file AND of `read-only` + `general-purpose`; could over-pass if the phrases live in unrelated blocks. → Scope each grep to the target section (Worker-configuration block; §Reference table), as `clean-restore.sh` scopes its assertion.
- [M] US-001/US-002 — `.claude/agents/general-purpose.md` does not exist (built-in type); the Key Resources table also has a stale `council.md` row pointing at a non-existent file. → Do NOT add a file-path cell for `general-purpose`; use an inline note. Leave the stale `council.md` row untouched (out of scope) but do not make it worse.
- [M] US-004 — `next-dev-prod` is already REGRESSION on the base (host-state probe). → Verify "no new regression" via the runner aggregate exit code (`$?`==0), NOT by absence of REGRESSION rows in RESULTS.md.
- [M] US-003 — `# source:` must match the canonical header format the runner greps. → Pin to `# source: memory/MEMORY.md 2026-06-10 (rl-delegation) #57`.
- [L] US-001 — Worker-configuration block never documents `subagent_type` at all; make the new bullet actionable ("set `subagent_type: general-purpose` in your `Agent` call").
- [L] US-002 — mandate inline-note approach; do not add a 3rd column unless all 8 rows are updated.
- [L] US-003 — distinguish "section absent" from "phrase absent" in the REGRESSION message.

## Critic B — User lens

Overall: REVISE. No protected-path violations (additive edit to the delegate skill is safe; agent files excluded per Non-Goals).

- [M] Line-number anchors (`~line 127`, `~lines 242–244`) will drift. → Reference section headings instead.
- [M] AC `grep -n "read-only"` is case/phrase brittle; defer authoritative verification to the probe (US-003), keep AC greps loose/consistent.
- [M] Committing generated `evals/RESULTS.md` on the branch can collide with parallel autopilot runs (see `autopilot-shared-checkout-contamination`). → Treat RESULTS.md as a generated artifact; it must not block merge if stale.
- [L] Probe over-pass on unrelated occurrences → scope grep (same as Critic A M).
- [L] Probe should emit PASS/REGRESSION to stderr (`>&2`) like `clean-restore.sh`.
- Missing: CHANGELOG `## [Unreleased]` entry (git.md § Changelog) — editing a skill the orchestrator reads is workflow-visible.
- Missing: a See-Also pointer noting `general-purpose` is a built-in type (no agent file).

## Synthesis

- **High-severity findings**: 0
- **Medium-severity findings**: 7 (4 from A, 3 from B; several overlap on section-scoping + RESULTS handling)
- **Protected-path violations**: 0
- **Recommendation**: PROCEED — all findings are M/L and correctable with cheap AC clarifications, which have been folded into `prd.md` (see "Critic synthesis" appendix). No GitHub-side or destructive operation is gated by these.
