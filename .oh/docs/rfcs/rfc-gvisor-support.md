# RFC: gVisor as a supported A1 substrate

**Status:** Draft
**Axis:** A1 (substrate)
**Parent contract:** [`rfc-runtime-support.md`](rfc-runtime-support.md)
**Implementation epic:** [#591](https://github.com/mifunedev/openharness/issues/591)
**Tracking issue:** [#806](https://github.com/mifunedev/openharness/issues/806)
**Raw measurement:** `.oh/skills/wiki/corpus/raw/2026-08-19-gvisor-wsl2-spike.md`
**Host runbook:** [`../gvisor-host-runbook.md`](../gvisor-host-runbook.md)

## Purpose

This RFC proposes gVisor (`runsc`) as the first supported A1 substrate beyond the
default container. The proposal rests on a measurement, not on an estimate.

`rfc-runtime-support.md` § 8 ranks the gVisor overlay second, and calls the overlay
"cheapest, most reversible". The parent RFC assigned that rank before anybody
measured gVisor on a harness host. An operator ran the measurement on 2026-08-19.

## 1. What the spike measured

Host: WSL2, Ubuntu 22.04.5 LTS, kernel `6.18.33.2-microsoft-standard-WSL2`,
glibc 2.35, Docker Engine 29.7.2, gVisor release-20260810.0.

| Test | Result |
|---|---|
| Boot | PASS. `docker run --runtime=runsc --rm hello-world` printed the hello-world text |
| Detached tmux session | PASS. `tmux ls` listed the session |
| `npm ci`, 1055 dependencies | 1.15x wall-clock, 2.05x CPU |
| Nested `dockerd` | PASS, with `--iptables=false` |
| Kernel identity | `4.19.0-gvisor`, against a host kernel of `6.18.33.2-microsoft-standard-WSL2` |

Each PASS rests on a round trip. A booted sandbox produced the output. A presence
check such as `command -v runsc` does not produce a verdict.

## 2. The result that decides the proposal

**A detached tmux session survives under `runsc`.**

The Open Harness process model makes tmux normative. Cron, the Slack gateway, the
watchdog, and every `agent-` build session live in named tmux sessions. A substrate
that drops a detached session cannot host the workspace, whatever its isolation
depth.

No upstream gVisor document states how `runsc` handles PTYs. The `systrap` platform
holds the session. This RFC records the measurement, because the fact is not
published elsewhere.

## 3. Cost

| Metric | `runc` | `runsc` | Ratio |
|---|---|---|---|
| real | 35.093s | 40.500s | 1.15x |
| user | 30.903s | 63.410s | 2.05x |
| sys | 13.213s | 11.560s | 0.87x |

Report both ratios. `npm ci` waits on the network and on disk. That wait hides most
of the userspace-kernel cost inside wall-clock time. A CPU-bound workload pays the
2.05x instead.

This RFC publishes no upstream percentage. The upstream gVisor performance guide
measures the `ptrace` platform. The default platform is `systrap`. A number copied
from that guide describes a different platform.

## 4. Isolation gained

`4.19.0-gvisor` is the kernel that the workload sees. The host runs
`6.18.33.2-microsoft-standard-WSL2`. A userspace kernel serves the syscalls, so
agent-generated code never reaches the host syscall surface directly.

The wiki entry `runtime-isolation-landscape` ranks gVisor at Level 2. The current
default substrate is Level 1: one privileged container that shares the host kernel
and the Docker socket.

## 5. What the substrate does not gain

1. **`--privileged` still weakens the boundary.** Nested Docker needs
   `--privileged`. A tier that runs nested Docker under `--privileged` returns part
   of the isolation that `runsc` provides.
2. **Nested networking changes shape.** Nested `dockerd` needs `--iptables=false`.
   That flag breaks `docker run -p` and `docker run --expose`. Nested containers
   then need `--network=host`.
3. **Syscall coverage is imperfect.** gVisor re-implements syscalls. A workload that
   uses a rare syscall may fail under `runsc` and pass under `runc`.

## 6. The host prerequisite that the spike found

Docker Engine and Docker Desktop contend for `/var/run/docker.sock`. One socket path
holds one listener.

A host that runs Docker Desktop must give Docker Engine a separate socket. The spike
used a systemd drop-in:

```
[Service]
ExecStart=
ExecStart=/usr/bin/dockerd -H unix:///run/docker-engine.sock --containerd=/run/containerd/containerd.sock
```

The spike also disabled `docker.socket`, because that unit re-binds the contested
path.

Two corrections to the plan's host runbook follow from the measurement:

1. The runbook states that WSL2 Ubuntu 22.04 ships no systemd. The measured host
   runs `systemd` as PID 1.
2. The runbook presents `docker context use desktop-linux` as a free switch back.
   The switch back is not free, because the socket path holds one listener.

## 7. Proposal

1. **Adopt gVisor as the first supported A1 substrate beyond the default.** The
   measurement supports the parent RFC's "cheapest, most reversible" claim.
2. **Keep the tier opt-in.** `rfc-runtime-support.md` § 3 preserves the zero-config
   default. A `runtime=runsc` selection stays a toggle.
3. **Document the dedicated-socket prerequisite** for any host that also runs Docker
   Desktop.
4. **Publish both cost ratios** wherever the harness quotes gVisor overhead. A quote
   of 1.15x alone flatters the tier.

## 8. What this RFC decides and defers

**Decides.** gVisor boots, holds tmux, runs nested Docker, and costs 1.15x wall and
2.05x CPU on a measured harness host. gVisor qualifies as a candidate A1 substrate
under the § 2 contract of the parent RFC.

**Defers.** The config-key question. `rfc-runtime-support.md` § 8 ranks the Sysbox
execution target first, and EPIC
[#731](https://github.com/mifunedev/openharness/issues/731) owns the
`ExecutionTarget` seam. A substrate selector must not fork that seam. This RFC
proposes no config key, and adds no `ExecutionTarget` implementation.

**Defers.** The probe. A probe that asserts gVisor behavior needs a host that runs
`runsc`. CI runners do not. A probe that skips on every runner asserts nothing.

## 8a. Status, and what blocks acceptance

This RFC is Draft. The measurement is complete and green. The adoption decision is
open.

Three conditions block an `Accepted` verdict. Issue
[#806](https://github.com/mifunedev/openharness/issues/806) holds the full resume
procedure.

| ID | Condition | Gates the others? |
|---|---|---|
| B1 | EPIC #731 must state one config key | YES |
| B2 | A second host, and a second architecture | no |
| B3 | One CPU-bound workload behind the cost number | no |

B1 is the real gate. Two selectors for one decision fork the `ExecutionTarget` seam.

Every fact in this RFC traces to
`.oh/skills/wiki/corpus/raw/2026-08-19-gvisor-wsl2-spike.md`, which ships in the
same change. A reader needs no other branch.

## 9. Open decisions

- **Which config key selects a substrate.** EPIC #731 must state one key. P4 of the
  substrate plan proposes `sandbox.substrate`. The Sysbox slice proposes
  `sandbox.runtime`. Two selectors for one decision fork the seam.
- **Whether nested Docker stays a requirement.** A tier that drops nested Docker
  keeps a stronger boundary, and loses sibling-container capability.
- **How the harness verifies the tier without a host.** A CI runner cannot boot
  `runsc`. The verification may need a self-hosted runner.

## Non-goals

- This RFC adds no code, no config key, and no `ExecutionTarget` implementation.
- This RFC does not rank gVisor against Firecracker or Kata. The parent RFC § 4
  holds that comparison.
- This RFC does not change the default substrate.

## Related

- [`rfc-runtime-support.md`](rfc-runtime-support.md) — the parent contract and the fit matrix
- [`rfc-brain-hands-boundary.md`](rfc-brain-hands-boundary.md) — the `ExecutionTarget` seam
- Wiki entries `runtime-isolation-landscape` and `gvisor-wsl2-substrate`
