---
title: "Crabbox — Remote-Exec Control Plane"
slug: crabbox-remote-exec-control-plane
tags: [runtime, sandbox, remote-execution, fan-out, control-plane, crabbox, cloudflare-workers, ssh, rsync]
created: 2026-07-04
updated: 2026-07-04
sources:
  - raw/2026-07-04-crabbox-remote-exec-control-plane.md
related: [runtime-isolation-landscape]
confidence: provisional
---

# Crabbox — Remote-Exec Control Plane

## Relevant Source Files
- `raw/2026-07-04-crabbox-remote-exec-control-plane.md` — WebFetch snapshot of the Crabbox "how it works" docs + canonical URLs.
- `.oh/docs/rfcs/rfc-runtime-support.md` §6 — where Open Harness weighs Crabbox as an A3 (fan-out) option.

## Summary
Crabbox (`crabbox.sh`, `openclaw/crabbox`) is a **remote software testing / execution control plane** for short-lived boxes: "warm a box, sync the diff, run the suite." You keep the local edit-save-run loop but offload the expensive or evidence-producing command to an ephemeral remote runner via **lease → sync → run → release**. For Open Harness it is an **axis-A3 (scale/fan-out)** candidate of a fundamentally different shape than "swap the substrate": a lease/govern/cleanup control plane rather than a per-task substrate.

## Detail
**Five-phase `crabbox run` lifecycle.** *Plan* (load layered config, mint a `cbx_…` lease ID, create a per-lease SSH key) → *Lease* (`POST /v1/leases` to the coordinator with class/provider/TTL/idle-timeout/caps + SSH pubkey; coordinator authenticates, enforces spend caps, provisions) → *Sync* (seed remote git from origin+base ref, then rsync only the **dirty** checkout; fingerprint-skip no-op syncs; guard against mass deletion of tracked files) → *Run* (execute over SSH, stream stdout/stderr, heartbeat, mirror phased run records to the broker) → *Release* (delete the runner and free provider state unless `--keep`).

**Three-layer architecture with strict credential segregation.** A local **CLI** (`cmd/crabbox`) holds the per-lease SSH key and does git-seed + rsync + streaming. A **coordinator/broker** holds provider credentials and owns lease state, expiry, cleanup, usage accounting, and cost guardrails — and notably **runs on Cloudflare Workers + a Durable Object** (or Node.js + PostgreSQL + pg-boss). **Runners** are vanilla machines that hold no broker secrets — "leaves: provisioned, used, deleted." Traffic splits `CLI → coordinator (HTTPS/JSON) → provider API` and `CLI → runner (SSH/rsync, direct)`.

**Providers & warm pools.** Brokered providers: Hetzner, AWS, Azure, GCP; direct adapters for static SSH hosts (`provider: ssh` bypasses the broker), local containers, and sandbox runners. `crabbox warmup` keeps a box ready for reuse by friendly slug (e.g. `blue-lobster`); heartbeats recompute idle expiry and the durable scheduler releases untouched leases. Active-lease caps return HTTP 429 when exceeded.

**Why it matters to the harness.** It ships **cost caps, guaranteed cleanup, and credential isolation** that the current "git worktrees + tmux ralph loops in one privileged container" fan-out model lacks. Its sync grain (git seed + rsync dirty tree) matches the harness's "it's just a git repo" design. And its coordinator-on-Workers is a clean example of **Cloudflare Workers used as a control plane, never as the code-execution runner** — reinforcing the runtime myth-bust in [[runtime-isolation-landscape]] (isolate tier ≠ full-OS substrate). It is adjacent to the org's own `mifunedev/sandboxes` ("Collection of Agent Execution Environments").

**Open question (deferred).** For A3, would the harness rather *be* a Crabbox runner target (the sandbox exposed via `provider: ssh`), *embed* the lease/sync/run/release pattern as its own fan-out mechanism, or *integrate* Crabbox directly — versus adopting a self-hosted-microVM / managed-SaaS substrate? Autopilot, the harness's heaviest fan-out consumer, is the first place this choice bites.

## See Also
- [[runtime-isolation-landscape]]
