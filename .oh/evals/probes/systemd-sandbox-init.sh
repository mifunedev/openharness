#!/usr/bin/env bash
# tier: A
# source: issue #956 (systemd PID 1; cron supervision leaves tmux) 2026-09-04
# desc: the sandbox image boots systemd as PID 1 — systemd packages installed, container marker and SIGRTMIN+3 stop signal set, /sbin/init is the CMD, no Tini init/entrypoint/sleep-infinity override in either Docker flavor, bootstrap unit enabled, and the cgroup grant is the minimum proven necessary rather than privileged or a host cgroup bind.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DOCKERFILE="$ROOT/.devcontainer/Dockerfile"
COMPOSE="$ROOT/.devcontainer/docker-compose.yml"
COMPOSE_IO="$ROOT/.devcontainer/docker-compose.image-only.yml"
BOOTSTRAP="$ROOT/.devcontainer/openharness-bootstrap.service"
GENERATOR="$ROOT/.devcontainer/openharness-env-generator.sh"

for file in "$DOCKERFILE" "$COMPOSE" "$COMPOSE_IO" "$BOOTSTRAP" "$GENERATOR"; do
  [[ -f "$file" ]] || { echo "SKIPPED: required file absent: $file" >&2; exit 2; }
done

missing=()

grep -qE '^ +systemd systemd-sysv dbus \\$' "$DOCKERFILE" \
  || missing+=("Dockerfile must install systemd, systemd-sysv (for /sbin/init), and dbus")
grep -qE '^ENV container=docker$' "$DOCKERFILE" || missing+=("Dockerfile must set ENV container=docker")
grep -qE '^STOPSIGNAL SIGRTMIN\+3$' "$DOCKERFILE" \
  || missing+=("Dockerfile must set STOPSIGNAL SIGRTMIN+3 so docker stop shuts systemd down cleanly")
grep -qF 'CMD ["/sbin/init"]' "$DOCKERFILE" || missing+=("Dockerfile CMD must be /sbin/init")
grep -qF 'ENTRYPOINT []' "$DOCKERFILE" \
  || missing+=("Dockerfile must reset the inherited ENTRYPOINT with 'ENTRYPOINT []' — node:22-trixie-slim ships docker-entrypoint.sh, which would wrap systemd")
if grep -qE '^ENTRYPOINT[[:space:]]+[^[]' "$DOCKERFILE" || grep -qE '^ENTRYPOINT[[:space:]]+\[[[:space:]]*"' "$DOCKERFILE"; then
  missing+=("Dockerfile declares a non-empty ENTRYPOINT — nothing may wrap systemd as PID 1")
fi
if grep -qF 'CMD ["sleep", "infinity"]' "$DOCKERFILE"; then
  missing+=("Dockerfile still uses sleep infinity as the container lifecycle owner")
fi
grep -qF 'system-environment-generators/10-openharness' "$DOCKERFILE" \
  || missing+=("Dockerfile must install the environment generator — systemd units do not inherit the container environment")
grep -qF '/proc/1/environ' "$GENERATOR" \
  || missing+=("the environment generator must derive the unit environment from PID 1 rather than guessing a variable list")

grep -qE '^WantedBy=multi-user.target$' "$BOOTSTRAP" || missing+=("openharness-bootstrap.service must be WantedBy=multi-user.target")
grep -qE '^Type=oneshot$' "$BOOTSTRAP" || missing+=("openharness-bootstrap.service must be Type=oneshot")
grep -qE '^RemainAfterExit=yes$' "$BOOTSTRAP" || missing+=("openharness-bootstrap.service must set RemainAfterExit=yes")
grep -qE '^ExecStart=/usr/local/bin/entrypoint.sh$' "$BOOTSTRAP" \
  || missing+=("openharness-bootstrap.service must run the existing entrypoint as its ExecStart")
grep -qE '^KillMode=process$' "$BOOTSTRAP" \
  || missing+=("openharness-bootstrap.service must use KillMode=process so the daemons it starts survive the oneshot exiting")

for compose in "$COMPOSE" "$COMPOSE_IO"; do
  rel="${compose#"$ROOT"/}"
  if grep -qE '^[[:space:]]*init:[[:space:]]*true[[:space:]]*$' "$compose"; then
    missing+=("$rel still sets init: true — Tini would take PID 1 ahead of systemd")
  fi
  if grep -qE '^[[:space:]]*entrypoint:' "$compose"; then
    missing+=("$rel still overrides entrypoint: — nothing may wrap systemd")
  fi
  if grep -qE '^[[:space:]]*command:[[:space:]]*sleep infinity' "$compose"; then
    missing+=("$rel still overrides command: sleep infinity")
  fi
  if grep -qE '^[[:space:]]*privileged:[[:space:]]*true' "$compose"; then
    missing+=("$rel introduces privileged: true — prohibited as a systemd shortcut")
  fi
  if grep -qE '^[[:space:]]*-[[:space:]]*/sys/fs/cgroup:' "$compose"; then
    missing+=("$rel binds the host cgroup tree — proven to expose the host cgroup root and other containers read-write")
  fi
  grep -qE '^[[:space:]]*cgroup:[[:space:]]*private[[:space:]]*$' "$compose" \
    || missing+=("$rel must pin cgroup: private — the container-private cgroup subtree depends on it")
  grep -qE '^[[:space:]]*-[[:space:]]*SYS_ADMIN[[:space:]]*$' "$compose" \
    || missing+=("$rel must grant cap_add SYS_ADMIN — systemd cannot mount its own cgroup2 hierarchy without it")
  grep -qE '^[[:space:]]*-[[:space:]]*/sys/fs[[:space:]]*$' "$compose" \
    || missing+=("$rel must tmpfs /sys/fs so /sys/fs/cgroup is unmounted and systemd mounts it writable")
  grep -qE '^[[:space:]]*-[[:space:]]*/run[[:space:]]*$' "$compose" \
    || missing+=("$rel must tmpfs /run — Docker's AppArmor profile denies systemd mounting it itself")
  grep -qE '^[[:space:]]*-[[:space:]]*/run/lock[[:space:]]*$' "$compose" \
    || missing+=("$rel must tmpfs /run/lock, or run-lock.mount fails")
  grep -qE '^[[:space:]]*-[[:space:]]*apparmor=unconfined[[:space:]]*$' "$compose" \
    || missing+=("$rel must set security_opt apparmor=unconfined — the docker-default profile denies systemd's cgroup2 mount even with CAP_SYS_ADMIN")
done

if (( ${#missing[@]} )); then
  printf 'REGRESSION: systemd sandbox init contract broken:\n' >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "PASS: the sandbox image boots /sbin/init as PID 1 with the container marker and SIGRTMIN+3 stop signal, neither Docker flavor keeps init: true / entrypoint / sleep infinity, the bootstrap oneshot is enabled with a PID-1-derived environment, and the cgroup grant is cap SYS_ADMIN + tmpfs /sys/fs rather than privileged or a host cgroup bind" >&2
exit 0
