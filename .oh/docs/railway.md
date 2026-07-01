# Deploy Open Harness on Railway

Railway is the hosted **smoke-test** path for Open Harness. It is useful when a new user wants to click a deploy button, see the repo boot, inspect a public status page, and decide whether to continue with the full local Docker/devcontainer setup.

It is **not full local sandbox parity**. Railway builds and runs a container from this repository, but it does not provide the host Docker socket or privileged sibling-container surface that Open Harness uses for `make sandbox`, `make shell`, compose overlays, Docker-in-Docker workflows, and teardown/rebuild lifecycle control.

## One-click deploy

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template?template=https%3A%2F%2Fgithub.com%2Fmifunedev%2Fopenharness)

The button deploys this repository with the root [`railway.json`](../railway.json), which points Railway at `.oh/deploy/railway/Dockerfile` and starts `.oh/deploy/railway/start.sh`.

## What launches

The Railway service starts a hosted-smoke web surface:

- `/` — HTML status page explaining the hosted mode and limitations.
- `/healthz` — plain `ok` healthcheck used by Railway.
- `/status.json` — sanitized JSON status with tool availability and secret-presence booleans.

The status service binds to Railway's `$PORT` on `0.0.0.0`. It does not print secret values.

## Configuration

No environment variable is required to boot the smoke service.

Optional variables:

| Variable | Purpose |
|---|---|
| `GH_TOKEN` | Enables authenticated GitHub operations from inside the hosted container. Configure it in Railway variables; never commit it. |
| `OH_PROJECT_ROOT` | Overrides the in-container project root. Defaults to `/home/sandbox/harness`. |
| `OPENHARNESS_HOSTED_MODE` | Defaults to `railway`; used only for the status payload. |

Agent/provider tokens such as Slack app tokens, Claude credentials, or other OAuth material must be configured through Railway variables or provider-specific login flows. Do not put them in `railway.json`, README examples, or committed docs.

## Persistence

Railway containers are disposable. For anything beyond a quick smoke test, add a Railway volume for the runtime home/state you care about, such as `/home/sandbox`, before performing logins or long-running work. Without a volume, provider auth and runtime state can disappear on redeploy.

## Limitations

Use the local Docker/devcontainer install when you need:

- `make sandbox`, `make shell`, `make destroy`, or compose overlays.
- Access to `/var/run/docker.sock`.
- Docker builds from inside the sandbox.
- Privileged containers or sibling service containers.
- Local bind-mounted project worktrees with host-level Docker control.

The Railway path deliberately avoids pretending these surfaces exist. It is a fast hosted preview and a deployment smoke test; the full Open Harness experience remains the local/self-hosted Docker path documented in [Installation](installation.md) and [Quickstart](quickstart.md).

## Maintainer verification

Before changing the Railway surface, run:

```bash
bash evals/probes/railway-one-click-deploy.sh
```

The probe checks the README button, `railway.json`, deploy assets, `$PORT` binding, and the hosted-mode limitations in this doc.
