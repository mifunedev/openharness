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

## Quick tunnel flow

Run inside the sandbox, after the app is already listening locally:

```bash
bash "$CLAUDE_SKILL_DIR/scripts/run.sh" $ARGUMENTS
```

The script verifies `cloudflared`, `tmux`, and the local upstream, starts a
Cloudflare quick tunnel in `tmux`, waits for the generated URL, and prints
inspect/log/stop commands.

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
