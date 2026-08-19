# Raw capture — gVisor and MicroSandbox substrate spike, WSL2 host

**Captured:** 2026-08-19 (UTC)
**Source:** direct measurement on the operator's WSL2 host. No external page.
**Immutable.** Do not edit. Synthesis lives in `../gvisor-wsl2-substrate.md`.

## Host state

```
uname -r          6.18.33.2-microsoft-standard-WSL2
/etc/os-release   Ubuntu 22.04.5 LTS
ldd --version     2.35
ps -p 1 -o comm=  systemd
/dev/kvm          crw-rw---- 1 root kvm 10, 232
vmx in cpuinfo    64 occurrences
```

Docker before the spike: Docker Desktop WSL integration. `/usr/bin/docker` was a
symlink into `/mnt/wsl/docker-desktop/cli-tools/`. No `dockerd` ran in the
distribution.

Docker after the spike: Docker Engine 29.7.2 in the Ubuntu distribution, on
`/run/docker-engine.sock`, through a systemd drop-in. `docker.socket` disabled.

## gVisor

Version: `runsc version release-20260810.0`, spec 1.2.1.

### Boot

```
$ docker run --runtime=runsc --rm hello-world
Hello from Docker!
This message shows that your installation appears to be working correctly.
```

### Kernel identity

```
$ docker run --rm debian:bookworm-slim uname -r
6.18.33.2-microsoft-standard-WSL2
$ docker run --runtime=runsc --rm debian:bookworm-slim uname -r
4.19.0-gvisor
```

### Detached tmux session

```
--- tmux ls ---
t: 1 windows (created Wed Aug 19 01:17:17 2026)
--- attach-capable check ---
HAS-SESSION OK
```

### Cost, npm ci over 1055 dependencies

```
runc     real 0m35.093s   user 0m30.903s   sys 0m13.213s
runsc    real 0m40.500s   user 1m3.410s    sys 0m11.560s
```

Wall ratio 1.15x. CPU ratio 2.05x.

### Nested dockerd

```
nested Server=29.7.2 | Driver=overlayfs
Hello from Docker!
```

Nested `dockerd` needed `--iptables=false`. The nested container needed
`--network=host`. The nested registry pull failed on an absent IPv6 route.

### Network

```
inside runsc   IPv4 HTTPS 401   IPv6 HTTPS 000   global IPv6 addrs 0
inside runc    IPv4 HTTPS 401                    global IPv6 addrs 0
```

A 401 proves the request reached the registry. Both runtimes report zero global
IPv6 addresses, so the IPv6 gap is host network configuration.

## MicroSandbox

```
$ sh get-msb.sh
  Microsandbox Installer
info Detected platform: linux-x86_64
error Microsandbox Linux releases require glibc 2.39 or newer, but this system
      has glibc 2.35. Please use a newer glibc-based Linux environment.
```

No binary installed. No round trip possible.

The devcontainer reports glibc 2.36. Both harness machines fall below the 2.39
floor.
