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

1. **Identify the current branch and latest commit:**

```bash
BRANCH=$(git branch --show-current)
SHA=$(git rev-parse --short HEAD)
echo "Branch: $BRANCH | Commit: $SHA"
```

2. **Find the latest CI run for this branch:**

```bash
gh api "repos/ryaneggz/open-harness/actions/runs?branch=$BRANCH&per_page=1" \
  --jq '.workflow_runs[0] | {id: .id, status: .status, conclusion: .conclusion, head_sha: .head_sha[:7], name: .name}'
```

3. **If the run is still in progress, poll every 15 seconds (max 5 minutes):**

```bash
RUN_ID=<id from step 2>
for i in $(seq 1 20); do
  STATUS=$(gh api "repos/ryaneggz/open-harness/actions/runs/$RUN_ID" --jq '.status')
  if [ "$STATUS" = "completed" ]; then
    break
  fi
  echo "Still running... ($i/20)"
  sleep 15
done
```

4. **Check the result:**

```bash
gh api "repos/ryaneggz/open-harness/actions/runs/$RUN_ID" \
  --jq '{status: .status, conclusion: .conclusion, url: .html_url}'
```

5. **If failed, get the failure details:**

```bash
# Get the failed job ID
JOB_ID=$(gh api "repos/ryaneggz/open-harness/actions/runs/$RUN_ID/jobs" \
  --jq '.jobs[] | select(.conclusion == "failure") | .id')

# Get the failure context (15 lines before the error)
gh api "repos/ryaneggz/open-harness/actions/jobs/$JOB_ID/logs" 2>&1 \
  | grep -B 15 "Process completed with exit code" | head -25
```

6. **Report the result:**

- **PASS**: Report "CI green" with the run URL
- **FAIL**: Report the failing step, error message, and suggest a fix. Then fix the issue, commit, push, and run `/ci-status` again
- **NO RUN**: If no CI run exists for the current commit, the push may not have triggered CI (check branch filter in `.github/workflows/ci.yml`)

## CI Pipeline Steps

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
