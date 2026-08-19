# Partition v2 — microsandbox-substrate

This document supersedes `partition.md`. Read partition v2 before `partition.md`.

`partition.md` remains in the folder as the record of what the devcontainer
measured. `partition.md` is correct about the devcontainer. `partition.md` is wrong
about the WSL2 host, and five classifications rest on that error.

## Why a second partition exists

`partition.md` measured one machine and classified phases for the project. The
project spans two machines. A phase that a container cannot build may still build on
the host.

Every classification below names its target machine.

## Ground truth, two machines

| Fact | Devcontainer | WSL2 host |
|---|---|---|
| Kernel | `6.18.33.2-microsoft-standard-WSL2` | `6.18.33.2-microsoft-standard-WSL2` |
| Distribution | Debian 12 (bookworm) | Ubuntu 22.04.5 LTS |
| glibc | 2.36 | 2.35 |
| `/dev/kvm` | ABSENT | **PRESENT** |
| Docker socket | ABSENT | **PRESENT** |
| Docker daemon | fails | **Engine 29.7.2** |
| `runsc` | absent | **installed, GREEN** |
| `msb` | absent | blocked by glibc |
| PID 1 | not measured | `systemd` |

The devcontainer and the host share a kernel. The devcontainer and the host differ
in distribution, in glibc, and in device access.

## Partition

| Phase | Devcontainer | WSL2 host | Binding class |
|---|---|---|---|
| P0 `wsl2-substrate-spike` | BLOCKED | **DONE** | DONE |
| P2 `microsandbox-rfc-amendment` | BUILDABLE (narrowed) | BUILDABLE | BUILDABLE |
| P3 `microsandbox-workspace-image` | BLOCKED | BLOCKED | BLOCKED |
| P4 `microsandbox-execution-target` | CLAIMED | CLAIMED | CLAIMED |
| P5 `microsandbox-cold-boot-restore` | BLOCKED | BLOCKED | BLOCKED |
| P6 `microsandbox-supported-contract` | BLOCKED | BLOCKED | BLOCKED |
| P7 `microsandbox-docs-ia` | BLOCKED | BLOCKED | BLOCKED |
| P8 `gvisor-support-rfc` | BUILDABLE | BUILDABLE | **BUILDABLE, first** |

The plan defines no P1. The plan's revision section states that P0 replaces P1.

## What changed against partition.md

### P0 moved from BLOCKED to DONE

`partition.md` blocked P0 on the absence of a shell on the WSL2 host. The operator
ran the spike on the WSL2 host on 2026-08-18. `p0-spike-results.md` holds the
result table and the raw output.

### P3, P5, and P6 keep the BLOCKED class for a different reason

`partition.md` blocks these three phases on an absent `/dev/kvm`. The WSL2 host
exposes `/dev/kvm`. A reader who trusts the original reason would expect the host to
unblock these phases.

The measured blocker is the glibc floor. The MicroSandbox installer requires glibc
2.39 or newer. The devcontainer reports 2.36. The host reports 2.35. Both machines
fall below the floor. The class does not change. The reason changes, and the
unblocking condition changes with the reason.

### P8 moved to first position

`partition.md` records finding F1. F1 states that P8's gate reads "P7 merged" while
the outcome table promotes P8 first in two of four outcomes.

P0 returned GREEN for gVisor on path A. The outcome table maps that result to "the
gVisor RFC goes first". P8 proceeds before P7. F1 closes.

`partition.md` records finding F2. F2 states that P8-first rests on an unmeasured P0
GREEN. The spike measured the result. F2 closes.

### P2 widens

`partition.md` narrows P2 to one fit-matrix row, because the devcontainer could
measure no MicroSandbox fact. The host measured one hard fact: the glibc 2.39 floor.
P2 can now report a measured blocker instead of an empty row.

### P4 keeps the CLAIMED class

The collision with EPIC #731 does not depend on either machine. The class stands.

## Gate reachability

`ste-check.sh` reports 12 findings against the merged
`.oh/docs/rfcs/rfc-runtime-support.md` and exits 1. The repository does not hold
whole-file STE cleanliness on merged RFCs.

A gate of "exit 0 on the whole file" is reachable for a new file. The same gate is
unreachable for an amended file without a separate cleanup. Amended files use
`--blocks after` on the changed blocks. This constraint is finding F4, and F4 stands.
