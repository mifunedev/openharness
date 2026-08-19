# RFC: Runtime support — axes taxonomy & the "supported runtime" contract

Status: Draft for [#592](https://github.com/mifunedev/openharness/issues/592). Implementation epic: [#591](https://github.com/mifunedev/openharness/issues/591).

This document defines *how Open Harness treats runtimes* so the build-validate-support
program in #591 builds against a shared contract instead of ad-hoc per-runtime decisions.
It is a definition/decision artifact — it implements no runtime. Which runtimes land, and
in what order, are #591's child issues.

## Purpose

Today the harness has exactly one substrate — a single privileged `debian:bookworm-slim`
container per repo (`.devcontainer/docker-compose.yml`). The host Docker socket is **opt-in and
off by default**: it is a separate overlay (`.devcontainer/docker-compose.docker-sock.yml`)
applied only when `sandbox.docker_socket` / `DOCKER_SOCKET` is truthy
(`.oh/scripts/docker-compose.sh:136`). The image ships the **docker CLI but no `dockerd`**
(`docker-ce-cli` + `docker-compose-plugin`, `.devcontainer/Dockerfile:37`), so in-sandbox Docker
work depends on that opt-in socket — and enabling it is a root-on-host boundary that is fine for
a trusted single operator but the weakest link the moment untrusted, agent-generated code runs
unattended on a shared VM ("remote-first, lights-out software factory", `README.md`). There is no
isolation tier above the privileged container, no per-task blast-radius containment, and no
first-class "ship the app" runtime beyond a localhost `cloudflared` tunnel. Before adding any of
those, we ratify the vocabulary and the bar.

## 1. The three-axis taxonomy

"Runtime" conflates three layers. A candidate that fits one axis can be nonsensical for another,
so every candidate is tagged to the axis it serves.

| Axis | Question | Today | The gap |
|---|---|---|---|
| **A1 — Substrate** | Where does the *sandbox itself* run, and how isolated is it? | 1 privileged container; docker CLI but no `dockerd`, and the host Docker socket is an **opt-in overlay, off by default** | No stronger isolation tier for untrusted / lights-out / multi-tenant runs |
| **A2 — Deploy target** | Where do the *apps agents build* get shipped? | BYO tunnel (`cloudflared`), Railway *smoke-test only*, GHCR publish | No "ship it" runtime — only "expose localhost" |
| **A3 — Scale / fan-out** | How do we run *N tasks in parallel*? | git worktrees in the *one* container + tmux ralph loops | No per-task isolated sandbox; all tasks share one kernel, and — since the image has no `dockerd` — the *same* opt-in host socket whenever it is enabled at all |

## 2. The "supported runtime" contract (ratifiable)

A runtime is **supported** only when it meets *all* of the following — mirroring how agent CLIs
are supported today (`.oh/docs/harnesses/overview.md`):

1. **Documented** — a per-runtime doc at `.oh/docs/runtimes/<name>.md` + a runtimes overview, and a
   row in the install matrix.
2. **One-toggle** — opt-in via a *single* surface: a `harness.yaml` toggle, a compose overlay, or a
   `RUNTIME=` selector. Never a manual multi-step setup.
3. **Validated** — boots the sandbox (or performs its axis's job) and clears the boot-lint +
   `.oh/evals/probes/*` floor.
4. **Guarded** — a dedicated eval/drift probe (exemplar: `.oh/evals/probes/railway-one-click-deploy.sh`)
   so support can't silently rot.

**Per-runtime definition of done:** `implement → validate (probe-green) → document as supported →
friction removed (a one-command path exists)`.

## 3. Guiding principle — actively reduce end-user friction

Every supported runtime must make the operator's life *simpler*, not add a knob to babysit. The
trusted single-operator container stays the **zero-config default**; every new tier is opt-in and
one-toggle, with onboarding docs updated in lockstep (this ties directly into the in-flight
`feat/install-quickstart-reconcile` work). A runtime that adds operational burden without a net
friction reduction does not qualify as "supported" under this contract.

## 4. Fit matrix — candidates × axis

| Candidate | Axis | Isolation / shape | Notes |
|---|---|---|---|
| **gVisor (`runsc`)** | A1 | syscall interposition, shared kernel | **MEASURED 2026-08-19 — GREEN.** Boots, holds a detached tmux session, runs nested `dockerd`. Cost 1.15x wall and 2.05x CPU. See [`rfc-gvisor-support.md`](rfc-gvisor-support.md) |
| **Firecracker microVM** | A1 | kernel-per-sandbox (deepest) | Continues research spike #384; suits untrusted/multi-tenant |
| **Kata Containers** | A1 | microVM depth + OCI/compose compat | Lowest-friction path to microVM-grade isolation *while keeping `docker compose`* |
| **MicroSandbox (`msb`)** | A1 | microVM, KVM-backed | **MEASURED 2026-08-19 — BLOCKED.** The installer requires glibc 2.39. The devcontainer reports 2.36. The WSL2 host reports 2.35. `/dev/kvm` presence does not unblock the tier |
| **E2B / Daytona / Fly Machines / Cloudflare Sandboxes / Modal** | A1/A3 | managed sandbox-as-a-service | Supported = one-toggle **BYO-account** integration; double as the fan-out answer |
| **Cloudflare Workers/Pages (Wrangler)** | A2 | V8 isolate / edge | Deploy target for agent-built apps |
| **Fly.io / Railway-full / Vercel** | A2 | managed PaaS | Deploy targets; Railway upgrades from today's smoke-test |
| **CI-as-runtime (self-hosted GH Actions dind)** | A3 | container on runner | Already half-owned via `CI_RUNNER` (`.github/workflows/sandbox-boot-guard.yml`) |
| **Crabbox** | A3 | remote-exec control plane | See §6 — lease→sync→run→release offload, not a substrate swap |

### 4a. Measured rows

Two rows above report a measurement instead of an estimate. An operator ran the
substrate spike on a WSL2 host on 2026-08-19.

gVisor returns GREEN. The tmux result decides the tier, because the Open Harness
process model makes tmux normative, and no upstream document states how `runsc`
handles PTYs.

MicroSandbox returns BLOCKED on a glibc floor. Both harness machines fall below the
floor. glibc 2.39 needs Ubuntu 24.04 or newer.

Quote both gVisor cost ratios. A workload that waits on the network hides the
userspace-kernel cost inside wall-clock time. A CPU-bound workload pays 2.05x.

Evidence: `.oh/skills/wiki/corpus/raw/2026-08-19-gvisor-wsl2-spike.md`. The gVisor
proposal is [#806](https://github.com/mifunedev/openharness/issues/806). The
MicroSandbox unblock is
[#805](https://github.com/mifunedev/openharness/issues/805).

## 5. Cloudflare, specifically (myth-bust)

Cloudflare ships a two-tier offering; only one tier fits the substrate:

- **Dynamic Workers** (V8 isolates): ~100× faster/cheaper than containers, but **cannot be an A1
  substrate** — no full OS (git/bash/tmux/dev-servers/Docker-socket/multi-language builds). Fine as
  an **A2** target only.
- **Cloudflare Sandboxes / Containers** (GA 2026): persistent isolated Linux with PTY, snapshots,
  filesystem watch, code interpreter, egress-proxy credential injection — the real Cloudflare fit for
  **A1/A3**.
- **Workers/Pages via Wrangler**: the **A2** target proper.

Existing foothold: `oh.mifune.dev/install.sh` is already a Cloudflare Worker (302 redirect) — the CF
edge relationship exists; an A2 deploy skill extends infra we already operate.

## 6. Adjacent architecture — Crabbox (awareness, not yet a committed direction)

**Crabbox** (`crabbox.sh`, `openclaw/crabbox`) is a *remote-execution control plane* — a different
decomposition of A3 than "swap the substrate." Model: keep the local edit-save-run loop; offload the
expensive/evidence-producing command to a short-lived remote box via **plan → lease → sync → run →
release** (sync = seed remote git from origin+base ref, then rsync the *dirty* tree — the same
"it's just a git repo" grain the harness already relies on). Three layers: local **CLI** (per-lease
SSH key) · **coordinator** (provider creds + lease state + cost caps) · **runner** (vanilla ephemeral
machine, no secrets). It ships **cost caps, guaranteed cleanup, and credential isolation** the
worktrees-in-one-container model lacks, and its coordinator *runs on Cloudflare Workers + a Durable
Object* — Workers used correctly as a control plane, never as the code-execution runner, reinforcing
§5. Adjacent to the org's `mifunedev/sandboxes` ("Collection of Agent Execution Environments").

Decision it raises (deferred): for A3, do we prefer a Crabbox-style **offload** over a per-task
substrate — and if so, would the harness **be** a runner target (`provider: ssh`), **embed** the
lease/sync/run pattern, or **integrate** Crabbox directly? Reference wiki entries hold the mechanics:
`crabbox-remote-exec-control-plane`, `runtime-isolation-landscape`.

## 7. What this RFC decides vs. defers

- **Decides:** the axis vocabulary (§1), the "supported" contract (§2), and preservation of the
  zero-config default substrate (§3). On acceptance → recorded as an ADR row in `README.md`.
- **Defers to #591's children:** *which* runtimes land and in what *order* — that ordering turns on
  the primary-driver question (isolation-security vs. fan-out vs. deploy-convenience).

## 8. Proposed child-issue ordering (implements this contract; filed under #591)

1. **A1 · Sysbox execution target** — the scheduled next slice of [#731](https://github.com/mifunedev/openharness/issues/731), landing behind the `ExecutionTarget` contract from [#733](https://github.com/mifunedev/openharness/issues/733). Unprivileged containers that run their *own* `dockerd`, so the tier gains stronger isolation **without** trading away sibling-container capability (see §9).
2. **A1 · gVisor overlay** — cheapest, most reversible; sets the "one-toggle, probe-guarded, documented" support template the others reuse.
3. **A1 · Firecracker microVM** — land #384.
4. **A1 · Kata Containers**.
5. **A1/A3 · Managed sandbox integrations** (E2B / Daytona / Fly / CF Sandboxes / Modal) — BYO-account.
6. **A3 · CI-as-runtime** (`CI_RUNNER` dind).
7. **A2 · Deploy-skill family** (Wrangler / flyctl / Railway-full).
8. **Landscape memo** — `blog/` companion to `2026-06-07-containers-microvms-vms.md`.

## 9. Open decisions

- **Primary driver** — isolation-security vs. fan-out vs. deploy-convenience (reorders §8).
- **Self-hosted vs managed** — own the isolation fleet (gVisor/Firecracker/Kata) or rent it; for
  managed, does "supported" = a documented BYO-account integration?
- ~~**DinD trade-off**~~ — **ANSWERED**: the trade is not forced. Sysbox gives the tier its **own
  `dockerd`** inside an unprivileged container, so a stronger-isolation tier keeps
  sibling-container capability instead of losing it — which is why Sysbox is now §8 item 1. The
  host socket stays what it already is: opt-in and off by default (§Purpose). Decided under
  [#731](https://github.com/mifunedev/openharness/issues/731) /
  [#733](https://github.com/mifunedev/openharness/issues/733); the boundary that makes a second
  execution target an implementation detail is recorded in
  [`rfc-brain-hands-boundary.md`](rfc-brain-hands-boundary.md). Still open *per candidate*: what
  gVisor and Firecracker tiers do, since neither ships a nested daemon for free.
- **Control-plane vs substrate-swap (Crabbox)** — offload model vs. per-task substrate for A3.
- **Install-matrix constraint** — must every supported tier work across all install paths, or may
  advanced substrates be VM-only (documented as such)?

## Non-goals

- No runtime is implemented here.
- V8-isolate / WASM runtimes *as a substrate* (cannot host a full-OS sandbox) and Kubernetes/Nomad
  orchestration (over-heavy for "one repo, one sandbox") remain out of scope.
