# @mifune/openharness

The **Open Harness CLI** (`oh`) — create a [Open Harness](https://oh.mifune.dev)
Docker sandbox and drive its lifecycle from the command line.

Open Harness is a portable harness for running coding agents (Claude Code, Codex, Pi,
and others) in an isolated Docker sandbox, with the agent's identity, skills, and crons
versioned in git. This package is the standalone `oh` CLI that creates sandboxes and
manages their lifecycle.

## Install

```bash
npm install -g @mifune/openharness
```

Then run it as `oh`:

```bash
oh --help
```

Or run it once without installing:

```bash
npx @mifune/openharness sandbox install docker
```

Prefer a `curl | bash` bootstrap (also installs Node when missing)? See
[`get-oh.sh`](https://oh.mifune.dev/docs/installation):

```bash
curl -fsSL https://oh.mifune.dev/get-oh.sh | bash
```

### Requirements

- **Node.js ≥ 20** (22 recommended) on your `PATH`. Unlike the `get-oh.sh` bootstrap,
  npm will not install Node for you.
- **Docker** and **git** for the sandbox lifecycle commands (`oh sandbox install`, `oh shell`).

## Quick start

Create a sandbox from any directory — no project checkout needed:

```bash
oh sandbox install docker   # wizard, then boot; writes ~/.oh/sandboxes/<name>/
oh sandbox list             # name, runtime, status, repo
oh shell <name>             # open a zsh shell in the running container
```

To bind one of your own checkouts into the sandbox, equip it and pass `--repo`:

```bash
cd your-project
oh update                                     # vendor .oh/ + crons/ — and nothing else
oh sandbox install docker --repo "$PWD" --name your-project
```

Add an agent harness or a tool at any point — this needs no rebuild. The verb is
the only door; nothing installs at boot:

```bash
oh harness list                 # what exists, and what is installed
oh harness install opencode     # install into the running sandbox
oh tool install herdr           # a fresh sandbox has no herdr
```

Everything else the sandbox ships — a headless browser, the GitHub CLI:

```bash
oh tool list                    # what is present, and what is installable
oh tool install agent-browser   # asks before the ~1 GB Chromium download
```

`oh harness` and `oh tool` also run **inside** the sandbox, where they install
into the current environment instead of driving the container over Docker
Compose. Detection is automatic (`/.dockerenv` plus `SANDBOX_NAME`); override it
with `OH_EXECUTION_TARGET=local` or `OH_EXECUTION_TARGET=docker-compose`.
`oh sandbox install` remains host-only and says so.

## Commands

| Command | What it does |
|---|---|
| `oh sandbox install <runtime>` | Create a sandbox: run the wizard, write the registry entry under `${OH_HOME:-~/.oh}/sandboxes/<name>/`, materialise the compose files and wrapper into it, and boot the container. Flags: `--name`, `--repo <dir>`, `--yes`, `--image[=<ref>]`, `--no-build`, `--print-argv`. `docker` is provisionable; `microsandbox` is planned and refuses with a pointer at the runtime RFC. |
| `oh sandbox list [--json]` | List the registry entries with name, runtime, container status, and bound repo. |
| `oh shell [name]` | Open a `zsh` shell in the running sandbox container. |
| `oh stop [name]` | Stop the sandbox, preserving volumes. |
| `oh restart [name]` | Restart the sandbox service. |
| `oh logs [name]` | Tail the sandbox compose logs. |
| `oh ps [name]` | Show sandbox service status. |
| `oh destroy [name] [--yes]` | Remove the sandbox, wipe its named volumes (`docker compose down -v`), then delete the registry entry. Names the volumes, then requires you to type the sandbox name; refuses without a TTY unless `--yes` is passed. |
| `oh update` | Vendor `.oh/` + `crons/` into the current directory, equipping an empty checkout and upgrading an equipped one (`--from <dir>` / `--from-remote [--ref <ref>]`). It writes nothing else and never prompts. |
| `oh config show [--sandbox <name>]` | Print the resolved `oh.json` — every non-secret setting. |
| `oh config set <field> <value> [--sandbox <name>]` | Set one dotted `oh.json` field (`access.sshPort 2200`), validated against the schema. A secret key is refused with a pointer at `oh secret set`. |
| `oh config repo` | Create a repo on your GitHub account, keep the cloned-from upstream as the `openharness` remote, point `origin` at yours, and push. Asks first and defaults to no; never runs without an interactive yes. |
| `oh config <integration>` | Configure an integration via an interactive wizard. |
| `oh secret set <KEY> [--sandbox <name>]` | Prompt for the value with the input hidden and write it to the gitignored `.env` (mode `0600`). The value is never taken from the command line, where shell history would keep it. |
| `oh secret list [--sandbox <name>]` | List the allow-listed keys that hold a value, with the values redacted. |
| `oh compose config` | Print the resolved compose configuration. |
| `oh harness <list\|install\|status>` | Install and inspect agent CLI harnesses. `install` is the only door: it probes the running sandbox, installs into the persistent home volume, and reports. It reads and writes no `oh.json` field, and needs no rebuild. |
| `oh tool <list\|install\|status>` | Install and inspect sandbox tooling that is not an agent CLI. `herdr`, `cloudflared`, `agent-browser`, `microsandbox`, and `tailscale` are `installable`; `gh` and the Docker CLI are `baked-in` and cannot be installed. Nothing installs at boot. A large download is confirmed first, and `--yes` accepts it. |
| `oh gateway <args…>` | Manage a messaging client session (Slack bridge for `pi`/`hermes`). |
| `oh cloud <args…>` | Configure credentials and manage OpenHarness Cloud SSH keys and nodes. |
| `oh --version` | Print the CLI version. |
| `oh --help` | Show help; every subcommand also accepts `--help`. |

`oh.json` and the `.env` beside it are the only two configuration surfaces: `oh.json`
holds every non-secret setting, `.env` holds only the allow-listed secrets. Each has
two homes — a sandbox's registry entry (`--sandbox <name>`) and the project root
(no flag). See
[configuration](https://github.com/mifunedev/openharness/blob/main/docs/configuration.md)
for the field reference.

`oh` is the only lifecycle door, on the host and in the sandbox, and every verb
runs `.oh/scripts/docker-compose.sh` — see
[lifecycle commands](https://github.com/mifunedev/openharness/blob/main/docs/lifecycle-commands.md), which also
states the confirmation policy `oh destroy` carries.

`oh update` prefers the payload bundled into the CLI itself; with `--from-remote` (or no
payload at all) it shallow-clones the public OpenHarness repo into a temp dir and removes
it after the run (`--ref <ref>` pins it). Root `docs/` remains project-owned and is not part
of that payload. Catalog and help output therefore links to the Open Harness source
documentation instead of a path inside the equipped project.

The CLI writes no scaffold. It creates no `AGENTS.md`, no provider configuration, and no
`.gitignore` line beyond the `.env` line `oh secret set` adds inside a git checkout.

## OpenHarness Cloud

`oh cloud` is an Apache-2.0 licensed client that talks to a proprietary hosted service.
Configure the Cloud API once, then use `oh cloud` instead of hand-writing authenticated HTTP
requests:

```bash
oh cloud config  # securely prompts for the current provisioner key
oh cloud ssh-keys create --name laptop --public-key-file ~/.ssh/openharness_node.pub
oh cloud nodes create --name demo --ssh-key-id <ssh-key-id>
oh cloud nodes watch <node-id>
```

Both settings are repository-local. `oh cloud config` writes the API base URL to `cloud.apiUrl`
in the tracked `oh.json` and, until OpenHarness Cloud issues user API tokens, stores the
user-provided provisioner key as `OH_CLOUD_PROVISION_KEY` in the gitignored root `.env`
(mode `0600`). The key is never printed; `oh cloud config show` redacts it. Nothing is written
under `$HOME`.

`OH_CLOUD_API_URL` and `OH_CLOUD_PROVISION_KEY` (`OH_PROVISION_KEY` and `PROVISION_KEY` are
still accepted) provide non-persistent overrides for automation. Because the settings live in
the repository, `oh cloud` runs inside an OpenHarness-equipped repo; outside one, pass
`--api-url` and `--provision-key`. On the first `oh cloud` run in a repo, a legacy
`~/.config/openharness/cloud.json` is migrated into these two homes and then reported as no
longer read — it is left on disk for you to delete. Run `oh cloud --help` for the complete
SSH-key and node lifecycle command set.

## Documentation

- **Docs:** https://oh.mifune.dev
- **Installation guide:** https://oh.mifune.dev/docs/installation
- **Source & issues:** https://github.com/mifunedev/openharness

## License

[Apache-2.0](./LICENSE)
