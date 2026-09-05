---
title: "Muse Code"
---

# Muse Code

Muse Code is Meta's terminal coding agent. Open Harness installs the native `muse` CLI through Meta's official installer.

## Install and verify

Run the install command in an equipped checkout inside a running sandbox:

```bash
oh harness install muse-code
muse --version
oh harness status muse-code
```

The same install command works from a host checkout that targets a running sandbox.
The catalog classifies Muse as `installable`. Installation runs as `sandbox` and writes into `~/.local/bin` in the persistent home volume.
Repeated installation skips the installer when `muse --version` succeeds. A stopped sandbox returns an error; start the sandbox and retry.

The catalog runs this command through Bash:

```bash
set -o pipefail
curl -fsSL https://dev.meta.ai/install.sh | MUSE_INSTALL_DIR="$HOME/.local/bin" MUSE_NO_MODIFY_PATH=1 MUSE_LOGIN=0 bash
```

`MUSE_NO_MODIFY_PATH=1` prevents upstream shell-profile edits. Open Harness already includes `~/.local/bin` on `PATH`.
`MUSE_LOGIN=0` prevents interactive authentication during the download. Authentication for model use is a separate step.
The installer downloads a launcher and a versioned native binary beside it. Keep both files and the launcher's metadata together.
Upstream selects the current stable release and checks the binary's size and SHA-256. The launcher checks for updates during later use.
Set `MUSE_NO_AUTO_UPDATE=1` in the launching process to disable automatic updates.

## Authentication

Inside the sandbox, run:

```bash
muse login
```

The verified CLI opens a browser code flow for a Meta account. Starting `muse` also offers sign-in when credentials are absent.
Use `/login` inside Muse to reopen authentication choices. Account eligibility and usage billing follow Meta's current service rules.

For automation, inject `META_API_KEY` into the environment of the process that launches Muse.
Open Harness accepts this key through its existing hidden secret prompt:

```bash
oh secret set META_API_KEY
oh secret list
```

This stores the key in the checkout's gitignored `.env` with mode `0600`.
Storage does not export the key into an existing shell or forward it through Compose.
For a one-shot command, Node 22 can load that file without shell evaluation:

```bash
node --env-file=.env -e 'const {spawnSync}=require("node:child_process"); const r=spawnSync("muse",["exec","Summarize this repository"],{stdio:"inherit"}); process.exit(r.status ?? 1)'
```

Run the Node command inside the sandbox, from the checkout where you stored the key.
An existing process environment takes precedence over the `.env` file. `META_API_KEY` takes precedence over stored Muse credentials.
Muse also supports `muse auth set --api-key-stdin` for credential storage through standard input.
Run `muse logout` to remove stored Muse credentials. Logout preserves a key stored by `oh secret set`.

## Context and skills

Muse reads the existing repository `AGENTS.md`. Do not run `muse init` over an Open Harness checkout.
Open Harness owns project instructions and the canonical `.oh/skills` pack.
The standard provider surface is:

```text
.agents/skills -> ../.oh/skills
```

Sandbox bootstrap creates and repairs this link through the canonical linker. To equip another checkout, run `oh update`, then:

```bash
bash .oh/scripts/link-providers.sh --init
bash .oh/scripts/link-providers.sh --check
```

The linker preserves real directories at provider paths and reports a collision. Move existing skills aside before retrying.
Muse loads project rules and skills only for trusted workspaces. To inspect this checkout for one invocation:

```bash
muse skills list --source project --workspace "$PWD" --trust-workspace
muse skills inspect .agents/skills/architect/SKILL.md --workspace "$PWD" --trust-workspace
```

`--trust-workspace` trusts the selected checkout for that invocation. Tool approvals and the OS sandbox remain enabled.
Official discovery rules select `AGENTS.md` before compatibility instruction files at each level. Deeper project instructions override shallower instructions.
Run interactive `muse` sessions in Herdr so the terminal survives a disconnect.

## Persistence and removal

The existing `/home/sandbox` volume preserves the launcher, native binaries, and home-local Muse state across normal restart and recreation.
Default user settings and credentials live under `~/.config/muse`, including `settings.json` and `auth.json`.
`XDG_CONFIG_HOME` changes that location; `MUSE_AUTH_PATH` overrides the credential file.
Keep overrides inside the persistent home if their state must survive recreation.
Project instructions and skills remain in the project checkout.

No configuration key enables Muse, and nothing installs it at boot. A fresh home requires `oh harness install muse-code` again.
To stop using Muse, stop its session. There is no disable flag or `oh harness uninstall` command.
To uninstall manually, stop Muse and remove `~/.local/bin/muse`, its `muse-bin-*` binaries, and Muse metadata such as `.muse-version`.
Remove only Muse-owned files from the shared bin directory. Preserve `~/.config/muse` if you want to retain user state.
`oh destroy` removes the entire sandbox home volume, including installed harnesses and home-local credentials.

## Verified upstream and limitations

Verification on 2026-09-04 installed `Muse Code 1.0.3 (1.0.3-R2198.1)` on Linux x86_64.
The Bash launcher supports Linux and macOS on x86_64 and arm64. Open Harness uses the Linux sandbox path.
Upstream authentication, skill support, and service availability can change independently of Open Harness.
Version checks and skill inspection do not prove access to a paid model or an authenticated session.

- [Official installer](https://dev.meta.ai/install.sh)
- [Launcher source](https://api.meta.ai/muse-launcher.sh)
- [Authentication](https://dev.meta.ai/docs/muse-code/auth.md)
- [Configuration and instruction discovery](https://dev.meta.ai/docs/muse-code/configuration.md)
- [Skill discovery](https://dev.meta.ai/docs/muse-code/extending.md)
