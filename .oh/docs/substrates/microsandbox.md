---
title: "MicroSandbox"
---

# MicroSandbox

[MicroSandbox](https://github.com/microsandbox/microsandbox) is a microVM tier:
one real kernel per sandbox, KVM-backed. It is the default — and currently the
only — substrate `oh substrate install` knows how to install.

```bash
oh substrate status microsandbox   # what this host has, and what it needs
oh substrate install               # microsandbox is the default name
```

## This harness cannot run it yet

Both blockers below were **measured**, not assumed
([#805](https://github.com/mifunedev/openharness/issues/805), from the P0 spike
in [#803](https://github.com/mifunedev/openharness/pull/803)). `msb` has never
produced a binary in this harness, so there is no local round trip.

| Requirement | This harness | Why |
|---|---|---|
| glibc >= 2.39 | **2.36** | `.devcontainer/Dockerfile` pins `debian:bookworm-slim`. The installer refuses below 2.39. |
| `/dev/kvm` present | **absent** | `.devcontainer/docker-compose.yml` declares no `devices:` key, so the container reaches no KVM. |

Measured glibc across the candidates:

| Target | glibc | Clears the floor |
|---|---|---|
| WSL2 host (Ubuntu 22.04.5) | 2.35 | no |
| Devcontainer (`debian:bookworm-slim`) | 2.36 | no |
| `ubuntu:24.04` | 2.39 | yes, exactly at the floor |
| `debian:trixie-slim` | 2.41 | yes, with headroom |

**Both must clear.** A glibc bump alone installs `msb` and still boots no
microVM, because a microVM needs KVM.

Neither fix belongs to `oh substrate`: the base image is on its own upgrade track
([#807](https://github.com/mifunedev/openharness/issues/807)) and the `devices:`
key is a compose change. Both are tracked in
[#805](https://github.com/mifunedev/openharness/issues/805).

## What `install` does on a blocked host

It measures, reports, and stops — with no network call and no installer run:

```
microsandbox: not supported on this host — nothing was installed.

  glibc      2.36     requires >= 2.39
             .devcontainer/Dockerfile pins debian:bookworm-slim (glibc 2.36). …
  /dev/kvm   absent   requires present
             .devcontainer/docker-compose.yml declares no `devices:` key, …

Tracked in #805. Re-run after the blockers clear,
or pass --force to attempt the install anyway.
```

Exit code 1. `--force` runs the installer regardless — useful for confirming the
upstream error yourself, or on a host you know the probe misread.

## The installer, and where it came from

```bash
curl -sSL https://get.microsandbox.dev -o /tmp/get-msb.sh
sh /tmp/get-msb.sh
```

This is copied verbatim from the P0 spike record
(`.oh/tasks/microsandbox-substrate/next-tasks.md` on
[#803](https://github.com/mifunedev/openharness/pull/803)). It is **not**
reconstructed from upstream docs — with no working binary in this harness there
is nothing to verify a guess against, so the catalog cites the spike instead.

After a successful install the command runs `msb self doctor` and reports a
non-zero result **without** failing the install: the install succeeded, and the
doctor is diagnosing the host.

## CAVEAT — container-side or host-side is not settled

This command installs `msb` **inside the container**, because that is the only
side the CLI's `ExecutionTarget` can reach.

#805 measures the glibc floor against *both* the WSL2 host (2.35) and the
devcontainer (2.36) and does not say which is the intended target. A microVM
tier that replaces the container would plausibly be installed on the host. If
#731 settles it the other way, this command's target changes — and that is a
reason it writes no config today.

## The round trip that would prove it works

From #805's acceptance list. Neither has ever passed here:

```bash
msb self doctor                  # expect exit 0
msb run alpine --exec 'echo ok'  # expect "ok"
```

`msb self doctor` alone proves nothing. The second command is the round trip.

## Related

- [Substrates overview](overview.md) — why the CLI selects no runtime
- [#805](https://github.com/mifunedev/openharness/issues/805) — the two blockers
- [#803](https://github.com/mifunedev/openharness/pull/803) — the P0 measurement record
