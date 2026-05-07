---
title: "Multi-Sandbox SSH"
sidebar_position: 5
---


Run multiple sandboxes on a single host, each reachable via SSH on a unique port. This enables direct SSH from your laptop, sandbox-to-sandbox communication, and CI/CD integration.

## When to use this

- You run multiple agents on a single server and need to reach each one directly
- You want VS Code Remote-SSH to connect straight into a sandbox (no "Attach to Container" step)
- One agent needs to orchestrate or communicate with another agent
- CI/CD pipelines need to execute commands inside specific sandboxes

## Prerequisites

- The `sshd` overlay enabled for each sandbox
- Each sandbox configured with a unique host port mapping

## Setup

### 1. Enable the sshd overlay

Add to each sandbox's `config.json` (at the repo root, gitignored — copy from `config.example.json` if missing):

```json
{
  "composeOverrides": [
    ".devcontainer/docker-compose.sshd.yml"
  ]
}
```

### 2. Assign unique ports

Each sandbox needs a unique host port mapping to container port 22. Override the port in a compose override or by setting it per-sandbox:

```yaml
# sandbox-alpha — port 2222
services:
  sandbox:
    ports:
      - "2222:22"

# sandbox-bravo — port 2223
services:
  sandbox:
    ports:
      - "2223:22"

# sandbox-charlie — port 2224
services:
  sandbox:
    ports:
      - "2224:22"
```

### 3. Configure SSH on your client

Add entries to `~/.ssh/config` on your local machine (or any machine that needs access):

```
Host sandbox-alpha
  HostName your-server-ip    # or 127.0.0.1 for local Docker
  Port 2222
  User sandbox
  ForwardAgent yes

Host sandbox-bravo
  HostName your-server-ip
  Port 2223
  User sandbox
  ForwardAgent yes

Host sandbox-charlie
  HostName your-server-ip
  Port 2224
  User sandbox
  ForwardAgent yes
```

`ForwardAgent yes` passes your local SSH keys through to the sandbox so git operations inside the container use your host credentials without copying keys.

### 4. Connect

Terminal: `ssh sandbox-alpha`

VS Code: Remote-SSH: Connect to Host → `sandbox-alpha`

## Sandbox-to-sandbox communication

Sandboxes on the same Docker host can reach each other via `host.docker.internal` (automatically set by the base compose file):

```bash
# From inside sandbox-alpha, connect to sandbox-bravo:
ssh -p 2223 sandbox@host.docker.internal
```

This enables orchestration patterns where one agent delegates work to other agents running in separate sandboxes.

## Security notes

- The SSH password comes from `SANDBOX_PASSWORD` in `.env` (default: `changeme`). Change this for any production or internet-facing deployment.
- `ForwardAgent yes` means the remote host can use your local SSH keys for the duration of the session. Only enable this for trusted hosts.
- The sshd overlay runs the SSH server as the container's main process (`command: /usr/sbin/sshd -D`), replacing the default `sleep infinity`. The sandbox is still fully functional.

## Port allocation convention

For multi-sandbox hosts, a simple convention:

| Sandbox | Port |
|---------|------|
| First sandbox | 2222 |
| Second sandbox | 2223 |
| Third sandbox | 2224 |
| ... | 2222 + N |
