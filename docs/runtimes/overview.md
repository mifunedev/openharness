---
title: "Runtimes Overview"
---

# Runtimes Overview

A **runtime** is the isolation boundary the sandbox runs *on*. A **harness** is
an agent CLI that runs *inside* it. They are different things with different
lifecycles, which is why the runtime catalog lives under `oh sandbox` and
[`oh harness`](../harnesses/overview.md) is its own command over its own
catalog.

Open Harness runs on a **Docker container** today. Nothing on this page changes
that.

## The commands

```bash
oh sandbox install docker    # create a sandbox on the only provisionable runtime
oh sandbox list              # every sandbox: name, runtime, status, repo
oh sandbox --help            # the catalog: which runtimes exist, and their state
```

```
$ oh sandbox --help
...
Runtimes:
  docker        provisionable
  microsandbox  planned
```

`oh sandbox install docker` writes a registry entry under
`${OH_HOME:-~/.oh}/sandboxes/<name>/` and boots the container — see
[`oh sandbox install docker`](../deployment-prebuilt-image.md).

`oh sandbox install microsandbox` refuses:

```
oh sandbox install: microsandbox is not a provisionable runtime yet; see
docs/rfcs/rfc-runtime-support.md. Inside a sandbox run `oh tool install microsandbox`.
```

`oh sandbox install` is host-scoped. Run from inside the sandbox it refuses with
a host-only error, because it changes the sandbox's own Docker configuration.
See
[Lifecycle commands → Where you are standing when you type `oh`](../lifecycle-commands.md#where-you-are-standing-when-you-type-oh).

## What is in the catalog

| Runtime | Tier | State | How you reach it |
|---|---|---|---|
| [Docker container](docker.md) | shared host kernel, namespaces + cgroups | **provisionable** | `oh sandbox install docker` |
| [MicroSandbox](microsandbox.md) | microVM — one real kernel per sandbox, KVM-backed | planned | `oh tool install microsandbox` installs the `msb` binary inside a sandbox; running Open Harness *on* msb is a manual host recipe |

Two entries rather than one is deliberate. A single-entry catalog would encode a
false singleton and need a schema change the moment a second runtime lands.

### The two are reached differently

Docker is what the compose stack already drives, so `oh sandbox install docker`
provisions it end to end. MicroSandbox is **not** a Docker runtime — it is its
own VM manager, so it cannot plug into the boot path and instead
[replaces it, running the published image directly](microsandbox.md#running-open-harness-on-microsandbox).
That asymmetry is why the two need different framing.

## Why the CLI selects no substrate key

Two proposals name the selector differently — `sandbox.substrate` (the substrate
plan, [#802](https://github.com/mifunedev/openharness/issues/802) P4) and
`sandbox.runtime` (the EPIC [#731](https://github.com/mifunedev/openharness/issues/731)
sysbox slice). The open decision, and the axes taxonomy behind it, live in
[the runtime-support RFC](../rfcs/rfc-runtime-support.md); settling it outside
#731 forks the `ExecutionTarget` seam.

So the entry records only what it was actually provisioned on: `runtime:
"docker"` in its `oh.json`. Nothing chooses a deeper tier for you.

## What this does not do

- It does not change how the sandbox boots. Only `docker` is provisionable.
- It adds no Dockerfile build arg. A build arg would bake a guaranteed-failing
  install into every image (see [MicroSandbox](microsandbox.md)).
- `oh tool install microsandbox` installs a binary and nothing else: it rebuilds
  no image, restarts no sandbox, and writes no configuration.

None of that stops you running Open Harness **on** a different runtime yourself —
it just means the CLI is not how you do it. See
[Running Open Harness on MicroSandbox](microsandbox.md#running-open-harness-on-microsandbox).
