#!/usr/bin/env bash

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

_docker_owner() {
  local p="$1"
  command -v docker >/dev/null 2>&1 || return 0
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

_socket_listening() {
  local p="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltnH 2>/dev/null | awk -v port="$p" '
      { laddr = $4; sub(/.*:/, "", laddr); if (laddr == port) { found = 1 } }
      END { exit(found ? 0 : 1) }
    '
    return $?
  fi
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

_port_taken() {
  local p="$1"
  [ -n "$(_docker_owner "$p")" ] && return 0
  _socket_listening "$p" && return 0
  return 1
}

OWNER="$(_docker_owner "$PORT")"
if [ -n "$OWNER" ] || _socket_listening "$PORT"; then
  [ -n "$OWNER" ] || OWNER="a host process"
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
