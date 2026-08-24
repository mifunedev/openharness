---
title: "Substrates Overview"
---

# Substrates Overview

A **substrate** is the isolation boundary the sandbox runs on. A **harness** is
an agent CLI that runs *inside* it. They are different things with different
lifecycles, which is why `oh substrate` and [`oh harness`](../harnesses/overview.md)
are separate commands over separate catalogs.

Today Open Harness runs on one substrate: an ordinary Docker container. Nothing
on this page changes that. `oh substrate` reports what a deeper tier would need
and installs the tooling for it; **it selects no runtime**.

## Why the CLI stops short of selecting one

Two proposals name the selector differently — `sandbox.substrate` (the substrate
plan, [#802](https://github.com/mifunedev/openharness/issues/802) P4) and
`sandbox.runtime` (the EPIC [#731](https://github.com/mifunedev/openharness/issues/731)
sysbox slice). [#806 § B1](https://github.com/mifunedev/openharness/issues/806)
records this as an open decision and states that settling it outside #731 forks
the `ExecutionTarget` seam.

So `oh substrate` writes no configuration at all. It answers *"could this machine
run MicroSandbox, and what is missing?"* and installs the tool when the answer is
yes. Whichever key wins, this command stays correct.

## The commands

```bash
oh substrate list              # every known substrate and whether this host supports it
oh substrate status            # the same, plus the measured value behind each verdict
oh substrate install           # install the default substrate (microsandbox)
```

`install` **measures the host first and refuses to run an installer that cannot
succeed**, printing each unmet requirement next to its remediation. `--force`
overrides that judgement — that flag is where your decision lives, not the
command's.

A stopped sandbox is not an error: the command says so and exits 0.

## What is in the catalog

| Substrate | Tier | State | Installable here |
|---|---|---|---|
| [MicroSandbox](microsandbox.md) | microVM — one real kernel per sandbox, KVM-backed | blocked | yes, once two blockers clear |
| gVisor (`runsc`) | syscall interposition — a userspace kernel, no KVM | planned | no |

**gVisor is listed but not installable.** It is a host-side Docker runtime
(`--runtime=runsc`), not a package inside the sandbox, so `oh substrate` cannot
reach it. It measured **GREEN** on a WSL2 host — boot, detached tmux, isolation,
and nested `dockerd` all passed, at 1.15x wall / 2.05x CPU on `npm ci` — but the
adoption decision is unmade. See
[#806](https://github.com/mifunedev/openharness/issues/806) and draft PR
[#804](https://github.com/mifunedev/openharness/pull/804).

Two entries rather than one is deliberate. A single-entry catalog would encode a
false singleton and need a schema change the moment gVisor lands.

## What this does not do

- It does not change how the sandbox boots. No substrate is selected.
- It does not write `harness.yaml`, and adds no Dockerfile build arg. A build arg
  would bake a guaranteed-failing install into every image (see
  [MicroSandbox](microsandbox.md)).
- It does not rebuild or restart the sandbox.
