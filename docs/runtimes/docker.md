---
title: "Docker container"
---

# Docker container

The runtime Open Harness runs on today. A Linux container: a **shared host
kernel**, isolated by namespaces and cgroups.

```bash
oh runtime status docker
```

There is nothing to install — `oh runtime install docker` refuses and says so.
`oh sandbox` starts the container; this page is about checking that the runtime
underneath it is healthy.

## What is checked, and where

| Check | Scope | Probe |
|---|---|---|
| Docker daemon answers | **host** | `docker version --format '{{.Server.Version}}'` |

**Scope matters.** The daemon lives on the machine holding the `oh` binary, not
inside the sandbox. A check run inside the container would answer about the
wrong kernel, so this one is `scope: "host"` while MicroSandbox's glibc and
`/dev/kvm` checks are `scope: "target"`.

A consequence worth knowing: the daemon check still runs when the container is
stopped or absent. That is deliberate — "the sandbox will not start" and "the
daemon is down" are different problems, and `oh runtime status` should be able
to tell you which one you have.

## Healthy

```
$ oh runtime status docker
RUNTIME  TIER       STATE   SUPPORTED  IN USE
docker   container  active  yes        yes

docker — requirements:
  docker     29.7.2     requires exit 0   [host] OK
  see docs/runtimes/docker.md
```

`IN USE` is `yes` when the sandbox container is actually running. It is a fact
about the running sandbox, not a config read — there is no runtime selector to
read (see [#806 § B1](https://github.com/mifunedev/openharness/issues/806)).

## Daemon down

```
$ oh runtime status docker
RUNTIME  TIER       STATE   SUPPORTED  IN USE
docker   container  active  no         no

docker — requirements:
  docker     failed     requires exit 0   [host] FAIL
             The Docker daemon did not answer. Install Docker Engine and start
             it — see https://docs.docker.com/engine/install/ — then re-run
             `oh sandbox`.
```

## What this tier gives you, and what it does not

A shared kernel is the trade. Namespaces and cgroups separate processes,
filesystems, and networks; they do **not** put a kernel boundary between the
workload and the host. The
[isolation landscape](../rfcs/rfc-runtime-support.md) covers the tiers above
this one, and [MicroSandbox](microsandbox.md) is the microVM candidate this
harness is working toward.

Two harness-specific notes:

- **`docker_socket` is off by default.** Mounting the host
  `/var/run/docker.sock` into the sandbox is effectively host root, so it is
  opt-in via `DOCKER_SOCKET` in `.devcontainer/.env`. See
  [security considerations](../security-considerations.md).
- **The container is the unit of disposal.** `make destroy` removes containers
  and volumes; provider auth persists in named volumes across a rebuild.

## Related

- [Runtimes overview](overview.md) — why the CLI selects no runtime
- [MicroSandbox](microsandbox.md) — the microVM candidate, and its two measured requirements
