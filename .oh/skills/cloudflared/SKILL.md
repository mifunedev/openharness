---
name: cloudflared
description: |
  Start or explain a Cloudflared tunnel for a sandbox app port. Cloudflared is
  the default public sharing method for Open Harness previews; this skill
  replaces generic sharing guidance with a portable pointer to the installed
  cloudflared CLI and tmux process convention.
  TRIGGER when: asked to share a local app publicly, expose a sandbox port,
  make localhost reachable from another machine, open a preview URL, or run
  cloudflared.
argument-hint: "<port> [--host 127.0.0.1] [--name <slug>] [--session <name>]"
allowed-tools: Bash, Read
---

# Cloudflared

Use Cloudflared as the default public tunnel for sandbox app previews. Prefer a
Cloudflare quick tunnel for temporary sharing; use a named tunnel only when the
operator explicitly needs a stable hostname or Cloudflare Access policy.

## Arguments

Arguments received: `$ARGUMENTS`

- `PORT`: first positional argument; required (example: `3000`)
- `--host`: local upstream host; default `127.0.0.1`
- `--name`: optional slug for the tmux/log suffix; default is the port
- `--session`: optional tmux session name override; default `cloudflared-<slug>`

If `PORT` is missing, ask which local port to tunnel.

## Pre-flight — confirm the public surface (do NOT assume)

A dev stack usually listens on **several** ports where only ONE is the intended
public surface (e.g. a web UI on `:3005`, a browser-editor gateway on `:8788`, a
metrics port, a DB). Picking the wrong one wastes a tunnel and can expose the
wrong service.

Before starting a tunnel:

1. If the caller did not name the service explicitly, **list the listening ports
   and ask which service is meant to be public** — never default to "the web
   port". `ss -ltnp` or the project's dev docs disambiguate.
2. A quick-tunnel URL is a **public bearer URL** — anyone with it reaches the
   origin. If the target is not a throwaway static preview (it has auth,
   webhooks, an admin surface, or real data), get an explicit go-ahead before
   exposing it.

## Quick tunnel flow

Run inside the sandbox, after the app is already listening locally:

```bash
bash "$CLAUDE_SKILL_DIR/scripts/run.sh" $ARGUMENTS
```

The script verifies `cloudflared`, `tmux`, and the local upstream, starts a
Cloudflare quick tunnel in `tmux`, waits for the generated URL, and prints
inspect/log/stop commands.

**Always verify through the PUBLIC url, not just the local upstream.** The
script's local `curl` precheck is necessary but NOT sufficient: an origin can
answer `127.0.0.1` fine yet return `404`/`421` through the tunnel because it
routes on (or rejects) the `Host` header the tunnel sends (see Troubleshooting).
After the URL appears:

```bash
curl -fsS -o /dev/null -w '%{http_code}\n' https://<sub>.trycloudflare.com/<known-path>
```

If the public code differs from the local code, it is a host-header problem, not
a tunnel-connectivity problem — fix the origin (below), don't restart the tunnel.

## Adding cloudflared to an existing dev session (pane, not a new session)

When the operator wants the tunnel to live *inside* an existing multi-pane dev
session (so it starts/stops with the rest of the stack) rather than in its own
`cloudflared-<slug>` session, add it as a pane instead of calling `run.sh`:

```bash
# open a pane in the running session's window, then launch the tunnel with a log
PANE=$(tmux split-window -t <session>:0 -c <project-dir> -P -F '#{pane_id}')
tmux select-pane -t "$PANE" -T cloudflared
tmux send-keys -t "$PANE" \
  "cloudflared tunnel --url http://127.0.0.1:<port> --no-autoupdate 2>&1 | tee /tmp/<session>-cloudflared.log" C-m
tmux select-layout -t <session>:0 even-vertical   # match the session's layout
```

Stop it with `tmux send-keys -t "$PANE" C-c` **or** `pkill -x cloudflared` — never
`pkill -f 'cloudflared tunnel …'`, whose pattern also matches the shell running
the `pkill`, killing your own command.

If the upstream check fails, fix the app bind/listen state first. Many dev
servers must listen on `0.0.0.0` inside the container to be reachable through the
tunnel.

## Stable hostname path

For durable public URLs, do not invent a separate access layer. Use Cloudflare's
named tunnel flow and store credentials in the existing `~/.cloudflared` volume:

```bash
cloudflared tunnel login
cloudflared tunnel create <name>
cloudflared tunnel route dns <name> <hostname>
cloudflared tunnel run <name>
```

If the app is sensitive, require Cloudflare Access or another authentication gate
before sharing the URL. Quick tunnel URLs are public bearer URLs.

## Troubleshooting

### Public URL 404s / 421s while `127.0.0.1:<port>` works locally

The tunnel is connected; the origin is rejecting the `Host` header cloudflared
sends (the trycloudflare hostname). Two common causes:

- **Next.js dev server** bound to `127.0.0.1` refuses cross-origin hosts and
  answers `404`. Add the tunnel hostname (or a wildcard) to `allowedDevOrigins`
  in `next.config`, or bind the app to `0.0.0.0`, or rewrite the header at the
  tunnel: `cloudflared tunnel --url http://127.0.0.1:<port> --http-host-header <host-the-origin-expects>`.
- **Host-routed services** (e.g. a browser-editor gateway that dispatches by a
  `cs-<label>.<domain>` sub-domain) only serve requests whose `Host` matches a
  known route. A single random `*.trycloudflare.com` host will 404 by design.
  These need a **named tunnel with the real wildcard hostname**, not a quick
  tunnel — see *Stable hostname path*. `--http-host-header` can unblock a single
  known host for a smoke test, but is not a substitute for real host routing.

Diagnose by comparing the local vs public status code for the same path; if they
differ, it is a host-header/routing issue, not connectivity.

### `cloudflared tunnel login` says `cert.pem` already exists

Treat an existing `~/.cloudflared/cert.pem` as a likely valid login, not an error
to delete. First check whether Cloudflared can already see tunnels:

```bash
cloudflared tunnel list
```

If that works, do not run `cloudflared tunnel login` again. The existing
certificate is already usable.

Only replace the certificate when the operator intentionally wants to switch
Cloudflare accounts. Back it up first, and leave existing tunnel credential JSON
files in place unless explicitly removing those tunnels:

```bash
mkdir -p ~/.cloudflared/backups
mv ~/.cloudflared/cert.pem ~/.cloudflared/backups/cert.pem.$(date -u +%Y%m%dT%H%M%SZ).bak
cloudflared tunnel login
```

Quick tunnels from `/cloudflared <port>` do not require login, so this warning is
only relevant to named tunnels and durable hostnames.
