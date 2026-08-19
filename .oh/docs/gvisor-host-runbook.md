# gVisor host runbook — WSL2

This runbook records the state that the substrate spike left on a WSL2 host. The
runbook gives the operator three procedures: verify, exercise, and revert.

Proposal: [`rfcs/rfc-gvisor-support.md`](rfcs/rfc-gvisor-support.md).
Raw measurement: `.oh/skills/wiki/corpus/raw/2026-08-19-gvisor-wsl2-spike.md`.
Tracking issue: [#806](https://github.com/mifunedev/openharness/issues/806).

The runbook applies to any host that runs `runsc`. The recorded values come from the
2026-08-19 spike host.

## State that the spike left on the host

| Item | Value |
|---|---|
| Docker Engine | 29.7.2, installed in the Ubuntu 22.04 distribution |
| Engine socket | `/run/docker-engine.sock` |
| systemd drop-in | `/etc/systemd/system/docker.service.d/10-openharness-socket.conf` |
| `docker.socket` unit | disabled |
| gVisor | `runsc` release-20260810.0 |
| `daemon.json` | holds `nvidia` and `runsc` runtimes |
| Docker Desktop | installed, and its socket moved aside |

The Engine uses a dedicated socket. Docker Desktop uses `/var/run/docker.sock`. One
socket path holds one listener, so the two daemons need separate paths.

## Set the environment

Every command below needs this variable. Docker Desktop owns the default path.

```bash
export DOCKER_HOST=unix:///run/docker-engine.sock
```

Add the same line to `~/.bashrc` to make the setting persist.

## Procedure 1 — verify

```bash
export DOCKER_HOST=unix:///run/docker-engine.sock
docker info --format 'OS={{.OperatingSystem}} | Server={{.ServerVersion}}'
docker info --format '{{range $k,$v := .Runtimes}}{{$k}} {{end}}'
```

Expect `OS=Ubuntu 22.04.5 LTS`. An answer of `Docker Desktop` means the shell
reached the wrong daemon.

Expect `runsc` in the runtime list. A listed runtime is a presence check. Procedure 2
proves the capability.

## Procedure 2 — exercise

### Boot

```bash
docker run --runtime=runsc --rm hello-world
```

Expect the hello-world text. Printed text proves a boot.

### Confirm the kernel differs

```bash
docker run --rm            debian:bookworm-slim uname -r   # host kernel
docker run --runtime=runsc --rm debian:bookworm-slim uname -r   # gVisor kernel
```

Expect two different strings. gVisor reports its own kernel version, because gVisor
runs a userspace kernel. Two different strings prove isolation.

### Hold a detached tmux session

```bash
docker run --runtime=runsc --rm debian:bookworm-slim bash -c \
  'apt-get update -qq >/dev/null 2>&1 && apt-get install -y -qq tmux >/dev/null 2>&1 \
   && tmux new-session -d -s t "sleep 60" && tmux ls'
```

Expect `t: 1 windows`. This test carries the most weight. The Open Harness process
model makes tmux normative.

### Measure the cost

Run one workload twice in one directory. Compare `real` and `user`.

```bash
docker run --rm             -v "$PWD:/w" -w /w node:22 bash -c 'time npm ci'
docker run --runtime=runsc --rm -v "$PWD:/w" -w /w node:22 bash -c 'time npm ci'
```

The 2026-08-19 spike measured 1.15x on `real` and 2.05x on `user`. Report both numbers. A
workload that waits on the network hides most of the cost in `real`.

### Run Docker inside gVisor

```bash
docker run --runtime=runsc --rm --privileged -e DOCKER_HOST= docker:dind sh -c \
  'unset DOCKER_HOST; dockerd --iptables=false >/tmp/d.log 2>&1 &
   sleep 12; docker -H unix:///var/run/docker.sock info --format "nested {{.ServerVersion}}"'
```

Nested `dockerd` needs `--iptables=false`. Nested containers then need
`--network=host`.

## Known limits

1. **The host exposes no global IPv6 address.** A registry pull that resolves to an
   AAAA record fails. The same limit applies under `runc`. The cause is host network
   configuration, not gVisor.
2. **Docker Desktop needs a restart to reclaim its socket.** The spike moved
   `/var/run/docker.sock` aside. Restart Docker Desktop WSL integration to restore
   the default path.
3. **`--privileged` weakens the gVisor boundary.** Procedure 2 uses `--privileged`
   for the nested Docker test only.

## Procedure 3 — revert

Run each command with `sudo`.

```bash
# 1. Remove gVisor from the daemon configuration.
ls /etc/docker/daemon.json.bak.pre-runsc.*      # pick the backup
cp /etc/docker/daemon.json.bak.pre-runsc.<stamp> /etc/docker/daemon.json

# 2. Remove the packages.
apt-get remove -y runsc
rm -f /etc/apt/sources.list.d/gvisor.list
rm -f /usr/share/keyrings/gvisor-archive-keyring.gpg

# 3. Remove Docker Engine, and keep Docker Desktop.
systemctl disable --now docker.service
rm -f /etc/systemd/system/docker.service.d/10-openharness-socket.conf
systemctl daemon-reload
apt-get remove -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

# 4. Restore the Docker Desktop socket.
ls /var/run/docker.sock.desktop.*               # pick the moved socket
```

Restart Docker Desktop WSL integration after step 4. Docker Desktop recreates
`/var/run/docker.sock` on restart.

Keep Docker Engine to keep gVisor. Step 3 removes the substrate that this task
measured.
