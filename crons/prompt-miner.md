---
id: prompt-miner
schedule: "0 5 * * *"
timezone: America/Denver
enabled: false
overlap: false
catchup: false
tmux: true
repo: mifunedev/openharness
description: Daily prompt-miner — mine 24h of session traces for prompt-quality markers and ship a top finding to the origin fork via /spec (opt-in, cap-gated)
---

# prompt-miner

You are running on a daily prompt-miner cycle, inside your own detached tmux
session. Create an isolated `/worktrees` checkout for any source or branch work so
the shared root checkout stays clean. Your job is to mine the last 24h of session
traces for a high-confidence prompt-quality marker and, when one clears the bar,
ship it to the **origin fork** through `/spec` — never upstream, never
auto-merged.

This cron is **opt-in and cap-gated**:

- **Kill-switch**: this cron is currently `enabled: false` in the frontmatter above
  and does not fire. To start it, flip that line to `enabled: true` and reload the
  runtime (`SIGHUP` — `kill -HUP "$(cat crons/.pid)"` from inside the
  container); disabling again is the same one-line edit + reload. Never delete the
  file (preserves history). The frontmatter `enabled:` value is the single source
  of truth — this paragraph previously claimed the cron shipped disabled while the
  tracked file said otherwise (issue #663 review).
- **Caps**: THIS CRON IS CURRENTLY UNCAPPED. Its `preflight:` gate was removed in
  0.3.0 with the autopilot machinery it was built on — the gate had no enabled
  consumer. The cron ships `enabled: false`, so nothing runs uncapped today.
  **Before flipping `enabled: true`, restore a cap gate** that counts open PRs
  labeled `prompt-miner` on `mifunedev/openharness` and wire it back as
  `preflight:`; recover the previous implementation from git history
  (`git log -- .oh/skills/autopilot/autopilot-caps.sh`).

## Steps

### 1. Mine a trailing 14-day corpus (report-only)

Run the interactive skill in report-only mode. `--hours` avoids the midnight-UTC
double-count/miss that `--since`/`--until` (YYYY-MM-DD day-granularity) would
introduce:

```bash
/prompt-miner --hours 336 --report-only
```

**The mining window is deliberately decoupled from the run cadence.** This cron
fires daily, but it mines a trailing 14 days, because the marker gate needs
`sessions_supporting ≥ 10` inside a *single* session-type stratum
(`references/markers.md`) and a 24h corpus cannot supply that. Measured on the
live corpus 2026-08-03, largest stratum per window: 24h → 4, 168h → 6,
**336h → 18**. A 24h window made `NO-CORPUS` arithmetically guaranteed — which is
what the first 23 runs of this cron reported, every time, without exception
(19 `NO-CORPUS` + 4 `NO-SESSIONS`, zero `MINING-COMPLETE`).

Consecutive daily runs therefore overlap heavily and will re-observe the same
sessions. That is intended: the report is a rolling view of a 14-day corpus, not
a daily delta, and marker promotion is a property of the corpus rather than of
any single day.

This writes `$TMPDIR/oh-prompt-miner/<today>/prompt-miner-<date>.md` (+ `.json`). `--report-only`
**never** writes into the repository. Surface the top mined markers in the
reply so a human can review the run without attaching.

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
  the reply and **stop**. No issue, no branch, no PR.

### 3. Ship the candidate to origin via `/spec`

Hand the issue to `/spec`, which owns plan and build end-to-end (isolated worktree,
single-owner implementation with bounded `/delegate` fan-out, the `/eval` gate, `/audit pr`
undraft) and targets the fork:

```bash
/spec plan --issue <N> --repo mifunedev/openharness --base development
# then, once the operator approves prd.md:
/spec execute <slug> --repo mifunedev/openharness --base development
```

Capture the **created PR number**, then label the PR itself — GitHub does **not**
propagate the issue's label onto the PR, so an unlabeled PR would silently defeat
the cap once a preflight gate is restored (it counts PRs by label, not issues):

```bash
gh pr edit <PR> --repo mifunedev/openharness --add-label prompt-miner
```

### 4. Append the liveness line

Append a `crons/.cron.log` liveness line against the **shared root** (humans +
heartbeat read the root checkout, never a build worktree). Honor `$CRON_LOG_ROOT`
if set, else map the current checkout back to its shared root.

```bash
ROOT="${CRON_LOG_ROOT:-$(git worktree list --porcelain 2>/dev/null | awk 'NR==1 && $1 == "worktree" { sub(/^worktree /,""); print; exit }' || true)}"
ROOT="${ROOT:-$(git rev-parse --show-toplevel)}"
printf '[%s]\tprompt-miner\t%s\t%s\n' "$(date -Iseconds)" "<STATUS>" "<msg>" \
  | "$ROOT/.oh/scripts/locked-append.sh" "$ROOT/crons/.cron.log"
```

## Guarantees

- **Never auto-merge.** This cron opens a PR and labels it; a human merges.
- **Never edit tracked harness files directly.** Improvements land as
  loop-gated PRs through `/spec` (whose execute node walks retro/compound),
  never as unattended mutations. The interactive `/prompt-miner` Step-4 gate only
  proposes a probe, and it requires human `APPROVE`.
- **Origin-only.** Issue, PR, and ground-truth cross-ref target
  `mifunedev/openharness` / `origin/development` — never `upstream`/`mifunedev`.
- **Harness-infra scope only** (skills/rules/docs/scripts/crons/wiki).
