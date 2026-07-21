# Prebuilt-image deployment (skip the local build)

Every default install path builds the sandbox image locally from
[`.devcontainer/Dockerfile`](../../.devcontainer/Dockerfile) — Node, `gh`, the
Docker CLI, cloudflared, bun, uv, pnpm, and the agent CLIs. On a cold cache that
is **~10 minutes**. Each tagged release also publishes that exact image, already
built and smoke-tested, to GHCR:

```
ghcr.io/mifunedev/openharness:latest      # newest release
ghcr.io/mifunedev/openharness:<CalVer>    # e.g. 2026.7.5 — pin for reproducibility
```

**Prebuilt-image mode** runs that published image instead of building, so a
sandbox comes up in the time it takes to pull. Your project is still bind-mounted
over it, so the image supplies only the **toolchain** — your live, git-versioned
`.oh/` control plane (and the rest of your repo) shadows the copy baked into the
image. That is the key property: **the image version is a toolchain concern, not
a correctness one**, which is why `latest` is a safe default.

This is the "basic" Docker path. It does **not** replace the canonical
local-build flow — it is a faster option for the same equipped-repo model.

## Herdr license and source in published images

Published images aggregate an unmodified Herdr v0.7.4 executable under its
AGPL-3.0-or-later option. That license scope covers the Herdr component, not
Open Harness or other separate works in the aggregate. Legal files and a
conservative corresponding-source bundle live outside `/home/sandbox/harness`,
so neither the Flavor A bind mount nor Flavor B's workspace volume can hide
them:

```text
/usr/share/doc/herdr/LICENSE
/usr/share/doc/herdr/NOTICE
/usr/share/doc/herdr/SOURCE-OFFER
/usr/share/src/herdr/herdr-0.7.4-corresponding-source.tar.gz
/usr/share/src/herdr/herdr-0.7.4-corresponding-source.tar.gz.sha256
```

Extract and verify them from a pulled image without booting the sandbox:

```bash
IMAGE=ghcr.io/mifunedev/openharness:<CalVer>
docker pull "$IMAGE"
docker create --name herdr-source "$IMAGE"
docker cp herdr-source:/usr/share/src/herdr/herdr-0.7.4-corresponding-source.tar.gz .
docker cp herdr-source:/usr/share/src/herdr/herdr-0.7.4-corresponding-source.tar.gz.sha256 .
docker cp herdr-source:/usr/share/doc/herdr/LICENSE ./herdr-0.7.4-LICENSE
docker cp herdr-source:/usr/share/doc/herdr/NOTICE ./herdr-0.7.4-NOTICE
docker cp herdr-source:/usr/share/doc/herdr/SOURCE-OFFER ./herdr-0.7.4-SOURCE-OFFER
docker rm herdr-source
sha256sum -c herdr-0.7.4-corresponding-source.tar.gz.sha256
```

The matching tagged GitHub Release attaches the bundle, checksum, NOTICE,
source-access information, and license. The direct asset URL in the image label
is checksum-verifiable, not an immutable-storage claim:

```bash
SOURCE_URL=$(docker image inspect "$IMAGE" --format \
  '{{ index .Config.Labels "dev.openharness.herdr.source.url" }}')
EXPECTED_SHA=$(docker image inspect "$IMAGE" --format \
  '{{ index .Config.Labels "dev.openharness.herdr.source.sha256" }}')
curl --fail --location --remote-name "$SOURCE_URL"
printf '%s  %s\n' "$EXPECTED_SHA" \
  herdr-0.7.4-corresponding-source.tar.gz | sha256sum -c -
```

The canonical bundle SHA-256 is
`320c72c3d02d538d5c909e1e7d377485119351973b7a51c31a7fc33359c77183`.
The bundle contains the exact upstream tree at commit
`50aaa2ec046ee26ff407c20f49de496f522512a8`, including `Cargo.lock`, build
metadata, and upstream's vendored patched `portable-pty` and `libghostty-vt`
source. It also carries locked Rust dependency sources under `vendor/cargo` and
exactly the 36 Zig package-source directories named by
`vendor/libghostty-vt/build.zig.zon.json` under `vendor/zig-global-cache/p`.
Cargo 1.96.1, Zig 0.15.2, and Python 3 create and validate the caches; the build
note records the exact Zig fetch flags and offline-cache setup. Generated Zig
local caches and build outputs are excluded, while legitimate upstream and
fetched executable modes and symlinks are preserved. Open Harness makes no
claim that rebuilding produces a byte-identical binary. The included license
contains the no-warranty terms.

Herdr upgrades are one atomic image/release change: binary checksums, source
commit/checksum, legal files, labels, vendored skill, tests, and release assets
must move together. Release CI builds the deterministic bundle from the pinned
Docker source stage that the full build reuses, asserts its canonical SHA,
embeds and smokes it before image push, and publishes or byte-compares source
assets without overwrite. A retry reuses an existing version image only when
its revision and source-SHA labels match, moves `latest` from that exact verified
image, then verifies both remote digests. See
[Herdr](integrations/herdr.md#license-and-corresponding-source) for details.

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
already resolves (a previously built `sandbox-<name>`, or a `sandbox.image` set
in `harness.yaml`) without pinning one — an advanced escape hatch.

### Which image ref wins (last wins)

```
ghcr.io/mifunedev/openharness:latest      (built-in default)
  └─ harness.yaml  sandbox.image: <ref>   (project default — see harness.yaml.example)
       └─ oh sandbox --image=<ref>        (per-invocation override)
```

Set a durable project default in `harness.yaml`:

```yaml
sandbox:
  image: ghcr.io/mifunedev/openharness:latest
  # pull_policy: always   # re-pull on every up (default: missing — pull only if absent)
```

With `sandbox.image` set, a bare `oh sandbox --image` uses it; add
`pull_policy: always` to always re-pull `latest`.

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
`harness.yaml`-derived `--env-file`, so it overrides a `sandbox.image` pin — the
same last-wins ordering as the CLI.

## VS Code "Reopen in Container"

The VS Code Dev Containers path reads
[`.devcontainer/docker-compose.yml`](../../.devcontainer/docker-compose.yml)
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

[`.devcontainer/docker-compose.image-only.yml`](../../.devcontainer/docker-compose.image-only.yml)
is a standalone compose file — no `..:` bind mount, no `build:` stanza:

```bash
docker compose -f .devcontainer/docker-compose.image-only.yml up -d
```

This pulls and runs the published image with **no clone and no build**. The
workspace and control plane live entirely in the named `oh_workspace` volume
declared in that file, mounted at `$OH_PROJECT_ROOT`.

### `OH_IMAGE_ONLY=1`

The compose file sets `OH_IMAGE_ONLY=1` in the container environment. This is
the entrypoint flag that switches `entrypoint.sh` into **no-bind mode**:

- the host UID/GID sync block is skipped (there is no host directory to read
  ownership from)
- the workspace mount is `chown`'d to the sandbox user instead
- the first-boot seed (below) runs before `link-providers`, the root
  `pnpm install`, and cron tmux setup, so those steps see a populated `.oh/`

Prebuilt-image mode (Flavor A) never sets this flag — it always keeps the bind
mount, so its host-UID-sync path is unchanged.

### Seed-to-volume persistence

On the **first boot** against an empty `oh_workspace` volume, the entrypoint
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

The [compose file](../../.devcontainer/docker-compose.image-only.yml) is the
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
docker volume rm oh_workspace 2>/dev/null || true   # the seeded .oh/ control plane

# ── 2. Fresh run (no bind mount, no build) ─────────────────────────
docker run -d --name "$NAME" --restart unless-stopped --init \
  -e OH_IMAGE_ONLY=1 \
  -e OH_PROJECT_ROOT=/home/sandbox/harness \
  -e GIT_USER_NAME="ryaneggz" \
  -e GIT_USER_EMAIL="kre8mymedia@gmail.com" \
  -e GH_TOKEN="${GH_TOKEN:-}" \
  -v oh_workspace:/home/sandbox/harness \
  -v claude-auth:/home/sandbox/.claude \
  -v config-dir:/home/sandbox/.config \
  -v herdr-data:/home/sandbox/.herdr \
  -v ssh-config:/home/sandbox/.ssh \
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
**no** `protected-paths.txt is missing`. The `oh_workspace` volume is now
authoritative — later boots see the `.oh/.image-seeded` marker and skip
re-seeding, so your in-container edits persist.

```bash
# ── 4. Attach an interactive shell (once the container is stable) ──
# Optional: block until the healthcheck reports healthy (start_period ~300s).
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
the wait loop works as written — or use `make shell` / `oh shell`.

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
