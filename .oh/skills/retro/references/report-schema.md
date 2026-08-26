# Retro Report Schema

Every non-trivial `/retro` run must emit this structure before the IDENTITY.md
approval gate. Keep the final line as `STATUS: RETRO-DONE`.

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
- `Promotion` must be one of `report-only`, `IDENTITY`, or `discarded`.

## Promotion candidate format

IDENTITY candidates are the only promotable tier. They must remain prescriptive,
are rare, and must carry correction-surface metadata:

```markdown
Proposed IDENTITY.md addition(s):
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
- **Promoted**: <n> to IDENTITY.md
- **Observation**: <one sentence>
```

`Promoted` counts the lines actually appended, not the length of the proposal
list.
