# gVisor moved out of this task

The gVisor thread left this task folder on 2026-08-19. Nothing here is the
authority for gVisor.

## Where gVisor lives now

| Item | Location |
|---|---|
| Proposal and resume procedure | issue [#806](https://github.com/mifunedev/openharness/issues/806) |
| RFC, wiki entries, raw capture | PR [#804](https://github.com/mifunedev/openharness/pull/804), draft |
| Host runbook — verify, exercise, revert | `.oh/docs/gvisor-host-runbook.md` on PR #804 |

Issue #806 and PR #804 are self-contained. A reader who opens either one needs no
file from this task folder.

`gvisor-host-runbook.md` moved to `.oh/docs/gvisor-host-runbook.md`. This folder no
longer holds a copy, because two copies drift.

## How this task arrived at its current state

1. The plan proposed nine phases, P0 through P8, for a MicroSandbox substrate.
2. A devcontainer session partitioned the phases and stopped at the operator gate.
   `partition.md` records that partition, and the session measured the devcontainer.
3. The operator ran the P0 spike on the WSL2 host. `p0-spike-results.md` records the
   result. gVisor returned GREEN. MicroSandbox returned BLOCKED.
4. `partition-v2.md` re-derived the partition, because `partition.md` classified
   phases for a project that spans two machines.
5. The gVisor result promoted P8 to first position, and the gVisor work moved to
   its own issue and its own pull request.
6. A later check found a second MicroSandbox blocker: the sandbox reaches no
   `/dev/kvm`. `next-tasks.md` records both blockers.
7. MicroSandbox work moved to issue
   [#805](https://github.com/mifunedev/openharness/issues/805).

## What stays here

This folder keeps the measurement record and the phase register:

- `p0-spike-results.md` — the spike that measured both candidates
- `partition.md` and `partition-v2.md` — the two partitions, and why the second exists
- `next-tasks.md` — every BLOCKED and CLAIMED phase, with its unblocking condition
- `progress.txt` — the progress record
- `host-handoff.md` — the host prompt that produced the spike

The folder is historical after MicroSandbox lands. Issue #805 carries the
MicroSandbox work forward, and issue #806 carries gVisor.
