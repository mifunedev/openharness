---
title: "Runtimes Overview"
---

# Runtimes Overview

A **runtime** is the isolation boundary the sandbox runs *on*. A **harness** is
an agent CLI that runs *inside* it. They are different things with different
lifecycles, which is why `oh runtime` and [`oh harness`](../harnesses/overview.md)
are separate commands over separate catalogs.

Open Harness runs on a **Docker container** today. Nothing on this page changes
that. `oh runtime` reports which runtime is in use and whether it is healthy,
measures what a deeper tier would need, and installs the tooling for it — but
**it selects no runtime**.

## The commands

```bash
oh runtime list              # every known runtime, and which one is in use
oh runtime status            # the measured value behind each verdict
oh runtime status docker     # just the one you are on
oh runtime install           # install the default (microsandbox)
```

```
$ oh runtime list
RUNTIME       TIER                   STATE    SUPPORTED  IN USE
docker        container              active   yes        yes
microsandbox  microvm                blocked  no         no
gvisor        syscall-interposition  planned  n/a        no
```

`install` **measures first and refuses to run an installer that cannot
succeed**, printing each unmet requirement next to its remediation. `--force`
overrides that judgement — that flag is where your decision lives, not the
command's.

A stopped sandbox is not an error: the command says so and exits 0.

`oh runtime` is host-scoped. Run from inside the sandbox, `install` refuses with
a host-only error, and host requirements report `SUPPORTED` as `?` because they
cannot be measured from the container. Re-run on the host for a verdict. See
[Lifecycle commands → Where you are standing when you type `oh`](../lifecycle-commands.md#where-you-are-standing-when-you-type-oh).

## What is in the catalog

| Runtime | Tier | State | Installable |
|---|---|---|---|
| [Docker container](docker.md) | shared host kernel, namespaces + cgroups | **active** | n/a — already here |
| [MicroSandbox](microsandbox.md) | microVM — one real kernel per sandbox, KVM-backed | blocked | yes, once `/dev/kvm` reaches the container |
| gVisor (`runsc`) | syscall interposition — a userspace kernel, no KVM | planned | no |

### Docker is listed, and it is checked

It would be easy to list only the runtimes you *cannot* use. That answers "what
could I move to" while silently skipping "what am I on, and is it healthy".
`oh runtime status docker` probes the daemon on the **host** — the machine
holding the `oh` binary, not the sandbox — so a dead daemon shows as `FAIL` with
a remediation instead of being assumed fine.

### gVisor is planned, not implemented

It is listed because it is real and measured **GREEN** on a WSL2 host — boot,
detached tmux, isolation, and nested `dockerd` all passed, at 1.15x wall /
2.05x CPU on `npm ci`. But **nothing is implemented here**: it is a host-side
Docker runtime (`--runtime=runsc`), not a package inside the sandbox, so
`oh runtime` cannot install it, and it declares no checks because there is
nothing yet to probe. See
[#806](https://github.com/mifunedev/openharness/issues/806) and draft PR
[#804](https://github.com/mifunedev/openharness/pull/804).

Three entries rather than one is deliberate. A single-entry catalog would encode
a false singleton and need a schema change the moment gVisor lands.

### The two candidates are reached differently

gVisor **is** a Docker runtime (`--runtime=runsc`), so it can in principle be
reached through the existing compose stack. MicroSandbox is **not** — it is its
own VM manager, so it cannot plug into the boot path and instead
[replaces it, running the published image directly](microsandbox.md#running-open-harness-on-microsandbox).
That asymmetry is why the two need different framing, and it is independent of
anything `oh runtime` does.

## Why the CLI stops short of selecting one

Two proposals name the selector differently — `sandbox.substrate` (the substrate
plan, [#802](https://github.com/mifunedev/openharness/issues/802) P4) and
`sandbox.runtime` (the EPIC [#731](https://github.com/mifunedev/openharness/issues/731)
sysbox slice). [#806 § B1](https://github.com/mifunedev/openharness/issues/806)
records this as an open decision and states that settling it outside #731 forks
the `ExecutionTarget` seam.

So `oh runtime` writes no configuration at all. It answers *"what am I on, and
could this machine run something deeper?"* and installs the tool when the answer
is yes. **Naming the command `runtime` does not settle the key** — the command
persists nothing, so whichever name wins, it stays correct.

## What this does not do

- It does not change how the sandbox boots. No runtime is selected.
- It writes no configuration key, and adds no Dockerfile build arg. A build arg
  would bake a guaranteed-failing install into every image (see
  [MicroSandbox](microsandbox.md)).
- It does not rebuild or restart the sandbox.

None of that stops you running Open Harness **on** a different runtime yourself —
it just means the CLI is not how you do it. See
[Running Open Harness on MicroSandbox](microsandbox.md#running-open-harness-on-microsandbox).
