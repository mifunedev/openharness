# Retro Report Schema

Every non-trivial `/retro` run must emit this structure. `/retro` writes no
file; the report is terminal output. Keep the final line as `STATUS: RETRO-DONE`.

## Required sections

1. `## Session signals`
2. `## Hypotheses`
3. `## Promotion candidates`
4. `## Summary`
5. final line: `STATUS: RETRO-DONE`

## Hypotheses table

Use exactly this header so `scripts/validate-retro-report.sh` can check it:

```markdown
| ID | Subsystem | Hypothesis | Evidence for | Evidence against | Verdict | Confidence | Promotion |
|----|-----------|------------|--------------|------------------|---------|------------|-----------|
```

Rules:
- `Evidence against` is required for every row; write `none found in-session` only after actively checking.
- `Verdict` must be `supported`, `refuted`, or `inconclusive`.
- `Confidence` must be `low`, `medium`, or `high`.
- `Promotion` must be one of `report-only`, `probe`, or `discarded`.

## Promotion candidate format

Probe candidates are the only promotable tier. They nominate a probe under
`.oh/evals/probes/`; `/retro` never creates it. They must remain prescriptive,
are rare, and must carry correction-surface metadata:

```markdown
Probe candidates:
- <principle> [<subsystem> · <confidence> · harden|proceduralize|eval] — probe: <id> | basis: <one clause>
```

Write `- none` when nothing qualified.

If `eval` is used, the probe must be `deferred-tier-b` and the line must include
`justification:` explaining why neither `harden` nor `proceduralize` fits.

## Summary block

```markdown
## Summary
- **Result**: OP | DRY-RUN | SKIPPED-TRIVIAL
- **Subsystems**: <which of the 5 produced signals, or focus: name>
- **Hypotheses**: <total> (supported <n> / refuted <n> / inconclusive <n>)
- **Probe candidates**: <n>
- **Observation**: <one sentence>
```

`Probe candidates` counts the lines in the probe-candidate block, not the number
of hypotheses tested.
