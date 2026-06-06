# Research Plan — Firecracker / microVM Isolation for mifune.dev

> Status: **Research plan (desk research only, pre-spike)** · Owner: orchestrator · Created: 2026-06-06
> Scope: **Firecracker-focused**, **research + decision framework only** (no spike, no PoC, no benchmarks)
> Objective: **feasibility study on two tracks** — internal harness hardening **and** a mifune.dev product offering
> Target branch: `development`

## Context

**Why this exists.** Open Harness is the proof-of-work product under the
**mifune.dev** brand. Today every agent sandbox runs as a single Docker
Compose service that **shares the host kernel** and **bind-mounts
`/var/run/docker.sock`** (`.devcontainer/docker-compose.yml:30`). That is an
acceptable trust posture for a single operator self-hosting on their own box,
but it has two hard limits:

1. **Socket = root on host.** Any code running in the sandbox can `docker run`
   a privileged container that bind-mounts host `/` — a trivial, well-known
   escape. This is fine when *you* are the only agent author; it is
   unacceptable the moment the sandbox runs **untrusted, model-generated, or
   third-party agent code**.
2. **Shared kernel.** A kernel-level container escape (seccomp bypass, kernel
   CVE) reaches the host directly. There is no second boundary.

For mifune.dev to **offer microVM support** — a stronger-isolation tier that
makes it safe to run untrusted agents and, eventually, multi-tenant hosted
sandboxes — we need a **kernel-per-workload boundary**. **Firecracker** (the
VMM behind AWS Lambda/Fargate: ~125 ms boot, <5 MB/VM overhead, minimal device
model) is the candidate this research evaluates. **No prior investigation
exists in the repo** (grep for `firecracker|microvm|kata|gvisor|kvm` → zero
hits).

**Intended outcome of this plan.** A time-boxed **desk-research** effort that
ends in a **go/no-go decision on two tracks** — (A) an internal hardening tier
for the harness, and (B) a hosted mifune.dev offering — plus, where the call is
go, the **support plan** shape and the **numeric criteria a later spike must
hit**. This round produces *evidence and a recommendation*; it does **not** boot
a VM or run a benchmark (those are the deferred next step, see Out of scope).

## Goals & non-goals

**Goals**
- Build an evidence-based capability/limitation profile of **Firecracker** vs the
  current Docker baseline (isolation strength, boot/overhead, device model, DX cost).
- Determine on paper whether Firecracker can preserve the harness contract
  (live editing, named-volume auth, tmux process model, cron runtime).
- Deliver a go/no-go for internal hardening **and** for productization, with the
  threat-model rows each would close.
- Define the numeric success criteria a follow-up spike must satisfy.

**Non-goals (this round)**
- Running any spike, host-capability test, PoC, or benchmark on real hardware.
- Evaluating rival VMMs (Kata, Cloud Hypervisor, gVisor) — Firecracker-focused
  by design (see note below).
- Building the production multi-tenant control plane, billing, or quotas.
- GPU passthrough, nested-virt-in-VM matrices, or Windows guests.
- Forcing existing Docker users to migrate — microVM is an **added tier**.

> **Why Firecracker-only this round.** Other isolation tech exists (Kata
> Containers, Cloud Hypervisor, gVisor) and trades DX friction against isolation
> differently. This round deliberately scopes to Firecracker to produce a deep,
> decisive read. If Phase 4 returns **no-go on Firecracker**, the recommended
> follow-up is a *second* research round broadening to those alternatives —
> explicitly out of scope here.

## Threat model (Phase 0 must ratify this before anything else)

The recommendation depends entirely on which row(s) we are buying down:

| Threat | Docker today | What a Firecracker microVM buys |
| --- | --- | --- |
| Untrusted agent code persists a rootkit on host | **Exposed** (socket → root) | Strong: separate kernel + no host socket |
| Container escape via kernel CVE reaches host | **Exposed** | Strong: KVM boundary |
| Cross-tenant data exfiltration (hosted) | N/A (single-tenant today) | Strong: per-tenant VM |
| Resource exhaustion / noisy neighbor | Partial (no cgroup limits set) | Strong: VM-bounded mem/CPU |
| Supply-chain compromise of the base image | Exposed | **Unchanged** — a VM does not fix image trust |

**Decision rule.** If the ratified threat model is only "prevent host
persistence on a single-operator box," a cheaper hardening pass (drop the docker
socket + user namespaces + read-only rootfs + cgroup limits) may suffice and
microVM is deferred. If it includes "run untrusted code" or "multi-tenant
hosting," a microVM boundary is justified.

## Firecracker capability profile (Phase 1 fills this with cited facts)

Evaluate Firecracker on its own merits against the **Docker baseline only**,
across these dimensions:

| Dimension | What to establish |
| --- | --- |
| **Architecture & device model** | Minimal virtio set (net, block, vsock); no BIOS/PCI; attack surface vs a full VM and vs a container. |
| **Jailer** | How the `jailer` binary confines the VMM itself (cgroups + namespaces + chroot + seccomp) — the defense-in-depth around the host-facing process. |
| **Boot & overhead** | Cold boot (~125 ms), per-VM memory overhead (<5 MB), and what drives them — to compare against `make sandbox` warm-start today. |
| **Snapshotting** | Snapshot/restore for fast warm starts and fleet density; relevance to an on-demand hosted tier. |
| **Orchestration paths** | Compare *Firecracker integration layers* (not rival VMMs): raw Firecracker API + `jailer`, **firecracker-containerd**, **ignite**, **flintlock**. Which preserves an OCI-image workflow with least bespoke glue. |
| **Workspace live-edit** | virtio-fs vs vsock file-sync to expose the bind-mounted workspace into the guest — **the single biggest DX risk** vs today's host bind-mount. |
| **OCI image reuse** | Path to convert the existing `.devcontainer/Dockerfile` output into the rootfs + kernel a Firecracker guest needs. |

## Hard constraint to establish in Phase 0/1: host capability

Firecracker requires **`/dev/kvm`** (hardware virtualization). This gates the
entire effort and must be settled on paper before any later spike:
- **Bare metal** (Equinix, Hetzner dedicated, AWS `*.metal`) → KVM available.
- **Standard cloud VMs** → usually **no nested virt**; a later spike would fail
  there. The research must enumerate which target providers qualify.
- The harness's **bind-mount live-edit model does not survive into a microVM
  unchanged** — the guest needs virtio-fs or a vsock sync. This is the headline
  DX risk and is analyzed on paper here, prototyped later.

## Phased approach (desk research only)

Each phase has a gate; do not start the next until the gate passes. No phase in
this round touches hardware — all output is written analysis.

**Phase 0 — Frame (½ day).** Ratify the threat-model table with the user. Define
the numeric success criteria a *later* spike must hit (e.g. boot ≤ 2 s, mem
overhead ≤ 50 MB/sandbox, zero workflow-breaking DX regressions). Gate:
signed-off threat model + criteria.

**Phase 1 — Firecracker landscape (desk, 1 day).** Ingest authoritative sources
via `/wiki-ingest` (Firecracker design doc/NSDI paper, firecracker-containerd
docs, jailer & snapshotting docs, the security model). Synthesize
`wiki/firecracker.md` (and `wiki/microvm-isolation.md` if the topic overflows
the 600-word cap). Gate: the capability profile table above is filled with cited
facts and Firecracker's known limitations are recorded.

**Phase 2 — Architecture-fit analysis (desk, 1 day).** Map Firecracker against
the harness contract **on paper** and produce a fit/risk table covering:
- Live workspace editing via virtio-fs/vsock (replacing the host bind-mount).
- Named auth-volume persistence (`claude-auth`, `codex-auth`, `pi-auth`, …) equivalents.
- Whether the tmux process model (`context/rules/sandbox-processes.md`) and the
  cron runtime (`scripts/cron-runtime.ts`, launched from `.devcontainer/entrypoint.sh`)
  run unchanged inside a guest.
- The consequence of dropping `/var/run/docker.sock` (no nested Docker → in-VM runtime).
Gate: fit/risk table with each row marked preserved / changed / blocked.

**Phase 3 — Productization viability (desk, ½–1 day).** Two go/no-go tracks:
- **(A) Internal hardening tier** shipped in-repo for KVM-capable self-hosters.
- **(B) Hosted mifune.dev offering** — scope the *isolation primitive* only, plus a
  brief competitive read (Fly Machines, E2B, Modal, Daytona) to position it.
Gate: each track has an evidence-backed go/no-go with the threat-model rows it closes.

**Phase 4 — Decision synthesis (output, ½ day).** A recommendation memo: the
two go/no-go calls, the rows Firecracker closes, residual risks, and the
**criteria a follow-up spike must hit**. Gate: memo written; if either track is
go, the implementation/spike issue is filed (the spike itself is *not run here*).

## Support plan — how mifune.dev offers microVM support (drafted; finalized in Phase 4)

The *shape* of the offering, to be confirmed by the research:

1. **Isolation as a tier, not a replacement.** Add an `isolation` selector:
   `docker` (default, unchanged) | `microvm` (new). Surface it via `config.json`
   (already the compose-overlay mechanism — `Makefile:10-17` reads
   `.composeOverrides[]`) and/or a `make sandbox-vm` target. No regression for
   existing single-operator users.
2. **Image pipeline.** Reuse `.devcontainer/Dockerfile` as the source of truth;
   add a build step that converts the OCI image to the Firecracker rootfs +
   kernel format.
3. **Preserve the harness contract.** Live workspace editing (virtio-fs/vsock),
   named-volume auth persistence equivalents, the tmux process model, and the
   cron runtime (`scripts/cron-runtime.ts`) must work inside the microVM, or the
   gaps ship as documented known limitations.
4. **Drop the docker socket in the microVM tier.** The whole point: this tier
   MUST NOT bind-mount `/var/run/docker.sock`. Document the trade-off (no nested
   Docker → use an in-VM runtime instead).
5. **Two consumption modes:**
   - **Self-host:** the tier shipped in-repo for users with KVM-capable hosts.
   - **Hosted (later):** mifune.dev runs the microVM fleet; this plan scopes the
     *isolation primitive*, not billing/control-plane.
6. **Docs + positioning.** New `docs/integrations/microvm.md` (Docusaurus) plus a
   short positioning note: "run untrusted / multi-tenant agents safely."

## Files this research will touch (research artifacts, not product code)

| Path | Change |
| --- | --- |
| `.claude/plans/firecracker-microvm-support-research.md` | This plan (the PR deliverable). |
| `wiki/firecracker.md` (+ `wiki/microvm-isolation.md` if needed) | Phase 1 synthesis via `/wiki-ingest` (+ `wiki/raw/<date>-*.md` snapshots). |
| `memory/<date>/log.md` | Per-phase run logs (Memory Improvement Protocol). |

Implementation-phase files (**post-decision**, deferred until after Phase 4):
`config.json` overlay, a `make sandbox-vm` target in `Makefile`, an image-build
script under `scripts/`, and `docs/integrations/microvm.md`.

## Verification — how we know the research succeeded

- **Phase 0:** threat model ratified with the user; numeric spike criteria written down.
- **Phase 1:** `wiki/firecracker.md` exists with cited sources; the capability
  profile table is filled and Firecracker's limitations are recorded.
- **Phase 2:** the architecture-fit table exists with every harness-contract row
  marked preserved / changed / blocked.
- **Phase 3:** each productization track (internal hardening, hosted offering)
  has an evidence-backed go/no-go and a competitive positioning note.
- **Phase 4:** a recommendation memo exists with both go/no-go calls, the closed
  threat-model rows, residual risks, and the criteria a follow-up spike must hit;
  if go, the implementation/spike issue is filed.

## Out of scope

- **Any spike, host-capability test, PoC, or benchmark** — these are the
  recommended **deferred next step** once this plan is approved and Firecracker
  gets a go. This round is desk research and a decision framework only.
- Writing product code (`config.json` overlay, `make sandbox-vm`, image-build
  script, `docs/integrations/microvm.md`) — all post-decision.
- Broadening to a multi-VMM comparison (Kata / Cloud Hypervisor / gVisor) — only
  if Firecracker is rejected, as a separate research round.
- Multi-tenant billing, quotas, or the hosted control plane.
- GPU passthrough, Windows guests, nested-virt-inside-cloud-VM workarounds.
