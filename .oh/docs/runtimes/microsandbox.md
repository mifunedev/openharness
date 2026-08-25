---
title: "MicroSandbox"
---

# MicroSandbox

[MicroSandbox](https://github.com/microsandbox/microsandbox) is a microVM tier:
one real kernel per sandbox, KVM-backed. It is the default — and currently the
only — runtime `oh runtime install` knows how to install.

```bash
oh runtime status microsandbox   # what this host has, and what it needs
oh runtime install               # microsandbox is the default name
```

## Two different questions

This page answers both, and they have different answers. Read the one you are
actually asking.

| | Question | Answer |
|---|---|---|
| **(a)** | Can `oh runtime install microsandbox` succeed *in this devcontainer*? | **No** — two measured blockers, below. |
| **(b)** | Can I run Open Harness **on** MicroSandbox, from my own host? | **Possibly yes, today** — see [Running Open Harness on MicroSandbox](#running-open-harness-on-microsandbox). Nothing on this page measures your host. |

The distinction matters because the two use different commands on different
machines. `oh runtime install` installs `msb` **inside the container**
(`installUser: "sandbox"`, and both its checks are target-scoped). If you want
msb as the **runner** for Open Harness, you install msb on your **host**, from
upstream — `oh runtime install` is not that command and wires nothing up.

## `oh runtime install` cannot succeed in this devcontainer

Both blockers below were **measured**, not assumed
([#805](https://github.com/mifunedev/openharness/issues/805), from the P0 spike
in [#803](https://github.com/mifunedev/openharness/pull/803)). `msb` has never
produced a binary in this harness, so there is no local round trip.

**Everything in this section measures the devcontainer, not your host.** Both
preflight checks are target-scoped, so they answer question (a) only. A current
host — Ubuntu 24.04 ships glibc 2.39 and `/dev/kvm` — may clear both and is
simply not measured here.

| Requirement | This devcontainer | Why |
|---|---|---|
| glibc >= 2.39 | **2.36** | `.devcontainer/Dockerfile` pins `debian:bookworm-slim`. The installer refuses below 2.39. |
| `/dev/kvm` present | **absent** | `.devcontainer/docker-compose.yml` declares no `devices:` key, so the container reaches no KVM. |

Measured glibc across the candidates:

| Target (all container-side except the first) | glibc | Clears the floor |
|---|---|---|
| WSL2 host (Ubuntu 22.04.5) — *this harness's own host, not a claim about hosts generally* | 2.35 | no |
| Devcontainer (`debian:bookworm-slim`) | 2.36 | no |
| `ubuntu:24.04` | 2.39 | yes, exactly at the floor |
| `debian:trixie-slim` | 2.41 | yes, with headroom |

**Both must clear.** A glibc bump alone installs `msb` and still boots no
microVM, because a microVM needs KVM.

Neither fix belongs to `oh runtime`: the base image is on its own upgrade track
([#807](https://github.com/mifunedev/openharness/issues/807)) and the `devices:`
key is a compose change. Both are tracked in
[#805](https://github.com/mifunedev/openharness/issues/805).

## Running Open Harness on MicroSandbox

This is question (b), and it does not go through the `oh` CLI at all.

**MicroSandbox is not a Docker runtime.** You cannot point `docker compose` at it
the way you can point it at gVisor (`--runtime=runsc`). It is its own VM manager
with its own CLI. So it does not plug into the boot path — **it replaces it.**
msb becomes the runner, and the thing it runs is the image Open Harness already
publishes:

```
ghcr.io/mifunedev/openharness:latest
```

msb runs standard OCI images from any registry, so no new image is needed. The
invocation to translate is **not** the compose stack — it is the plain
`docker run` recipe in
[Prebuilt-image deployment](../deployment-prebuilt-image.md) (Flavor B), which
already boots the harness with no compose, no CLI, and no build: five environment
variables and five mounts.

:::caution UNTESTED
Nobody has executed this end to end. `msb` has never produced a binary in this
harness (see the blockers above), so this section is a **translation of a verified
`docker run` recipe into a documented msb schema** — every part is individually
grounded, and the combination is not. The five specific risks are listed at the
bottom. Treat it as a starting point, not a runbook, and please report what you
find.
:::

### Step 1 — Install `msb` on your host

**On your host, not in the container.** This is the step `oh runtime install`
does *not* do for you: that command installs `msb` inside the sandbox, which is
the wrong side for this.

Check the floor first — `msb` needs both, and neither is Open Harness's
requirement:

```bash
ldd --version | head -1        # need glibc >= 2.39
test -e /dev/kvm && echo kvm   # need KVM
```

If either fails, stop. On Linux, KVM usually means adding yourself to the `kvm`
group and confirming virtualisation is enabled in firmware. On macOS or Windows
you need a Linux VM with nested virtualisation; WSL2 exposes `/dev/kvm` only on
recent builds.

Then install and prove it works:

```bash
curl -sSL https://get.microsandbox.dev | sh
msb self doctor                  # expect exit 0
msb run alpine --exec 'echo ok'  # expect "ok"
```

**The second command is the gate.** `msb self doctor` alone proves nothing. If
`msb run alpine` does not print `ok`, the problem is msb on your host and no
amount of Open Harness configuration will fix it.

### Step 2 — Create the directories the sandbox will bind

msb binds **host paths**, where compose used named volumes. Use dedicated
directories — the entrypoint runs `chown -R sandbox:sandbox` and `chmod 700`
against these, so never point them at your real `~/.ssh` or `~/.config`:

```bash
mkdir -p ~/.openharness-msb/{workspace,claude,config,herdr,ssh}
```

**Leave `workspace/` empty.** The entrypoint seeds the control plane from the
image's baked `/opt/oh-seed` on first boot, guarded by `[ ! -d "$dest/.oh" ]`.
Point it at a directory that already contains a `.oh/` and the seed is skipped
**with no error message** — every step in that path is `|| true` — leaving a
harness with no control plane.

### Step 3 — Write the config

#### Compose key to msb key

Container paths are the same on both sides.

| Compose (`docker-compose.image-only.yml`) | msb config | Notes |
|---|---|---|
| `image:` | `image:` | `ghcr.io/mifunedev/openharness:latest`, public |
| `volumes:` (named) | `mounts:` | msb binds **host paths**, not named volumes — the directories from Step 2 |
| `environment:` | `env:` | two keys are load-bearing; see below |
| `ports:` (overlays only) | `network.ports:` | the base stack declares none — it is exec-based |
| *(implicit)* | `network.policy: public` | first boot needs broad egress |
| `command: sleep infinity` | `cmd:` | the image has no long-running CMD of its own |
| `extra_hosts: host.docker.internal` | *(no equivalent)* | only self-hosted Langfuse uses it |
| `healthcheck:` | *(no equivalent)* | run `.oh/scripts/sandbox-healthcheck.sh` manually |

#### The file

Save as `sandbox.yaml`. Derived from the verified `docker run` recipe — the same
five environment variables and five mounts.

```yaml
image: ghcr.io/mifunedev/openharness:latest
workdir: /home/sandbox/harness
cmd: ["sleep", "infinity"]

env:
  OH_IMAGE_ONLY: "1"                          # load-bearing
  OH_PROJECT_ROOT: /home/sandbox/harness      # load-bearing — must equal the mount target
  GIT_USER_NAME: "<your-name>"
  GIT_USER_EMAIL: "<your-email>"
  GH_TOKEN: "${GH_TOKEN}"

mounts:
  - "~/.openharness-msb/workspace:/home/sandbox/harness"
  - "~/.openharness-msb/claude:/home/sandbox/.claude"
  - "~/.openharness-msb/config:/home/sandbox/.config"
  - "~/.openharness-msb/herdr:/home/sandbox/.herdr"
  - "~/.openharness-msb/ssh:/home/sandbox/.ssh"

network:
  policy: public
```

Twelve named volumes exist in the compose file; the five above are the set the
verified `docker run` recipe uses. The other seven are per-harness auth for CLIs
you may not use — add them as you enable those harnesses.

### Step 4 — Start it

```bash
msb run --conf sandbox.yaml --name openharness
msb ls                                    # confirm it is running
```

First boot pulls the image and seeds the workspace, so give it time.

### Step 5 — Verify the seed before you rely on it

This is the step that catches a silent half-boot:

```bash
msb exec openharness -- bash -lc '
  ls /home/sandbox/harness/.oh >/dev/null \
  && bash /home/sandbox/harness/.oh/scripts/link-providers.sh --check \
  && echo SEED_OK'
```

A healthy boot prints `Providers OK: …` and `SEED_OK`. If `.oh` is missing, the
seed was skipped — stop the sandbox, empty the workspace directory, and start
again.

### Step 6 — Attach and work

```bash
msb exec openharness -- zsh     # interactive shell, as under `docker exec`
```

Then, inside — exactly as in any Open Harness sandbox:

```bash
herdr                           # start the terminal workspace
gh auth login && gh auth setup-git
claude                          # or codex, pi, hermes
```

**`msb exec` is your only door.** VS Code's "Attach to Running Container" does
not work — this is not a container. If you want an editor attached, use Remote-SSH
to the host and drive the sandbox from a terminal, or enable the SSH overlay
inside the sandbox and connect to that.

Stop and restart without losing state — the bind directories hold everything:

```bash
msb stop openharness
msb run --conf sandbox.yaml --name openharness   # second boot skips the seed
```

### What you lose

| | |
|---|---|
| **The host Docker socket** | **Gone, and this is the headline.** A microVM has no host `dockerd` to reach. Nested-Docker work stops: `/health-check`'s inventory, container work from inside the sandbox, and — most importantly — **`oh sandbox` / `make sandbox` run *inside* an msb-hosted harness have no daemon.** You cannot manage a harness from in there. |
| **VS Code "Attach to Running Container"** | Gone. It is not a container. Options B and C in [Connecting](../connecting.md) do not apply; you get `msb exec`. |
| `host.docker.internal` | No equivalent. Affects self-hosted Langfuse only. |
| The compose healthcheck | No equivalent. `max_duration` / `idle_timeout` are different semantics — set them explicitly, or a VM manager built for ephemeral work may reap a harness that is meant to run for weeks. |

### The five untested inferences

Ranked by what they cost if wrong:

1. **The entrypoint needs root.** The Dockerfile declares no `USER`, and the
   entrypoint runs `chpasswd`, `usermod`, and `chown -R` before dropping to
   `gosu sandbox`. If msb starts it non-root, **the boot half-fails silently** —
   those calls are `|| true`. This is the highest risk in the translation.
2. **Reaping.** msb's `idle_timeout` / `max_duration` defaults are unknown, and
   Open Harness is explicitly one long-lived sandbox running agents on cron.
3. **ENTRYPOINT/CMD inheritance.** msb exposes explicit `entrypoint:` / `cmd:`
   fields, which suggests it may not inherit them from the image.
4. **Bind UID mapping** through the microVM's filesystem transport — whether
   `chown -R 1000` means the same thing on both sides.
5. **`msb exec` semantics** matching `docker exec -u sandbox`.

**Where your secrets now live.** Under Docker, volume contents sat root-owned
outside your home directory. Under an msb bind they sit in your own filesystem in
plaintext. Not new secrets, but a new location — back up and permission
`~/.openharness-msb/` accordingly.

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

## The round trip that would prove `msb` works

From #805's acceptance list. Neither has ever passed here:

```bash
msb self doctor                  # expect exit 0
msb run alpine --exec 'echo ok'  # expect "ok"
```

`msb self doctor` alone proves nothing. The second command is the round trip.

Both prove that **`msb`** works. Neither says anything about Open Harness running
on it — that is question (b), and it is a different exercise.

## Related

- [Runtimes overview](overview.md) — why the CLI selects no runtime
- [#805](https://github.com/mifunedev/openharness/issues/805) — the two blockers
- [#803](https://github.com/mifunedev/openharness/pull/803) — the P0 measurement record
