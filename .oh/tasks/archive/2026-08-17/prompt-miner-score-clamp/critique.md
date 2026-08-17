# Critique — prompt-miner-score-clamp

Generated 2026-08-13; reviews `prd.md` rev 1, post-`/prd`, pre-`/ralph`.

## Critic A — Implementer lens

```
[SEVERITY: H] [US-003] R4 updates markers.md but leaves SKILL.md Step 3 contradicting it —
SKILL.md:135 instructs "correlate each feature in markerFeatureKeys against the session
`score`", the very field the PRD says is censored. | EVIDENCE: .oh/skills/prompt-miner/SKILL.md:118,135
| RECOMMENDATION: R4 (or a new rule) must also update SKILL.md Step 2/3 wording, else the
operative doc a future agent actually follows still points at the censored scale.

[SEVERITY: M] [*] report-schema.md is the documented JSON contract for sessions[]/manifest,
but no rule assigns updating it, though R2 adds scoreUncapped and R3 adds manifest.ceilingSaturation.
| EVIDENCE: references/report-schema.md:27-41 (manifest table), :46-75 (session shape)
| RECOMMENDATION: add an explicit rule/AC requiring report-schema.md updated in the same commit.

[SEVERITY: M] [US-001] R2 says "every ranked session", but unranked[] shares the same record
shape and scoreSession is called before the rankable split, so scoreUncapped will be present
on unranked records too. | EVIDENCE: mine-traces.mjs:1004-1029 builds record for ALL sessions
before the split at :1040/:1070 | RECOMMENDATION: clarify R2 to "every scored session record".

[SEVERITY: M] [US-002] R3 does not specify whether ceilingSaturation is built from `rankable`
only or all sessions; noHumanPrompt sessions have sessionType: null (mine-traces.mjs:1003).
| RECOMMENDATION: pin the AC to `rankable` explicitly.

[SEVERITY: L] [US-002] "score equals 100" must be stated as the stored (rounded) score field,
not an unrounded intermediate. | EVIDENCE: mine-traces.mjs:427,430.

[SEVERITY: M] [US-002] R5 gives no markdown format for the census. | EVIDENCE: renderMarkdown
:1081-1132 has a flat bullet-list "## Manifest" section :1086-1097 | RECOMMENDATION: pick the
existing bullet style and say so.

[SEVERITY: L] [*] PRD's numeric claims verified CORRECT: base ∈ [0,100] by construction
(weights :37-44 non-negative; signals clamped :376,389,391; abandoned/incomplete 0|1);
scoreUncapped ∈ [0,115]; ranking sorts by score (:1041); .oh/skills/** absent from
vitest.config.ts:5-9 include.

[SEVERITY: L] [*] No protected-path or destructive-operation risk. No entry under
.oh/skills/prompt-miner/* in .claude/protected-paths.txt.

[SEVERITY: M] [*] Wiki NOT-APPLICABLE is defensible but thinly argued; flag for the auditor
that if #730's future fix reads scoreUncapped/ceilingSaturation as load-bearing inputs, THAT
task should run the DeepWiki comparison.

[SEVERITY: L] [*] No story is 2+ stories in disguise — but US-003 as scoped does not cover
the SKILL.md contradiction; broaden it or add a fourth story.
```

## Critic B — User lens

```
[SEVERITY: H] [*] The change makes the marker gate strictly MORE PERMISSIVE on exactly the run
that motivated it (d=0.332→0.423; LOO failures 19/37→0/37), and the daily cron auto-files a
GitHub issue the moment a marker clears the bar. The PRD never states whether that step-change
is desired. Given #730 shows the gate is already unstable, silently lowering the effective bar
raises the auto-file rate on an untrustworthy signal. | EVIDENCE: PRD evidence table +
.oh/crons/prompt-miner.md Step 2 | RECOMMENDATION: acknowledge the tradeoff explicitly and
record the decision, or add a guard.

[SEVERITY: M] [*] Scale choice can change effect DIRECTION, not just magnitude: hasFilePath
ran d_cap=−0.497 (negative) and d_unc=+0.402 (positive) across the 08-03..08-10 windows.
The PRD's chosen example (lenWords) only shows a robustness change. | RECOMMENDATION: state
that scale choice can flip sign, and that this reinforces rather than replaces #730.

[SEVERITY: M] [US-003] Wiki Alignment claims references/scoring.md is "updated in-place by
US-003", but US-003's text only names markers.md, and scoring.md does not mention
scoreUncapped at all. | RECOMMENDATION: add a rule requiring scoring.md, or drop the claim.

[SEVERITY: M] [*] Sequencing: is a scale fix useful before #730's reproducibility fix?
| RECOMMENDATION: state the sequencing rationale in one sentence.

[SEVERITY: L] [*] Rollback covers code/doc but not the human dependency: issues/PRs filed
between ship and a revert would cite the uncensored scale and are not retracted by git revert.

[SEVERITY: L] [*] Non-Goals doesn't explicitly rule in or out report-schema.md.

[SEVERITY: L] [*] No audience/framing drift against .oh/context/USER.md.

[SEVERITY: N/A] [*] Protected-paths check clean; no [PROTECTED-PATH] tag warranted.
```

## Synthesis

- **High-severity findings**: 2 (A: SKILL.md contradiction; B: gate becomes more permissive)
- **Medium-severity findings**: 7
- **Low-severity findings**: 6
- **Recommendation**: REVISE-PRD → PROCEED

### Disposition (rev 2)

| Finding | Disposition |
|---|---|
| A-H SKILL.md contradiction | **Mitigated.** New R8 + US-003 scope broadened to SKILL.md Steps 2–3. |
| B-H more-permissive gate | **Mitigated by design change.** New R9: the marker record carries BOTH `effect_size` (uncensored, authoritative) and `effect_size_capped`, and a marker whose two scales disagree on direction or on bar-clearing is reported UNSTABLE and is **not** promotable. This makes the net change strictly *stricter* where the scales disagree — which is precisely where the permissiveness objection bites — while keeping the uncensored scale as the measurement basis. |
| A-M report-schema.md unassigned | Mitigated: R10 assigns it. |
| A-M ranked vs scored records | Mitigated: R2 reworded to "every scored session record". |
| A-M ceilingSaturation population | Mitigated: R3 pins `rankable`. |
| A-L rounded score comparison | Mitigated: R3 pins the stored rounded `score` field. |
| A-M markdown format unspecified | Mitigated: R5 pins the existing `## Manifest` bullet style. |
| A-M wiki thinly argued | Accepted; note added deferring the DeepWiki comparison to the #730 follow-on. |
| B-M sign-flip framing | Mitigated: recorded in the Problem section and load-bearing for R9. |
| B-M scoring.md claim | Mitigated: R11 assigns scoring.md. |
| B-M sequencing rationale | Mitigated: one-paragraph rationale added. |
| B-L rollback human dependency | Mitigated: Rollback section extended. |
| B-L report-schema in Non-Goals | Resolved by R10 (in scope, not a non-goal). |
