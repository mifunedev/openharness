---
sidebar_position: 6
title: "Connecting"
---

# Connecting to a Sandbox

Once a sandbox is running, there are three ways to open a shell inside it. Choose based on your setup: terminal, local VS Code, or remote VS Code over SSH.

All three options assume the sandbox is already started. If it is not, run:

```bash
docker compose -f .devcontainer/docker-compose.yml up -d
```

See [Sandbox Lifecycle](./sandbox-lifecycle) for the full set of `docker compose` commands.

## Option A — Terminal (works everywhere)

Use `docker exec` to open an interactive shell as the `sandbox` user:

```bash
docker exec -it -u sandbox openharness zsh
```

Replace `openharness` with your `SANDBOX_NAME`. You land in `/home/sandbox/harness`.

To use bash instead of zsh:

```bash
docker exec -it -u sandbox openharness bash --login
```

This is the fastest option and works on any machine with Docker installed.

## Option B — VS Code Attach to Container (local)

Use this option when Docker is running on the same machine as VS Code.

1. Install the [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) extension in VS Code.
2. Open the Command Palette: `Cmd+Shift+P` (macOS) or `Ctrl+Shift+P` (Linux / Windows).
3. Run **"Dev Containers: Attach to Running Container"**.
4. Select your sandbox from the list (it appears as the container name, e.g. `openharness`).

VS Code opens a new window attached to the sandbox. You can use the integrated terminal, install extensions, and edit files as if you were working locally. The workspace folder inside the container is `/home/sandbox/harness`.

## Option C — VS Code Remote SSH + Attach (remote server)

Use this option when Docker is running on a remote Linux host (a cloud VM or a home server).

### 1. Configure SSH on your laptop

Add an entry to `~/.ssh/config`:

```
Host openharness
  HostName your-server-ip
  User your-username
  ForwardAgent yes
```

Replace `your-server-ip` with the IP address of your remote host and `your-username` with your SSH user on that machine.

### 2. Connect VS Code to the remote host

1. Install the [Remote - SSH](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-ssh) extension in VS Code.
2. Open the Command Palette and run **"Remote-SSH: Connect to Host"**.
3. Select `openharness` (the alias you added to `~/.ssh/config`).

VS Code connects to the remote host. You should see the bottom-left status bar change to show the remote host name.

### 3. Attach to the running container

While connected to the remote host in VS Code:

1. Install the Dev Containers extension on the remote (VS Code prompts you if it is not already installed).
2. Open the Command Palette and run **"Dev Containers: Attach to Running Container"**.
3. Select your sandbox.

VS Code opens a new window attached to the container on the remote host. From here the experience is identical to Option B.

## Staying connected

Long-running agent sessions should run inside tmux, not in the foreground of your shell. This way they survive disconnects:

```bash
# Inside the sandbox, start an agent in a named tmux session:
tmux new-session -d -s agent-claude 'claude'

# Reattach any time:
tmux attach -t agent-claude
```

See `.claude/rules/sandbox-processes.md` (rendered in the Architecture section) for naming conventions and best practices.

## Next steps

- [Onboarding](./onboarding) — authenticate services inside the sandbox after connecting for the first time.
- [Sandbox Lifecycle](./sandbox-lifecycle) — full reference for `docker compose` commands.
- [Quickstart](./quickstart) — end-to-end walkthrough from install to first agent session.
