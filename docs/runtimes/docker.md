---
title: "Docker container"
---

# Docker container

The runtime Open Harness runs on today, and the only **provisionable** one. A
Linux container: a **shared host kernel**, isolated by namespaces and cgroups.

```bash
oh sandbox install docker   # create a sandbox on this runtime, from any directory
oh sandbox list             # name, runtime, status, repo
```

There is nothing to install for the runtime itself — Docker is a host
prerequisite. `oh sandbox install docker` writes a registry entry under
`${OH_HOME:-~/.oh}/sandboxes/<name>/` and starts the container; the recipes are
in [`oh sandbox install docker`](../deployment-prebuilt-image.md).

## Where the daemon has to be

The Docker daemon lives on the machine holding the `oh` binary, not inside the
sandbox. `oh sandbox install` is therefore host-only and refuses with a
host-only error when run inside a sandbox — see
[Lifecycle commands](../lifecycle-commands.md#where-you-are-standing-when-you-type-oh).

If the daemon is not answering, `oh sandbox install docker` fails at the compose
call. Install Docker Engine and start it — see
<https://docs.docker.com/engine/install/> — then re-run the command.
`oh ps <name>` reports whether an existing sandbox is up.

## What this tier gives you, and what it does not

A shared kernel is the trade. Namespaces and cgroups separate processes,
filesystems, and networks; they do **not** put a kernel boundary between the
workload and the host. The
[isolation landscape](../rfcs/rfc-runtime-support.md) covers the tiers above
this one, and [MicroSandbox](microsandbox.md) is the microVM candidate this
harness is working toward.

Two harness-specific notes:

- **The host Docker socket is off by default.** Mounting
  `/var/run/docker.sock` into the sandbox is effectively host root, so it is
  opt-in: the wizard asks, and `access.dockerSocket` in the entry's `oh.json`
  records the answer. See
  [security considerations](../security-considerations.md).
- **The container is the unit of disposal.** `oh destroy <name>` removes the
  containers, the volumes, and the registry entry; `oh stop <name>` keeps the
  volumes, so provider auth survives a rebuild.

## Related

- [Runtimes overview](overview.md) — why the CLI selects no substrate key
- [MicroSandbox](microsandbox.md) — the microVM candidate, and its two measured requirements
