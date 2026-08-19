# Partition — microsandbox-substrate

> **SUPERSEDED.** Read `partition-v2.md` first. This document measured the
> devcontainer, and classified phases for a project that spans two machines. The
> WSL2 host exposes `/dev/kvm` and a Docker daemon, so the ground-truth table below
> does not describe the host. The MicroSandbox phases stay BLOCKED for a different
> reason: the glibc 2.39 floor. See `p0-spike-results.md`.

Step 1 of `BRIEF.md`. This document classifies every phase of
`.claude/plans/project-harness-skills-to-use-ste-fluffy-parnas.md` as BUILDABLE,
BLOCKED, or CLAIMED. No build starts before the operator confirms this partition.

## Ground truth, re-measured in this container

The brief supplied a list and told me not to trust it. I measured each item again.
Every measured value matches the brief.

| Fact | Command | Observed |
|---|---|---|
| Kernel | `uname -r` | `6.18.33.2-microsoft-standard-WSL2` |
| Distribution | `head -2 /etc/os-release` | Debian GNU/Linux 12 (bookworm) |
| `/dev/kvm` | `ls -l /dev/kvm` | ABSENT — `No such file or directory` |
| Docker socket | `ls -l /var/run/docker.sock` | ABSENT — `No such file or directory` |
| Docker daemon | `docker info` | FAILS — `dial unix /var/run/docker.sock: connect: no such file or directory` |
| `msb` | `command -v msb` | not installed |
| `runsc` | `command -v runsc` | not installed |
| glibc | `ldd --version` | 2.36 |
| `vmx` flag | `grep -c -w vmx /proc/cpuinfo` | 64 |
| Node / pnpm | `node --version`, `pnpm --version` | v22.23.2, 10.33.0 |
| Network egress | `curl https://registry.npmjs.org/` | HTTP 200 |

The `vmx` flag is present and `/dev/kvm` is absent. That pair is the exact trap
the plan names: the CPU advertises virtualization, and the container cannot reach
the KVM device. A presence check on `vmx` alone reports a false GREEN.

The Docker CLI binary exists at `/usr/bin/docker` and reaches no daemon. That pair
is the second false-presence trap. `command -v docker` succeeds; the round trip fails.

**Consequence.** The container boots no sandbox of any kind. The container builds no
image. The container runs no microVM. A phase gate that requires a boot cannot pass
in the container.

## Verification tooling, proven by round trip

I proved each named gate before I named it.

| Tool | Proof of rejection | Proof of acceptance |
|---|---|---|
| `.oh/skills/ste/scripts/ste-check.sh` | exit 1, 6 findings on a fixture holding `facilitate`, `in order to`, and passive voice | exit 0, no findings on a clean fixture |

One caveat that changes a gate. `ste-check.sh` reports 12 findings against the
existing `.oh/docs/rfcs/rfc-runtime-support.md` and exits 1. The repo does not hold
whole-file STE cleanliness on its merged RFCs. A gate of "exit 0 on the whole file"
is therefore reachable for a NEW file and unreachable for an AMENDED file without a
separate cleanup. Amended files use `--blocks after` on the changed blocks instead.

## Partition

| Phase | Class | Gate reachable here? |
|---|---|---|
| P0 `wsl2-substrate-spike` | **BLOCKED** | No |
| P2 `microsandbox-rfc-amendment` | **BUILDABLE (narrowed)** | Yes, for one row of one table |
| P3 `microsandbox-workspace-image` | **BLOCKED** | No |
| P4 `microsandbox-execution-target` | **CLAIMED** | Not applicable |
| P5 `microsandbox-cold-boot-restore` | **BLOCKED** | No |
| P6 `microsandbox-supported-contract` | **BLOCKED** | No |
| P7 `microsandbox-docs-ia` | **BLOCKED** | No |
| P8 `gvisor-support-rfc` | **BUILDABLE** | Yes |

The plan defines no P1. Its § "Revision" states that P0 replaces P1.

### P0 — BLOCKED

**Missing thing:** a shell on the WSL2 host. Every P0 command runs outside this
container. Step 0 needs `docker context ls` against a live daemon. Step 1 needs
`sudo apt-get install runsc` and `sudo runsc install` on the host. Step 2 needs
`docker run --runtime=runsc`. Step 3 needs `/dev/kvm` for `msb`.

The plan already states this: "The operator runs every command below on the WSL2
host, because this container reaches neither `/dev/kvm` nor the host Docker daemon."
My measurements confirm both absences.

The P0 runbook ships in `next-tasks.md` in runnable form.

### P2 — BUILDABLE, narrowed to one row

P2 as written holds three separable pieces. One is buildable here. Two are not.

**Buildable — the fit-matrix row.** `.oh/docs/rfcs/rfc-runtime-support.md` § 4 holds
the candidate table at lines 63-73. It lists a "Firecracker microVM" row and no
MicroSandbox row. The plan's own correction table records that MicroSandbox uses
**libkrun**, not Firecracker. Adding a MicroSandbox row and correcting the mechanism
name is a factual edit backed by a citable upstream fact. It asserts no measurement.

Verification: `bash .oh/skills/ste/scripts/ste-check.sh --blocks after <file>` exits
0 on the changed blocks, and `/spec critique` returns APPROVED from two critics.

**Not buildable — the re-ranking paragraph.** P2 says: "Write the 'why not Sysbox
first' paragraph from measured evidence." No measured evidence exists. The evidence
comes from P0's nested-`dockerd` result, and P0 carries the BLOCKED class. Writing
that paragraph
now means inventing the finding it claims to report. It goes to `next-tasks.md`.

**Not buildable — the `targetRoot` amendment.** P2 claims MicroSandbox is "the first
real consumer of the reserved `targetRoot` divergence" in
`.oh/docs/rfcs/rfc-brain-hands-boundary.md` § 5.1. The in-flight sysbox slice claims
the same seam first: its `plan-v2.md` decision **D4′** reads "`workspace: { hostRoot,
targetRoot }` STAYS TWO FIELDS and GAINS REAL SEMANTICS", and its rationale cites the
same § 5.1 request. Two slices cannot both be the first consumer. This piece is
CLAIMED and goes to `next-tasks.md`.

### P3 — BLOCKED

**Missing thing:** a Docker daemon to build the OCI rootfs, and `/dev/kvm` to boot
the result. The gate is `.oh/scripts/sandbox-healthcheck.sh` passing unmodified
**inside a booted microVM**. Nothing in that sentence is reachable here.

### P4 — CLAIMED

`.oh/worktrees/plan/731-sysbox-execution-target` holds an uncommitted task folder
`.oh/tasks/sysbox-execution-target/` under EPIC #731, which is OPEN. I read its
`plan-v2.md` and its `progress.txt`. The collision is larger than the file list in
the brief. The collision has three layers.

**Layer 1 — the identical files.** P4's worker table names four paths. All four are
the sysbox slice's own working set:

- `.oh/cli/src/lib/execution/index.ts` — the `resolveExecutionTarget()` seam
- `.oh/cli/src/__tests__/execution-target.test.ts`
- `.oh/evals/probes/execution-target-contract.sh`
- `.oh/scripts/harness-config.sh` allowlist

**Layer 2 — the config key.** P4 adds `sandbox.substrate`. The sysbox slice adds
`sandbox.runtime` (D2′). Both keys select the same thing through the same flat
two-level grammar. Landing both produces two selectors for one decision.

**Layer 3 — the topology, which is the real conflict.** P4 adds a peer
`ExecutionTarget` addressing **one** service. The sysbox slice's D1′ splits the
compose file into **two** services — `sandbox` as the brain, a new `exec` as the
hands — and states that a same-container runtime swap is the error its v1 made.
The two designs disagree about what the seam addresses. A merge of the two is a new
design decision, not an integration.

Per the brief: I classify P4 CLAIMED, I do not race it, and I do not silently merge
the two designs.

The sysbox slice has no open PR, and another worktree holds its uncommitted work. So
the unblocking condition is a landed decision, not a landed PR. `next-tasks.md`
records that condition.

### P5 — BLOCKED

**Missing thing:** two. The stated gate reads "P4 merged", and P4 carries the CLAIMED
class. The subject — cold-boot restore of `cron-watchdog`, `cron-system`, and `client-slack-pi`
— needs a booted microVM to observe a cold boot.

### P6 — BLOCKED

**Missing thing:** a booted microVM. The supported-runtime contract at
`.oh/docs/rfcs/rfc-runtime-support.md:38-49` has four legs, and leg 3 reads "Validated
— boots the sandbox … and clears the boot-lint + `.oh/evals/probes/*` floor". The
phase's own gate reads "Exits 0 on a healthy boot." A document that closed the other
three legs while leg 3 stayed open would claim a support level the repo does not hold.

`.oh/docs/runtimes/` does not exist yet. The first supported-runtime doc creates it.

### P7 — BLOCKED

**Missing thing:** the feature the documents would describe. P7 edits `README.md`,
`AGENTS.md`, `.oh/context/TOOLS.md`, `.oh/docs/security-considerations.md` § 4,
`.oh/docs/connecting.md`, and `.oh/docs/glossary.md` to tell an operator to select a
substrate. No substrate exists to select, because P4 carries the CLAIMED class and P3
carries the BLOCKED class. Shipping this text now ships false copy in the most-read
files in the repo.

P7 hits an ordering block, not a host-state block. I name that difference plainly
rather than force the phase into the host-state wording.

### P8 — BUILDABLE

P8 delivers `.oh/docs/rfcs/rfc-gvisor-support.md` and no code. The plan states this
twice: "minimum deliverable: an RFC" and "Ship the RFC alone. Ship code only after a
separate approval." § Out of scope repeats it: "Any gVisor implementation."

Every question the RFC must answer is answerable from repository state plus cited
upstream documents, with no measurement:

1. **Placement** — reads `.devcontainer/docker-compose.docker-sock.yml` and
   `.oh/scripts/docker-compose.sh`, both present here.
2. **Host prerequisite** — states that `make sandbox` alone never produces a gVisor
   sandbox, and carries the host runbook. That runbook is a written procedure, not a
   run.
3. **The two costs** — the `--iptables=false` consequence is an upstream-documented
   behavior. The plan forbids publishing an overhead percentage and requires a
   measurement instead, so the RFC specifies the spike and prints no number.
4. **Ordering** — states the trade between the two facts and ranks conditionally.
5. **The bind-mount flag** — names `--file-access=shared` and its caching cost.

This RFC **specifies** the three spikes; the operator **runs** them on the host.
Specifying a spike with a pass condition is a document act. The RFC must not report
a result.

Verification, all runnable in this container:

```bash
bash .oh/skills/ste/scripts/ste-check.sh .oh/docs/rfcs/rfc-gvisor-support.md   # exit 0
```

The RFC also needs `/spec critique` to return APPROVED from two critics. A link check
confirms that every path the RFC cites resolves in this checkout.

## Findings that need an operator decision

Binding constraint 1 says to halt when a premise, gate, or ordering does not hold.
Four items qualify.

**F1 — P8's gate contradicts P0's gate table.** P8 states "**Gate:** P7 merged."
P0's outcome table states "gVisor GREEN on path A → **P8 first**" and "gVisor GREEN
on path B only → **P8 first**". Two of four P0 outcomes promote P8 ahead of the
queue. P7 carries the BLOCKED class. Both readings cannot hold. P8-first is the only
reading that survives, and that reading needs the operator's word before I build to it.

**F2 — P8-first is also unmeasured.** P0's table promotes P8 on a GREEN gVisor
result. P0 has not run. Building P8 now means writing the RFC **before** the
measurement that the plan uses to decide P8's priority. That order is defensible for
a document that reports no measurement and forbids invented numbers. That order is
not defensible for any phase downstream of P8. I recommend the RFC state plainly that
P0 has not run.

**F3 — P4 forks the execution seam.** Layers 2 and 3 above. Landing P4 as written
alongside the sysbox slice yields two selectors and two topologies for one seam.

**F4 — the STE gate is unreachable on amended files.** Measured above: the existing
`rfc-runtime-support.md` already exits 1 with 12 findings. The plan's verification
table asks for "Exits 0" on each changed doc. For amended files, the reachable gate
is `--blocks after` on the changed blocks. For new files, whole-file exit 0 holds.

## Recommendation

Build **P8 in full** and **P2 narrowed to the fit-matrix row**. Route everything
else to `next-tasks.md` with its exact unblocking condition.

The result is two documents and no code. The scope is small. The scope is also the
whole of what this container can build and verify without inventing a measurement,
and the brief states that the deferred work is a deliverable rather than a shortfall.

If the operator prefers the smallest coherent unit, build P8 alone. P2's narrowed
row touches a file the sysbox slice also amends, which is a merge cost for one table
row.

**STOP. Awaiting operator confirmation before any build.**
