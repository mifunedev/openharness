---
sidebar_position: 8
title: "Grok Build"
---

# Grok Build

Grok Build is xAI's proprietary terminal coding agent, shipped as the `grok` CLI. Open Harness installs it with xAI's official installer from `https://x.ai/cli/install.sh`.

Grok Build is **optional** in Open Harness and is **excluded from the default image**. Enable it only when you want the xAI Grok Build CLI available in the sandbox.

## Install (optional)

Enable Grok Build in `harness.yaml`:

```yaml
install:
  grok_build: true
```

Or set the legacy build flag in `.devcontainer/.env`:

```bash
INSTALL_GROK_BUILD=true
```

Then rebuild/restart the sandbox:

```bash
make stop && make sandbox
```

Open Harness uses the upstream installer during image build, pinned to the version verified when this support was added:

```bash
curl -fsSL https://x.ai/cli/install.sh | bash -s 0.2.39
```

Review-first equivalent for manual inspection:

```bash
curl -fsSL -o grok-install.sh https://x.ai/cli/install.sh
# Review grok-install.sh in your editor or pager before running it.
bash grok-install.sh 0.2.39
```

If you already use [`vet`](https://github.com/vet-run/vet), `vet https://x.ai/cli/install.sh 0.2.39` gives the same third-party installer a fetch/review/approve gate. `vet` is optional and is not required by Open Harness.

Verify the install inside the sandbox:

```bash
grok --version
```

If `grok` is not found, confirm `install.grok_build: true` is set in `harness.yaml` (or `INSTALL_GROK_BUILD=true` in `.devcontainer/.env`) and rebuild.

## Authentication

Use one of the Grok Build auth flows inside the sandbox:

```bash
# Recommended for headless/remote sandboxes
grok login --device-auth

# Interactive OAuth flow
grok login
```

For service-account or automation-style setup, provide an xAI API key through
the `XAI_API_KEY` environment variable, either in `.devcontainer/.env` or in
the shell that launches `grok`. Treat `.devcontainer/.env` and Compose
environment variables as convenience secret storage only; users and processes
with Docker/container access may be able to inspect them.

:::warning Auth precedence
Cached OAuth/session state in `~/.grok/auth.json` takes precedence over `XAI_API_KEY`. If Grok Build appears to ignore a new API key, run `grok logout` or reset the `grok-auth` volume, then try again.
:::

## Common usage

```bash
# Start an interactive Grok Build session
grok

# Run a one-shot prompt/headless task
grok -p "Summarize the changes on this branch"

# ACP stdio mode
grok agent stdio
```

Run interactive sessions in tmux so they survive SSH or editor disconnects:

```bash
tmux new-session -d -s agent-grok 'grok'
tmux attach -t agent-grok
```

## State persistence

Open Harness mounts the `grok-auth` named volume at `/home/sandbox/.grok` (`~/.grok`) alongside the other agent auth volumes. This volume persists **Grok user state written under `~/.grok`** across container rebuilds, such as:

- auth and cached sessions (`auth.json`)
- config
- sessions and conversation state
- memory
- skills/plugins
- logs

:::warning Volume removal deletes Grok state
`make destroy` and `docker compose down -v` remove named volumes, including `grok-auth`. Use `make stop` when you want Grok Build state under `~/.grok` to survive.
:::

## Dangerous flags

Grok Build exposes flags that can bypass approval or permission prompts, including `--always-approve`, `--yolo`, and `--permission-mode bypassPermissions`.

:::warning Use only for trusted tasks
These flags can allow broad tool use inside the sandbox. Only use them when you understand and accept the risk for the specific task and repository. Open Harness documents these flags as warning-only; it does not normalize or recommend yolo-mode examples.
:::

## Upstream documentation

- [Grok CLI](https://x.ai/cli)
- [xAI Build overview](https://docs.x.ai/build/overview)
