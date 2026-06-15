# Critique — autopilot-eval-gate-delta

Generated 2026-06-11; reviews `prd.md` post-/prd, pre-/ralph.

## Critic A — Implementer lens

```
[SEVERITY: M] [US-001] "PR touches no file the probe reads" is unverifiable — no read-set mechanism exists in the skill/runner/rules. RECOMMENDATION: define read-set as a deterministic heuristic, or drop condition (c) and rely on exit-code + delta.
[SEVERITY: M] [US-001] §6 is doc-as-spec; the probe verifies vocabulary, not runtime behavior. RECOMMENDATION: state this is doc-as-spec; require the three conditions as an explicit numbered/bulleted list so a future agent can't elide one.
[SEVERITY: M] [US-003] Absence-grep ("does §6 still contain 'Any REGRESSION'?") is brittle on free-form prose. RECOMMENDATION: assert POSITIVE presence of canonical tokens (e.g. "exit 0", "delta", "unchanged") rather than absence of old language.
[SEVERITY: M] [US-003/US-004] eval-gate has empty prior on first /eval run → delta new-pass/new-fail, never fires the regression array; AC "runner exits 0" is trivially satisfied even if the probe is broken. RECOMMENDATION: verify by running `bash evals/probes/eval-gate.sh` directly (exit 0) AND proving a reverted §6 makes it exit 1.
[SEVERITY: M] [US-003] The revert-to-old-text verification is a destructive manual step on a tracked file. RECOMMENDATION: do it inside a git worktree so the main checkout is never left broken.
[SEVERITY: L] [US-001] FR-1(c) read-set depends on runner metadata the runner doesn't emit, and Non-Goals excludes touching the runner → orphaned requirement.
[SEVERITY: L] [US-002] "No other rows changed" has no diff fingerprint. RECOMMENDATION: add a row-count assertion.
[SEVERITY: L] [US-004] SKIPPED probes are excluded from the regression array; "no green→red" is trivially satisfied if a probe SKIPs. RECOMMENDATION: word AC as "no previously-PASS probe → REGRESSION/TIMEOUT/ERROR (SKIPPED permitted)".
```

## Critic B — User lens

```
[SEVERITY: H] [US-001] "file-scope disjoint" PROCEED condition has no definition of "read-set" and no algorithm; indeterminate for variable/glob paths. RECOMMENDATION: define concretely, or drop the sub-condition and rely solely on runner-exit-0 + delta-unchanged (matches the MEMORY lesson core).
[SEVERITY: H] [US-001] The three-part rule is self-defeating: a PR editing autopilot/SKILL.md itself touches the file the eval-gate probe reads → disjoint-scope fails → PR kept draft despite unchanged delta. Blocks the very class of PRs most likely to trigger it. RECOMMENDATION: apply disjoint-scope only to pre-existing-red probes, or exempt probes added/modified by this PR — better, drop it; delta is authoritative.
[SEVERITY: M] [US-001/US-003] Probe is a grep text oracle, not behavioral; a semantic (non-verbatim) reversion could keep the old behavior and still pass. RECOMMENDATION: scope the Success Metrics claim to verbatim reversion, and assert positive presence of delta/exit-code terms with AND-logic.
[SEVERITY: M] [US-004] §6 already commits evals/RESULTS.md; US-004 could create a vacuous second identical commit. RECOMMENDATION: clarify US-004's /eval is the SAME invocation as §6's gate; no separate commit.
[SEVERITY: M] [*] The probe now hard-couples loop health to §6 wording, yet Non-Goals excludes adding autopilot to protected-paths with no substitute safeguard. RECOMMENDATION: accept the risk explicitly ("the probe IS the protection") or note a follow-on issue.
[SEVERITY: M] [US-001] No rollback/escape hatch documented. RECOMMENDATION: add one sentence — restore pre-change §6 text; the probe flips red surfacing the reversion.
[SEVERITY: L] [US-003] Renaming the autopilot skill makes the probe silently SKIP rather than REGRESS — accepted limitation for a single-dev repo.
[SEVERITY: L] [US-002] "No other rows changed" not machine-checkable without a baseline. RECOMMENDATION: record a baseline grep in the commit/PR.
```

## Synthesis

- **High-severity findings**: 2 (both on the US-001 "file-scope disjoint" PROCEED sub-condition — undefined read-set + self-defeating for PRs that edit the probed file).
- **Medium-severity findings**: 6 (brittle absence-grep → use positive assertions; vacuous-pass risk → direct probe verification; worktree-isolated revert test; vacuous second commit; protected-paths coupling; missing escape hatch).
- **Resolution**: PRD **revised in place** (advisor-model 3-step variant — author resolves, then proceeds). The two H findings are mitigated by **dropping the file-scope sub-condition as a hard gate** and making the **green→red delta authoritative** for causation (an `unchanged` delta means the PR did not cause the red, regardless of file overlap); the file-scope idea is retained only as a diagnostic note. Key M mitigations folded into the ACs: positive-assertion probe (AND-logic on corrected-vocabulary tokens), direct-run + worktree-isolated revert verification, explicit escape hatch, row-count assertion, SKIPPED carve-out wording, and explicit risk-acceptance for the protected-paths coupling (probe is the protection; protected-paths add is a follow-on).
- **Recommendation**: PROCEED (post-revision; no unresolved high-severity findings).
