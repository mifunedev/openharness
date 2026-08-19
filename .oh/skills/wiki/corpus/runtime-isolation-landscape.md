---
title: "Runtime Isolation Landscape (2026)"
slug: runtime-isolation-landscape
tags: [runtime, isolation, sandbox, gvisor, firecracker, kata, microvm, cloudflare, e2b, daytona, fly, modal]
created: 2026-07-04
updated: 2026-08-19
sources:
  - raw/2026-07-04-runtime-isolation-landscape.md
  - raw/2026-08-19-gvisor-wsl2-spike.md
related: [crabbox-remote-exec-control-plane, sandbox-dependency-installs, gvisor-wsl2-substrate]
confidence: provisional
---

# Runtime Isolation Landscape (2026)

## Relevant Source Files
- `raw/2026-07-04-runtime-isolation-landscape.md` — WebFetch snapshot (isolation strategies) + the multi-source 2026 landscape corpus.
- `.oh/docs/rfcs/rfc-runtime-support.md` — the Open Harness runtime-support RFC whose fit matrix this entry backs.
- `raw/2026-08-19-gvisor-wsl2-spike.md` — the 2026-08-19 measurement that confirmed the gVisor row.

## Summary
A reference map of the 2026 sandbox-isolation options for running agent-generated code, ranked by isolation depth and tagged to the harness's runtime axes (A1 substrate, A2 deploy, A3 fan-out). The load-bearing fact: **plain containers are Level-1 isolation** ("insufficient for anything an LLM generates"), which is exactly the harness's current substrate — one privileged container sharing the host kernel and Docker socket. Stronger tiers (gVisor → Kata/Firecracker) exist and are what an A1 upgrade would adopt.

## Detail
**Isolation ladder (deepest last).**
- **Plain containers (runc/namespaces)** — Level 1. Shared host kernel + cgroups; a kernel exploit in one container can compromise all. Fine for trusted code, not untrusted LLM output.
- **gVisor (`runsc`)** — Level 2. A user-space kernel intercepts/re-implements syscalls so the workload never touches the real kernel; imperfect syscall coverage causes some compatibility friction. Used by Google (Agent Sandbox on GKE) and **Modal**. Cheapest step up from plain containers — a drop-in OCI runtime.
- **Kata Containers** — Level 3. MicroVM-grade isolation (dedicated kernel via hardware virtualization) **while keeping full Docker/OCI image compatibility** — the lowest-friction path to microVM depth. Offered by Northflank and **Daytona**.
- **Firecracker microVMs** — Level 3, the "gold standard for untrusted code." Kernel-per-sandbox on KVM; boots in **~125ms with ~5MB overhead**. Powers AWS Lambda, **E2B**, and Vercel Sandbox.

**Managed sandbox-as-a-service (A1/A3).** **E2B** (Firecracker, ~150ms cold start), **Daytona** (sub-90ms; Docker default, optional Kata path), **Fly Machines** (Firecracker), **Modal** (Python-native, GPU A100/H100, gVisor). Cold-start caveat: at high concurrency (~400 parallel starts) CNI/virtual-switch setup dominates, inflating latency up to 263% (a 125ms boot → multi-second) — relevant to any A3 fan-out plan.

**Cloudflare is two-tier — only one tier is a substrate.** *Dynamic Workers* = V8 isolates, ~100× faster/cheaper than containers with ms cold starts, but **no full OS** → an A2 deploy target only, never an A1 substrate. *Sandboxes/Containers* (GA 2026) = persistent isolated Linux with PTY, snapshot recovery, filesystem watch, code interpreter, and egress-proxy credential injection → the real Cloudflare fit for **A1/A3**. This is the "Cloudflare Workers can't host the sandbox" myth-bust; see [[crabbox-remote-exec-control-plane]] for Workers used correctly as a control plane.

**Categorization for adoption.** *Primitives* (Firecracker/gVisor) suit teams running their own fleet; *embeddable runtimes* (E2B, microsandbox) add code-exec quickly; *managed platforms* (Modal/Northflank/Daytona) suit data-heavy/GPU/zero-ops. For Open Harness the cheapest, most reversible first experiment is a **gVisor overlay** — a large isolation gain over `--privileged` + host socket for roughly one command's cost.

## Measured rows (2026-08-19)

An operator measured two tiers on a WSL2 host. The rest of this entry stays
provisional, because nobody has measured the other tiers on a harness host.

**gVisor — CONFIRMED.** `runsc` boots, holds a detached tmux session, and runs
nested `dockerd`. The workload sees kernel `4.19.0-gvisor` against a host kernel of
`6.18.33.2-microsoft-standard-WSL2`. Cost: 1.15x wall-clock and 2.05x CPU on an
`npm ci` over 1055 dependencies. Quote both ratios. The entry's claim that a gVisor
overlay is "the cheapest, most reversible first experiment" now rests on a
measurement.

**MicroSandbox — BLOCKED.** The installer requires glibc 2.39 or newer. The WSL2
host reports 2.35, and the devcontainer reports 2.36. `/dev/kvm` presence does not
unblock the tier.

Detail and the host prerequisites live in [[gvisor-wsl2-substrate]].

## See Also
- [[gvisor-wsl2-substrate]]
- [[crabbox-remote-exec-control-plane]]
- [[sandbox-dependency-installs]]
