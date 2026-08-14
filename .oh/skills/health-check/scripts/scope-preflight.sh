#!/usr/bin/env bash
# /health-check step 0 — classify the execution scope and the Docker endpoint ONCE,
# so the skill branches instead of discovering the same failure nine times.
#
# Why this exists (issue #762, refs #756): the sandbox no longer has a host Docker
# socket. It was removed deliberately as a host-root escape path. The `docker` CLI
# is still installed, so every Docker step in the skill used to fail on its own with
# the same 200-character connection error — nine times per invocation — while the
# memory/disk/CPU steps kept reporting the CONTAINER's numbers under host framing.
#
# Contract:
#   - stdout carries KEY=VALUE lines for the skill to branch on, plus AT MOST ONE
#     human-readable SCOPE-NOTICE line. The KEY=VALUE lines select the branch; they
#     are not the report.
#   - Exit status is ALWAYS 0. A classification step that exits non-zero is itself
#     the misleading-failure signal this script exists to remove.
#   - DOCKER_TRIAGE=available requires a COMPLETED round-trip, never `[ -S path ]`
#     alone: a socket file outlives an OOM-killed daemon, and a chmod-000 socket is
#     unopenable while still passing every file test. Calling either "available"
#     would reproduce the nine-failure wall in a shape no test covered.
#   - The host-only branch makes ZERO daemon contact. `docker context inspect` may
#     run during endpoint resolution because it reads local config and needs no
#     daemon (verified: returns the endpoint with rc=0 while no daemon is running).
#
# Environment:
#   HEALTH_CHECK_DOCKER_SOCK    Authoritative endpoint override. Bare path or URL.
#                               The test knob, and the reason every branch here is
#                               reachable under test rather than asserted in prose.
#   HEALTH_CHECK_PROBE_TIMEOUT_S  Round-trip budget in seconds (default 5).
#   DOCKER_HOST                 Honoured, and authoritative when set.
#
# NOTE: no `set -e`. Every failure below is a classification input, not an abort.
set -uo pipefail

SOCK_DEFAULT="/var/run/docker.sock"
NOTICE="HEALTH-CHECK SCOPE-NOTICE:"
SKILL_REF=".oh/skills/health-check/SKILL.md"

probe_timeout="${HEALTH_CHECK_PROBE_TIMEOUT_S:-5}"
case "$probe_timeout" in '' | *[!0-9]*) probe_timeout=5 ;; esac
[ "$probe_timeout" -gt 0 ] 2>/dev/null || probe_timeout=5

# --- endpoint helpers --------------------------------------------------------
# The filesystem path a unix endpoint refers to, or empty for any other scheme.
# A bare value with no scheme is a path (that is how DOCKER_HOST-less setups and
# this script's own override are written).
endpoint_path() {
  case "$1" in
    unix://*) printf '%s\n' "${1#unix://}" ;;
    *://*) printf '%s\n' "" ;;
    *) printf '%s\n' "$1" ;;
  esac
}

# The `-H` form of an endpoint: schemes pass through, a bare path becomes unix://.
endpoint_url() {
  case "$1" in
    *://*) printf '%s\n' "$1" ;;
    *) printf '%s\n' "unix://$1" ;;
  esac
}

# --- 1. execution scope ------------------------------------------------------
# /.dockerenv is the convention already used in this repo's runner fingerprint
# (.oh/scripts/lib/session-runner.sh). /run/.containerenv covers podman, and the
# cgroup read catches containers that ship neither marker file.
scope="host"
if [ -e /.dockerenv ] || [ -e /run/.containerenv ]; then
  scope="container"
elif [ -r /proc/1/cgroup ] && grep -qE '(docker|containerd|kubepods|libpod)' /proc/1/cgroup 2>/dev/null; then
  scope="container"
fi

# --- 2. docker CLI -----------------------------------------------------------
# Deliberately reported separately from the endpoint. Testing for the binary is
# what made the old behaviour wrong: /usr/bin/docker is present in this sandbox
# and proves nothing about reachability.
docker_cli="absent"
command -v docker >/dev/null 2>&1 && docker_cli="present"

# --- 3. endpoint resolution --------------------------------------------------
# An explicit override is AUTHORITATIVE and never falls through. If the operator
# (or a test) names an endpoint, silently triaging a different one would answer a
# question nobody asked. Only the implicit chain walks candidates.
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
  # `docker context` is how the real CLI resolves its endpoint when DOCKER_HOST is
  # unset — Colima, OrbStack and rootless setups set a context, not always the env
  # var. Narrow Go template, per this repo's deny-env-dump.sh inspect guard.
  ctx=""
  if [ "$docker_cli" = "present" ]; then
    ctx="$(timeout "$probe_timeout" docker context inspect \
      --format '{{.Endpoints.docker.Host}}' 2>/dev/null | head -1)"
  fi
  rootless=""
  [ -n "${XDG_RUNTIME_DIR:-}" ] && rootless="${XDG_RUNTIME_DIR}/docker.sock"

  # First candidate that is actually a socket wins; otherwise keep the first
  # candidate offered, so the notice can name a concrete endpoint.
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

# --- 4. triage ---------------------------------------------------------------
triage=""
reason=""
ep_path="$(endpoint_path "$endpoint")"

# Fast path: a unix endpoint with no socket present. Decided from the filesystem
# alone, so the host-only branch contacts no daemon at all.
if [ -n "$ep_path" ] && [ ! -S "$ep_path" ]; then
  triage="host-only"
  reason="no Docker socket at $ep_path"
elif [ "$docker_cli" = "absent" ]; then
  triage="host-only"
  reason="no docker CLI on PATH to reach $endpoint"
else
  # An endpoint exists (unix socket present, or a non-filesystem scheme such as
  # tcp:// that no file test can settle). Spend exactly ONE round-trip on it.
  # With an explicit override, target it directly. Without one, let the CLI resolve
  # as it normally would, so context-supplied TLS settings are not dropped.
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

# --- 5. report ---------------------------------------------------------------
printf 'SCOPE=%s\n' "$scope"
printf 'DOCKER_CLI=%s\n' "$docker_cli"
printf 'DOCKER_ENDPOINT=%s\n' "$endpoint"
printf 'DOCKER_TRIAGE=%s\n' "$triage"
printf 'METRICS_SCOPE=%s\n' "$scope"

# Exactly one notice on both degraded branches, none when triage is available.
# It carries the why, what was skipped, who runs the relocated procedure and where
# it lives — a bare "docker unavailable" would leave the reader at a dead end.
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
