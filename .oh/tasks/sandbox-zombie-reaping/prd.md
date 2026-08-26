# Sandbox zombie-process reaping

## Problem

The sandbox accumulates zombie processes without bound. Measured 2026-08-26 in a
live sandbox:

| Metric | Value |
|---|---|
| Zombie processes | **933** |
| Total processes | 1,059 |
| Live (non-zombie) processes | 126 |
| Zombies as share of process table | **88%** |
| `kernel.pid_max` | **4,096** |
| Headroom | ~3,037 PIDs |
| Observed growth | 749 → 933 in ~45 min (**~330/hr**) |
| Oldest zombie age | 1h 22m |

By `comm`: `esbuild` 337, `bash` 245, `sleep` 175, `tmux` 40, `sh` 35, `jq` 25,
`python3` 12, `tail` 9, `node` 8, `pkill` 7. Every one is parented to PID 1.

The spread across unrelated programs is the diagnosis: this is not a leak in any
one tool, it is the absence of a reaper.

At the observed rate the process table reaches `pid_max` in roughly nine hours of
comparable activity. `fork()` then fails and the sandbox cannot start any
process — no agent, no test run, no git. It does not degrade gracefully.

## Root cause

PID 1 in this container is `/init.krun` (MicroSandbox / libkrun microVM init). It
does not reap orphaned children. When a process's parent exits, the orphan
reparents to PID 1 and stays a zombie forever.

`.oh/docs/runtimes/microsandbox.md` § open question 5 predicted exactly this:

> **PID 1 reaping.** Compose sets `init: true`; the msb config has no confirmed
> equivalent. With no reaper, orphaned processes from cron agents and tmux
> sessions may accumulate.

This spec is the measured confirmation of that hypothesis.

## Why the supported path is unaffected

`.devcontainer/docker-compose.yml:94` and
`.devcontainer/docker-compose.image-only.yml:64` both set `init: true`, so on the
Docker path PID 1 is `docker-init`/tini. Orphans from `docker exec` trees
reparent to that and are reaped. No leak exists there.

The leak is specific to containers whose PID 1 is `/init.krun`. Per
`.oh/docs/runtimes/microsandbox.md`, msb's preflight fails in this environment
(glibc 2.36 < 2.39, no `/dev/kvm`), so whatever launched this container did not
come from the shipped compose files.

**Deciding whether krun becomes a supported runtime is out of scope for this
task.** This spec covers only the reaping behavior.

## Where a reaper must sit

`PR_SET_CHILD_SUBREAPER` (prctl 36) is confirmed working in this kernel: a test
process set the flag, orphaned a grandchild, and the grandchild reparented to the
subreaper rather than PID 1 and was reaped.

A subreaper only inherits orphans from processes **beneath it**. The agent
workload does not descend from the entrypoint. Measured ancestry of a live agent
session:

```
zsh(448) → claude(1097) → herdr(579) → PID 1
```

`herdr` is parented directly to PID 1. Agents attach over `docker exec`, which
roots a new tree at PID 1 rather than under the entrypoint's tree. Every zombie in
the census above came from such a tree.

The reaper therefore has to sit at the **head of each exec-rooted tree** — the
shell/herdr launch path — not at the entrypoint.

## Proposed fix

Set `PR_SET_CHILD_SUBREAPER` at the head of exec-rooted sessions, so orphans
reparent to that session's own head instead of to a non-reaping PID 1, and are
reaped there.

Scope is the launch path only. Candidate sites: `.oh/scripts/docker-compose.sh`
(the `exec docker compose` shell verb) and the herdr session launch.

## Rejected alternatives

| Alternative | Why rejected |
|---|---|
| tini as the image `ENTRYPOINT` | Covers only the entrypoint tree. Measured ancestry shows the agent workload is rooted at PID 1 via `docker exec`, in a sibling branch. Would have caught **zero** of the 933 observed zombies. |
| Collapse or remove `init: true` | It is load-bearing on the Docker path and is what keeps that path leak-free. Adding image-level tini beneath it would stack a second reaper that adds nothing, while remaining inert on the krun path. |
| Raise `kernel.pid_max` | Not a repo-side lever. `/proc/sys/kernel/pid_max` is read-only in this container; a write returns permission denied and the value stays 4,096. It also would not stop the leak, only slow the failure. Record as a host/krun observation. |
| Reap the existing 933 zombies | Not possible from inside. Only PID 1 can reap them, and PID 1 will not. A container restart is the operator's action. |

## Verification plan

This change touches launch paths and **requires a booted container**. It cannot
be verified from inside the sandbox, which is why it is specced rather than
shipped.

Verify by rejection, not by exit 0. The check must name the failure it catches:

1. In a booted container, `docker exec` a shell, spawn a process that forks a
   grandchild and exits, leaving the grandchild orphaned.
2. **Without** the fix: the grandchild's `ppid` becomes 1 and `ps -o stat=` shows
   `Z` indefinitely. This is the failure the change must catch.
3. **With** the fix: the grandchild's `ppid` becomes the session head and the
   entry disappears from the process table once reaped.
4. Run the full test suite in a booted container and compare zombie count before
   and after. `esbuild` zombies are the highest-volume source and are the signal.
5. `sandbox-boot-guard` (`.github/workflows/sandbox-boot-guard.yml`) and
   `sandbox-boot-smoke.sh` must stay green — this is a boot-path change and a
   regression bricks the sandbox for everyone.

## Known casualty

The `audit-run-root-contract` eval probe was red for an extended period because
of this behavior. Its orphan check used `kill -0`, which returns success for an
unreaped zombie. Two repair attempts (`d6a1c18c`, `a734c2b4`) missed the cause;
a third (#842) fixed the probe by reading process state instead. The probe was
green on CI throughout, because GitHub runners reap. Any future process-lifecycle
test will hit the same divergence between this environment and CI.
