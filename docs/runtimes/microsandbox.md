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

## Which question are you asking?

This page answers two, and they have different answers. Read the one you are
actually asking.

| Question | Short answer |
|---|---|
| **Can `oh runtime install microsandbox` succeed *in this devcontainer*?** | **No** — one remaining blocker, `/dev/kvm`. See [why it is blocked](#why-oh-runtime-install-microsandbox-is-blocked-here). |
| **Can I run Open Harness *on* MicroSandbox, from my own host?** | **Possibly yes, today** — see [Running Open Harness on MicroSandbox](#running-open-harness-on-microsandbox). Nothing on this page measures your host. |

The distinction matters because the two use different commands on different
machines. `oh runtime install` installs `msb` **inside the container** today
(`installUser: "sandbox"`, and both its checks are target-scoped — and that may
be [the wrong side](#which-side-msb-belongs-on-is-not-settled)). If you want msb
as the **runner** for Open Harness, you install msb on your **host**, from
upstream — `oh runtime install` is not that command and wires nothing up.

## Why `oh runtime install microsandbox` is blocked here

### The two requirements, and which one still blocks

Both were **measured**, not assumed
([#805](https://github.com/mifunedev/openharness/issues/805), from the P0 spike
in [#803](https://github.com/mifunedev/openharness/pull/803)). `msb` has never
produced a binary in this harness, so there is no local round trip.

**Everything in this section measures the devcontainer, not your host.** Both
preflight checks are target-scoped, so they answer the install question only. A
current host — Ubuntu 24.04 ships glibc 2.39 and `/dev/kvm` — may clear both and
is simply not measured here.

| Requirement | This devcontainer | Why |
|---|---|---|
| glibc >= 2.39 | **cleared** | `.devcontainer/Dockerfile` pins `debian:trixie-slim`, whose glibc clears the 2.39 floor with headroom. |
| `/dev/kvm` present | **absent — blocks** | `.devcontainer/docker-compose.yml` declares no `devices:` key, so the container reaches no KVM. |

The glibc floor was a base-image decision, not an `oh runtime` one, and the base
upgrade to `debian:trixie-slim`
([#807](https://github.com/mifunedev/openharness/issues/807)) cleared it. The
WSL2 host this harness runs on measures 2.35 and is not what the target-scoped
check reads. Measurements for every candidate are in
[#803](https://github.com/mifunedev/openharness/pull/803).

**Both must clear.** glibc now does; `/dev/kvm` does not, so the install still
stops — a microVM needs KVM, and no glibc version substitutes for it.

The remaining fix does not belong to `oh runtime` either: the `devices:` key is
a compose change, tracked in
[#805](https://github.com/mifunedev/openharness/issues/805). Passing `/dev/kvm`
into the sandbox is out of scope for the base upgrade.

### What `install` prints on a blocked host

It measures, reports, and stops — with no network call and no installer run.
On the current Trixie image only the device check fails:

```
microsandbox: not supported on this host — nothing was installed.

  /dev/kvm   absent   requires present
             .devcontainer/docker-compose.yml declares no `devices:` key, …

Tracked in #805. Re-run after the blockers clear,
or pass --force to attempt the install anyway.
```

Exit code 1. `--force` runs the installer regardless — useful for confirming the
upstream error yourself, or on a host you know the probe misread.

### What the upstream installer script does

This is what `oh runtime install microsandbox` runs **inside the container**
once `/dev/kvm` is present. It is the same upstream script you run on your host in
[Step 1](#step-1--install-msb-on-your-host) — the difference is where.

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

### Which side msb belongs on is not settled

Today this command installs `msb` **inside the container**, because that is the
only side the CLI's `ExecutionTarget` can reach. Whether that is the *right*
side is open.

#805 measures the glibc floor against *both* the WSL2 host (2.35) and the
devcontainer (now Trixie, above the 2.39 floor) and does not say which is the
intended target. A microVM
tier that replaces the container would plausibly be installed on the host. If
#731 settles it the other way, this command's target changes — and that is a
reason it writes no config today.

### The round trip that would prove `msb` works

From #805's acceptance list; neither has ever passed here. The commands are in
[Step 1](#step-1--install-msb-on-your-host).

Both prove that **`msb`** works. Neither says anything about Open Harness
running on it — that is the other question, and it is a different exercise.

## Running Open Harness on MicroSandbox

This does not go through the `oh` CLI at all.

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
already boots the harness with no compose, no CLI, and no build.

:::caution UNTESTED
Nobody has executed this end to end. `msb` has never produced a binary in this
harness (see the remaining blocker above), so this section is a **translation of a verified
`docker run` recipe into a documented msb schema** — every part is individually
grounded, and the combination is not. The five specific risks are listed at the
bottom. Treat it as a starting point, not a runbook, and please report what you
find.
:::

### Step 1 — Install `msb` on your host

This is the step `oh runtime install` does *not* do for you: that command
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
| `entrypoint:` | `entrypoint:` | compose sets this explicitly too — so does the config below. See the note under the file. |
| `command: sleep infinity` | `cmd:` | matches the image's own `CMD`; set explicitly because msb may not inherit it |
| `init: true` | *(no confirmed equivalent)* | PID 1 is the entrypoint chain with no reaper — see risk 5 |
| `restart: unless-stopped` | *(no confirmed equivalent)* | no auto-recovery after a host reboot; confirm msb's restart policy before relying on this for anything long-lived |
| `extra_hosts: host.docker.internal` | *(no equivalent)* | only self-hosted Langfuse uses it |
| `healthcheck:` | *(no equivalent)* | run `.oh/scripts/sandbox-healthcheck.sh` manually |

#### `sandbox.yaml`

Derived from the verified `docker run` recipe in
[Prebuilt-image deployment](../deployment-prebuilt-image.md) (Flavor B), reconciled
against `docker-compose.image-only.yml`. Two deliberate differences from that
recipe: the compose mount set (all of `~/.config`, plus `.herdr`) replaces the
recipe's `.config/gh` and `.pi`, and `SANDBOX_NAME` is dropped because the
sandbox is named on the `msb run` command line in Step 4.

```yaml
image: ghcr.io/mifunedev/openharness:latest
workdir: /home/sandbox/harness
entrypoint: ["/usr/local/bin/entrypoint.sh"]
cmd: ["sleep", "infinity"]

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

**Set `entrypoint:` explicitly.** Do not rely on msb inheriting the image's
`ENTRYPOINT`. Everything that makes this a harness rather than a bare container
lives in that script — the UID sync, the `gosu` privilege drop,
`link-providers.sh --init`, and the workspace seed. If msb does not inherit it,
`sleep infinity` becomes PID 1, none of that runs, and Step 5 fails with no
explanation. Compose sets the same key explicitly
(`docker-compose.image-only.yml`), so this matches the verified stack.

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
| **The host Docker socket** | **Gone, and this is the headline.** A microVM has no host `dockerd` to reach. Nested-Docker work stops: `/health-check`'s inventory, container work from inside the sandbox, and — most importantly — **the entire lifecycle verb family run *inside* an msb-hosted harness has no daemon**: `oh sandbox`, `oh shell`, `oh stop`, `oh restart`, `oh logs`, `oh ps`, and `oh destroy`. All of them go through `.oh/scripts/docker-compose.sh`. You cannot manage a harness from in there. |
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
5. **PID 1 reaping.** Compose sets `init: true`; the msb config has no confirmed
   equivalent. With no reaper, orphaned processes from cron agents and tmux
   sessions may accumulate.

`msb exec` matching `docker exec -u sandbox` is a sixth open question — the
verified recipes all attach with an explicit `-u sandbox`, and no msb
user-selection flag is shown above because none is confirmed.

## Related

- [Runtimes overview](overview.md) — why the CLI selects no runtime
- [#805](https://github.com/mifunedev/openharness/issues/805) — the two measured requirements
- [#803](https://github.com/mifunedev/openharness/pull/803) — the P0 measurement record
