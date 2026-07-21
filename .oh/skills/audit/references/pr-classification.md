# Private PR classification contract

`../scripts/pr-acquire.sh` performs the only GitHub read and emits schema-version 1 input. `../scripts/pr-classify.sh` is the sole pure classifier and machine seam. Renderers consume its JSON and never re-derive state.

CI is `FAIL` for ACTION_REQUIRED/CANCELLED/ERROR/FAILURE/STARTUP_FAILURE/STALE/TIMED_OUT; otherwise `PENDING` for EXPECTED/IN_PROGRESS/PENDING/QUEUED/REQUESTED/WAITING; empty present rollup is `NONE`; all-terminal SUCCESS/NEUTRAL/SKIPPED is `PASS`; every malformed or new value is `UNKNOWN` with incomplete evidence.

`readyForReview` applies only to draft + PASS + MERGEABLE + CLEAN + complete evidence. `readyToMerge` applies only to non-draft with the same evidence and reviewDecision APPROVED, explicit empty, or null. `promotable` is their union. Audits never ready or merge PRs.
