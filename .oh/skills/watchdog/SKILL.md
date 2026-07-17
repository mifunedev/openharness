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
AUDIT_ROOT="${AUDIT_ROOT:-$(git rev-parse --show-toplevel)}"
AUDIT_ROOT=$(cd "$AUDIT_ROOT" && pwd -P)
export AUDIT_ROOT
```

## Action: autopilot draft PRs

Goal: determine whether draft PRs are stuck or stale, complete them when
possible, and remove the draft state only after verification. A draft PR is not
a final nudge; it is unfinished work that the watchdog should drive to a
ready-for-review PR when safe.

### 1. Fetch draft candidates in one query

Create an invocation-scoped temporary directory with `mktemp -d` and an
`EXIT INT TERM HUP` cleanup trap. Acquire candidates once through the shared seam:

```bash
AUDIT_RUN_ID="${AUDIT_RUN_ID:-audit-$(date -u +%Y%m%dT%H%M%SZ)-watchdog-$BASHPID}"
WATCHDOG_TMP=$(mktemp -d "${TMPDIR:-/tmp}/${AUDIT_RUN_ID}.watchdog.XXXXXX")
trap 'rm -rf "$WATCHDOG_TMP"' EXIT INT TERM HUP
"$AUDIT_ROOT/.oh/skills/audit/scripts/pr-acquire.sh" prs \
  --repo "$WATCHDOG_REPO" --label autopilot \
  | "$AUDIT_ROOT/.oh/skills/audit/scripts/pr-classify.sh" >"$WATCHDOG_TMP/candidates.json"
```

Select records with `.isDraft == true`. If none exist, report
`WATCHDOG_OK: no autopilot draft PRs`. Acquisition/classification failure is a
watchdog failure, never an empty clean result.

### 2. Classify each draft

Consume classifier fields; never re-derive CI, mergeability, readiness, age, or
promotability from raw GitHub JSON. Convert `WATCHDOG_STALE_HOURS` to the queue
classifier's day threshold only for candidate prioritization. Treat `.ci == "NONE"`
or `"UNKNOWN"`, `.evidenceComplete != true`, and `.promotable != true` as blocked.
A missing active tmux session may establish stuckness, but cannot override the
classifier's readiness fields.

### 3. Safe actions

Allowed mutations:

1. **Promotable draft → mark ready.** Immediately before the mutation, perform a
   fresh focused acquisition and classification under the same run:
   ```bash
   "$AUDIT_ROOT/.oh/skills/audit/scripts/pr-acquire.sh" pr --repo "$WATCHDOG_REPO" --pr "$PR" \
     | "$AUDIT_ROOT/.oh/skills/audit/scripts/pr-classify.sh" >"$WATCHDOG_TMP/pre-action-$PR.json"
   jq -e '.isDraft == true and .ci == "PASS" and .evidenceComplete == true
          and .readyForReview == true and .promotable == true' \
     "$WATCHDOG_TMP/pre-action-$PR.json" >/dev/null || exit 1
   gh pr ready "$PR" --repo "$WATCHDOG_REPO"
   ```
   `NONE` is never accepted, even when local targeted checks passed. Then verify a
   fresh `gh pr view` reports `isDraft == false`.

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

Required from the immediately preceding shared focused classifier JSON:

- `isDraft == true`
- `ci == "PASS"` (`NONE`, `PENDING`, and `UNKNOWN` are blocked)
- `evidenceComplete == true`
- `readyForReview == true`
- `promotable == true`

Do not inspect `statusCheckRollup` independently or substitute local checks for
missing GitHub CI.

After `gh pr ready`, re-read the PR and require `isDraft == false`.

## Action: autopilot tmux sessions

For `cron-autopilot-*` or legacy `autopilot-*` tmux sessions, kill only under one
of two objective conditions. **Age alone is never sufficient. Age alone is not enough.**

### 1. Frozen prompt sessions

Kill when the pane tail shows a terminal prompt the detached run cannot clear
itself: Claude usage/session limits, Codex zero-credit/usage-limit errors
(`usage_limit_reached`, `status_code 429`, `Credits-Balance":"0`), `/upgrade`,
`Resume from summary`, `Resume full session`, or a fatal error banner.

```bash
for s in $(tmux ls 2>/dev/null | grep -oE '^(cron-)?autopilot-[^:]*'); do
  if tmux capture-pane -p -t "$s" 2>/dev/null | tail -80 \
       | grep -qiE 'hit your (usage|session) limit|session limit|/usage-credits|/upgrade|Resume from summary|Resume full session|usage_limit_reached|status_code["[:space:]:]+429|Credits-Balance["[:space:]:]+0'; then
    tmux kill-session -t "$s"; rm -f "/tmp/$s.keep"
    echo "NUDGE: killed stuck session $s"
  fi
done
```

### 2. Completed autopilot PR sessions

A kept `autopilot-<branch>` session is useful while its PR is open. After the
associated PR is terminal (`MERGED` or `CLOSED`), it is safe to reap only if the
pane is idle/static. Preserve every session with an open PR, and preserve any
terminal-PR session whose pane changes between two captures.

Implementation pattern:

```bash
safe_branch_session() { printf '%s' "autopilot-$1" | tr '/:' '--' | tr '[:space:]' '-' | tr -cd 'A-Za-z0-9_.=-'; }
idle_session() {
  local s="$1" a b
  a=$(tmux capture-pane -p -t "$s" 2>/dev/null | md5sum | awk '{print $1}') || return 1
  sleep 3
  b=$(tmux capture-pane -p -t "$s" 2>/dev/null | md5sum | awk '{print $1}') || return 1
  [ "$a" = "$b" ]
}

# Compare session names to sanitized headRefName values instead of relying only
# on string surgery from the session name back to a branch.
gh pr list --repo "$WATCHDOG_REPO" --state all --limit 100 \
  --json number,state,headRefName > /tmp/watchdog-prs-all.json

for s in $(tmux ls 2>/dev/null | grep -oE '^autopilot-[^:]*'); do
  pr=$(jq -r --arg s "$s" '
    .[] | select(("autopilot-" + (.headRefName | gsub("[/:[:space:]]"; "-") | gsub("[^A-Za-z0-9_.=-]"; ""))) == $s)
        | @base64' /tmp/watchdog-prs-all.json | head -1)
  [ -n "$pr" ] || continue
  state=$(printf '%s' "$pr" | base64 -d | jq -r .state)
  number=$(printf '%s' "$pr" | base64 -d | jq -r .number)
  case "$state" in
    MERGED|CLOSED)
      if idle_session "$s"; then
        tmux kill-session -t "$s"; rm -f "/tmp/$s.keep"
        echo "NUDGE: reaped completed autopilot session $s (PR #$number $state)"
      else
        echo "WATCHING: completed autopilot session $s still active"
      fi
      ;;
    *)
      echo "WATCHING: autopilot session $s has open PR #$number"
      ;;
  esac
done
```

Never kill a session merely because it is old. The terminal PR state plus the
idle double-capture is the safety gate.

## Reporting

- No candidates: `WATCHDOG_OK: <action>`
- Draft marked ready: `NUDGE: completed draft PR #<n> and marked ready`
- Draft needs work: `NUDGE: completing stale draft PR #<n> (<reason>)`
- Active but not stale: `WATCHING: draft PR #<n> still active`
- Stuck session killed: `NUDGE: killed stuck session <s>`
- Completed session reaped: `NUDGE: reaped completed autopilot session <s> (PR #<n> <state>)`
- Terminal session still active: `WATCHING: completed autopilot session <s> still active`

## Common Pitfalls

- Do not treat a draft PR as a merge nudge. First decide if it is promotable;
  otherwise finish the work.
- Do not run `gh pr ready` on red, pending, dirty, behind, or conflicting PRs.
- Do not merge. Watchdog completion stops at ready-for-review.
- Do not kill autopilot tmux sessions on age alone; require a frozen prompt OR
  terminal PR state plus an idle double-capture.
- Do not derive the repo from the local checkout for Open Harness automation;
  default to `mifunedev/openharness` and accept explicit `--repo` overrides.
