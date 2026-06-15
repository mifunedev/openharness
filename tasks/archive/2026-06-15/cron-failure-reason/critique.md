# Critique — cron-failure-reason

Generated 2026-06-12; reviews `prd.md` post-/prd, pre-/ralph. Two adversarial
critics (implementer + user lens), cross-checked against
`.claude/protected-paths.txt`.

## Critic A — Implementer lens

```
[SEVERITY: H] [US-002] log() applies .replace().slice() to the msg arg; if readFailureTail
  returns undefined, .replace throws. AC must guarantee the return type is `string`, compiler-enforced.
[SEVERITY: H] [US-002] "no secret-spew risk beyond today" is inaccurate — today no stdout is
  captured; after this change up to 200 chars ARE. New exposure surface, not risk parity.
[SEVERITY: M] [US-001] Tests should reuse the existing beforeEach temp-dir fixture, not a new teardown path.
[SEVERITY: M] [US-002] After Claude→Codex fallback the logFile holds combined output (tee -a);
  tail may start mid-sentence. UX note, not correctness.
[SEVERITY: M] [US-001] maxChars default "e.g. 500" conflicts with the 200-char log() cap →
  implementer ambiguity. Pin it.
[SEVERITY: M] [US-003] Inline literal tabs break markdown tables; specify \t escape vs fenced code.
[SEVERITY: L] [US-002] Comment placement in fireTmux unspecified.
[SEVERITY: L] [*] Success Metric ("next heartbeat EXIT_1 diagnosable") not pre-merge verifiable;
  needs a manual QA step.
```

## Critic B — User lens

```
[SEVERITY: M] [US-001] No path sandboxing; entry.id comes from frontmatter → traversal concern.
[SEVERITY: M] [US-002] code can be null (SIGKILL); null !== 0 → tail still fires; EXIT_null
  underdocumented.
[SEVERITY: M] [US-002] 200-char cap after whitespace-collapse may yield a useless mid-sentence
  tail; set honest expectations.
[SEVERITY: M] [US-003] "only EXIT_n row" constraint lives in AC, not Non-Goals (invisible to
  an implementer reading Non-Goals first).
[SEVERITY: L] [*] maxChars param = API surface with no consumer; USER.md warns against premature
  abstraction.
[SEVERITY: L] [US-001] Secrets in /tmp log — content (not just length) matters; add an honest
  scope exclusion.
[SEVERITY: L] [*] New 4th tab field could surprise a field-count-sensitive .cron.log consumer
  (e.g. heartbeat.md).
```

## Resolution (REVISE-PRD → PROCEED)

No protected-path violation: the only touched file on the protected list is
`scripts/cron-runtime.ts`, and the change is additive (a new exported helper +
a 1-line edit to an existing handler + a comment) — no deletion, so no
`[PROTECTED-PATH]` gate fires.

Both **H** findings had clear AC-level mitigations and were baked into the
revised `prd.md` rather than triggering a HALT:

- **H-1 (undefined return → throw)**: US-001 AC now pins the signature to
  `readFailureTail(...): string` (return type `string`, never `undefined`),
  compiler-enforced under TS strict — `log()` can never throw on its result.
- **H-2 (inaccurate secret-spew framing)**: Goals bullet 4 rewritten to state
  honestly that this *is* new (length-bounded, content-unfiltered) exposure;
  a Non-Goal now explicitly excludes secret filtering and assigns the
  credential-free-`/tmp` responsibility to the operator.

All **M/L** findings folded in: `maxChars` default pinned to **200** with a
test-injection rationale (mirrors `onJobError(logFn = log)`); `code === null`
(`EXIT_null`) preserved and documented; fenced-code format example replaces
inline tabs; path-validation declared pre-existing/out-of-scope; combined
claude+codex tail noted; comment placement fixed; downstream `.cron.log`
parsing noted as additive to the existing 4th `msg` column; manual post-merge
QA step added for the aspirational Success Metric.

## Synthesis

- **High-severity findings**: 2 (both mitigated at the AC level in the revised PRD)
- **Medium-severity findings**: 7 (all folded into the revised PRD)
- **Low-severity findings**: 4 (all folded in)
- **Recommendation**: PROCEED
