---
title: Langfuse
---

# Langfuse

[Langfuse](https://langfuse.com) is optional observability for **Pi sessions**.
Open Harness does not bundle or operate Langfuse: deploy it separately (Langfuse
Cloud or your own installation) and follow the [official Docker Compose deployment
guide](https://langfuse.com/self-hosting/deployment/docker-compose) if you
self-host. Secure that external service with appropriate access controls and TLS;
this integration does not add a proxy, exporter, credential pass-through, or
tracing for other CLIs.

[`pi-langfuse` v1.5.6](https://www.npmjs.com/package/pi-langfuse/v/1.5.6) is a
Pi package. Its `v1.5.6` tag resolves to
[commit `fa415f33458f010265a287251fd3e7d249e97b99`](https://github.com/gooyoung/pi-langfuse/commit/fa415f33458f010265a287251fd3e7d249e97b99).
Pi packages can execute arbitrary code, so review that source before installing
it. Choose the narrowest installation scope and pin the version:

```bash
# User installation: writes to ~/.pi/agent/settings.json
pi install npm:pi-langfuse@1.5.6

# Project installation: writes to .pi/settings.json (review before committing)
pi install -l npm:pi-langfuse@1.5.6

# One session only: does not change settings
pi -e npm:pi-langfuse@1.5.6
```

This is deliberately **not** an Open Harness default package. It instruments Pi
sessions only; it does not instrument standalone Claude Code, Codex CLI, or
Gemini CLI sessions.

## Local self-hosted setup walkthrough

The following procedure mirrors a working local installation: clone Langfuse as
an independent project under Open Harness's `.oh/worktrees/project/` namespace,
start its Compose stack, attach the existing sandbox to Langfuse's Docker
network, and configure Pi against the service hostname.

Commands run from the normal host terminal unless marked **SANDBOX** or **PI**.

### 1. Clone Langfuse under `.oh/worktrees`

Start from the Open Harness checkout:

```bash
cd /path/to/openharness
WORKTREES_ROOT="$(bash .oh/scripts/oh-path worktrees --no-create 2>/dev/null || printf '%s' "${WORKTREES_DIR:-.oh/worktrees}")"
mkdir -p "$WORKTREES_ROOT/project/langfuse"
git clone https://github.com/langfuse/langfuse.git \
  "$WORKTREES_ROOT/project/langfuse/langfuse"
cd "$WORKTREES_ROOT/project/langfuse/langfuse"
```

This is an independent repository with its own `.git`, not a harness branch or
Git worktree. If it is already cloned, update it instead:

```bash
cd /path/to/openharness
WORKTREES_ROOT="$(bash .oh/scripts/oh-path worktrees --no-create 2>/dev/null || printf '%s' "${WORKTREES_DIR:-.oh/worktrees}")"
cd "$WORKTREES_ROOT/project/langfuse/langfuse"
git pull --ff-only
```

### 2. Start and verify Langfuse

```bash
docker compose up -d --wait --wait-timeout 300
docker compose ps
curl -fsS http://localhost:3000/api/public/health
```

A failed health check can be investigated with:

```bash
docker compose logs --tail=200
```

### 3. Start the sandbox and discover Langfuse's network

```bash
docker start oh-sbx-local
LANGFUSE_WEB_ID=$(docker compose ps -q langfuse-web)
LANGFUSE_NETWORK=$(
  docker inspect "$LANGFUSE_WEB_ID" \
    --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}' |
  head -n 1
)
printf 'Langfuse container: %s\nLangfuse network: %s\n' \
  "$LANGFUSE_WEB_ID" "$LANGFUSE_NETWORK"
```

Run these commands from the cloned Langfuse repository so `docker compose`
selects its Compose project.

### 4. Attach the sandbox to Langfuse

The conditional network attachment is idempotent:

```bash
docker inspect oh-sbx-local \
  --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{"\n"}}{{end}}' |
  grep -Fxq "$LANGFUSE_NETWORK" ||
  docker network connect "$LANGFUSE_NETWORK" oh-sbx-local
```

Confirm that both containers share the network, then verify DNS and HTTP from
the sandbox:

```bash
docker network inspect "$LANGFUSE_NETWORK" \
  --format '{{range .Containers}}{{println .Name}}{{end}}' |
  sort

docker exec -u sandbox oh-sbx-local getent hosts langfuse-web
docker exec -u sandbox oh-sbx-local \
  curl -fsS http://langfuse-web:3000/api/public/health
```

Compose may prefix the Langfuse container's displayed name. The service DNS
name remains `langfuse-web`. Repeat the network attachment whenever the
`oh-sbx-local` container is destroyed and recreated.

### 5. Create the local user, project, and keys

Open <http://localhost:3000> on the host and:

1. Select **Sign up** and create the initial local user.
2. Sign in and create an organization when prompted.
3. Create a project, for example `openharness-local`.
4. Open **Settings → API Keys** and select **Create new API keys**.
5. Copy the public key (`pk-lf-...`) and secret key (`sk-lf-...`) while shown.

Keep the secret key out of source files, shell history, screenshots, and chat.

### 6. Install and configure Pi

Enter the existing sandbox:

```bash
docker exec -it -u sandbox oh-sbx-local bash
```

Then run these commands in the **SANDBOX**:

```bash
pi --version
pi install npm:pi-langfuse@1.5.6
pi list
export LANGFUSE_PRIVACY_PRESET=metadata-only
pi
```

At the **PI** prompt, run `/langfuse-setup` and enter:

```text
Public key:  pk-lf-...
Secret key:  sk-lf-...
Langfuse URL: http://langfuse-web:3000
```

Do not use `localhost` here: inside the sandbox it refers to the sandbox, not
the Langfuse container. The saved configuration lives at
`~/.pi/agent/pi-langfuse/config.json` on Open Harness's persistent `pi-auth`
volume.

### 7. Verify tracing and permissions

At the **PI** prompt:

1. Run `/langfuse-status`; confirm the masked public key, host
   `http://langfuse-web:3000`, `metadata-only` privacy, and no runtime error.
2. Run `/langfuse-test`; confirm the test trace appears in the local project.
3. Send a normal prompt and confirm its session trace appears as well.

Exit Pi, then verify restrictive permissions from the **SANDBOX** without
printing the credential file:

```bash
stat -c '%a %n' \
  ~/.pi/agent/pi-langfuse \
  ~/.pi/agent/pi-langfuse/config.json
```

Expected permissions are `700` for the directory and `600` for the file. Keep
`LANGFUSE_PRIVACY_PRESET=metadata-only` set before future Pi launches unless a
broader capture policy is deliberately approved.

## Configure

### Interactive setup (recommended)

Start Pi, then run its package command:

```text
/langfuse-setup
```

Enter the Langfuse public key (`pk-lf-...`), secret key (`sk-lf-...`), and
external Langfuse URL. The package persists them in
`~/.pi/agent/pi-langfuse/config.json`; in the sandbox, `~/.pi` is on the
`pi-auth` named volume. When the package writes the file it creates a `0700`
directory and a `0600` file where POSIX permissions are available. `make destroy`
removes named volumes, including `pi-auth`, so configure again after destroying
the sandbox.

### Environment-only setup

For a non-interactive shell, export credentials before starting Pi:

```bash
export LANGFUSE_PUBLIC_KEY='pk-lf-...'
export LANGFUSE_SECRET_KEY='sk-lf-...'
export LANGFUSE_BASE_URL='https://cloud.langfuse.com'
export LANGFUSE_PRIVACY_PRESET='metadata-only'
pi
```

`LANGFUSE_HOST` is supported as a fallback name. For an environment-only
configuration, `LANGFUSE_BASE_URL` wins over `LANGFUSE_HOST`.

`.devcontainer/.env` is Docker Compose interpolation, **not** a file that is
automatically injected wholesale into Pi. If you keep Langfuse variables there,
explicitly export them in the shell that launches Pi:

```bash
set -a
source /home/sandbox/harness/.devcontainer/.env
set +a
pi
```

## Configuration and privacy precedence

A valid saved `~/.pi/agent/pi-langfuse/config.json` (one with both keys) supplies
credentials and host before environment configuration. Environment privacy
settings still apply: `LANGFUSE_PRIVACY_PRESET` and the individual capture flags
override saved privacy settings. If there is no complete saved config,
environment credentials are used; then `LANGFUSE_BASE_URL` takes precedence over
`LANGFUSE_HOST`.

The upstream default is `full-debug`, which captures prompts, outputs, tool I/O,
the system prompt, and cwd. Prefer a narrower preset unless that detail is
explicitly approved:

| Preset | Captures |
| --- | --- |
| `metadata-only` | metadata only; no inputs, outputs, tool I/O, system prompt, or cwd |
| `prompts-only` | inputs/prompts only; no outputs, tool I/O, system prompt, or cwd |
| `conversations` | inputs and assistant outputs; no tool I/O, system prompt, or cwd |
| `full-debug` (default) | inputs, outputs, tool I/O, system prompt, and cwd |

Fine-grained environment flags override a preset:

```bash
export LANGFUSE_CAPTURE_INPUTS=true
export LANGFUSE_CAPTURE_OUTPUTS=true
export LANGFUSE_CAPTURE_TOOL_IO=false
export LANGFUSE_CAPTURE_SYSTEM_PROMPT=false
export LANGFUSE_CAPTURE_CWD=false
```

The package redacts common secrets and local paths before upload, but redaction
is defense in depth, not permission to upload sensitive prompts, tool results,
or source context. Keep keys out of version control, use the least capture that
meets the need, and treat the Langfuse deployment as an external data boundary.

## Choose the URL from where Pi runs

| Pi location | Langfuse location | URL to configure | Notes |
| --- | --- | --- | --- |
| Host shell | Langfuse on the same host | `http://localhost:3000` | Normal host-loopback case. |
| Sandbox | Langfuse on the Docker host | `http://host.docker.internal:3000` | The sandbox already maps `host.docker.internal` to Docker's host gateway. `localhost` inside the sandbox is the sandbox itself. |
| Sandbox | Another Compose service | that service's hostname, for example `http://langfuse-web:3000` | Works only after both services are explicitly attached to a shared Docker network. It is not automatic. |
| Sandbox or host | Cloud or remote self-hosted Langfuse | its HTTPS public URL | Verify DNS, TLS, routing, and firewall access from the process running Pi. |

## Verify with a real prompt

1. Confirm Pi loaded the optional package:
   ```bash
   pi list
   ```
2. In Pi, run `/langfuse-status`. It shows the selected source, host, masked
   public key, effective capture policy, config path, and last runtime error.
3. Run `/langfuse-test`. It performs a timeout-bounded authenticated request and
   sends a small test trace.
4. Send a normal Pi prompt, then inspect the resulting trace in Langfuse. A
   real prompt is the end-to-end check for the session trace, generations, and
   any tool observations.

## Troubleshooting

| Symptom | Check and fix |
| --- | --- |
| Missing keys or no configuration | Run `/langfuse-setup`, or export both `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` before starting Pi. |
| Old key or host still wins | A complete saved config takes precedence for credentials and host. Use `/langfuse-status` to see its source, then rerun `/langfuse-setup` to replace stale saved values. |
| Wrong URL | With environment-only setup, use `LANGFUSE_BASE_URL`; it wins over `LANGFUSE_HOST`. A saved host still wins over either, so update or remove the stale saved config deliberately. |
| Connection refused or timeout | Check the location table: sandbox `localhost` is not the Docker host; use `host.docker.internal` for the host, or explicitly share a Compose network for a service hostname. |
| TLS or DNS error | Use the externally reachable HTTPS URL, verify the hostname resolves from the Pi process, and provide a certificate chain trusted by that process. |
| Test works but no useful trace | Send a real Pi prompt after `/langfuse-test`, then use `/langfuse-status` and Pi output for the last runtime error and effective capture policy. |
| Usage or cost is absent | These fields are conditional on provider events. Some providers do not expose them; inspect raw observations and do not treat their absence as a tracing failure. |

For package installation scope, pins, and trust behavior, see the upstream
[Pi packages documentation](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/packages.md).
