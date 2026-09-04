# Creating a sandbox: `oh sandbox install docker`

`oh sandbox install docker` is the one command that creates a sandbox. It runs
from **any** directory, writes a registry entry under
`${OH_HOME:-~/.oh}/sandboxes/<name>/`, and starts the container:

```bash
oh sandbox install docker   # wizard: name, timezone, git identity, SSH, Docker socket
oh shell <name>             # attach as the sandbox user
```

**Running the published image is the default.** Each tagged release publishes the
sandbox image, already built and smoke-tested, to GHCR:

```
ghcr.io/mifunedev/openharness:latest      # newest release
ghcr.io/mifunedev/openharness:<version>   # e.g. 0.1.0 — pin for reproducibility
```

With no `--repo` there is **no checkout on the host at all**: the workspace and
the `.oh/` control plane live in the sandbox's home volume, seeded once from the
image's baked `/opt/oh-seed`. Nothing is cloned and nothing is built.

Pass `--repo <dir>` and that checkout is bind-mounted at
`/home/sandbox/harness` instead. The image then supplies only the **toolchain** —
your live, git-versioned `.oh/` control plane (and the rest of your repo)
shadows the copy baked into the image. That is the key property: **the image
version is a toolchain concern, not a correctness one**, which is why `latest` is
a safe default. Building locally from
[`.devcontainer/Dockerfile`](../.devcontainer/Dockerfile) — Node, `gh`, the
Docker CLI, bun, uv, pnpm — happens only in that case, and only when
`image.mode` is `build`. On a cold cache that build is **~10 minutes**.

## Prerequisites

| Need | For |
|---|---|
| Docker (with Compose plugin) | pulling + running the image |
| Node.js ≥ 20 | running the `oh` CLI |
| A checkout equipped with `oh update` | only for `--repo`: the bind-mounted `.oh/` control plane |

The image is public — no `docker login ghcr.io` is required to pull it. The
release currently publishes for the architecture the CI runner builds on; if you
run a different CPU arch, prefer a local build (`--repo` with `image.mode` set to
`build`) until multi-arch images land.

## Pinning an image ref

```bash
oh sandbox install docker --image              # pull ghcr.io/mifunedev/openharness:latest
oh sandbox install docker --image=ghcr.io/mifunedev/openharness:2026.7.5   # pin a release
oh shell <name>                                # zsh in the running container, as usual
```

`--image` implies `--no-build`: it swaps the wrapper's `up -d --build` for
`up -d --no-build` and threads the resolved image ref through `OH_SANDBOX_IMAGE`,
which the compose file interpolates at `image:`.

`--no-build` on its own suppresses the build and reuses whatever image compose
already resolves (a previously built `sandbox-<name>`, or an `image.ref` set in
the entry's `oh.json`) without pinning one — an advanced escape hatch.

### Which image ref wins (last wins)

```
ghcr.io/mifunedev/openharness:latest      (built-in default)
  └─ oh.json  image.ref=<ref>               (the entry's default — see docs/configuration.md)
       └─ oh sandbox install docker --image=<ref>   (per-invocation override)
```

Set a durable default on the entry:

```bash
oh config set --sandbox <name> image.ref ghcr.io/mifunedev/openharness:latest
oh config set --sandbox <name> image.pullPolicy always
```

which is the same as writing this into `~/.oh/sandboxes/<name>/oh.json`:

```json
{
  "image": {
    "ref": "ghcr.io/mifunedev/openharness:latest",
    "mode": "image",
    "pullPolicy": "missing"
  }
}
```

With `image.ref` set, a bare `oh sandbox install docker --image` uses it; set
`image.pullPolicy` to `"always"` to always re-pull `latest`.

## `--repo`: bind a checkout into the sandbox

```bash
cd <your-project>
oh update                                     # vendor .oh/ + crons/ into this checkout
oh sandbox install docker --repo "$PWD" --name <your-project>
```

`repo` is stored in the entry's `oh.json` and rendered into the compose
environment as `OH_REPO_DIR`, which the base compose file reads as
`${OH_REPO_DIR:-..}` for both the bind mount and the build context. It also lets
a lifecycle verb resolve this sandbox whenever you stand inside that checkout, so
`oh shell` needs no name there.

## What still happens at boot

systemd is PID 1 and runs `entrypoint.sh` once as `openharness-bootstrap.service`,
the same either way: host UID/GID sync when a checkout is bound, provider symlink
repair, and the **fingerprint-gated `pnpm install`** at the repo root. The cron
runtime then starts as `openharness-cron.service`. That install covers the
repo's root dependencies only (not the image toolchain), so it stays fast and
does not defeat the point of skipping the build.

## Compose-equivalent (no CLI)

The CLI is a thin wrapper over the compose files it materialises into the entry;
you can drive compose directly from an equipped checkout:

```bash
OH_SANDBOX_IMAGE=ghcr.io/mifunedev/openharness:latest \
  bash .oh/scripts/docker-compose.sh --repo-dir "$PWD" up -d --no-build
```

`OH_SANDBOX_IMAGE` in the process environment takes precedence over the
`.env` `--env-file`, so it overrides an `OH_SANDBOX_IMAGE` pin — the
same last-wins ordering as the CLI.

## VS Code "Reopen in Container"

The VS Code Dev Containers path reads
[`.devcontainer/docker-compose.yml`](../.devcontainer/docker-compose.yml)
**directly** and cannot receive `--no-build`, so its build-suppression relies on
`pull_policy`. Set both in `.devcontainer/.env` (compose auto-loads it):

```dotenv
OH_SANDBOX_IMAGE=ghcr.io/mifunedev/openharness:latest
OH_PULL_POLICY=always
```

> ⚠️ Because the service keeps its `build:` block, some Docker Compose versions
> may still rebuild on this path rather than pull. **Validate on your host**
> (watch for a `pull` vs a `build` in the VS Code container log) before relying
> on it; if it rebuilds, use the CLI path above, or the direct-image
> `devcontainer.json` below.

### Direct-image variant (bypasses the compose stack)

For a minimal VS Code container that pulls and skips compose entirely, point
`devcontainer.json` at the image instead of the compose file. Note this drops the
named auth volumes and compose overlays — it is a lighter, less-featured
container:

```jsonc
{
  "name": "openharness-image",
  "image": "ghcr.io/mifunedev/openharness:latest",
  "workspaceFolder": "/home/sandbox/harness",
  "remoteUser": "sandbox"
}
```

## Under the hood: the image-only compose file

Without `--repo`, the CLI materialises
[`.devcontainer/docker-compose.image-only.yml`](../.devcontainer/docker-compose.image-only.yml)
into the entry as the compose base. Everything below describes that path, and it
is what `oh sandbox install docker` runs for you. Tracked in
[#609](https://github.com/mifunedev/openharness/issues/609).

### The recipe by hand

That file is standalone — no `..:` bind mount, no `build:` stanza:

```bash
docker compose -f .devcontainer/docker-compose.image-only.yml up -d
```

This pulls and runs the published image with **no clone and no build**.
Everything the sandbox persists — the workspace and control plane at
`/home/sandbox/harness` included — lives in the single `/home/sandbox` mount
declared in that file: the named volume `<sandbox-name>_workspace` by default,
or an absolute host path when `OH_HOME_MOUNT` is set.

### How the mode is detected

Nothing declares the mode. `entrypoint.sh` asks whether
`/home/sandbox/harness` is a bind mount **and** already holds a `.oh/` directory,
and reads the answer from the kernel and the filesystem:

- **checkout bind present** (`--repo`) — sync the sandbox UID/GID to the host
  directory's owner, and never seed.
- **anything else** (the image-only default, and a runtime that mounts a fresh empty host
  directory at the project root) — skip the UID/GID sync, since there is no host
  directory to read ownership from; `chown` the workspace to the sandbox user;
  and run the first-boot seed (below) before `link-providers`, the root
  `pnpm install`, and cron tmux setup, so those steps see a populated `.oh/`.

The detected mode is logged on both paths, so a wrong detection is visible in
`oh logs` rather than silent:

```
[entrypoint] checkout bind detected at /home/sandbox/harness — syncing host UID/GID
[entrypoint] no checkout bind at /home/sandbox/harness — seeding from /opt/oh-seed
```

Three independent guards keep a misdetection from seeding over a real checkout:
`mountpoint -q` is a kernel fact rather than a heuristic, `seed_workspace_volume`
refuses when `.oh/` already exists, and `.oh/.image-seeded` is gitignored.

### Seed-to-volume persistence

On the **first boot** against an empty home mount, the entrypoint
seeds the baked control plane — from the image's `/opt/oh-seed` — into the
volume, then writes the marker `.oh/.image-seeded`. From that point on, the
**volume is authoritative**: it is the operator-editable copy of `.oh/` (and
the rest of the repo), and edits made inside the running sandbox persist there
across image pulls and container recreation, not in the image itself. Later
boots see the marker and skip re-seeding, so a populated volume is never
clobbered.

> ⚠️ **The image-only path requires an image built after two changes:** (1) the seed-bake
> that stages `/opt/oh-seed`, and (2) the `.claude` seed-config fix
> ([#617](https://github.com/mifunedev/openharness/pull/617)) that stops
> `.dockerignore` from starving `/opt/oh-seed` of `.claude/protected-paths.txt`.
> An image missing (2) crash-loops on boot with
> `ERROR: .claude/protected-paths.txt is missing`. Pin a tag published **after
> #617 merges** (or a local build of that branch — see below) before relying on
> the image-only path. Volumes already seeded by a pre-#617 image self-heal on
> the next boot against a fixed image.

### Clean slate + fresh run (explicit `docker run`)

The [compose file](../.devcontainer/docker-compose.image-only.yml) is the
canonical one-liner (`docker compose -f … up -d`). If you drive Docker directly
instead, this is the equivalent teardown → fresh run → verify sequence. It
mirrors the compose file's env and volume set — note it reads `GIT_USER_NAME` /
`GIT_USER_EMAIL` (the entrypoint ignores any `OH_GIT_*` variants).

```bash
# ── 0. Config ──────────────────────────────────────────────────────
IMAGE=ghcr.io/mifunedev/openharness:latest   # a tag published after #617
NAME=openharness

# To test BEFORE #617 is published, build the fix branch locally and point
# IMAGE at it (this is the "run it now" path):
#   git fetch origin && git checkout feat/image-seed-claude-config
#   docker build -t openharness:seedfix -f .devcontainer/Dockerfile .
#   IMAGE=openharness:seedfix

# ── 1. Clear previous state ── DESTRUCTIVE: wipes the seeded workspace ──
docker rm -f "$NAME" 2>/dev/null || true
docker volume rm "${NAME}_workspace" 2>/dev/null || true   # the whole sandbox home

# ── 2. Fresh run (no bind mount, no build) ─────────────────────────
docker run -d --name "$NAME" --restart unless-stopped \
  --cgroupns private \
  --cap-add SYS_ADMIN \
  --security-opt apparmor=unconfined \
  --tmpfs /run --tmpfs /run/lock --tmpfs /sys/fs \
  -e GIT_USER_NAME="ryaneggz" \
  -e GIT_USER_EMAIL="kre8mymedia@gmail.com" \
  -e GH_TOKEN="${GH_TOKEN:-}" \
  -v "${NAME}_workspace":/home/sandbox \
  "$IMAGE"

# ── 3. Verify the seed + provider wiring ───────────────────────────
sleep 8
docker logs "$NAME" 2>&1 | tail -30
docker exec "$NAME" bash -lc '
  ls -l /home/sandbox/harness/.claude/protected-paths.txt \
  && bash /home/sandbox/harness/.oh/scripts/link-providers.sh --check \
  && ls /home/sandbox/harness/.oh >/dev/null && echo SEED_OK'
```

A healthy boot ends with `Providers OK: …` and `SEED_OK`, and the logs show
**no** `protected-paths.txt is missing`. The home mount is now
authoritative — later boots see the `.oh/.image-seeded` marker and skip
re-seeding, so your in-container edits persist.

The boot installs no harness and no tool. The image contains none either, so the
container comes up with no agent CLI and no `herdr`. Check the state with
`docker exec "$NAME" bash -lc 'oh harness list'` and
`docker exec "$NAME" bash -lc 'oh tool list'`, then install what you need
through the one door, for example
`docker exec "$NAME" bash -lc 'oh tool install herdr'`.

```bash
# ── 4. Attach an interactive shell (once the container is stable) ──
# Optional: block until the healthcheck reports healthy (start_period ~600s).
until [ "$(docker inspect -f '{{.State.Health.Status}}' "$NAME" 2>/dev/null)" = healthy ]; do
  echo "waiting for $NAME to become healthy…"; sleep 5
done

docker exec -it -u sandbox "$NAME" zsh   # interactive shell (bash also available)
# first commands inside the container:
#   oh tool install herdr
#   herdr
# then complete gh/provider auth and launch agents from Herdr panes
```

The image has no `HEALTHCHECK` of its own, so `docker run` won't populate
`.State.Health` unless you add `--health-cmd`; on the plain `docker run` above,
skip the wait loop and just exec once `docker ps` shows the container `Up`. The
compose path (`docker-compose.image-only.yml`) defines the healthcheck, so there
the wait loop works as written — or use `oh ps <name>` and `oh shell <name>`.

### The same image runs under MicroSandbox

`msb` runs standard OCI images, so this image is also what you point MicroSandbox
at if you want a microVM rather than a container. The `docker run` recipe above
is the invocation to translate — see
[Running Open Harness on MicroSandbox](runtimes/microsandbox.md#running-open-harness-on-microsandbox).
Untested end to end; the risks are listed there.

### Single-arch caveat

Same caveat as above: the published image targets the CI runner's architecture.
If you run a different CPU arch, prefer `--repo` with `image.mode` set to
`build`, so the image is built on the machine that runs it, until multi-arch
images land.

### Manual live-host smoke checklist (non-gating)

The eval probe suite covers the static contract (env-var gating, compose
shape, doc content) deterministically, without a Docker host. It cannot cover
an actual live boot. Before relying on the image-only path in production, run
this checklist by hand on a real host:

- [ ] `docker pull ghcr.io/mifunedev/openharness:<tag built after the /opt/oh-seed change>`
- [ ] `docker compose -f .devcontainer/docker-compose.image-only.yml up -d`
- [ ] confirm **no build step ran** — the compose/Docker output shows a pull, not a build
- [ ] confirm `.oh/` was seeded into the volume:
      `docker compose -f .devcontainer/docker-compose.image-only.yml exec sandbox ls /home/sandbox/harness/.oh`
- [ ] confirm an agent / the `oh` CLI is usable inside the container
- [ ] edit a file under `.oh/` in the running container, then
      `docker compose -f .devcontainer/docker-compose.image-only.yml restart`,
      and confirm the edit is still there

See also [Pinning an image ref](#pinning-an-image-ref) above for pulling a
pinned tag through the CLI.

## See also

- [Installation](installation.md) — all install paths
- [Security considerations](security-considerations.md) — the Docker-socket opt-in
- [`.oh/` directory layout](oh-directory-layout.md)
