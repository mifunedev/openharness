---
title: SSH
---

# SSH

By default you reach the sandbox with `make shell` or VS Code Attach (see
[Connecting to the Sandbox](../connecting.md)) — the base container publishes
**no ports**. This integration adds an **opt-in `sshd` overlay** so you can
`ssh` straight into the container, and documents how to front several tenants'
containers with a single host-side `nginx` reverse proxy on one VM.

The daemon is **off by default**, binds **loopback-only**, and authenticates by
**public key** unless you opt into password auth. It runs as a background daemon
alongside the container's main process, so the cron runtime, healthcheck, and
`make shell` are unaffected.

## 1. Prerequisites

- Sandbox is provisioned (`make ps` shows your container).
- A local SSH keypair (`ssh-keygen -t ed25519` if you don't have one). The
  daemon defaults to key auth; you supply the **public** key.

## 2. Enable the overlay

Turn on the `ssh` section in your local `harness.yaml` (uncomment the keys):

```yaml
ssh:
  enabled: true              # SANDBOX_SSH — run sshd for direct container SSH
  port: 2222                 # SANDBOX_SSH_PORT — host loopback port published for SSH
  # password_auth: false     # leave off; use a key (section 3)
```

Public-key material can't live in `harness.yaml` (its parser is single-line), so
put your key in the gitignored `.devcontainer/.env`:

```bash
SANDBOX_SSH_AUTHORIZED_KEYS="ssh-ed25519 AAAA...yourkey... you@laptop"
```

You can paste multiple keys separated by newlines (or literal `\n`). Apply the
change with a rebuild:

```bash
make destroy && make sandbox
```

`make sandbox` runs a **port-collision preflight**: if `SANDBOX_SSH_PORT` is
already bound by another container or host process, it aborts *before* creating
the container and prints the conflict plus the next free port — it never
silently clobbers a port another tenant is using. Bypass with
`SANDBOX_SSH_PORT_CHECK=off make sandbox` if you know better. Check any port
yourself:

```bash
bash .oh/scripts/check-host-port.sh 2222   # → "free" or "<port> in use by <owner>; next free: <m>"
```

## 3. Add your public key

If you didn't set `SANDBOX_SSH_AUTHORIZED_KEYS` in step 2, add it now and
restart. Alternatively, bind-mount a host `authorized_keys` file — add a
`compose.overrides` entry pointing at a small overlay that mounts
`~/.ssh/authorized_keys` to `/home/sandbox/.ssh/authorized_keys:ro`.

The entrypoint writes the key material to `/home/sandbox/.ssh/authorized_keys`
(mode `600`, owned by the `sandbox` user) and hardens `sshd` with a drop-in at
`/etc/ssh/sshd_config.d/openharness.conf`:

```
PermitRootLogin no
PubkeyAuthentication yes
PasswordAuthentication no
```

> If sshd starts with **no** authorized key **and** password auth off, no one
> can log in — the entrypoint logs a loud warning. Provide a key or enable
> password auth.

## 4. Connect

The overlay publishes `127.0.0.1:${SANDBOX_SSH_PORT}:22` on the host, so from
the **host** machine:

```bash
ssh -p 2222 sandbox@localhost
```

You land in `/home/sandbox/harness` as the `sandbox` user. To reach it from
another machine, either open an SSH tunnel to the host
(`ssh -L 2222:localhost:2222 you@vm`) or front it with nginx (section 6).

Verify the daemon inside the container:

```bash
docker exec <container> pgrep -x sshd     # sshd is running
```

## 5. Optional: password auth

Key auth is strongly preferred. If you must allow password login (uses the
`sandbox` user's `SANDBOX_PASSWORD`), set:

```yaml
ssh:
  password_auth: true        # SANDBOX_SSH_PASSWORD_AUTH
```

> **Security.** The default `SANDBOX_PASSWORD` (`test1234`) is weak and public.
> Never enable password auth on a `0.0.0.0` / internet-facing bind without first
> setting a strong `SANDBOX_PASSWORD` in `.devcontainer/.env`. See
> [Security considerations](../security-considerations.md).

## Security posture

- **Off by default** — no `sshd`, no published port until you enable the overlay.
- **Loopback by default** — the host bind is `127.0.0.1`, reachable from the host
  (and a host-side proxy), not the public interface. To expose it directly,
  change the overlay bind to `0.0.0.0:${SANDBOX_SSH_PORT}:22` — an explicit,
  deliberate choice.
- **Pubkey by default, `PermitRootLogin no`** — password auth is opt-in.
- Exposing SSH broadly, or enabling password auth with the default password, is
  the operator's responsibility — the harness makes the safe posture the default.

## 6. Multi-tenant SSH routing with nginx (single VM)

To host several agents on one VM and give each its own SSH endpoint, run each as
its own container (distinct `SANDBOX_NAME`) publishing SSH on a **distinct host
loopback port**, then front them with a host-side `nginx:alpine` using the
`stream` module (raw TCP — included in the official image).

**DNS first.** Point a subdomain per tenant at the VM's public IP (A/AAAA
records). Replace `example.com` with your domain (e.g. `mifune.dev`):

```
oh-1.example.com  A  203.0.113.10
oh-2.example.com  A  203.0.113.10
```

Each tenant's `harness.yaml` sets a unique loopback port, e.g. tenant-1 →
`ssh.port: 12201`, tenant-2 → `ssh.port: 12202`. Pick a free port per tenant:

```bash
bash .oh/scripts/check-host-port.sh 12201   # ensure it's free before `make sandbox`
```

### (a) Subdomain + port per tenant — simple, no TLS

The `stream` block maps one public listen port per tenant to its loopback port.
`nginx.conf` on the VM:

```nginx
events {}

stream {
  server {
    listen 2201;
    proxy_pass 127.0.0.1:12201;   # oh-1.example.com → tenant-1
  }
  server {
    listen 2202;
    proxy_pass 127.0.0.1:12202;   # oh-2.example.com → tenant-2
  }
}
```

Run the router with host networking so it can reach the loopback-published
tenant ports and bind the public ports:

```yaml
# docker-compose.yml (host-side, next to nginx.conf)
services:
  ssh-router:
    image: nginx:alpine
    network_mode: host
    restart: unless-stopped
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
```

Users connect per tenant:

```bash
ssh -p 2201 sandbox@oh-1.example.com
ssh -p 2202 sandbox@oh-2.example.com
```

The subdomain names the tenant; the **port** is the routing key. Plain SSH has
no host header, so with this variant the port distinguishes tenants. Add a new
tenant by allocating a fresh loopback+public port pair and appending one
`server {}` block (reload with `docker exec <router> nginx -s reload`).

### (b) Single-port, hostname-routed — SSH-over-TLS + SNI (advanced)

For a **single entry port** where the *domain* selects the tenant
(`ssh oh-1.example.com` and `ssh oh-2.example.com` share port 443), wrap SSH in
TLS and route by SNI. nginx `stream` reads the TLS server name without
terminating it and forwards the raw stream:

```nginx
events {}

stream {
  map $ssl_preread_server_name $tenant {
    oh-1.example.com  127.0.0.1:12201;
    oh-2.example.com  127.0.0.1:12202;
  }

  server {
    listen 443;
    ssl_preread on;
    proxy_pass $tenant;
  }
}
```

Because `ssl_preread` forwards the raw TLS stream, each tenant needs a TLS shim
(e.g. `stunnel`) in front of its `sshd` to terminate TLS back to plain SSH (or
terminate TLS at nginx per-SNI with a wildcard `*.example.com` cert and
`proxy_pass` plaintext SSH). Clients wrap SSH in TLS with a `ProxyCommand`:

```
# ~/.ssh/config
Host oh-1.example.com oh-2.example.com
  ProxyCommand openssl s_client -quiet -connect %h:443 -servername %h
  User sandbox
```

This buys a true single entry point at the cost of a TLS shim per tenant and a
wildcard certificate. Most operators are well served by variant (a); reach for
(b) only when you need one shared port with hostname-based selection.

## See also

- [Connecting to the Sandbox](../connecting.md) — `make shell`, VS Code Attach, ports
- [Security considerations](../security-considerations.md) — exposure posture
