# Critique — eval-probes-ci-gate

Generated 2026-06-13; reviews `prd.md` post-/prd, pre-/ralph. Two critics ran on
the **pre-revision** PRD; the PRD was then revised to fold in every
high-severity mitigation (see `prd.md` § Critic synthesis).

## Critic A — Implementer lens (raw)

- [H][US-003] Hermeticity verified only "locally", not CI-reproducible; committed RESULTS.md baseline (PASS in sandbox) could transition to ERROR in cold CI → false green→red. Recommend explicit CI-dry-run AC. (next-dev-prod already REGRESSION in baseline; that specific case is safe per run.sh:106.)
- [H][US-003] Scope creep — 16-probe audit mixes static analysis + behavioral verification; distinct dependency classes (static-grep, file-exec, process-inspection, extract-and-run). Split into classify + patch; classification table mandatory.
- [H][US-003] owned-surface-guard.sh uses `grep -oP` (line 87) with no SKIP guard → PASS→ERROR if -P unsupported. Add guard or document ubuntu-latest confirmation.
- [M][US-002] Node AC is a deferred task, not verifiable. Convert to falsifiable assertion (no probe uses node/jq → no Node setup).
- [M][US-004] Self-guard grep must be unanchored for YAML indentation (boot-lint-glob idiom); acknowledge it's a string-presence check.
- [M][US-003/US-002] No story updates committed RESULTS.md after patches → local/CI baseline divergence. Add refresh-baseline requirement; document PASS→SKIPPED divergence is non-regressing.
- [M][US-001] `grep -c '"evals/\*\*"'` fragile (assumes double-quoting). Relax to quote-agnostic or mandate double-quote style.
- [M][US-003] drift-check-cron-staleness-glob is extract-and-run; audit definition too narrow (only docker/tmux/cron-system). Include extract-and-run probes.
- [L][US-002] RESULTS.md mv -f writes to writable checkout (not read-only). Clarify "read-only wrt git" = no commit, not filesystem.
- [L][US-005] README AC grep-only → too weak; require substantive content.
- [L][*] concurrency cancel-in-progress applies to eval-probes; force-push can cancel the gate. Acknowledge.

## Critic B — User lens (raw)

- [H][*] No escape hatch for a probe false-fail blocking all PRs (single-dev context). workflow_dispatch exists but undocumented as unblock. Document escape path in README.
- [H][US-003] Circular bootstrap: gate can't pass until probes hermetic, but only way to confirm is run the gate. Sequence US-003 (hermeticity) before US-002 (job), or land with continue-on-error then harden.
- [M][US-002] PASS→SKIPPED transitions silent; stale committed RESULTS.md weakens the signal. Document as known limitation / operator responsibility.
- [M][US-002] Double-gating with autopilot §6 on inconsistent baselines. Document interaction, not a bug.
- [M][US-001] evals/** trigger couples RESULTS.md-only commits to full CI. Acceptable noise for single-dev; document.
- [M][US-004] Self-guard is a text match, not semantic; refactors could silently break coverage. Acknowledge in `# desc:`.
- [L][US-005] eval-weekly cron superseded but no deprecation note. Add one-line note to cron body.
- [L][*] No protected-path violations (ci-harness.yml + evals/probes/ not in protected-paths.txt; run.sh protected but in Non-Goals).

## Synthesis

- **High-severity findings**: 5 (all AC-mitigated via PRD revision — bootstrap circularity resolved by reordering US-002 before US-003; hermeticity proof + classification table + grep -P guard + escape-hatch docs all added)
- **Medium-severity findings**: 8 (folded into ACs / Technical Considerations / Non-Goals)
- **Low-severity findings**: 5 (folded in)
- **Protected-path violations**: 0
- **Recommendation**: PROCEED (post-revision — no high-severity finding remains without an AC-level mitigation)
