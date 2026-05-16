---
name: docker-sandbox-debug
description: |
  Diagnose and fix common Docker sandbox failures: containers that won't start,
  port collisions, volume mount errors, network issues, and log retrieval.
  Use when a container exits unexpectedly, a port is already in use, a bind
  mount shows empty or permission-denied errors, or you need to capture logs
  from a running container or in-sandbox tmux session.
license: Apache-2.0
metadata:
  mifune:
    version: "0.1.0"
    category: dev-workflow
    requires-tools: ["docker"]
---

# Docker Sandbox Debug

Systematic runbook for diagnosing containers that won't start, port collisions,
volume mount problems, and log retrieval. Works on Linux and macOS. Windows
users: commands are the same under WSL2; native PowerShell equivalents are not
covered.

---

## 1. Container Not Starting

### Symptoms
- `docker ps` shows no container, or container exits immediately.
- `docker compose up` reports a non-zero exit code.

### Steps

**1a. Check exit code and last log lines.**

```bash
# Replace <container> with the container name or ID.
docker ps -a --filter "name=<container>" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
docker logs --tail 50 <container>
```

Common exit codes:

| Code | Meaning | Likely cause |
|------|---------|--------------|
| 1 | Generic error | Bad entrypoint, missing file |
| 125 | Docker daemon error | Image not found, OOM |
| 126 | Permission denied | Entrypoint not executable |
| 127 | Command not found | Wrong entrypoint path |
| 137 | SIGKILL (OOM) | Container hit memory limit |
| 139 | SIGSEGV | Corrupt binary or wrong arch |

**1b. Inspect the container config.**

```bash
docker inspect <container> | grep -A5 '"ExitCode"'
docker inspect <container> | grep -A10 '"Env"'
```

**1c. Run interactively to bypass the entrypoint.**

```bash
# Override entrypoint to get a shell for investigation:
docker run --rm -it --entrypoint /bin/sh <image>:<tag>
# Or with compose:
docker compose run --entrypoint /bin/sh <service>
```

**1d. Check for missing environment variables.**

Most crashes during startup are from a missing required env var. Compare
`.env` (or your shell environment) against what `docker inspect` shows.

```bash
docker inspect <container> --format '{{range .Config.Env}}{{println .}}{{end}}'
```

**1e. Verify the image architecture.**

On Apple Silicon (M-series), pulling an `amd64`-only image causes silent
crashes or `exec format error`.

```bash
docker inspect <image>:<tag> --format '{{.Architecture}}'
# If "amd64" on an arm64 host, add --platform linux/arm64 or use a multi-arch image.
```

---

## 2. Port Collisions

### Symptoms
- `Bind for 0.0.0.0:<port> failed: port is already allocated`
- `address already in use`

### Steps

**2a. Find what is using the port.**

```bash
# Linux
ss -tlnp | grep :<port>
# macOS
lsof -i :<port>
```

**2b. Identify the owning Docker container (if any).**

```bash
docker ps --format "table {{.Names}}\t{{.Ports}}" | grep <port>
```

**2c. Resolution options.**

| Option | When to use |
|--------|------------|
| Stop the conflicting container | You own the other container |
| Change the host-side port in compose | You cannot stop the other service |
| Use `--publish 0` to let Docker pick a free port | Ad-hoc dev runs only |

Change host port in `docker-compose.yml`:

```yaml
ports:
  - "8081:8080"   # host:container — change 8081 to any free port
```

**2d. Verify the port is free before restarting.**

```bash
# Linux
ss -tlnp | grep :<new-port>
# macOS
lsof -i :<new-port>
# Expect no output if free.
```

---

## 3. Volume Mount Issues

### Symptoms
- Files inside the container are missing or appear empty.
- `Permission denied` when the process tries to write to a bind-mounted path.
- Container writes are not visible on the host, or vice versa.

### Steps

**3a. Confirm the mount is present.**

```bash
docker inspect <container> --format '{{range .Mounts}}{{.Type}} {{.Source}} -> {{.Destination}} (RW={{.RW}}){{"\n"}}{{end}}'
```

Check `RW=true` for writable mounts and that `Source` points to the
expected host path.

**3b. Verify the host path exists.**

```bash
ls -la <host-path>
```

If missing, create it before starting the container. Docker creates
missing bind-mount paths as `root:root`, which often causes permission
errors for non-root container users.

**3c. Fix permission errors.**

```bash
# Option A: Chown the host directory to match the container user UID.
sudo chown -R <uid>:<gid> <host-path>

# Option B: Use a named volume instead of a bind mount for ephemeral data.
# In docker-compose.yml, replace the bind mount with a named volume.
```

Determine the container user UID:

```bash
docker run --rm <image>:<tag> id
```

**3d. macOS-specific: file system latency.**

Docker Desktop on macOS uses a virtual file system layer. Large bind
mounts (e.g., `node_modules/`) can be slow. Prefer named volumes for
dependency directories and bind-mount only source code.

```yaml
volumes:
  - .:/app                         # source — bind mount (fast enough)
  - node_modules:/app/node_modules # deps — named volume (fast)

volumes:
  node_modules:
```

**3e. SELinux (Linux only).**

On SELinux-enforcing systems, bind mounts need a `:z` (shared) or `:Z`
(private) label:

```yaml
volumes:
  - ./data:/data:z
```

---

## 4. Network and DNS Issues

### Symptoms
- Containers cannot reach each other by service name.
- `curl http://<service>:<port>` times out inside a container.

### Steps

**4a. Confirm containers are on the same network.**

```bash
docker network inspect <network-name>
# Look for both containers under "Containers".
```

With Compose, all services in a `docker-compose.yml` share a default
network automatically. Manually-started containers are not on that
network.

**4b. Test connectivity from inside a container.**

```bash
docker exec -it <container> ping <other-service>
docker exec -it <container> curl -v http://<other-service>:<port>
```

**4c. Add a container to an existing network.**

```bash
docker network connect <network-name> <container>
```

---

## 5. Log Retrieval

### 5a. Container logs via Docker

```bash
# Stream live logs:
docker logs -f <container>

# Last N lines:
docker logs --tail 100 <container>

# Logs with timestamps:
docker logs -t <container>

# Since a timestamp (ISO 8601 or Go duration):
docker logs --since 5m <container>
docker logs --since "2026-05-16T10:00:00" <container>
```

**Save to file:**

```bash
docker logs <container> > /tmp/<container>.log 2>&1
```

### 5b. Logs from a tmux session (if used for in-sandbox processes)

If you run in-sandbox processes inside named tmux sessions (see your
project's process lifecycle conventions), retrieve output without
attaching:

```bash
# Capture the visible pane buffer to a file:
tmux capture-pane -t <session-name> -p > /tmp/<session-name>.log

# For a specific pane in a multi-pane session (0-indexed):
tmux capture-pane -t <session-name>:0.1 -p > /tmp/<session-name>-pane1.log

# List sessions to find the right name:
tmux ls
```

If the process log is tee'd to a file (a common convention):

```bash
cat /tmp/<session-name>.log
tail -f /tmp/<session-name>.log
```

### 5c. Compose-level log aggregation

```bash
# All services:
docker compose logs -f

# Single service:
docker compose logs -f <service>

# Save all service logs:
docker compose logs --no-color > /tmp/compose-all.log 2>&1
```

---

## 6. Quick-Reference Checklist

Run through this list in order when a sandbox is broken:

```
[ ] docker ps -a              — is the container listed? what is its status?
[ ] docker logs <container>   — what is the last error?
[ ] docker inspect <c>        — correct image, mounts, env, ports?
[ ] ss / lsof on the port     — port already in use?
[ ] ls <host-path>            — bind-mount source exists?
[ ] chown / :z label          — permission or SELinux issue?
[ ] docker network inspect    — containers on the same network?
[ ] tmux ls                   — in-sandbox sessions still running?
```

---

## Guidelines

- Always read `docker logs` before restarting a container — the exit
  reason is almost always there.
- Prefer `docker compose down && docker compose up` over `docker restart`
  when config has changed; `restart` reuses the old config.
- Named volumes survive `docker compose down`; add `-v` to remove them:
  `docker compose down -v`.
- On Linux, `--network host` bypasses port mapping and is useful for
  quick debugging but should not be left in production compose files.
- When logs are noisy, pipe through `grep -v` to filter known-good lines
  before hunting for errors.
