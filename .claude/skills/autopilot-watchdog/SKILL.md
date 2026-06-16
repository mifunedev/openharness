---
name: autopilot-watchdog
description: "Ad-hoc and heartbeat watchdog for the autopilot loop: kills truly stuck sessions, surfaces long-lived sessions, ready PRs, draft PRs stale after 2h, and draft-cap saturation without auto-undrafting or closing."
argument-hint: "[--stale-hours <n>] [--daily-cap <n>] [--repo <owner/name>]"
---

# Autopilot Watchdog

## Purpose

Run this whenever you need to check whether the hourly `/autopilot` loop is
jammed. It is safe to run ad-hoc, and the heartbeat cron must invoke this skill
each time it wakes up instead of carrying its own copy of the watchdog logic.

The watchdog has one autonomous mutation: kill tmux sessions frozen at terminal
interactive prompts they cannot clear. PR handling is **surface-only**. In
particular, draft PR age/backlog is never authorization to run `gh pr ready`,
`gh pr close`, or `gh pr merge`.

## Inputs

- `--stale-hours <n>`: draft PR stale threshold. Default: `2` hours.
- `--daily-cap <n>`: same-day open autopilot PR cap. Default: `6`.
- `--repo <owner/name>`: target repo. Default: derive with `gh repo view`.

## Procedure

1. Resolve the repo and thresholds:

   ```bash
   REPO="${REPO_OVERRIDE:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
   AUTOPILOT_DRAFT_STALE_HOURS="${AUTOPILOT_DRAFT_STALE_HOURS:-2}"
   AUTOPILOT_DAILY_CAP="${AUTOPILOT_DAILY_CAP:-6}"
   ```

2. **Stuck sessions (KILL — autonomous nudge).** Kill only sessions frozen at
   terminal prompts the cron cannot clear on its own:

   ```bash
   for s in $(tmux ls 2>/dev/null | grep -oE '^(cron-)?autopilot-[^:]*'); do
     if tmux capture-pane -p -t "$s" 2>/dev/null | tail -25 \
          | grep -qiE 'hit your (usage|session) limit|session limit|/usage-credits|/upgrade|Resume from summary|Resume full session'; then
       tmux kill-session -t "$s"; rm -f "/tmp/$s.keep" "/tmp/$s.pid"
       echo "NUDGE: killed stuck autopilot session $s (frozen at a usage-limit/resume prompt)"
     fi
   done
   # sweep orphaned keep-markers (session already gone)
   for m in /tmp/cron-autopilot-*.keep /tmp/autopilot-*.keep; do [ -e "$m" ] || continue; \
     s=$(basename "$m" .keep); tmux has-session -t "$s" 2>/dev/null || rm -f "$m"; done
   # reap fallback worktrees that NO live tmux pane is working inside.
   cwds="$(tmux list-panes -a -F '#{pane_current_path}' 2>/dev/null)"
   for d in .worktrees/cron/*/; do [ -d "$d" ] || continue; \
     abs="$(cd "$d" && pwd)"; \
     printf '%s\n' "$cwds" | grep -qxF "$abs" || printf '%s\n' "$cwds" | grep -qF "$abs/" \
       || git worktree remove --force "$d" 2>/dev/null || true; done
   git worktree prune 2>/dev/null || true
   ```

3. **Long-lived sessions (SURFACE — never kill on age).** Surface an autopilot
   tmux session alive longer than 90 minutes unless Step 2 already killed it:

   ```bash
   now_epoch=$(date -u +%s)
   tmux ls 2>/dev/null | grep -oE '^(cron-)?autopilot-[^:]*' | while read -r s; do
     pid_file="/tmp/$s.pid"
     [ -f "$pid_file" ] || continue
     start_epoch=$(stat -c %Y "$pid_file" 2>/dev/null || echo "$now_epoch")
     age_s=$(( now_epoch - start_epoch ))
     age_m=$(( age_s / 60 ))
     if [ "$age_m" -gt 90 ]; then
       echo "WATCHING: autopilot session $s alive ${age_m}m — verify it is not hung"
     fi
   done
   ```

4. **Ready / jammed-loop PRs (SURFACE — never merge).** Surface green,
   mergeable, non-draft autopilot PRs as operator merge nudges:

   ```bash
   gh pr list --repo "$REPO" --state open --label autopilot --limit 100 \
     --json number,isDraft,mergeable,mergeStateStatus \
     --jq '.[] | select(.isDraft==false and .mergeable=="MERGEABLE" and .mergeStateStatus=="CLEAN") | .number' \
     | while read -r n; do
         [ -n "$n" ] || continue
         echo "NUDGE: autopilot PR #$n is green + mergeable — merge to free the queue"
       done
   ```

5. **Stale draft autopilot PRs (WATCHDOG — surface only).** A draft autopilot PR
   is stale after more than **2 hours** in draft with no update. Draft age alone
   never authorizes mutation:

   ```bash
   today=$(date -u +%Y-%m-%d)
   now_epoch=$(date -u +%s)
   draft_rows=$(gh pr list --repo "$REPO" --state open --label autopilot --limit 100 \
     --json number,isDraft,updatedAt,createdAt,headRefName \
     --jq '.[] | select(.isDraft==true) | [.number,.updatedAt,.createdAt,.headRefName] | @tsv')
   printf '%s\n' "$draft_rows" \
     | while IFS=$'\t' read -r n updated _created branch; do
         [ -n "$n" ] || continue
         updated_epoch=$(date -u -d "$updated" +%s 2>/dev/null || echo "$now_epoch")
         age_s=$(( now_epoch - updated_epoch ))
         age_h=$(( age_s / 3600 ))
         age_m=$(( age_s / 60 ))
         if [ "$age_s" -gt $(( AUTOPILOT_DRAFT_STALE_HOURS * 3600 )) ]; then
           echo "WATCHDOG: stale autopilot draft PR #$n updated ${age_h}h (${age_m}m) ago — investigate branch $branch; do not auto-undraft/close"
         fi
       done
   today_drafts=$(printf '%s\n' "$draft_rows" | awk -F '\t' -v today="$today" '$3 ~ "^" today { c++ } END { print c+0 }')
   if [ "$today_drafts" -ge "$AUTOPILOT_DAILY_CAP" ]; then
     draft_list=$(printf '%s\n' "$draft_rows" | awk -F '\t' '$1 { printf "%s#%s(%s)", sep, $1, $4; sep=", " }')
     echo "WATCHDOG: autopilot draft backlog saturates daily cap (${today_drafts}/${AUTOPILOT_DAILY_CAP} today) — investigate/promote/close one of: ${draft_list}; do not auto-undraft/close"
   fi
   ```

## Reporting Contract

Emit only these prefixes so callers can embed this skill in cron output:

- `NUDGE:` — a stuck session was killed, or a ready non-draft PR needs operator merge.
- `WATCHING:` — a long-lived session needs a human glance.
- `WATCHDOG:` — a draft PR is stale after 2h, or draft backlog saturated the daily cap.

No output means the autopilot loop has no watchdog findings.

## Common Pitfalls

1. **Using 24h for draft staleness.** The stale threshold is 2 hours. A draft PR
   older than 2h is enough to surface a `WATCHDOG` line.
2. **Auto-undrafting stale drafts.** Do not. Only a fresh `/pr-audit` promotable
   classification immediately before `gh pr ready` can authorize undrafting.
3. **Duplicating this logic in cron.** `crons/heartbeat.md` should point to this
   skill and include its emitted lines; the skill is the reusable ad-hoc entrypoint.
4. **Killing long-lived sessions by age.** Age is a surface-only signal. Kill only
   the explicit frozen-prompt patterns in Step 2.

## Verification Checklist

- [ ] Ad-hoc run emits stale drafts after 2h, not 24h.
- [ ] Heartbeat cron invokes `/autopilot-watchdog` instead of embedding its own copy.
- [ ] Stale draft and cap-saturation output includes `do not auto-undraft/close`.
- [ ] No PR mutation command appears in draft-handling steps.
- [ ] `evals/probes/autopilot-stale-draft-watchdog.sh` passes.
