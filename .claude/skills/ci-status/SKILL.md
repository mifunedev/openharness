---
name: ci-status
description: |
  Check the CI pipeline status for the current branch after pushing changes.
  Reports pass/fail with failure details. Use this after every push to confirm
  your changes are truly done — CI must be green.
  TRIGGER when: after git push, after committing changes, when asked to check CI,
  or when verifying that work is complete.
---

# CI Status

Monitor the GitHub Actions CI pipeline for the current branch. A feature is not done until CI passes.

## Instructions

1. **Identify the current branch, commit, and target repo:**

```bash
BRANCH=$(git branch --show-current)
SHA=$(git rev-parse --short HEAD)
echo "Branch: $BRANCH | Commit: $SHA"

# Repo: explicit --repo owner/name, else derive from the current checkout's origin.
# gh repo view resolves the checkout's origin remote — the repo where the branch/PR lives.
# To override (e.g. when testing against a different fork), set REPO_OVERRIDE=owner/name.
if [ -n "$REPO_OVERRIDE" ]; then
  case "$REPO_OVERRIDE" in
    */*) REPO="$REPO_OVERRIDE" ;;
    *) echo "ERROR: --repo must be owner/name format (got '$REPO_OVERRIDE')"; exit 1 ;;
  esac
else
  REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
fi
[ -n "$REPO" ] || { echo "ERROR: could not derive repo — is gh authenticated? Try: gh auth login"; exit 1; }
echo "Repo: $REPO"
```

2. **Prefer an open PR's checks (PR-first path):**

Derive the PR number for the current branch. When multiple open PRs share the head branch (stacked PRs), the first/most-recent is used. An empty `PR_NUMBER` means no open PR and routes to the branch-runs fallback in steps 3–6.

```bash
PR_NUMBER=$(gh pr list --head "$BRANCH" --state open --repo "$REPO" \
  --json number --jq '.[0].number')

if [ -n "$PR_NUMBER" ]; then
  echo "Open PR found: #$PR_NUMBER — checking PR checks directly"
  gh pr checks "$PR_NUMBER" --repo "$REPO"
  # Also available: gh pr view "$PR_NUMBER" --repo "$REPO" --json statusCheckRollup
  # If gh pr checks returns no rows, report NO-RUN (see step 7 — no checks were triggered).
  # Exit here if the PR checks output is definitive (pass/fail visible).
  # Otherwise fall through to the branch-runs fallback below for more detail.
else
  echo "No open PR for branch $BRANCH — using branch-runs fallback"
fi
```

3. **No-PR fallback: find the latest CI run for this branch:**

```bash
gh api "repos/$REPO/actions/runs?branch=$BRANCH&per_page=1" \
  --jq '.workflow_runs[0] | {id: .id, status: .status, conclusion: .conclusion, head_sha: .head_sha[:7], name: .name}'
```

4. **If the run is still in progress, poll every 15 seconds (max 5 minutes):**

```bash
RUN_ID=<id from step 3>
for i in $(seq 1 20); do
  STATUS=$(gh api "repos/$REPO/actions/runs/$RUN_ID" --jq '.status')
  if [ "$STATUS" = "completed" ]; then
    break
  fi
  echo "Still running... ($i/20)"
  sleep 15
done
```

5. **Check the result:**

```bash
gh api "repos/$REPO/actions/runs/$RUN_ID" \
  --jq '{status: .status, conclusion: .conclusion, url: .html_url}'
```

6. **If failed, get the failure details:**

```bash
# Get the failed job ID
JOB_ID=$(gh api "repos/$REPO/actions/runs/$RUN_ID/jobs" \
  --jq '.jobs[] | select(.conclusion == "failure") | .id')

# Get the failure context (15 lines before the error)
gh api "repos/$REPO/actions/jobs/$JOB_ID/logs" 2>&1 \
  | grep -B 15 "Process completed with exit code" | head -25
```

7. **Report the result:**

- **PASS**: Report "CI green" with the run URL
- **FAIL**: Report the failing step, error message, and suggest a fix. Then fix the issue, commit, push, and run `/ci-status` again
- **NO RUN**: No workflow's `on:` filter matched the push, or `PR_NUMBER` was set but `gh pr checks` returned no rows (the PR exists but no workflows were triggered yet). *(Note: the workflow names below reflect this harness's layout and may differ in other checkouts.)*
  - `ci-harness.yml` — push only: `packages/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, itself
  - `docs.yml` — PR or push-to-main: `docs/**`, `apps/docs/**`, `blog/**`, itself
  - `conciseness.yml` — push or PR: `workspace/*.md`, `workspace/.claude/rules/*.md`, itself
  - `release.yml` — tag push only

  Infrastructure-only PRs (devcontainer/scripts/install/) trigger NOTHING on push — that's expected. `pull_request`-event workflows still fire when the PR opens. Diagnose with: `git diff --name-only HEAD~1 HEAD` and compare against each workflow's `on:` block.

## CI Pipeline Steps

*(Note: the steps below reflect this harness's CI layout and may differ in other checkouts.)*

This project's CI (`CI: Harness`) runs these steps in order:

1. Lint (`pnpm run lint`)
2. Format check (`pnpm run format:check`)
3. Type check (`pnpm run type-check`)
4. Prisma generate (`pnpm exec prisma generate`)
5. Prisma migrate (`npx prisma migrate deploy`)
6. Build (`pnpm run build`)
7. Test (`pnpm test`)
8. Playwright E2E (`pnpm run test:e2e`)

## Local Pre-flight

Before pushing, you can run the same checks locally to catch issues early:

```bash
pnpm -r run lint && pnpm -r run format:check && pnpm -r run build && pnpm -r run test
```
