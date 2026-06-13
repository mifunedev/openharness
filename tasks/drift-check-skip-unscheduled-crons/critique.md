# Critique — drift-check-skip-unscheduled-crons

Generated 2026-06-13; reviews `prd.md` post-/prd, pre-/ralph (2-critic gate, advisor-model 3-step variant).

## Critic A — Implementer lens

- [SEVERITY: H] [US-003] Probe "grep SKILL.md for absent raw loop" / "extract snippet" left as an either/or gives false confidence — a text-presence check passes trivially (renamed loop var keeps the string) and breaks on cosmetic reformatting; it does not test behavior. → **Mitigated**: US-003 rewritten to MANDATE extract-the-live-Step-C-2-block-and-run-against-fixtures, reject the bare-grep option, require non-empty/sanity extraction (REGRESSION on mis-extract), and demonstrate the REGRESSION path against a reverted block.
- [SEVERITY: M] [US-001] CRLF breaks `head -n1 = '---'` (returns `---\r`) → false-negative skip of a real cron. → **Mitigated**: AC now strips trailing `\r` on the line-1 check.
- [SEVERITY: M] [US-001] Missing-closing-`---` diverges from `parseCronFile` (which requires both delimiters). → **Mitigated**: predicate condition 2 now requires a closing `---`.
- [SEVERITY: M] [US-001] Bare `grep 'schedule:'` matches a commented `# schedule:` or substring key `pre_schedule:`. → **Mitigated**: anchored `^[[:space:]]*schedule:` on non-`#` lines.
- [SEVERITY: L] [US-001] Quoted `enabled: "false"` not excluded by naive grep. → **Mitigated**: predicate tolerates quoted `false`.
- [SEVERITY: L] [US-003] `stat`-absence SKIPPED + missing SKILL.md handling. → **Mitigated**: SKIPPED only on genuinely-absent prerequisite (SKILL.md or `stat`); stderr convention + trap-before-fixtures specified.
- [SEVERITY: L] [US-001] AC predicate-order ambiguity / 4-cron naming. → **Mitigated** by property-based AC (below).

## Critic B — User lens

- [SEVERITY: M] [US-001] "Mirror `parseCronFile`" framing imprecise — `parseCronFile` succeeds on a disabled cron; `loadCrons` drops it. → **Mitigated**: predicate reframed as the net outcome of `parseCronFile` + `loadCrons`.
- [SEVERITY: M] [US-001] Hardcoded four-cron list is brittle (autopilot `enabled` is a live toggle). → **Mitigated**: property-based AC, no hard-coded count/name list; autopilot not hard-required.
- [SEVERITY: M] [US-003] "Source predicate from live SKILL.md" impractical / under-specified. → **Mitigated**: single mandated strategy with a stable extraction anchor.
- [SEVERITY: L] [US-004 wording] Aggregate `DRIFT:` line count. → **Mitigated**: US-002 AC now covers the aggregate line + example shows a real cron.
- [SEVERITY: L] [*] Subdir glob depth + rollback not in Non-Goals. → **Mitigated**: both added to Non-Goals.
- **Protected-path check: PASS** — `drift-check` is in `.claude/protected-paths.txt`; this PRD *modifies* `SKILL.md`, does not delete/deprecate it. No `[PROTECTED-PATH]` violation.

## Synthesis

- **High-severity findings**: 1 (US-003 probe robustness) — **AC-level mitigation applied** (extract-and-run probe mandated; bare-grep rejected).
- **Medium-severity findings**: 6 — all folded into US-001/US-002/US-003 acceptance criteria.
- **Low-severity findings**: ~5 — folded into ACs, Non-Goals, and Technical Considerations.
- **Protected-path**: PASS (modification, not deletion).
- **Recommendation**: **PROCEED** — the single High finding concerned probe construction, not the feature's soundness; the revised PRD mandates a behavior-based probe and tightens every predicate edge case the critics raised. No GitHub-side state existed at gate time, so the revision was free.
