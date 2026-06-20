# spec-critique — restart-openharness-tmux (#273)

Adversarial pass over the plan + the spec-execute artifact before it goes live. Each risk is
either resolved in the script or accepted with rationale.

| # | Risk | Resolution |
|---|------|------------|
| 1 | **Self-termination** — `tmux kill-server` kills the launcher's own session, so an inline restart can't relaunch. | Launched **detached** (`setsid … &`) by the heartbeat; `trap '' HUP` survives the dying server. The script reparents to init and outlives the kill. |
| 2 | **Stale singleton lock** — after kill, `crons/.pid` still names the dead runtime; cron-runtime boots with `writeFileSync(..,'wx')`. | `acquireLock` (cron-runtime.ts:197-209) self-heals when the named pid is dead; the script also defensively `rm`s a dead-pid `crons/.pid`. The earlier wedge only stuck because that pid was orphaned-but-*alive*; `kill-server` genuinely kills it. |
| 3 | **Watchdog double-launch race** — `cron-watchdog` restarts `cron-system` every 60s. | Relaunch `cron-system` first and confirm `has-session` before launching the watchdog; a stray `new-session` on an existing name is a harmless tmux error, and the runtime lock blocks a second runtime regardless. |
| 4 | **Unknown cwd** (esp. `app-orchestra`'s worker pane) breaks relaunch. | The script captures `pane_current_path` **live** per pane and replays with `tmux … -c "$cwd"`; falls back to `$HARNESS` only if cwd is empty. |
| 5 | **Public downtime** — `mifune.dev` drops. | Named tunnel (`run mifune-web`) → same URL on reconnect; website origin relaunched before the tunnel; verification polls `mifune.dev` up to ~5m through the `npm run build` window. Operator chose the noon slot to be present. |
| 6 | **Argv false-positive** — `system-cron` substring also appears in the watchdog's `tmux has-session -t system-cron`. | The clean-check matches `-s system-cron` (new-session form) only, which the `-t` has-session calls never produce. |
| 7 | **Double-fire** of the heartbeat step (retry, or two pulses in the gated hour). | `flock` + done-sentinel make the script a no-op on re-run; the heartbeat step also touches a per-day sentinel and only the 12:00 pulse matches the gate. |
| 8 | **Transient sessions** (`cron-autopilot-*`, the heartbeat's own session) wrongly relaunched. | Relaunch is an **allowlist**: only `cron-system`, `cron-watchdog`, `app-*`, `expose-public-*`. Transients are intentionally dropped. |

## Adversarial-critic + dry-run findings (resolved before merge)

A `critic` sub-agent and a read-only dry-run against the live sessions surfaced these — all
fixed in the script/heartbeat before merge:

| # | Finding | Resolution |
|---|---------|------------|
| 9 | **HIGH (critic): relative launch path** misfires silently if the agent CWD ≠ harness root, with no retry. | Heartbeat launches via the **absolute** path; gate widened to a `12`-or-`13` retry window (sentinel-guarded). |
| 10 | **HIGH (critic): sentinel under `tasks/`** would trip the Sunday cleanup `BLOCKED-TASKS-WIP` pre-flight. | Sentinel moved to `/tmp/oh-restart-273.done` (script + heartbeat gate). |
| 11 | **HIGH (dry-run): `pane_start_command` is reported WRAPPED in literal `"`** — replaying it verbatim makes `sh -c` exec a single quoted blob → every relaunch fails. | Strip one leading/trailing quote before replay; re-verified the bare `sh -c` string against live data. |
| 12 | **MED (dry-run): fixed verify list** flags a legitimately-stopped session (`app-website-preview` was already gone) as missing → false degraded. | Verify set is derived from the **captured** sessions (+ cron core), not a fixed list. |
| 13 | **MED (critic): `has-session` ≠ live runtime** — a crashed cron pane still "exists". | Success gates on `crons/.pid` naming a `kill -0`-live pid; the watchdog relaunch waits on the same. |
| 14 | **MED (critic): mifune.dev gated success**, so a slow `npm run build` falsely marks degraded. | `mifune.dev` is informational only; success = argv cleared + durable stack back + live runtime. |

**Verdict:** APPROVED for unattended execution. Residual: a degraded relaunch (a session
fails to come back) leaves #273 open with a diagnostic comment and writes no sentinel, so the
operator can re-run. App-orchestra panes whose process was started by manual typing (empty
`pane_start_command`) return as bare shells — a known, documented limitation, not central to
the #273 argv goal.
