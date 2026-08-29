---
id: eval-weekly
schedule: "0 6 * * 0"
timezone: America/Denver
enabled: true
overlap: false
catchup: false
agent: pi
description: Weekly eval suite — run probes, log any regressions to memory
---

# Weekly Eval

Run the context fitness-function probe suite and log any regressions.
This is a **log-only** run: no issues are opened, no notifications are
sent.

> **Note:** CI (`eval-probes` in `.github/workflows/ci-harness.yml`) is the
> primary green→red regression gate — it runs the suite on every PR and push to
> `development`/`main`. This weekly cron is a **supplemental** check that catches
> regressions from non-PR activity (direct commits, drift in live real state).

## Tasks

1. Run the eval suite and capture full output to a temp file:
   ```bash
   bash .oh/skills/eval/run.sh > /tmp/eval-weekly-out.txt 2>&1 || true
   ```
2. Check for regressions:
   ```bash
   grep -E "^  - " /tmp/eval-weekly-out.txt || true
   ```
3. If any lines matching `^  - ` were found (these are the regression
   entries produced by `run.sh`), name each regressed probe and its source
   field in the reply. `run.sh` has already written the durable record to
   `.oh/evals/RESULTS.md`; this cron adds no second copy.

4. **Liveness:** append one liveness line to `crons/.cron.log` through
   `.oh/scripts/locked-append.sh`:
   ```bash
   printf '[%s] eval-weekly: %s\n' "$(date -Iseconds)" "<OK|REGRESSION(N)>" | .oh/scripts/locked-append.sh crons/.cron.log
   ```
   where the status token is `OK` when no regressions were found, or
   `REGRESSION(N)` (e.g. `REGRESSION(2)`) when N probes regressed.
   Create the file if it does not exist.

## Reporting

- No regressions → reply `EVAL_OK`.
- Regressions found → list each regressed probe id and its source on a
  separate line, prefixed with `REGRESSION:`.
