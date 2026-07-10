# @mifune/openharness

The **Open Harness CLI** (`oh`) — equip any repository with [Open Harness](https://oh.mifune.dev)
and drive its Docker sandbox from the command line.

Open Harness is a portable harness for running coding agents (Claude Code, Codex, Pi,
and others) in an isolated Docker sandbox, with the agent's identity, skills, crons, and
memory versioned in git. This package is the standalone `oh` CLI that scaffolds a harness
into a repo and manages its sandbox lifecycle.

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
npx @mifune/openharness init
```

Prefer a `curl | bash` bootstrap (also installs Node when missing)? See
[`get-oh.sh`](https://oh.mifune.dev/docs/installation):

```bash
curl -fsSL https://oh.mifune.dev/get-oh.sh | bash
```

### Requirements

- **Node.js ≥ 20** (22 recommended) on your `PATH`. Unlike the `get-oh.sh` bootstrap,
  npm will not install Node for you.
- **Docker** and **git** for the sandbox lifecycle commands (`oh sandbox`, `oh shell`).

## Quick start

Equip a repository, then bring up its sandbox:

```bash
cd your-project
oh init          # scaffold OpenHarness compat files + .oh/ control plane
oh sandbox       # docker compose up -d --build
oh shell         # open a zsh shell in the running container
```

## Commands

| Command | What it does |
|---|---|
| `oh init [dir]` | Scaffold OpenHarness compat files + the `.oh/` control plane into a repo (default: cwd). |
| `oh config <integration>` | Configure an integration via an interactive wizard. |
| `oh update` | Upgrade only the `.oh/` control plane from a newer source (`--from <dir>` / `--from-remote`); your project source is untouched. |
| `oh sandbox` | Provision and start the sandbox (`docker compose up -d --build`). |
| `oh shell [container]` | Open a `zsh` shell in the running sandbox container. |
| `oh gateway <args…>` | Manage a messaging client session (Slack bridge for `pi`/`hermes`). |
| `oh cloud <args…>` | Configure credentials and manage OpenHarness Cloud SSH keys and nodes. |
| `oh --version` | Print the CLI version. |
| `oh --help` | Show help; every subcommand also accepts `--help`. |

`oh init` and `oh update` fetch their payload on demand — with no local source they shallow-clone
the public OpenHarness repo into a temp dir and remove it after the run (`--from-remote`, `--ref <ref>`).

## OpenHarness Cloud

Configure the Cloud API once, then use `oh cloud` instead of hand-writing authenticated HTTP
requests:

```bash
oh cloud config  # securely prompts for the current provisioner key
oh cloud ssh-keys create --name laptop --public-key-file ~/.ssh/openharness_node.pub
oh cloud nodes create --name demo --ssh-key-id <ssh-key-id>
oh cloud nodes watch <node-id>
```

Until OpenHarness Cloud issues user API tokens, `oh cloud config` stores the user-provided
provisioner key at `~/.config/openharness/cloud.json` with file mode `0600`. The key is never
printed. `OH_CLOUD_CONFIG` overrides the file path; `OH_CLOUD_API_URL` and
`OH_PROVISION_KEY` provide non-persistent overrides for automation. Run `oh cloud --help` for
the complete SSH-key and node lifecycle command set.

## Documentation

- **Docs:** https://oh.mifune.dev
- **Installation guide:** https://oh.mifune.dev/docs/installation
- **Source & issues:** https://github.com/mifunedev/openharness

## License

[MIT](./LICENSE)
