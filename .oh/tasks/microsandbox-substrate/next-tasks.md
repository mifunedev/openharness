# Next tasks — microsandbox-substrate

Every phase that the P0 spike did not complete appears here. Each entry names the
exact unblocking condition. An unblocking condition is a command that the operator
runs on a host, or a pull request that lands first.

Source plan: `.claude/plans/project-harness-skills-to-use-ste-fluffy-parnas.md`
Measured result: `p0-spike-results.md`

## Summary

| Phase | Class after P0 | Unblocking condition |
|---|---|---|
| P0 `wsl2-substrate-spike` | **DONE** | Completed 2026-08-19. See `p0-spike-results.md`. |
| P2 `microsandbox-rfc-amendment` | BUILDABLE | None. Ready to build. |
| P3 `microsandbox-workspace-image` | BLOCKED | A host with glibc 2.39 or newer. |
| P4 `microsandbox-execution-target` | CLAIMED | A landed design decision on EPIC #731. |
| P5 `microsandbox-cold-boot-restore` | BLOCKED | P4 merged, and a glibc 2.39 host. |
| P6 `microsandbox-supported-contract` | BLOCKED | A booted `msb` sandbox. |
| P7 `microsandbox-docs-ia` | BLOCKED | P3 and P6 merged. |
| P8 `gvisor-support-rfc` | BUILDABLE | None. P0 promotes P8 to first position. |

## P3 — `microsandbox-workspace-image`

**Class:** BLOCKED.
**Missing thing:** glibc 2.39 or newer.

The MicroSandbox installer refuses to install below glibc 2.39. The WSL2 host runs
glibc 2.35. The devcontainer runs glibc 2.36. Both machines fall below the floor.

`/dev/kvm` does not gate this phase. The WSL2 host exposes `/dev/kvm`. The glibc
floor blocks the phase on its own.

**Unblocking condition.** Provide a host that reports glibc 2.39 or newer. Ubuntu
24.04 satisfies the floor. Verify with:

```bash
ldd --version | head -1        # expect 2.39 or newer
ls -l /dev/kvm                 # expect a character device
curl -sSL https://get.microsandbox.dev -o /tmp/get-msb.sh
sh /tmp/get-msb.sh
msb self doctor                # expect exit 0
msb run alpine --exec 'echo ok'  # expect "ok"
```

The final two commands form the round trip. `msb self doctor` alone proves nothing.

## MicroSandbox needs two unblocks, not one

The P0 spike found the glibc floor. A later check found a second blocker. Both must
clear before `msb` runs anywhere in this harness.

### Blocker 1 — glibc 2.39

Measured on 2026-08-19 with `docker run --rm <image> ldd --version`:

| Image | glibc | Clears the 2.39 floor? |
|---|---|---|
| `debian:bookworm-slim` (the devcontainer base today) | 2.36 | NO |
| `ubuntu:24.04` | 2.39 | Yes, at the floor |
| `debian:trixie-slim` | 2.41 | Yes, with headroom |

`.devcontainer/Dockerfile:1` pins `debian:bookworm-slim`. A move to
`debian:trixie-slim` keeps the Debian family, and changes three lines: the `FROM`
line, the Docker apt repo line at `:35`, and the cloudflared apt repo line at `:43`.

The WSL2 host reports glibc 2.35, and an Ubuntu 22.04 host cannot clear the floor
without a distribution upgrade. The container path costs less than the host path.

### Blocker 2 — no `/dev/kvm` in the sandbox

`msb` boots a microVM, and a microVM needs KVM.

`.devcontainer/docker-compose.yml` declares no `devices:` key, no `privileged`, and
no `cap_add`. The sandbox therefore reaches no KVM device, whatever its glibc
version. A glibc bump alone does not unblock `msb`.

The WSL2 host does expose `/dev/kvm` as a character device, and the operator's
account holds the `kvm` group. The device exists. The sandbox cannot reach it.

**Unblocking condition.** Add a device mapping to the sandbox service, and place the
`sandbox` user in the `kvm` group inside the image.

```yaml
devices:
  - /dev/kvm:/dev/kvm
```

Verify by round trip, not by presence:

```bash
ls -l /dev/kvm                   # presence only, proves nothing
msb self doctor                  # expect exit 0
msb run alpine --exec 'echo ok'  # expect "ok"
```

### Order

Blocker 2 can land before blocker 1. A `/dev/kvm` mapping is independent of the base
image. Blocker 1 without blocker 2 installs `msb` and still boots no microVM.

## P4 — `microsandbox-execution-target`

**Class:** CLAIMED.
**Owner:** EPIC #731, branch `feat/731-sysbox-execution-target`.

The sysbox slice plans a second `ExecutionTarget` implementation against the same
seam. The collision holds three layers:

1. Four identical files, including `resolveExecutionTarget()` at
   `.oh/cli/src/lib/execution/index.ts:29-34`.
2. Two config keys for one decision. P4 adds `sandbox.substrate`. The sysbox slice
   adds `sandbox.runtime`.
3. Two topologies. P4 addresses one service. The sysbox slice splits compose into a
   brain service and a hands service.

**Unblocking condition.** A landed design decision, not a landed pull request. The
decision must state one config key and one topology. Do not race the two branches.

## P5 — `microsandbox-cold-boot-restore`

**Class:** BLOCKED.
**Missing prerequisites:** two.

The phase gate reads "P4 merged". P4 carries the CLAIMED class. The phase also needs
a booted `msb` sandbox, which the glibc floor blocks.

**Unblocking condition.** P4 merges, and a glibc 2.39 host boots `msb`.

## P6 — `microsandbox-supported-contract`

**Class:** BLOCKED.
**Missing thing:** a booted `msb` sandbox.

The contract holds three legs. Leg 3 requires a boot. Legs 1 and 2 do not.

**Unblocking condition.** A glibc 2.39 host boots `msb`. Legs 1 and 2 can proceed
before leg 3 as a separate slice.

## P7 — `microsandbox-docs-ia`

**Class:** BLOCKED.
**Missing thing:** the feature that the documents describe.

**Unblocking condition.** P3 and P6 merge. Documentation that describes an absent
feature misleads the reader.

## Corrections that this register carries

### C1 — partition.md measured the container

`partition.md` reports `/dev/kvm` ABSENT and no Docker daemon. Both facts hold in
the devcontainer. Both facts are false on the WSL2 host. Five classifications rest
on container-only ground truth.

`partition-v2.md` re-derives the partition. Each phase names its target machine.

### C2 — the MicroSandbox blocker is glibc, not `/dev/kvm`

`partition.md` blocks P3, P5, and P6 on an absent `/dev/kvm`. The WSL2 host exposes
`/dev/kvm`. The real blocker is the glibc 2.39 floor. A reader who trusts the
original reason would expect the host to unblock these phases. The host does not.

### C3 — finding F2 is resolved

F2 states that P8-first rests on an unmeasured P0 GREEN. The P0 spike measured
GREEN on 2026-08-19. The gVisor RFC now reports measurements. F2 closes.

### C4 — finding F1 is resolved

F1 states that P8's gate reads "P7 merged" while the outcome table promotes P8
first. P0 returned GREEN for gVisor on path A. The outcome table maps that result
to "the gVisor RFC goes first". P8 proceeds before P7.

### C5 — the runbook misstates the WSL2 init system

The host runbook states that WSL2 Ubuntu 22.04 ships no systemd. The measured host
runs `systemd` as PID 1. Correct the runbook before another operator follows it.

### C6 — Docker Engine and Docker Desktop contend for one socket

The runbook presents `docker context use desktop-linux` as a free switch back. One
socket path holds one listener. The switch back is not free. Record the dedicated
socket procedure in the RFC.
