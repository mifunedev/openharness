#!/usr/bin/env bash
set -uo pipefail

SOCK_DEFAULT="/var/run/docker.sock"
NOTICE="HEALTH-CHECK SCOPE-NOTICE:"
SKILL_REF=".oh/skills/health-check/SKILL.md"

probe_timeout="${HEALTH_CHECK_PROBE_TIMEOUT_S:-5}"
case "$probe_timeout" in '' | *[!0-9]*) probe_timeout=5 ;; esac
[ "$probe_timeout" -gt 0 ] 2>/dev/null || probe_timeout=5

endpoint_path() {
  case "$1" in
    unix://*) printf '%s\n' "${1#unix://}" ;;
    *://*) printf '%s\n' "" ;;
    *) printf '%s\n' "$1" ;;
  esac
}

endpoint_url() {
  case "$1" in
    *://*) printf '%s\n' "$1" ;;
    *) printf '%s\n' "unix://$1" ;;
  esac
}

scope="host"
if [ -e /.dockerenv ] || [ -e /run/.containerenv ]; then
  scope="container"
elif [ -r /proc/1/cgroup ] && grep -qE '(docker|containerd|kubepods|libpod)' /proc/1/cgroup 2>/dev/null; then
  scope="container"
fi

docker_cli="absent"
command -v docker >/dev/null 2>&1 && docker_cli="present"

explicit=""
if [ -n "${HEALTH_CHECK_DOCKER_SOCK:-}" ]; then
  explicit="$HEALTH_CHECK_DOCKER_SOCK"
elif [ -n "${DOCKER_HOST:-}" ]; then
  explicit="$DOCKER_HOST"
fi

endpoint=""
if [ -n "$explicit" ]; then
  endpoint="$explicit"
else
  ctx=""
  if [ "$docker_cli" = "present" ]; then
    ctx="$(timeout "$probe_timeout" docker context inspect \
      --format '{{.Endpoints.docker.Host}}' 2>/dev/null | head -1)"
  fi
  rootless=""
  [ -n "${XDG_RUNTIME_DIR:-}" ] && rootless="${XDG_RUNTIME_DIR}/docker.sock"

  first=""
  for cand in "$ctx" "$SOCK_DEFAULT" "$rootless"; do
    [ -n "$cand" ] || continue
    [ -n "$first" ] || first="$cand"
    cpath="$(endpoint_path "$cand")"
    if [ -n "$cpath" ] && [ -S "$cpath" ]; then
      endpoint="$cand"
      break
    fi
  done
  [ -n "$endpoint" ] || endpoint="$first"
  [ -n "$endpoint" ] || endpoint="$SOCK_DEFAULT"
fi

triage=""
reason=""
ep_path="$(endpoint_path "$endpoint")"

if [ -n "$ep_path" ] && [ ! -S "$ep_path" ]; then
  triage="host-only"
  reason="no Docker socket at $ep_path"
elif [ "$docker_cli" = "absent" ]; then
  triage="host-only"
  reason="no docker CLI on PATH to reach $endpoint"
else
  rc=0
  if [ -n "$explicit" ]; then
    timeout "$probe_timeout" docker -H "$(endpoint_url "$endpoint")" \
      version --format '{{.Server.Version}}' >/dev/null 2>&1 || rc=$?
  else
    timeout "$probe_timeout" docker version --format '{{.Server.Version}}' >/dev/null 2>&1 || rc=$?
  fi
  if [ "$rc" -eq 0 ]; then
    triage="available"
  else
    triage="unreachable"
    reason="the endpoint $endpoint exists but the daemon did not answer within ${probe_timeout}s"
  fi
fi

printf 'SCOPE=%s\n' "$scope"
printf 'DOCKER_CLI=%s\n' "$docker_cli"
printf 'DOCKER_ENDPOINT=%s\n' "$endpoint"
printf 'DOCKER_TRIAGE=%s\n' "$triage"
printf 'METRICS_SCOPE=%s\n' "$scope"

if [ "$triage" != "available" ]; then
  where="this container"
  [ "$scope" = "host" ] && where="this host"
  printf '%s Docker triage is host-only — %s (%s). ' \
    "$NOTICE" "$reason" "$where"
  printf 'The sandbox Docker socket was removed deliberately in issue #756, so steps 2 and 5 and the tier 1-4 reclaim ladder are SKIPPED here and were not attempted. '
  printf 'Run the "Host-side Docker triage" block in %s as the orchestrator at the host project root, then paste its output back into this session. ' "$SKILL_REF"
  printf 'Until that output arrives, Docker headroom is UNKNOWN: the memory, swap, disk and CPU figures in this report measure %s, not the Docker host.\n' "$where"
fi

exit 0
