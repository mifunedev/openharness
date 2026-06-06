# Research Plan — Firecracker / microVM Isolation for mifune.dev

> Status: **Research plan (pre-spike)** · Owner: orchestrator · Created: 2026-06-06
> Type: research + support plan · Target branch: `development`

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

For mifune.dev to **offer microVM support** — i.e. a stronger-isolation tier
that makes it safe to run untrusted agents and, eventually, multi-tenant
hosted sandboxes — we need a kernel-per-workload boundary. **Firecracker**
(the VMM behind AWS Lambda/Fargate: ~125 ms boot, <5 MB/VM overhead, minimal
device model) is the leading candidate, but it is not the only one, and it
carries real host-infra and DX costs. **No prior investigation exists in the
repo** (grep for `firecracker|microvm|kata|gvisor|kvm` → zero hits).

**Intended outcome of this plan.** A time-boxed research effort that ends in a
**go/no-go decision** plus, if go, a concrete **support plan** for shipping a
`microvm` isolation tier alongside the existing Docker default — without
regressing the harness developer experience (bind-mount-style live editing,
named-volume auth persistence, tmux process model, `make sandbox` ergonomics).

## Goals & non-goals

**Goals**
- Pick the isolation technology and orchestration layer with evidence, not vibes.
- Preserve OCI image compatibility and the current `make` / compose DX as far as possible.
- Produce a benchmarked comparison (boot, memory, DX friction, isolation strength).
- Output a productization path for mifune.dev (self-host tier + hosted tier).

**Non-goals (this phase)**
- Building the production multi-tenant control plane (that is post-decision work).
- GPU passthrough, nested-virt-in-VM matrices, or Windows guests.
- Replacing Docker for the *trusted* default path — microVM is an **added tier**, not a forced migration.

## Threat model (Phase 0 must ratify this before any spike)

The recommended tech depends entirely on which row(s) we are buying down:

| Threat | Docker today | What microVM buys |
| --- | --- | --- |
| Untrusted agent code persists a rootkit on host | **Exposed** (socket → root) | Strong: separate kernel + no host socket |
| Container escape via kernel CVE reaches host | **Exposed** | Strong: KVM boundary |
| Cross-tenant data exfiltration (hosted) | N/A (single-tenant today) | Strong: per-tenant VM |
| Resource exhaustion / noisy neighbor | Partial (no cgroup limits set) | Strong: VM-bounded mem/CPU |
| Supply-chain compromise of the base image | Exposed | **Unchanged** — VM does not fix image trust |

Decision rule: if the ratified threat model is only "prevent host persistence
on a single-operator box," a cheaper hardening pass (drop the docker socket +
user namespaces + read-only rootfs + cgroup limits) may suffice and microVM is
deferred. If it includes "run untrusted code" or "multi-tenant hosting,"
microVM is justified.

## Candidate technologies to evaluate

| # | Option | VMM | DX cost | Isolation | Notes |
| --- | --- | --- | --- | --- | --- |
| A | **Kata Containers** (containerd `RuntimeClass`) | Firecracker **or** Cloud Hypervisor | **Low** — OCI-compatible drop-in runtime | VM-grade | Lowest friction; keeps image + compose model. Heavier than raw Firecracker. |
| B | **Raw Firecracker + firecracker-containerd** | Firecracker | High — build rootfs+kernel pipeline, TAP networking, jailer | VM-grade, minimal | Max control / min overhead; most engineering. AWS-maintained. |
| C | **Cloud Hypervisor** | Cloud Hypervisor | Medium-High | VM-grade | More device support than Firecracker (virtio-fs, more I/O) — better fit for dev-like workloads that need a live-editable filesystem. |
| D | **gVisor (runsc)** | userspace kernel (not a true VM) | Low | Syscall-interception (weaker than VM) | Lightest; but syscall-compat gaps can break toolchains and the boundary is softer. |
| E | **flintlock / Cluster API** | Firecracker | High | VM-grade | Lifecycle/orchestration layer on Firecracker; relevant only if we go bare-Firecracker at fleet scale. |

**Working hypothesis (to be confirmed or killed by the spikes):** Option **A
(Kata + Firecracker/Cloud Hypervisor via a containerd RuntimeClass)** is the
best balance — it preserves OCI images and most of the existing workflow while
giving a real VM boundary, so the harness changes stay small. Raw Firecracker
(B) is the fallback if Kata's overhead or the virtio-fs live-edit story proves
unacceptable.

## Hard constraint to verify first: host capability

Firecracker/Kata require **`/dev/kvm`** (hardware virt). This is the gating
infra question:
- **Bare metal** (Equinix, Hetzner dedicated, AWS `*.metal`) → KVM available.
- **Standard cloud VMs** → usually **no nested virt**; spikes will fail. Must
  confirm per target provider before committing engineering time.
- The harness's bind-mount live-edit model does **not** survive into a microVM
  unchanged — the guest needs **virtio-fs** or a vsock file sync to expose the
  workspace. This is the single biggest DX risk and must be prototyped, not assumed.

## Phased approach

Each phase has a gate; do not start the next until the gate passes.

**Phase 0 — Frame (½ day).** Ratify the threat model table above with the user.
Define numeric success criteria (e.g. boot ≤ 2 s, mem overhead ≤ 50 MB/sandbox,
zero workflow-breaking DX regressions). Gate: signed-off threat model + criteria.

**Phase 1 — Landscape review (1 day).** Ingest authoritative sources into the
wiki via `/wiki-ingest` (Firecracker design doc, Kata architecture, gVisor
security model, firecracker-containerd). Produce `wiki/firecracker.md`,
`wiki/kata-containers.md`, `wiki/microvm-isolation.md`. Gate: candidate matrix
above refined with cited facts.

**Phase 2 — Host capability spike (½ day).** On the actual target host(s),
confirm `/dev/kvm`, run upstream Firecracker "hello microVM" + a Kata
`RuntimeClass` smoke test. Gate: a microVM boots on target infra, or we record
which providers are disqualified.

**Phase 3 — Two parallel PoC spikes (2–3 days, isolated worktrees).**
- **3A Kata path:** install containerd + Kata, register a `RuntimeClass`, run
  the existing devcontainer image under it. Measure how much of `make sandbox`
  survives. Prototype workspace live-edit via virtio-fs.
- **3B Firecracker path:** firecracker-containerd, convert the devcontainer
  image → ext4 rootfs + kernel, TAP networking, exec a `claude -p` agent run.
Gate: both spikes either run an agent end-to-end or document a hard blocker.

**Phase 4 — Benchmark & decide (1 day).** Fill the matrix: cold/warm boot,
mem/CPU overhead vs Docker baseline, DX friction (does live edit work? does
tmux/cron model survive? does auth volume persistence work?), isolation
strength, ops complexity. Gate: a single recommended option with evidence.

**Phase 5 — Support plan (output, ½ day).** Write the productization plan
(below) for the chosen option and open the implementation issue(s).

## Support plan — how mifune.dev offers microVM support (drafted; finalized in Phase 5)

This is the *shape* of the offering, to be confirmed once the tech is chosen:

1. **Isolation as a tier, not a replacement.** Add an `isolation` selector:
   `docker` (default, unchanged) | `microvm` (new). Surfaced via `config.json`
   (already the compose-overlay mechanism — `Makefile:10-17` reads
   `.composeOverrides[]`) and/or a `make sandbox-vm` target. No regression for
   existing single-operator users.
2. **Image pipeline.** Reuse the existing `.devcontainer/Dockerfile` as the
   source of truth; add a build step that converts the OCI image to the format
   the chosen runtime needs (RuntimeClass = none; raw Firecracker = rootfs+kernel).
3. **Preserve the harness contract.** Live workspace editing (virtio-fs/vsock),
   named-volume auth persistence equivalents, tmux process model, and the cron
   runtime (`scripts/cron-runtime.ts`) must all work inside the microVM, or the
   gaps are documented as known limitations.
4. **Drop the docker socket in the microVM tier.** The whole point: the
   microVM tier MUST NOT bind-mount `/var/run/docker.sock`. Document the
   capability trade-off (no nested Docker → use the in-VM runtime instead).
5. **Two consumption modes for mifune.dev:**
   - **Self-host:** the new tier shipped in-repo for users with KVM-capable hosts.
   - **Hosted (later):** mifune.dev runs the microVM fleet; this plan only
     scopes the *isolation primitive*, not the billing/control-plane.
6. **Docs + positioning.** New `docs/integrations/microvm.md` (Docusaurus) and
   a short positioning note: "run untrusted / multi-tenant agents safely."

## Files this research will touch (research artifacts, not product code yet)

| Path | Change |
| --- | --- |
| `.claude/plans/firecracker-microvm-support-research.md` | This plan (the PR deliverable). |
| `wiki/firecracker.md`, `wiki/kata-containers.md`, `wiki/microvm-isolation.md` | Phase 1 synthesis via `/wiki-ingest` (+ `wiki/raw/<date>-*.md` snapshots). |
| `.worktrees/spike/*` | Phase 3 throwaway PoC scaffolding, isolated per `context/rules/git.md` § Worktrees. |
| `memory/<date>/log.md` | Per-phase run logs (Memory Improvement Protocol). |

Implementation-phase files (deferred until after the Phase 4 decision):
`config.json` overlay, a `make sandbox-vm` target in `Makefile`, an image-build
script under `scripts/`, and `docs/integrations/microvm.md`.

## Verification — how we know the research succeeded

- **Phase 2:** `firecracker --version` runs and a sample microVM boots on the
  target host; `/dev/kvm` confirmed present (or providers explicitly disqualified).
- **Phase 3:** an agent (`claude -p "<probe>"`) executes end-to-end inside the
  microVM under each candidate and returns output; live-edit prototype reflects
  a host-side file change inside the guest.
- **Phase 4:** the benchmark matrix is filled with real numbers against the
  Docker baseline, and exactly one option is recommended with the threat-model
  rows it closes.
- **Phase 5:** an implementation issue exists with the support plan above,
  scoped to the chosen tech.

## Out of scope

- Writing the production microVM runtime / control plane (post-decision).
- Multi-tenant billing, quotas, or the hosted control plane.
- GPU passthrough, Windows guests, nested-virt-inside-cloud-VM workarounds.
- Forcing existing Docker users to migrate — the default path stays Docker.
