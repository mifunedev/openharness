# Retro Report Schema

Every non-trivial `/retro` run must emit this structure before any MEMORY.md or
IDENTITY.md approval gate. Keep the final line as `STATUS: RETRO-DONE`.

## Required sections

1. `## Session signals`
2. `## Hypotheses`
3. `## Promotion candidates`
4. `## Log entry`
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
- `Promotion` must be one of `log-only`, `MEMORY`, `IDENTITY`, or `discarded`.

## Promotion candidate format

MEMORY candidates must carry correction-surface metadata:

```markdown
- YYYY-MM-DD: <lesson> [<subsystem> · <confidence> · harden|proceduralize|eval] — probe: <id> | basis: <one clause>
```

IDENTITY candidates must remain prescriptive and are rare:

```markdown
- <principle> [<subsystem> · <confidence> · harden|proceduralize|eval] — probe: <id> | basis: <one clause>
```

If `eval` is used, the probe must be `deferred-tier-b` and the line must include
`justification:` explaining why neither `harden` nor `proceduralize` fits.
