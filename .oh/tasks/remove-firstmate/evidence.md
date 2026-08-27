# Evidence — remove-firstmate

## Why this is better

The previous session handoff created two owners for one implementation: a workflow Advisor and a second long-lived implementation process. This change leaves one `/spec execute` Advisor owner and removes the unused session runner, timeout, lock, and ladder machinery. The result is one workflow to attach to, resume, validate, and finalize.

## What the plan asked for

Remove the retired implementation-session concept from active runtime, workflow, skill, documentation, test, probe, CI, and provider surfaces while keeping the canonical `/spec` plan → execute → retro gates.

## What was built

- Deleted `.oh/scripts/spec-build.sh`, `.oh/scripts/lib/session-runner.sh`, and `.oh/scripts/lib/task-contract.sh`.
- Deleted the session-specific tests, probes, template, and curated runner-ladder wiki page.
- Made `/spec execute` the single Advisor-owned implementation and finalization workflow; `/delegate` remains bounded fan-out only.
- Updated active references, cron guidance, provider docs, wiki navigation, protected paths, and eval results.

## Protected-path deletion justification

The merge-base protected entries `.oh/scripts/lib/session-runner.sh` and `.oh/scripts/lib/task-contract.sh` were deleted because they only supported the removed second implementation process. The current tree has no consumer for either path; the implementation workflow now lives in `/spec execute` and uses no session runner or task-contract library. The existing protected-path probe and the final eval run verify the resulting list and active references.

## Where this diverged

The implementation does not restore the deleted `ralph.sh` runner or its historical behavior. It removes the separate implementation process instead, as required by the single-owner refinement. Historical changelog, RFC, archived-task, and immutable raw wiki records remain preserved.

## What remains unverified

No known required gate remains unverified. Human review and merge remain the final gates.
