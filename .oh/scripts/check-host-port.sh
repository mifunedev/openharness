#!/usr/bin/env bash
# check-host-port.sh — is a host TCP port free to publish?
#
# Usage:
#   check-host-port.sh <port>
#
# Exit 0 and print "free" when nothing owns the port on the host.
# Exit 1 and print "<port> in use by <owner>; next free: <m>" when it is taken.
# "Owner" is a Docker container name when the port is a published container
# port, otherwise "a host process". The suggested next-free port is the first
# free port at or above <port>+1 that this same check considers free.
#
# Detection is host-side and needs no root:
#   - Docker published ports  (docker ps --format ... — catches other
#     containers / sibling tenants, whether the bind is 127.0.0.1 or 0.0.0.0)
#   - listening sockets       (ss -ltn, falling back to /proc/net/tcp{,6})
# A loopback-only and an all-interfaces bind on the same port both count as
# taken, since Docker cannot publish a port another binding already holds.

set -eu

usage() {
  printf 'Usage: %s <port>\n' "$0" >&2
}

[ "$#" -ge 1 ] || { usage; exit 2; }
PORT="$1"
case "$PORT" in
  ''|*[!0-9]*) printf '%s: port must be numeric\n' "$0" >&2; exit 2 ;;
esac
[ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] || {
  printf '%s: port out of range (1-65535)\n' "$0" >&2; exit 2
}

# Published container ports for a given host port. Prints the owning container
# name(s) if any published host port matches. Empty output = no docker match
# (also the case when docker is unavailable).
_docker_owner() {
  local p="$1"
  command -v docker >/dev/null 2>&1 || return 0
  # Format: "<names>\t<ports>" e.g. "openharness\t127.0.0.1:2222->22/tcp, ..."
  docker ps --format '{{.Names}}\t{{.Ports}}' 2>/dev/null | awk -v port="$p" '
    {
      names = $1
      # everything after the first tab is the ports column
      idx = index($0, "\t")
      ports = (idx ? substr($0, idx + 1) : "")
      # match ":<port>->" (published host port), guarding against substring
      # matches like :22222-> when looking for :2222 by requiring the "->".
      n = split(ports, arr, ",")
      for (i = 1; i <= n; i++) {
        if (arr[i] ~ (":" port "->")) { print names; next }
      }
    }
  '
}

# Is the host port in a LISTEN state per the kernel? 0 = listening (taken).
_socket_listening() {
  local p="$1"
  if command -v ss >/dev/null 2>&1; then
    # -H omits header; match ":<port>" at end of the local-address field.
    ss -ltnH 2>/dev/null | awk -v port="$p" '
      { laddr = $4; sub(/.*:/, "", laddr); if (laddr == port) { found = 1 } }
      END { exit(found ? 0 : 1) }
    '
    return $?
  fi
  # Fallback: parse /proc/net/tcp{,6}. Local address is field 2 "HEX:PORT",
  # state 0A = LISTEN. Port is hex.
  local hexport
  hexport=$(printf '%04X' "$p")
  awk -v hp="$hexport" '
    NR > 1 {
      split($2, a, ":")
      if (a[2] == hp && $4 == "0A") { found = 1 }
    }
    END { exit(found ? 0 : 1) }
  ' /proc/net/tcp /proc/net/tcp6 2>/dev/null
}

# True (0) when a port is taken by either detector.
_port_taken() {
  local p="$1"
  [ -n "$(_docker_owner "$p")" ] && return 0
  _socket_listening "$p" && return 0
  return 1
}

OWNER="$(_docker_owner "$PORT")"
if [ -n "$OWNER" ] || _socket_listening "$PORT"; then
  [ -n "$OWNER" ] || OWNER="a host process"
  # Find next free port above PORT (bounded scan).
  next=$((PORT + 1))
  while [ "$next" -le 65535 ]; do
    if ! _port_taken "$next"; then break; fi
    next=$((next + 1))
  done
  if [ "$next" -le 65535 ]; then
    printf '%s in use by %s; next free: %s\n' "$PORT" "$OWNER" "$next"
  else
    printf '%s in use by %s; no free port found above it\n' "$PORT" "$OWNER"
  fi
  exit 1
fi

printf 'free\n'
exit 0
