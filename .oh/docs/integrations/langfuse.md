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
