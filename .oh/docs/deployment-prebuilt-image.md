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

## Not yet: image-only, no checkout

Running the image with **no** project bind-mounted (workspace in a named volume,
control plane straight from the baked image) is a separate, deferred path — the
entrypoint's bind-mount assumptions (UID sync, root `pnpm install`, provider
symlinks) don't hold without a mounted repo. Prebuilt-image mode always keeps the
bind mount. Tracked in
[#609](https://github.com/mifunedev/openharness/issues/609).

## See also

- [Installation](installation.md) — all install paths
- [Security considerations](security-considerations.md) — the Docker-socket opt-in
- [`.oh/` directory layout](oh-directory-layout.md)
