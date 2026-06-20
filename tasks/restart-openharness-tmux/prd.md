# PRD — Scheduled tmux-server restart to clear stale `system-cron` argv (#273)

## Problem

The sandbox tmux **server** permanently advertises the argv of the first session that spawned
it (~2026-05-29): `tmux new-session -d -s system-cron … cron-runtime.ts …`. The `system-cron`
*session* is long dead and the canonical cron session today is `cron-system`, but tmux cannot
rewrite a running server's argv. The stale string already caused one mis-diagnosis (a session
recovery nearly killed the load-bearing server thinking it was a hung client). Cosmetic, but
worth clearing once.

## Approach (spec-* operative path)

This task folder is the **spec-plan** artifact; `critique.md` is the **spec-critique** pass;
`scripts/maintenance/restart-openharness-tmux.sh` is the **spec-execute** artifact. There is no
code feature and no PR to merge — the deliverable is an operational restart, so spec-execute =
*run the reviewed runbook-as-code*, not *build + open a PR*.

The only fix is a full `tmux kill-server` + relaunch of the durable session stack; the first
post-kill `new-session` becomes the new server and defines its clean argv.

## Trigger

The `crons/heartbeat.md` one-shot **date-gated step** (mirrors the #264 weekly-step pattern):
at `TZ=America/Denver` date `2026-06-20`, hour `12`, the heartbeat launches the script
**detached** (`setsid`) — required because `kill-server` kills the heartbeat agent's own
session. Auto-execute was the operator's explicit choice (drops `mifune.dev` for a brief
named-tunnel reconnect; same URL).

## Success signal

- New tmux server no longer advertises `-s system-cron`.
- Every durable session that was **live at capture** is relaunched (the `cron-system` /
  `cron-watchdog` core is always expected); a session that wasn't running at the time — e.g. a
  transient `app-website-preview` — is neither relaunched nor flagged missing.
- `crons/.pid` names a **live** runtime (`kill -0`) — required for success, not just a session
  that exists.
- `https://mifune.dev/` returns 200 — verified but **informational** (named tunnel, URL
  unchanged; rebuilds on its own, so it does NOT gate success).
- `#273` closed by the script on success (left open + commented if degraded).

## Out of scope

- Editing `scripts/cron-runtime.ts`. The website/app process behavior. Any non-tmux infra.
