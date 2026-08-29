# T3 Code on a phone, over a private tailnet

Reaching T3 Code from a phone without exposing it publicly. The tailnet node is
the **sandbox container**, running `tailscaled` in userspace-networking mode as
the unprivileged `sandbox` user. No container capability is added, no host port
is published, and T3 Code stays bound to container loopback. Tailscale Serve
inside the container terminates HTTPS on the tailnet and proxies to
`127.0.0.1:3773`.

A device that is not on the tailnet cannot reach the backend at all.

## Sessions

Both processes follow the sandbox tmux convention (see
[`sandbox-processes.md`](sandbox-processes.md)).

| Session | Process | Log |
| --- | --- | --- |
| `agent-tailscaled` | `tailscaled` in userspace-networking mode | `/tmp/agent-tailscaled.log` |
| `agent-t3code` | `npx --yes t3 serve --tailscale-serve` | `/tmp/agent-t3code.log` |

Neither is started by the container entrypoint. Joining a tailnet is an explicit
human act.

## One-time setup

```bash
oh tool install tailscale

tmux new-session -d -s agent-tailscaled \
  'tailscaled --tun=userspace-networking \
              --socket=$HOME/.tailscale/tailscaled.sock \
              --statedir=$HOME/.tailscale 2>&1 | tee /tmp/agent-tailscaled.log'

tailscale up
```

`tailscale up` prints a login URL. Open it in a browser and approve the node.
State lives in `$HOME/.tailscale`, which is a named Docker volume, so a container
recreate does not force a re-login.

## Start the server and pair the phone

```bash
/t3 doctor --tailscale     # confirm Node, binary, daemon, and tailnet state first
/t3 start --tailscale
```

The server prints a connection string, a one-time pairing token, a pairing URL,
and a QR code. Install the T3 Code mobile app, then scan the QR code or paste the
`https://<machine>.<tailnet>.ts.net/...` URL.

The pairing token is one-time. To add a second device later, do **not** restart
the server:

```bash
/t3 pair --tailscale
```

## Ports

Tailscale Serve defaults to HTTPS on **443**. Use another port with:

```bash
/t3 start --tailscale --tailscale-port 8443
```

The hosted `https://app.t3.codes` page cannot talk to a plain-HTTP backend
(mixed content). Tailscale Serve gives you real HTTPS, so it works with both the
hosted page and the native mobile app.

## Teardown and revocation

```bash
/t3 stop                              # kill the T3 Code session
tailscale serve --https=443 off       # withdraw the Serve mapping; it persists until you do
t3 auth                               # inspect and revoke T3 sessions and credentials
tailscale logout                      # remove this node's tailnet identity
```

Delete the node in the Tailscale admin console to revoke it from the other side.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `tailscale not found in PATH` | `oh tool install tailscale`, and set `install.tailscale: true` in `oh.json` so a rebuild keeps it |
| `tailscaled is not running` | start the `agent-tailscaled` session above; check `/tmp/agent-tailscaled.log` |
| backend state is `NeedsLogin` / `Stopped` | run `tailscale up` interactively and finish the browser login |
| Node does not satisfy the range | the T3 server needs `^22.16 \|\| ^23.11 \|\| >=24.10`; raise the Node pin in `.devcontainer/Dockerfile` and rebuild |
| port 3773 not answering | read `/t3 logs`; the provider backend may have failed to start |
| phone shows the page but cannot connect | confirm the phone is on the same tailnet and the MagicDNS name resolves |

## Secrets

Pairing URLs and tokens are credentials. They belong in the terminal and the
`/tmp` session log only — never in a tracked file, an issue, a PR body, or a
persistent log. Tailscale auth keys are never printed or committed; the supported
path is interactive `tailscale up`.
