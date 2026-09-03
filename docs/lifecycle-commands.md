---
title: "Lifecycle commands"
---

# Lifecycle commands (`oh`)

`oh` is the only front door to the sandbox lifecycle. This page is the single
source of truth for the verbs; every other document links here rather than
restating them.

Every compose verb runs `.oh/scripts/docker-compose.sh`, which owns overlay
resolution, project naming, and env plumbing. `oh` is the surface; the script is
the mechanism.

A sandbox is a **registry entry** under `${OH_HOME:-~/.oh}/sandboxes/<name>/`.
`oh sandbox install docker` writes it, and every later verb finds it by name
from any directory — no project checkout required. Details:
[Configuration → the two `oh.json` files](configuration.md#the-two-ohjson-files).

Host prerequisites: **Docker** (with the Compose plugin), **Git**, and
**Node.js ≥ 20**. Node runs `oh` itself; `get-oh.sh` installs it for you when it
is missing. Everything else — pnpm, Python, the agent CLIs — lives inside the
sandbox.

## The verbs

| Verb | Runs |
|---|---|
| `oh sandbox install <runtime> [--name <name>] [--repo <dir>] [--yes] [--image[=<ref>]] [--no-build]` | write the registry entry, then `docker-compose.sh up -d` inside it |
| `oh sandbox list [--json]` | every registry entry: name, runtime, status, repo |
| `oh shell [name]` | an interactive `zsh` in the sandbox container |
| `oh stop [name]` | `docker-compose.sh stop` — containers down, volumes kept |
| `oh restart [name]` | `docker-compose.sh restart` |
| `oh logs [name]` | `docker-compose.sh logs -f` |
| `oh ps [name]` | `docker-compose.sh ps` |
| `oh destroy [name] [--yes]` | `docker-compose.sh down -v`, then remove the registry entry — see below |
| `oh compose config` | `docker-compose.sh config` — the resolved compose file |
| `oh update [--from <dir> \| --from-remote [--ref <ref>]]` | equip an empty checkout with `.oh/` + `crons/`, and upgrade an equipped one |
| `oh config show [--sandbox <name>]` · `oh config set <field> <value> [--sandbox <name>]` | read and write `oh.json` |
| `oh config repo` · `oh config <integration>` | GitHub-remote and integration wizards |
| `oh secret set <KEY> [--sandbox <name>]` · `oh secret list [--sandbox <name>]` | read and write the gitignored `.env` |
| `oh gateway <pi\|hermes>` · `oh gateway status` | `.oh/scripts/gateway.sh` |
| `oh harness` · `oh tool` | install and inspect harnesses and tooling |
| `oh cloud` | manage OpenHarness Cloud nodes |
| `oh --help` · `oh --version` | usage and version |

`oh <verb> -- <args>` forwards extra arguments to `docker compose`, e.g.
`oh logs -- --tail 50`.

## Creating a sandbox

`oh sandbox install docker` is the one command that creates a sandbox. It runs
from **any** directory:

```bash
oh sandbox install docker      # wizard: name, timezone, git identity, SSH, Docker socket
oh shell <name>                # attach as the sandbox user
```

- The entry lands in `${OH_HOME:-~/.oh}/sandboxes/<name>/`, holding its own
  `oh.json`, its `.env`, and the compose files plus the wrapper script the CLI
  re-materialises on every lifecycle call. Edit `oh.json`; the rest is generated.
- The default name is `oh-sbx-<n>`, the lowest unused number. `--yes` prompts
  zero times and keeps every default.
- Without `--repo` the sandbox runs the prebuilt image and the image's
  `/opt/oh-seed` seeds the workspace volume. With `--repo <dir>` that checkout
  is bind-mounted at `/home/sandbox/harness` and can be built locally. Recipes:
  [`oh sandbox install docker`](deployment-prebuilt-image.md).
- `docker` is the only provisionable runtime today. `oh sandbox install
  microsandbox` refuses and points at
  [the runtime RFC](rfcs/rfc-runtime-support.md); inside a sandbox,
  `oh tool install microsandbox` installs the `msb` binary.

`oh sandbox` with no subcommand prints help and exits non-zero.

## How a verb finds your sandbox

`oh shell|stop|restart|logs|ps|destroy [name]` resolve in this order:

1. the `name` you passed;
2. the single registered entry, when exactly one exists;
3. the entry whose `repo` contains the current directory;
4. otherwise an error listing every registered name.

`oh sandbox list` prints that list, with the container status of each.

## Equipping a checkout: `oh update`

`oh update` vendors the `.oh/` control plane and `crons/` into the current
directory. An empty directory is equipped from scratch; an equipped one is
upgraded. Payload precedence: `--from <dir>`, then `--from-remote [--ref
<ref>]`, then the CLI's own bundled payload, then a remote fetch announced on
one line.

It writes **nothing else** — no `oh.json`, no `.env`, no `AGENTS.md`, no
`.gitignore` line, no `.devcontainer/`, no provider configuration. Those files
are yours. It never prompts.

## Where you are standing when you type `oh`

`oh` runs on the host **and** inside the sandbox, and it resolves a different
execution target for each. On the host it drives the container through Docker
Compose. Inside the sandbox it runs commands directly, because the sandbox *is*
the environment those commands target.

Detection is automatic: `oh` treats itself as in-sandbox when `/.dockerenv`
exists **and** `SANDBOX_NAME` is set. Override it with
`OH_EXECUTION_TARGET=local` or `OH_EXECUTION_TARGET=docker-compose`.

| Verb | On the host | Inside the sandbox |
|---|---|---|
| `oh harness install` · `oh tool install` | installs into the running container over Docker Compose | installs live, in place |
| `oh harness list/status` · `oh tool list/status` | reports `?` when the container is not reachable | reports the real state of this environment |
| `oh sandbox install` | provisions the sandbox | refuses with a host-only error |
| `oh shell` | `docker exec` into the container | opens a local `zsh` |

`oh sandbox install` changes the sandbox's own Docker configuration, so it stays
host-only rather than failing halfway.

`oh harness install <id>` and `oh tool install <id>` are the only way a harness
or a tool enters the sandbox. Nothing installs at boot, so a fresh sandbox has
no `herdr` until you run `oh tool install herdr`. Each install lands in
`~/.local` in the persistent home volume; `oh destroy` removes it. See
[Harnesses Overview](harnesses/overview.md#installing-a-harness).

## `oh destroy` and its confirmation policy

`down -v` wipes the sandbox home volume, and that volume holds provider
authentication. `oh destroy` is therefore the only lifecycle verb that asks
before it runs. It names the volumes it is about to delete — read from
`.devcontainer/docker-compose.yml`, not hardcoded — then requires you to type
the sandbox name. A blank line, a wrong name, or anything else aborts with a
non-zero exit and removes nothing.

Once `down -v` succeeds the registry entry under
`${OH_HOME:-~/.oh}/sandboxes/<name>/` is removed too, so the name becomes free
again.

When `storage.homePath` points the home mount at a host path, `down -v` cannot
delete it. `oh destroy` says so and leaves the directory in place; remove it
yourself if you want it gone.

Non-interactive use is gated on an explicit flag. When stdin is not a terminal
and `--yes` is absent, `oh destroy` refuses outright rather than assume consent.

## `oh compose config`, not `oh config`

`oh config` already means *"read, write, or configure configuration"*
(`oh config show`, `oh config set`, `oh config <integration>`), so the
resolved-compose printer lives under its own namespace: `oh compose config`.
That leaves room for further `oh compose <passthrough>` verbs without ever
colliding with the config and integration verbs.

## VS Code "Reopen in Container" applies no overlays

Attaching VS Code to a container that `oh sandbox install docker` already
started is safe and is the recommended editor path — see
[Connecting to the sandbox](connecting.md).

**Provisioning** from VS Code is different. *Dev Containers: Reopen in
Container* reads `.devcontainer/devcontainer.json`, whose `dockerComposeFile`
lists `docker-compose.yml` and nothing else. It never runs
`.oh/scripts/docker-compose.sh`, so **no overlay applies on that path**:

- `access.ssh` → no `docker-compose.ssh.yml`, so no sshd and no published SSH port
- `access.dockerSocket` → no `docker-compose.docker-sock.yml`, so no host Docker socket
- `composeOverrides[]` → every extra overlay path is ignored

Secrets still reach that container: compose auto-loads the `.devcontainer/.env`
beside the compose file, and that file is a symlink to the root `.env`.
Non-secret `oh.json` settings only reach compose when `oh` renders them, so on
this path each variable falls back to its default in
`.devcontainer/docker-compose.yml`.

:::danger `storage.homePath` is ignored on this path
`OH_HOME_MOUNT` is one of those rendered-only variables, so *Reopen in
Container* falls back to the Docker-managed `<name>_workspace` volume even when
`storage.homePath` points the sandbox home at a host directory. That is a
**second, separate home**: agent logins made through `oh sandbox install docker` are not there,
and the two diverge silently from then on.

If you set `storage.homePath`, always provision with `oh sandbox install
docker` and attach.
:::

If you need any overlay, provision with `oh sandbox install docker` and then use
*Dev Containers: Attach to Running Container* instead of *Reopen in Container*.
