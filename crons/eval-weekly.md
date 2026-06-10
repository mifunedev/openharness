---
id: eval-weekly
schedule: "0 6 * * 0"
timezone: America/Denver
enabled: true
overlap: false
catchup: false
description: Weekly eval suite — run probes, log any regressions to memory
---

# Weekly Eval

Run the context fitness-function probe suite and log any regressions.
This is a **log-only** run: no issues are opened, no notifications are
sent.

## Tasks

1. Compute `TODAY=$(date -u +%Y-%m-%d)` and ensure the log directory
   exists: `mkdir -p "memory/$TODAY"`.

2. Run the eval suite and capture full output to a temp file:
   ```bash
   bash .claude/skills/eval/run.sh > /tmp/eval-weekly-out.txt 2>&1 || true
   ```

3. Check for regressions:
   ```bash
   grep -E "^  - " /tmp/eval-weekly-out.txt || true
   ```

4. If any lines matching `^  - ` were found (these are the regression
   entries produced by `run.sh`), append one dated entry per regression
   to `memory/$TODAY/log.md`:

   ```
   ## eval-weekly -- HH:MM UTC
   - **Result**: REGRESSION
   - **Probe**: <probe-id from regression line>
   - **Source**: <source field from regression line>
   - **Observation**: probe regressed from PASS; see evals/RESULTS.md for current status
   ```

   Use one `## eval-weekly -- HH:MM UTC` heading block per run (not per
   probe). List each regressed probe as a separate bullet under
   `- **Probe**:` within that block.

   If there are no regressions, append instead:
   ```
   ## eval-weekly -- HH:MM UTC
   - **Result**: OP
   - **Probes**: <N from "ran N probe(s)" line>
   - **Observation**: all probes passed or skipped; no regressions
   ```

5. **Mandatory closing step:** append one liveness line to
   `crons/.cron.log`:
   ```bash
   printf '[%s] eval-weekly: %s\n' "$(date -Iseconds)" "<OK|REGRESSION(N)>" >> crons/.cron.log
   ```
   where the status token is `OK` when no regressions were found, or
   `REGRESSION(N)` (e.g. `REGRESSION(2)`) when N probes regressed.
   Create the file if it does not exist.

## Reporting

- No regressions → reply `EVAL_OK`.
- Regressions found → list each regressed probe id and its source on a
  separate line, prefixed with `REGRESSION:`.
