---
name: watchdog
description: |
  Generic watchdog for stuck or stale automation. Inspects one or more action
  classes, determines whether they are merely slow vs actually stuck/stale, and
  takes the smallest safe completion action. Includes the autopilot draft-PR
  watchdog: stale draft PRs should be completed and marked ready for review,
  not merely surfaced as merge nudges.
argument-hint: "[--repo <owner/name>] [--stale-hours <n>] [--action <autopilot-drafts|sessions|all>] [--dry-run]"
---

# Watchdog

Generic watchdog for automation that can get stuck between observable states.
It is intentionally broader than the old autopilot-specific health nudge: each
watchdog action must define (1) objective stuck/stale signals, (2) safe allowed
mutations, and (3) a terminal verification state.

## When to Use

Use `/watchdog` when an automation loop or long-running action may be wedged:

- heartbeat/cron pulses checking for stuck work
- draft PRs that should have been completed by an autonomous loop
- tmux sessions frozen at usage-limit/resume prompts
- future watchdog classes with similarly objective signals

Default target repo for Open Harness automation: `mifunedev/openharness`.
Override with `--repo owner/name` for tests or forks.

## Arguments

Parse `$ARGUMENTS`:

| Flag | Default | Meaning |
|------|---------|---------|
| `--repo <owner/name>` | `mifunedev/openharness` | GitHub repo to inspect/mutate |
| `--stale-hours <n>` | `2` | Age threshold for draft PR limbo |
| `--action <...>` | `all` | `autopilot-drafts`, `sessions`, or `all` |
| `--dry-run` | false | Report intended actions only |

```bash
WATCHDOG_REPO="${WATCHDOG_REPO:-mifunedev/openharness}"
WATCHDOG_STALE_HOURS="${WATCHDOG_STALE_HOURS:-2}"
WATCHDOG_ACTION="${WATCHDOG_ACTION:-all}"
```

## Action: autopilot draft PRs

Goal: determine whether draft PRs are stuck or stale, complete them when
possible, and remove the draft state only after verification. A draft PR is not
a final nudge; it is unfinished work that the watchdog should drive to a
ready-for-review PR when safe.

### 1. Fetch draft candidates in one query

```bash
gh pr list --repo "$WATCHDOG_REPO" --state open --label autopilot \
  --json number,title,url,headRefName,baseRefName,isDraft,mergeable,mergeStateStatus,statusCheckRollup,updatedAt,labels \
  --jq '.[] | select(.isDraft == true)' > /tmp/watchdog-draft-prs.json
```

If the file is empty, report `WATCHDOG_OK: no autopilot draft PRs`.

### 2. Classify each draft

For each draft PR, derive:

- `age_hours`: hours since `updatedAt`
- `ci`: `PASS`, `FAIL`, `PEND`, or `NONE` from `statusCheckRollup`
- `promotable`: `mergeable == "MERGEABLE" && mergeStateStatus == "CLEAN" && ci == "PASS"`
- `stale`: `age_hours >= WATCHDOG_STALE_HOURS`
- `stuck`: stale plus one of: no active tmux session for the head branch, CI failed,
  merge state dirty/conflicting/behind, or no status/check progress

### 3. Safe actions

Allowed mutations:

1. **Promotable draft → mark ready.** If `promotable`, run:
   ```bash
   gh pr ready <PR> --repo "$WATCHDOG_REPO"
   ```
   Then verify `gh pr view <PR> --repo "$WATCHDOG_REPO" --json isDraft,mergeable,mergeStateStatus`
   reports `isDraft == false`.

2. **Stale/stuck draft → complete work first.** If stale or stuck but not
   promotable, check out the PR branch in an isolated worktree, finish the
   remaining implementation, run the relevant targeted checks/probes, push the
   branch, then mark ready only when the PR is green, mergeable, and clean.
   Use the PR's `headRefName`; do not start a duplicate feature branch.

3. **Slow-but-active draft → watch.** If under the stale threshold or there is
   clear active session/log progress, report `WATCHING: draft PR #<n> still active`.
   Do not mark ready.

Never merge from the watchdog. The terminal state is ready-for-review, not
merged.

### 4. Verification before `gh pr ready`

Before removing draft, verify all of:

```bash
gh pr view <PR> --repo "$WATCHDOG_REPO" \
  --json isDraft,mergeable,mergeStateStatus,statusCheckRollup
```

Required:

- `isDraft == true` before the action
- `mergeable == "MERGEABLE"`
- `mergeStateStatus == "CLEAN"`
- no failing or pending checks in `statusCheckRollup` unless the repo has no checks
  and local targeted checks passed

After `gh pr ready`, re-read the PR and require `isDraft == false`.

## Action: stuck sessions

For `cron-autopilot-*` or legacy `autopilot-*` tmux sessions, kill only when the
pane tail shows a terminal prompt the detached run cannot clear itself: usage or
session limit, `/upgrade`, `Resume from summary`, `Resume full session`, or a
fatal error banner. Age alone is not enough.

```bash
for s in $(tmux ls 2>/dev/null | grep -oE '^(cron-)?autopilot-[^:]*'); do
  if tmux capture-pane -p -t "$s" 2>/dev/null | tail -25 \
       | grep -qiE 'hit your (usage|session) limit|session limit|/usage-credits|/upgrade|Resume from summary|Resume full session'; then
    tmux kill-session -t "$s"; rm -f "/tmp/$s.keep"
    echo "NUDGE: killed stuck session $s"
  fi
done
```

## Reporting

- No candidates: `WATCHDOG_OK: <action>`
- Draft marked ready: `NUDGE: completed draft PR #<n> and marked ready`
- Draft needs work: `NUDGE: completing stale draft PR #<n> (<reason>)`
- Active but not stale: `WATCHING: draft PR #<n> still active`
- Stuck session killed: `NUDGE: killed stuck session <s>`

## Common Pitfalls

- Do not treat a draft PR as a merge nudge. First decide if it is promotable;
  otherwise finish the work.
- Do not run `gh pr ready` on red, pending, dirty, behind, or conflicting PRs.
- Do not merge. Watchdog completion stops at ready-for-review.
- Do not derive the repo from the local checkout for Open Harness automation;
  default to `mifunedev/openharness` and accept explicit `--repo` overrides.
