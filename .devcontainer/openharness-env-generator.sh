#!/usr/bin/env bash
set -u

RESERVED='^(HOME|PWD|OLDPWD|SHLVL|_|INVOCATION_ID|JOURNAL_STREAM|NOTIFY_SOCKET|MAINPID|MANAGERPID|LISTEN_PID|LISTEN_FDS|LISTEN_FDNAMES|SYSTEMD_EXEC_PID|container|container_uuid)$'

while IFS= read -r -d '' record; do
  case "$record" in
    *=*) ;;
    *) continue ;;
  esac
  name="${record%%=*}"
  value="${record#*=}"
  [[ "$name" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
  [[ "$name" =~ $RESERVED ]] && continue
  [[ "$value" == *$'\n'* ]] && continue
  printf '%s=%s\n' "$name" "$value"
done < /proc/1/environ
