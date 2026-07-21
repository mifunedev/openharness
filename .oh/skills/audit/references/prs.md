# Audit the open pull-request queue

Validate queue-only flags before starting: optional `--repo owner/name` (resolve an omitted repo once with `gh repo view --json nameWithOwner -q .nameWithOwner` from `AUDIT_ROOT`), optional
`--label L`, exactly one of `--author A` or `--mine`, optional `--base B` and
`--stale-days N`, `--deep`, repeatable `--apply proof|labels|close`, required
`--close-stale-days N` for close, and `--dry-run`. Focused `--pr` is invalid here.
Normalize `--mine` to the acquisition seam's `--mine` flag (which passes GitHub's
`--author @me`); never silently ignore it or combine it with `--author`.

Use `$AUDIT_ROOT/.oh/skills/audit/scripts/pr-acquire.sh prs` once with the explicit or resolved repository and normalized filters (limit 200), then pipe its versioned envelope to `$AUDIT_ROOT/.oh/skills/audit/scripts/pr-classify.sh`. Never classify during acquisition and never re-derive classifier fields during rendering. A capped result carries `truncated:true`; acquisition failure, truncation, malformed/incomplete records, or requested deep evidence that fails makes the result partial.

A stale draft must route to `/watchdog` to complete the branch before a workflow owner performs a freshly classified undraft.

Render actionability-ordered non-draft sections from `.primaryState`: CI failing, conflicting/behind, changes requested, needs review, ready, pending/other. Render drafts separately as non-actionable WIP with `.draftStatus` and `.draftLimbo`. Then show stale/convention/duplicate flag rollup and classifier counts. Stale green drafts remain promotable and limbo; flags never replace readiness state.

Emit `PRS-AUDIT-COMPLETE` only after successful classification of every selected PR with complete evidence and no truncation; otherwise disclose missing coverage and emit `PRS-AUDIT-PARTIAL`.

`--deep` is a separate bounded escalation for at most five CI-failing, conflicting, or changes-requested PRs. It cannot alter baseline classification. Diff correctness is outside audit scope; do not invent a review command.

Default is report-only. Actions are independent and require exact target/body/label/close previews plus confirmation. `--dry-run` prints the identical plan and writes nothing. Proof comments retain `<!-- pr-audit-proof -->` and update the existing marked comment. Label application skips absent labels without creating them. Close touches only targets older than `--close-stale-days`. Immediately before confirmed action, reacquire/classify under the same run with `freshPreAction:true`. Never call `gh pr ready` or merge.
