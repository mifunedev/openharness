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

Host prerequisites: **Docker** (with the Compose plugin), **Git**, and
**Node.js ≥ 20**. Node runs `oh` itself; `get-oh.sh` installs it for you when it
is missing. Everything else — pnpm, Python, the agent CLIs — lives inside the
sandbox.

## The verbs

| Verb | Runs |
|---|---|
| `oh init [dir]` | scaffold the `.oh/` control plane, `oh.json`, and `.env` into a repo |
| `oh sandbox [--image[=<ref>]] [--no-build]` | `docker-compose.sh up -d --build` |
| `oh shell [container]` | an interactive `zsh` in the container |
| `oh stop` | `docker-compose.sh stop` — containers down, volumes kept |
| `oh restart` | `docker-compose.sh restart` |
| `oh logs` | `docker-compose.sh logs -f` |
| `oh ps` | `docker-compose.sh ps` |
| `oh destroy [--yes]` | `docker-compose.sh down -v` — see below |
| `oh compose config` | `docker-compose.sh config` — the resolved compose file |
| `oh config show` · `oh config set <field> <value>` | read and write `oh.json` |
| `oh config repo` · `oh config <integration>` | GitHub-remote and integration wizards |
| `oh secret set <KEY>` · `oh secret list` | read and write the gitignored root `.env` |
| `oh gateway <pi\|hermes>` · `oh gateway status` | `.oh/scripts/gateway.sh` |
| `oh harness` · `oh runtime` · `oh tool` | install and inspect harnesses, runtimes, tooling |
| `oh update` | upgrade the vendored `.oh/` control plane |
| `oh cloud` | manage OpenHarness Cloud nodes |
| `oh --help` · `oh --version` | usage and version |

`oh <verb> -- <args>` forwards extra arguments to `docker compose`, e.g.
`oh logs -- --tail 50`.

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
| `oh runtime list/status` | measures host and container requirements | host-scope requirements report `?` — re-run on the host |
| `oh runtime install` | installs the runtime | refuses with a host-only error |
| `oh sandbox` | provisions the sandbox | refuses with a host-only error |
| `oh shell` | `docker exec` into the container | opens a local `zsh` |

`oh runtime install` and `oh sandbox` change the sandbox's own Docker
configuration, so they stay host-only rather than failing halfway.

## `oh destroy` and its confirmation policy

`down -v` wipes the sandbox home volume, and that volume holds provider
authentication. `oh destroy` is therefore the only lifecycle verb that asks
before it runs. It names the volumes it is about to delete — read from
`.devcontainer/docker-compose.yml`, not hardcoded — then requires you to type
the sandbox name. A blank line, a wrong name, or anything else aborts with a
non-zero exit and removes nothing.

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

Attaching VS Code to a container that `oh sandbox` already started is safe and
is the recommended editor path — see
[Connecting to the sandbox](connecting.md).

**Provisioning** from VS Code is different. *Dev Containers: Reopen in
Container* reads `.devcontainer/devcontainer.json`, whose `dockerComposeFile`
lists `docker-compose.yml` and nothing else. It never runs
`.oh/scripts/docker-compose.sh`, so **no overlay applies on that path**:

- `access.ssh` → no `docker-compose.ssh.yml`, so no sshd and no published SSH port
- `access.dockerSocket` → no `docker-compose.docker-sock.yml`, so no host Docker socket
- `hermesDashboard.enabled` → no `docker-compose.hermes-dashboard.yml`, so no dashboard
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
**second, separate home**: agent logins made through `oh sandbox` are not there,
and the two diverge silently from then on.

If you set `storage.homePath`, always provision with `oh sandbox` and attach.
:::

If you need any overlay, provision with `oh sandbox` and then use *Dev
Containers: Attach to Running Container* instead of *Reopen in Container*.
