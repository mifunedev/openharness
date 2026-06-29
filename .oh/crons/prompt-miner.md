---
id: prompt-miner
schedule: "0 5 * * *"
timezone: America/Denver
enabled: true
overlap: false
catchup: false
tmux: true
worktree: true
preflight: .oh/skills/prompt-miner/prompt-miner-caps.sh
repo: mifunedev/openharness
description: Daily prompt-miner — mine 24h of session traces for prompt-quality markers and ship a top finding to the origin fork via /ship-spec (opt-in, cap-gated)
---

# prompt-miner

You are running on a daily prompt-miner cycle, inside your own detached tmux
session **in an isolated git worktree** (`$CRON_WORKTREE`, set by the cron runtime
because this cron declares `worktree: true`). The shared root checkout is never
touched for source/branch work. Your job is to mine the last 24h of session
traces for a high-confidence prompt-quality marker and, when one clears the bar,
ship it to the **origin fork** through `/ship-spec` — never upstream, never
auto-merged.

This cron is **opt-in and cap-gated**:

- **Kill-switch**: this cron ships `enabled: false`. It does not fire until an
  operator flips it to `enabled: true` and reloads the runtime (`SIGHUP` —
  `kill -HUP "$(cat .oh/crons/.pid)"` from inside the container). Disabling again is a
  one-line edit + reload; never delete the file (preserves history).
- **Caps**: the `preflight: .oh/skills/prompt-miner/prompt-miner-caps.sh` gate
  runs **before** any worktree/tmux/agent and counts open PRs labeled
  `prompt-miner` on `mifunedev/openharness`. On a capped day it logs `SKIPPED-CAP-*`
  + liveness and spawns nothing. Caps are origin-scoped (the wrapper re-points
  `.oh/skills/autopilot/autopilot-caps.sh` at the fork + the `prompt-miner` label).

## Steps

### 1. Mine the last 24h (report-only)

Run the interactive skill in report-only mode over the 24h window — `--hours`
avoids the midnight-UTC double-count/miss that `--since`/`--until` (YYYY-MM-DD
day-granularity) would introduce:

```bash
/prompt-miner --hours 24 --report-only
```

This writes `.oh/memory/<today>/prompt-miner-<date>.md` (+ `.json`) and appends the
mandatory `.oh/memory/<today>/log.md` entry via `render-log-entry.sh`. `--report-only`
**never** edits `.oh/memory/MEMORY.md` or `.oh/context/IDENTITY.md`. Surface the top
mined markers in the daily log so a human can review the run without attaching.

### 2. Decide: candidate or stop

Read the mined markers (stratified by session type; see `references/markers.md`):

- **If a marker clears the bar** (`sessions_supporting ≥ 10` AND `effect_size ≥ 0.3`
  within a single session-type stratum): ensure the `prompt-miner` label exists on
  the fork, then file (or reuse) an origin issue labeled `prompt-miner` describing
  the improvement the marker motivates:

  ```bash
  gh label create prompt-miner --repo mifunedev/openharness --color FBCA04 \
    --description "prompt-miner-sourced improvement" 2>/dev/null || true
  gh issue create --repo mifunedev/openharness --label prompt-miner \
    --title "<short marker-driven improvement>" --body "<marker + evidence>"
  ```

- **Otherwise** append `NO-CANDIDATE` (corpus large enough, nothing cleared the
  bar) or `NO-CORPUS` (no stratum reached the `sessions_supporting ≥ 10` floor) to
  the daily log and **stop**. No issue, no branch, no PR.

### 3. Ship the candidate to origin via `/ship-spec`

Hand the issue to `/ship-spec`, which owns the build end-to-end (worktree Advisor,
`/delegate` + ralph, the `/eval` gate, `/pr-audit` undraft) and targets the fork:

```bash
/ship-spec --repo mifunedev/openharness --base development --issue <N>
```

Capture the **created PR number**, then label the PR itself — GitHub does **not**
propagate the issue's label onto the PR, so an unlabeled PR would silently defeat
the cap (the preflight counts PRs by label, not issues):

```bash
gh pr edit <PR> --repo mifunedev/openharness --add-label prompt-miner
```

### 4. Append the liveness line

Append a `.oh/crons/.cron.log` liveness line, resolving the **shared root** under
worktree mode (the worktree is reaped after the run; humans + heartbeat read the
root checkout). Mirror the autopilot convention: honor `$AUTOPILOT_LOG_ROOT` if
set, else map `$CRON_WORKTREE` back to its shared root, else the current toplevel.

```bash
ROOT="${AUTOPILOT_LOG_ROOT:-$(git -C "${CRON_WORKTREE:-.}" worktree list --porcelain 2>/dev/null | awk 'NR==1{sub(/^worktree /,"");print;exit}')}"
ROOT="${ROOT:-$(git rev-parse --show-toplevel)}"
printf '[%s]\tprompt-miner\t%s\t%s\n' "$(date -Iseconds)" "<STATUS>" "<msg>" \
  | "$ROOT/.oh/scripts/locked-append.sh" "$ROOT/.oh/crons/.cron.log"
```

## Guarantees

- **Never auto-merge.** This cron opens a PR and labels it; a human merges.
- **Never edit `.oh/memory/MEMORY.md` or `.oh/context/IDENTITY.md` directly.** Improvements
  land as loop-gated PRs through `/ship-spec` (which does not walk retro/compound),
  never as unattended memory/identity mutations. The interactive `/prompt-miner`
  Step-4 gate is the only memory-writing path, and it requires human `APPROVE`.
- **Origin-only.** Issue, PR, and ground-truth cross-ref target
  `mifunedev/openharness` / `origin/development` — never `upstream`/`mifunedev`.
- **Harness-infra scope only** (skills/rules/docs/scripts/crons/wiki).
