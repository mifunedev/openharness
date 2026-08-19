# P0 spike result — WSL2 host substrate measurement

**Date:** 2026-08-19 (UTC)
**Host:** WSL2, Ubuntu 22.04.5 LTS, kernel `6.18.33.2-microsoft-standard-WSL2`, glibc 2.35
**Path taken:** A — Docker Engine installed in this distribution

## Result table

| Candidate | Path | Boots | tmux survives | `npm ci` ratio | Nested dockerd | Verdict |
|---|---|---|---|---|---|---|
| gVisor `runsc` | A | YES | YES | 1.15x wall, 2.05x CPU | YES | GREEN |
| MicroSandbox `msb` | n/a | n/a | n/a | n/a | n/a | BLOCKED |

## Verdicts and the round trip that produced each one

- **gVisor GREEN.** `docker run --runtime=runsc --rm hello-world` printed the
  hello-world text. A booted sandbox produced that stdout.
- **MicroSandbox BLOCKED.** The installer refused to install. The installer reports a
  glibc floor of 2.39. This host has glibc 2.35. No `msb` binary exists, so no
  round trip is possible.

## Measurements

### gVisor spike 1 — boot

Command: `docker run --runtime=runsc --rm hello-world`
Result: PASS. Exit 0. The container printed "Hello from Docker!".

### gVisor spike 2 — tmux survival

Command: a detached `tmux new-session`, then `tmux ls`, then `tmux has-session`.
Result: PASS. `tmux ls` listed `t: 1 windows`. `has-session` exited 0.
This spike carried the most weight. The Open Harness process model makes tmux
normative. The `systrap` platform holds a detached session.

### gVisor spike 3 — cost

Workload: `npm ci` against a 1055-dependency lockfile. Same directory for both
runs. Node image `node:22`.

| Runtime | real | user | sys |
|---|---|---|---|
| `runc` | 35.093s | 30.903s | 13.213s |
| `runsc` | 40.500s | 63.410s | 11.560s |

Wall ratio: 1.15x. CPU ratio: 2.05x.

Report both numbers. `npm ci` waits on the network and on disk. That wait hides
most of the userspace-kernel cost in wall-clock time. A CPU-bound workload pays
the 2.05x instead. This measurement publishes no upstream percentage.

### gVisor spike 4 — nested dockerd

Nested `dockerd` starts inside gVisor and runs containers. Nested `dockerd`
needs `--iptables=false`. Nested containers then need `--network=host`.

Command: `docker -H unix:///var/run/docker.sock run --rm --network=host hello-world`
Result: PASS. The nested container printed the hello-world text.

The nested registry pull failed. The cause is an absent IPv6 route. The same
`runc` test shows 0 global IPv6 addresses. The cause is host network
configuration, not a gVisor capability. Label: policy/config.

Egress inside gVisor over IPv4 works. `curl -4` to the registry returned 401.
A 401 proves the request reached the registry.

## Host findings the runbook did not predict

1. **`systemd` is PID 1 on this host.** The runbook states that WSL2 Ubuntu
   22.04 ships no systemd. `ps -p 1 -o comm=` returns `systemd`.
2. **Docker Engine and Docker Desktop contend for one socket path.**
   `/var/run/docker.sock` holds one listener. The fix is a dedicated socket.
   This host now runs Engine on `/run/docker-engine.sock` through a systemd
   drop-in. The drop-in disables `docker.socket`. Docker Desktop keeps the
   default path.
3. **glibc blocks MicroSandbox, not `/dev/kvm`.** `/dev/kvm` is
   present on this host. The blocker is the 2.39 glibc floor. glibc 2.39 needs
   Ubuntu 24.04 or newer.

## What this result decides

The plan's outcome table maps "gVisor GREEN on path A" to: the gVisor RFC goes
first, and MicroSandbox drops to a remote-host and CI substrate.

## Correction to partition.md

`partition.md` measured the container. Its ground-truth table reports `/dev/kvm`
ABSENT and no Docker daemon. Both facts are false on this host. The partition
needs a re-derivation that names which machine each phase targets.

The MicroSandbox glibc floor blocks P3, P5, and P6 on both machines. `/dev/kvm`
presence does not unblock them.
