---
title: "MicroSandbox"
---

# MicroSandbox

[MicroSandbox](https://github.com/microsandbox/microsandbox) is a microVM tier:
one real kernel per sandbox, KVM-backed. It is **planned**, not provisionable —
`oh sandbox install microsandbox` refuses:

```
oh sandbox install: microsandbox is not a provisionable runtime yet; see
docs/rfcs/rfc-runtime-support.md. Inside a sandbox run `oh tool install microsandbox`.
```

What *is* shipped is the `msb` binary, as an ordinary installable tool:

```bash
oh tool install microsandbox   # inside a sandbox; installs msb as the sandbox user
oh tool status microsandbox    # installed state and version
```

## Which question are you asking?

This page answers two, and they have different answers. Read the one you are
actually asking.

| Question | Short answer |
|---|---|
| **How do I get the `msb` binary?** | `oh tool install microsandbox` — see [Installing `msb`](#installing-msb). |
| **Can I run Open Harness *on* MicroSandbox, from my own host?** | **Possibly yes, today** — see [Running Open Harness on MicroSandbox](#running-open-harness-on-microsandbox). Nothing on this page measures your host. |

The distinction matters because the two use different commands on different
machines. `oh tool install microsandbox` installs `msb` **inside the sandbox**
(`installUser: "sandbox"`). If you want msb as the **runner** for Open Harness,
you install msb on your **host**, from upstream — the tool verb is not that
command and wires nothing up.

## Installing `msb`

`oh tool install microsandbox` runs the pinned upstream installer as the
`sandbox` user. It downloads the script to a temp file, checks it against a
pinned `sha256`, and runs it with
`MSB_HOME="${NPM_USER_PREFIX:-$HOME/.local}/microsandbox"`. Observed result:

```
~/.local/microsandbox/bin/msb      # the binary MSB_HOME receives
~/.local/bin/msb                   # the symlink that puts it on PATH
$ msb --version
msb 0.6.16
```

Only the installer *script* is pinned. Upstream's script always fetches the
latest release, so the version you get is whatever upstream publishes.

The install lands in `~/.local`, inside the persistent home mount, so it
survives a container recreate and `oh destroy <name>` removes it. It needs
network access, rebuilds no image, restarts no sandbox, and writes no
`oh.json` field.

**`msb self doctor` is yours to run.** The harness runs no doctor and makes no
readiness verdict: `oh tool install microsandbox` verifies only that `msb` is on
PATH (`command -v msb`). Check the host yourself:

```bash
msb self doctor                  # expect exit 0
msb run alpine --exec 'echo ok'  # expect "ok"
```

## What a microVM still needs

`msb` runs microVMs, and a microVM needs a kernel boundary the container cannot
fabricate. Two requirements were **measured**
([#805](https://github.com/mifunedev/openharness/issues/805), from the P0 spike
in [#803](https://github.com/mifunedev/openharness/pull/803)):

| Requirement | This devcontainer | Why |
|---|---|---|
| glibc >= 2.39 | **cleared** | `.devcontainer/Dockerfile` pins `debian:trixie-slim`, whose glibc clears the 2.39 floor with headroom. |
| `/dev/kvm` present | **absent** | `.devcontainer/docker-compose.yml` declares no `devices:` key, so the container reaches no KVM. |

The glibc floor was a base-image decision and the base upgrade to
`debian:trixie-slim`
([#807](https://github.com/mifunedev/openharness/issues/807)) cleared it.
Passing `/dev/kvm` into the sandbox is a compose change, tracked in
[#805](https://github.com/mifunedev/openharness/issues/805).

So the binary installs cleanly here, and **running** a microVM from inside this
sandbox still fails for want of KVM. That is why the install is a tool verb with
no preflight verdict: installing a binary and being able to boot a microVM are
different claims, and only you can measure the second one on your host.

## Which side msb belongs on is not settled

`oh tool install microsandbox` installs `msb` **inside the sandbox**, because
that is the only side the CLI's `ExecutionTarget` can reach. Whether that is the
*right* side is open.

#805 measures the glibc floor against *both* the WSL2 host (2.35) and the
devcontainer (now Trixie, above the 2.39 floor) and does not say which is the
intended target. A microVM tier that replaces the container would plausibly be
installed on the host. If
[#731](https://github.com/mifunedev/openharness/issues/731) settles it the other
way, the tool's target changes — and that is a reason it writes no config
today. The axes taxonomy behind the decision is in
[the runtime-support RFC](../rfcs/rfc-runtime-support.md).

## Running Open Harness on MicroSandbox

This does not go through the `oh` CLI at all.

**MicroSandbox is not a Docker runtime.** You cannot point `docker compose` at it
the way you can point it at a Docker-level runtime. It is its own VM manager
with its own CLI. So it does not plug into the boot path — **it replaces it.**
msb becomes the runner, and the thing it runs is the image Open Harness already
publishes:

```
ghcr.io/mifunedev/openharness:latest
```

msb runs standard OCI images from any registry, so no new image is needed. The
invocation to translate is **not** the compose stack — it is the plain
`docker run` recipe in
[`oh sandbox install docker`](../deployment-prebuilt-image.md), which already
boots the harness with no compose, no CLI, and no build.

:::caution UNTESTED
Nobody has executed this end to end. No microVM has ever booted in this harness
(see [what a microVM still needs](#what-a-microvm-still-needs)), so this section
is a **translation of a verified `docker run` recipe into a documented msb
schema** — every part is individually
grounded, and the combination is not. The five specific risks are listed at the
bottom. Treat it as a starting point, not a runbook, and please report what you
find.
:::

### Step 1 — Install `msb` on your host

This is the step `oh tool install microsandbox` does *not* do for you: that verb
installs `msb` inside the sandbox, which is the wrong side for this.

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

For a review-first install, download and inspect the script before you run it:

```bash
curl -sSL -o get-microsandbox.sh https://get.microsandbox.dev
less get-microsandbox.sh
bash get-microsandbox.sh
```

**The second command is the gate.** `msb self doctor` alone proves nothing. If
`msb run alpine` does not print `ok`, the problem is msb on your host and no
amount of Open Harness configuration will fix it.

### Step 2 — Create the directories the sandbox will bind (host)

msb binds **host paths**, where compose used named volumes. Use dedicated
directories — the entrypoint runs `chown -R sandbox:sandbox` and `chmod 700`
against these, so never point them at your real `~/.ssh` or `~/.config`:

```bash
mkdir -p ~/.openharness-msb/{workspace,claude,config,herdr,ssh}
```

**`workspace/` must be empty.** The entrypoint seeds the control plane from the
image's baked `/opt/oh-seed` on first boot, guarded by `[ ! -d "$dest/.oh" ]`.
Point it at a directory that already contains a `.oh/` and the seed is skipped
**with no error message** — every step in that path is `|| true` — leaving a
harness with no control plane. Confirm it before you boot:

```bash
# Must print nothing. Anything here means the seed will be skipped.
ls -A ~/.openharness-msb/workspace
```

**These directories now hold your secrets.** Under Docker, volume contents sat
root-owned outside your home directory. Under an msb bind they sit in your own
filesystem in plaintext. Not new secrets, but a new location — permission and
back up `~/.openharness-msb/` accordingly.

### Step 3 — Write the config (host)

#### Compose key to msb key

Container paths are the same on both sides.

| Compose (`docker-compose.image-only.yml`) | msb config | Notes |
|---|---|---|
| `image:` | `image:` | `ghcr.io/mifunedev/openharness:latest`, public |
| `volumes:` (named) | `mounts:` | msb binds **host paths**, not named volumes — the directories from Step 2 |
| `environment:` | `env:` | two keys are load-bearing; see below |
| `ports:` (overlays only) | `network.ports:` | the base stack declares none — it is exec-based |
| *(implicit)* | `network.policy: public` | first boot needs broad egress |
| *(image `CMD ["/sbin/init"]`)* | `cmd:` | systemd must be PID 1; set explicitly because msb may not inherit the image `CMD` |
| `cap_add: [SYS_ADMIN]` | *(no confirmed equivalent)* | systemd needs it to mount its own cgroup2 hierarchy — see risk 5 |
| `tmpfs: [/run, /run/lock, /sys/fs]` | *(no confirmed equivalent)* | leaves `/sys/fs/cgroup` unmounted so systemd mounts it writable and container-private — see risk 5 |
| `security_opt: [apparmor=unconfined]` | *(no confirmed equivalent)* | the docker-default AppArmor profile denies systemd's mounts even with `CAP_SYS_ADMIN` |
| `cgroup: private` | *(no confirmed equivalent)* | pins the private cgroup namespace the isolation depends on |
| `restart: unless-stopped` | *(no confirmed equivalent)* | no auto-recovery after a host reboot; confirm msb's restart policy before relying on this for anything long-lived |
| `extra_hosts: host.docker.internal` | *(no equivalent)* | only self-hosted Langfuse uses it |
| `healthcheck:` | *(no equivalent)* | run `.oh/scripts/sandbox-healthcheck.sh` manually |

#### `sandbox.yaml`

Derived from the verified `docker run` recipe in
[`oh sandbox install docker`](../deployment-prebuilt-image.md), reconciled
against `docker-compose.image-only.yml`. Two deliberate differences from that
recipe: the compose mount set (all of `~/.config`, plus `.herdr`) replaces the
recipe's `.config/gh` and `.pi`, and `SANDBOX_NAME` is dropped because the
sandbox is named on the `msb run` command line in Step 4.

```yaml
image: ghcr.io/mifunedev/openharness:latest
workdir: /home/sandbox/harness
cmd: ["/sbin/init"]

env:
  OH_PROJECT_ROOT: /home/sandbox/harness      # load-bearing — must equal the mount target
  GIT_USER_NAME: "<your-name>"
  GIT_USER_EMAIL: "<your-email>"

mounts:
  - "~/.openharness-msb/workspace:/home/sandbox/harness"
  - "~/.openharness-msb/claude:/home/sandbox/.claude"
  - "~/.openharness-msb/config:/home/sandbox/.config"
  - "~/.openharness-msb/herdr:/home/sandbox/.herdr"
  - "~/.openharness-msb/ssh:/home/sandbox/.ssh"

network:
  policy: public
```

**Set `cmd:` explicitly.** Do not rely on msb inheriting the image's `CMD`.
systemd must be PID 1: it runs `entrypoint.sh` as `openharness-bootstrap.service`
— the UID sync, the `gosu` privilege drop, `link-providers.sh --init`, and the
workspace seed — and then supervises `openharness-cron.service`. If msb starts
anything else as PID 1, none of that runs and Step 5 fails with no explanation.
Whether msb can satisfy systemd's cgroup requirement at all is risk 5.

**No token here**, unlike the `docker run` recipe, which passes
`-e GH_TOKEN="${GH_TOKEN:-}"`. Compose and `docker run` interpolate `${VAR}`
reliably; whether msb's config parser does is **not verified**. If it does not,
the value becomes the literal string `${GH_TOKEN}`, the entrypoint's
`[ -n "${GH_TOKEN:-}" ]` guard still passes, and `gh auth login --with-token`
runs against garbage — which fails as an auth error rather than revealing that
the token was never wired up. `gh auth login` in Step 6 writes credentials into
the mounted `~/.config` and persists across restarts, so nothing is lost by
leaving it out. Add `GH_TOKEN` to `env:` only for unattended boots, and confirm
the substitution first.

Twelve named volumes exist in the compose file; the five above are the set the
verified `docker run` recipe uses. The other seven are per-harness auth for CLIs
you may not use — add them as you enable those harnesses.

### Step 4 — Boot the sandbox (host)

```bash
msb run --conf sandbox.yaml --name openharness
msb ls                                    # confirm it is running
```

First boot pulls the image and seeds the workspace, so give it time.

### Step 5 — Verify the seed before you rely on it (host, runs inside)

This is the step that catches a silent half-boot:

```bash
msb exec openharness -- bash -lc '
  ls /home/sandbox/harness/.oh >/dev/null \
  && bash /home/sandbox/harness/.oh/scripts/link-providers.sh --check \
  && echo SEED_OK'
```

A healthy boot prints `Providers OK: …` and `SEED_OK`. If `.oh` is missing, the
seed was skipped — stop the sandbox, empty the workspace directory, and start
again:

```bash
msb stop openharness
rm -rf ~/.openharness-msb/workspace/*
# then re-run Step 4
```

**What this check cannot tell you.** It confirms a control plane is present and
providers are linked. It cannot distinguish a fresh seed from a workspace that
already had a `.oh/` and was never seeded at all — the entrypoint's
`.oh/.image-seeded` marker is written whenever `.oh` exists after the guard, so
it is no stronger a signal. That is why Step 2 requires an empty directory.

### Step 6 — Attach and work (host → inside)

```bash
msb exec openharness -- zsh
```

Then, inside — exactly as in any Open Harness sandbox:

```bash
oh tool install herdr           # nothing installs at boot
herdr                           # start the terminal workspace
gh auth login && gh auth setup-git
oh harness install claude-code  # or codex, pi, opencode, hermes, grok-build
claude
```

**`msb exec` is your only door** — see
[What you lose by leaving Docker](#what-you-lose-by-leaving-docker).

Stop and restart without losing state — the bind directories hold everything:

```bash
msb stop openharness
msb run --conf sandbox.yaml --name openharness   # second boot skips the seed
```

### What you lose by leaving Docker

| What goes away | Consequence |
|---|---|
| **The host Docker socket** | **Gone, and this is the headline.** A microVM has no host `dockerd` to reach. Nested-Docker work stops: `/health-check`'s inventory, container work from inside the sandbox, and — most importantly — **the entire lifecycle verb family run *inside* an msb-hosted harness has no daemon**: `oh sandbox install docker`, `oh shell`, `oh stop`, `oh restart`, `oh logs`, `oh ps`, and `oh destroy`. All of them go through `.oh/scripts/docker-compose.sh`. You cannot manage a harness from in there. |
| **VS Code "Attach to Running Container"** | Gone — this is not a container. Options B and C in [Connecting](../connecting.md) do not apply; `msb exec` is the only door. For an editor, use Remote-SSH to the host and drive the sandbox from a terminal, or enable the SSH overlay inside the sandbox and connect to that. |
| `host.docker.internal` | No equivalent. Affects self-hosted Langfuse only. |
| The compose healthcheck | No equivalent. `max_duration` / `idle_timeout` are different semantics — confirm whether msb reaps idle sandboxes by default and, if so, which key disables it. Open Harness is meant to run for weeks. |

### The five untested inferences

Ranked by what they cost if wrong:

1. **ENTRYPOINT/CMD inheritance.** msb exposes explicit `entrypoint:` / `cmd:`
   fields, which suggests it may not inherit them from the image. If it does
   not, and you omit `entrypoint:`, **nothing in the boot chain runs at all** —
   no seed, no provider linking, no privilege drop. The config above sets the
   key explicitly for exactly this reason.
2. **The entrypoint needs root.** The Dockerfile declares no `USER`, and the
   entrypoint runs `chpasswd`, `usermod`, and `chown -R` before dropping to
   `gosu sandbox`. If msb starts it non-root, **the boot half-fails silently** —
   those calls are `|| true`.
3. **Reaping.** msb's `idle_timeout` / `max_duration` defaults are unknown, and
   Open Harness is explicitly one long-lived sandbox running agents on cron.
4. **Bind UID mapping** through the microVM's filesystem transport — whether
   `chown -R 1000` means the same thing on both sides.
5. **systemd as PID 1.** Compose grants `cap_add: [SYS_ADMIN]`, `tmpfs: [/sys/fs]`,
   and `cgroup: private` so systemd mounts a writable, container-private cgroup2
   hierarchy and reaps orphans itself. The msb config has no confirmed equivalent
   for any of the three; without them systemd exits at PID 1 with
   `Failed to create /init.scope control group`.

`msb exec` matching `docker exec -u sandbox` is a sixth open question — the
verified recipes all attach with an explicit `-u sandbox`, and no msb
user-selection flag is shown above because none is confirmed.

## Related

- [Runtimes overview](overview.md) — the catalog, and why the CLI selects no substrate key
- [Runtime support RFC](../rfcs/rfc-runtime-support.md) — the axes taxonomy and the open selector decision
- [#805](https://github.com/mifunedev/openharness/issues/805) — the two measured requirements
- [#803](https://github.com/mifunedev/openharness/pull/803) — the P0 measurement record
