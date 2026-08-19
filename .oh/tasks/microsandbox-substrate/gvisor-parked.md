# gVisor — parked state

The operator paused the gVisor work on 2026-08-19 to focus on MicroSandbox. The
sections below hold the resume procedure. Read the procedure before you reopen the
gVisor thread.

## Where the work sits

| Item | State | Location |
|---|---|---|
| P0 measurement | DONE, GREEN | `p0-spike-results.md`, PR #803 |
| gVisor RFC | Draft, CI green | PR #804 |
| Wiki entry `gvisor-wsl2-substrate` | `confidence: confirmed` | PR #804 |
| Wiki entry `runtime-isolation-landscape` | gVisor row confirmed, entry stays `provisional` | PR #804 |
| Fit matrix row | MEASURED GREEN | PR #804 |
| Host state | Docker Engine and `runsc` installed | `gvisor-host-runbook.md` |

Both pull requests are drafts. Neither merges without a human decision.

## The evidence is settled. The decision is not.

The spike proved a capability. The RFC proposes a commitment. A reader who conflates
capability and commitment will think the gVisor work has ended.

The measured facts left proposal status already. The wiki entry reads `confirmed`,
and the fit matrix row reads MEASURED GREEN. Neither statement hedges.

The RFC stays Draft, because nobody has agreed to adopt gVisor.

## What blocks `Accepted`

### B1 — two config keys for one decision

P4 of the substrate plan proposes `sandbox.substrate`. The EPIC #731 sysbox slice
proposes `sandbox.runtime`. One decision needs one selector.

Accepting the gVisor RFC before #731 states the key forks the `ExecutionTarget`
seam. The sysbox slice names a same-container swap as the error its own v1 made.

**Resume action.** Read `.oh/worktrees/plan/731-sysbox-execution-target`. Take the
key decision to #731. Do not decide the key inside the gVisor RFC.

### B2 — one host, one architecture

The spike measured one WSL2 host on amd64. The RFC generalizes to "a harness host".

**Resume action.** Run `gvisor-host-runbook.md` § Procedure 2 on a second host.
Report the result table. A second GREEN raises confidence, and a RED narrows the
RFC's claim.

### B3 — one network-bound workload behind the cost number

`npm ci` waits on the network and on disk. The 1.15x wall-clock figure inherits that
wait. The 2.05x CPU figure is the honest half.

**Resume action.** Measure one CPU-bound workload. A compile or a test suite works.
Report both ratios again.

### B4 — the RFC has no `RFC:` issue

`.oh/docs/rfcs/README.md` § Convention states that a proposal is a GitHub issue
with a title that starts with `RFC:`. Issue #802 carries a `task:` title, so the
gVisor proposal has no discussion surface.

**Resume action.** File `RFC: gVisor as a supported A1 substrate`. Point the index
row in `.oh/docs/rfcs/README.md` at the new issue.

## Resume procedure

1. Read `gvisor-parked.md` and `p0-spike-results.md`.
2. Check whether #731 has stated one config key. B1 gates everything else.
3. Verify the host still runs the substrate:
   ```bash
   export DOCKER_HOST=unix:///run/docker-engine.sock
   docker run --runtime=runsc --rm hello-world
   ```
   A failure means the host changed. `gvisor-host-runbook.md` § Procedure 1 triages.
4. Clear B4, which costs one command and needs no measurement.
5. Clear B2 and B3 if a reviewer asks for them.
6. Take the accept decision to the human. The human owns the merge gate.

## What NOT to do on resume

- Do not flip the RFC to `Accepted` without the human. The lifecycle in
  `.oh/docs/rfcs/README.md` reads Draft, Accepted, Superseded, and `Accepted` means
  agreed.
- Do not add a config key to the gVisor RFC. B1 explains the fork.
- Do not add an eval probe for gVisor. A probe needs a host that runs `runsc`, and
  CI runners do not. A probe that skips on every runner asserts nothing.
- Do not revert the host. `gvisor-host-runbook.md` § Procedure 3 holds the revert,
  and running it removes the substrate that this task measured.

## Note on tiers, for the next reader

gVisor and MicroSandbox sit at different isolation levels. A reader who expects a
microVM will misread the gVisor result.

| Tier | Mechanism | Level |
|---|---|---|
| `runc` | shared host kernel, namespaces | 1 |
| gVisor `runsc` | a userspace kernel serves the syscalls | 2 |
| MicroSandbox `msb` | a microVM, one kernel per sandbox, KVM-backed | 3 |

gVisor is not a microVM. gVisor intercepts syscalls in userspace, and needs no KVM.
MicroSandbox boots a real kernel per sandbox, and needs KVM.

The two tiers answer different questions, and the harness may adopt both. gVisor
costs less to adopt. MicroSandbox isolates more deeply.
