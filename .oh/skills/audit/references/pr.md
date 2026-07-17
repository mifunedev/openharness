# Audit one pull request

Validate a positive PR number and optional `--repo owner/name` before starting. Resolve an omitted repository once with `gh repo view --json nameWithOwner -q .nameWithOwner` from `AUDIT_ROOT`. Acquire with `$AUDIT_ROOT/.oh/skills/audit/scripts/pr-acquire.sh pr --repo "$REPO" --pr "$N"`, then pipe the schema-versioned envelope to `$AUDIT_ROOT/.oh/skills/audit/scripts/pr-classify.sh`. Acquisition failure or incomplete evidence is unknown; never infer readiness.

Render one compact evidence table from classifier JSON: number, CI, mergeability, clean state, review decision, primary state, flags, and the distinct `readyForReview`/`readyToMerge` booleans. Do not re-derive fields.

Emit `PR-AUDIT-PROMOTABLE` iff `.promotable == true && .evidenceComplete == true`; emit `PR-AUDIT-BLOCKED` for complete non-promotable evidence; otherwise emit `PR-AUDIT-UNKNOWN`.

`--deep` may add bounded root-cause evidence for this PR but cannot alter classification. Diff correctness is outside audit scope. `--proof` is the sole focused write: preview the exact idempotent `<!-- pr-audit-proof -->` comment and require confirmation; `--dry-run` writes nothing. Re-acquire and classify immediately before a confirmed write, tagged `freshPreAction: true`. Never call `gh pr ready` or merge.
