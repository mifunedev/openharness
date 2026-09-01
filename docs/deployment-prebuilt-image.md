# Prebuilt-image deployment (skip the local build)

Every default install path builds the sandbox image locally from
[`.devcontainer/Dockerfile`](../.devcontainer/Dockerfile) — Node, `gh`, the
Docker CLI, cloudflared, bun, uv, pnpm, and the agent CLIs. On a cold cache that
is **~10 minutes**. Each tagged release also publishes that exact image, already
built and smoke-tested, to GHCR:

```
ghcr.io/mifunedev/openharness:latest      # newest release
ghcr.io/mifunedev/openharness:<version>   # e.g. 0.1.0 — pin for reproducibility
```

**Prebuilt-image mode** runs that published image instead of building, so a
sandbox comes up in the time it takes to pull. Your project is still bind-mounted
over it, so the image supplies only the **toolchain** — your live, git-versioned
`.oh/` control plane (and the rest of your repo) shadows the copy baked into the
image. That is the key property: **the image version is a toolchain concern, not
a correctness one**, which is why `latest` is a safe default.

This is the "basic" Docker path. It does **not** replace the canonical
local-build flow — it is a faster option for the same equipped-repo model.

## Prerequisites

| Need | For |
|---|---|
| Docker (with Compose plugin) | pulling + running the image |
| An equipped repo (`oh init`, or a harness checkout) | the bind-mounted `.oh/` control plane |
| Node.js ≥ 20 | only if you drive it with the `oh` CLI (`oh sandbox`) |

The image is public — no `docker login ghcr.io` is required to pull it. The
release currently publishes for the architecture the CI runner builds on; if you
run a different CPU arch, prefer the local build until multi-arch images land.

## CLI path (recommended)

From an equipped repo:

```bash
oh sandbox --image              # pull ghcr.io/mifunedev/openharness:latest, no local build
oh sandbox --image=ghcr.io/mifunedev/openharness:2026.7.5   # pin a specific release
oh shell                        # zsh in the running container, as usual
```

`--image` implies `--no-build`: it swaps the wrapper's `up -d --build` for
`up -d --no-build` and threads the resolved image ref through `OH_SANDBOX_IMAGE`,
which the compose file interpolates at `image:`.

`--no-build` on its own suppresses the build and reuses whatever image compose
already resolves (a previously built `sandbox-<name>`, or an `image.ref` set in
`oh.json`) without pinning one — an advanced escape hatch.

### Which image ref wins (last wins)

```
ghcr.io/mifunedev/openharness:latest      (built-in default)
  └─ oh.json  image.ref=<ref>               (project default — see docs/configuration.md)
       └─ oh sandbox --image=<ref>        (per-invocation override)
```

Set a durable project default in `oh.json`:

```json
{
  "image": {
    "ref": "ghcr.io/mifunedev/openharness:latest",
    "mode": "image",
    "pullPolicy": "missing"
  }
}
```

With `image.ref` set, a bare `oh sandbox --image` uses it; set
`image.pullPolicy` to `"always"` to always re-pull `latest`.

## What still happens at boot

Because the bind mount is unchanged, `entrypoint.sh` runs exactly as in a local
build: host UID/GID sync, provider symlink repair, cron tmux sessions, and the
**fingerprint-gated `pnpm install`** at the repo root. That install covers your
repo's root dependencies only (not the image toolchain), so it stays fast and
does not defeat the point of skipping the build.

## Compose-equivalent (no CLI)

The `oh sandbox --image` path is a thin wrapper; you can drive compose directly:

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

## Image-only deployment (no checkout) — Flavor B

Everything above (call it **Flavor A**) still keeps the bind mount: your
checked-out repo shadows the image's toolchain. **Flavor B** drops the checkout
entirely — there is no project directory on the host at all. The workspace and
the `.oh/` control plane live in a named Docker volume, seeded once from the
image itself. Tracked in
[#609](https://github.com/mifunedev/openharness/issues/609).

### The recipe

[`.devcontainer/docker-compose.image-only.yml`](../.devcontainer/docker-compose.image-only.yml)
is a standalone compose file — no `..:` bind mount, no `build:` stanza:

```bash
docker compose -f .devcontainer/docker-compose.image-only.yml up -d
```

This pulls and runs the published image with **no clone and no build**.
Everything the sandbox persists — the workspace and control plane at
`/home/sandbox/harness` included — lives in the single `/home/sandbox` mount
declared in that file: the named volume `<sandbox-name>_workspace` by default,
or an absolute host path when `OH_HOME_MOUNT` is set.

### How the flavor is detected

Nothing declares the flavor. `entrypoint.sh` asks whether
`/home/sandbox/harness` is a bind mount **and** already holds a `.oh/` directory,
and reads the answer from the kernel and the filesystem:

- **checkout bind present** (Flavor A) — sync the sandbox UID/GID to the host
  directory's owner, and never seed.
- **anything else** (this flavor, and a runtime that mounts a fresh empty host
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

> ⚠️ **Flavor B requires an image built after two changes:** (1) the seed-bake
> that stages `/opt/oh-seed`, and (2) the `.claude` seed-config fix
> ([#617](https://github.com/mifunedev/openharness/pull/617)) that stops
> `.dockerignore` from starving `/opt/oh-seed` of `.claude/protected-paths.txt`.
> An image missing (2) crash-loops on boot with
> `ERROR: .claude/protected-paths.txt is missing`. Pin a tag published **after
> #617 merges** (or a local build of that branch — see below) before relying on
> Flavor B. Volumes already seeded by a pre-#617 image self-heal on the next
> boot against a fixed image.

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
docker run -d --name "$NAME" --restart unless-stopped --init \
  -e GIT_USER_NAME="ryaneggz" \
  -e GIT_USER_EMAIL="kre8mymedia@gmail.com" \
  -e GH_TOKEN="${GH_TOKEN:-}" \
  -v "${NAME}_workspace":/home/sandbox \
  "$IMAGE" sleep infinity

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

The same first boot also installs the default harnesses (Claude Code, Codex, Pi)
into `/home/sandbox/.local`; they are not baked into the image. Expect the boot
to run 60–180s longer than the `sleep 8` above and to need network — check with
`docker exec "$NAME" bash -lc 'oh harness list --defaults'`. If the registry was
unreachable the container still comes up; re-run
`docker exec "$NAME" bash -lc 'bash /home/sandbox/harness/.oh/scripts/provision-defaults.sh'`.

```bash
# ── 4. Attach an interactive shell (once the container is stable) ──
# Optional: block until the healthcheck reports healthy (start_period ~600s).
until [ "$(docker inspect -f '{{.State.Health.Status}}' "$NAME" 2>/dev/null)" = healthy ]; do
  echo "waiting for $NAME to become healthy…"; sleep 5
done

docker exec -it -u sandbox "$NAME" zsh   # interactive shell (bash also available)
# first command inside the container:
#   herdr
# then complete gh/provider auth and launch agents from Herdr panes
```

The image has no `HEALTHCHECK` of its own, so `docker run` won't populate
`.State.Health` unless you add `--health-cmd`; on the plain `docker run` above,
skip the wait loop and just exec once `docker ps` shows the container `Up`. The
compose path (`docker-compose.image-only.yml`) defines the healthcheck, so there
the wait loop works as written — or use `oh shell` / `oh shell`.

### The same image runs under MicroSandbox

`msb` runs standard OCI images, so this image is also what you point MicroSandbox
at if you want a microVM rather than a container. The `docker run` recipe above
is the invocation to translate — see
[Running Open Harness on MicroSandbox](runtimes/microsandbox.md#running-open-harness-on-microsandbox).
Untested end to end; the risks are listed there.

### Single-arch caveat

Same caveat as Flavor A above: the published image targets the CI runner's
architecture. If you run a different CPU arch, prefer a local build (or
Flavor A, which builds locally by default) until multi-arch images land.

### Manual live-host smoke checklist (non-gating)

The eval probe suite covers the static contract (env-var gating, compose
shape, doc content) deterministically, without a Docker host. It cannot cover
an actual live boot. Before relying on Flavor B in production, run this
checklist by hand on a real host:

- [ ] `docker pull ghcr.io/mifunedev/openharness:<tag built after the /opt/oh-seed change>`
- [ ] `docker compose -f .devcontainer/docker-compose.image-only.yml up -d`
- [ ] confirm **no build step ran** — the compose/Docker output shows a pull, not a build
- [ ] confirm `.oh/` was seeded into the volume:
      `docker compose -f .devcontainer/docker-compose.image-only.yml exec sandbox ls /home/sandbox/harness/.oh`
- [ ] confirm an agent / the `oh` CLI is usable inside the container
- [ ] edit a file under `.oh/` in the running container, then
      `docker compose -f .devcontainer/docker-compose.image-only.yml restart`,
      and confirm the edit is still there

See also [the CLI path](#cli-path-recommended) above for the Flavor A
equivalent of pulling a pinned tag.

## See also

- [Installation](installation.md) — all install paths
- [Security considerations](security-considerations.md) — the Docker-socket opt-in
- [`.oh/` directory layout](oh-directory-layout.md)
