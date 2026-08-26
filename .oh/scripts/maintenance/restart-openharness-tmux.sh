#!/usr/bin/env bash
set -uo pipefail
trap '' HUP

HARNESS="${HARNESS:-${OH_PROJECT_ROOT:-/home/sandbox/harness}}"
REPO="${OH_REPO:-mifunedev/openharness}"
ISSUE=273
LOCK=/tmp/oh-restart-273.lock
LOGF=/tmp/oh-restart-273.log
MAP=/tmp/oh-restart-273.sessions.txt
SENTINEL="/tmp/oh-restart-273.done"

DURABLE_RE='^(cron-system|cron-watchdog|app-.*|expose-public-.*)$'
ORDER=(app-website app-website-preview app-orchestra expose-public-mifune cron-system cron-watchdog)

fallback_cmd() {
  case "$1" in
    cron-system)   echo "cd $HARNESS && node --experimental-strip-types .oh/scripts/cron-runtime.ts 2>&1 | tee /tmp/cron-system.log" ;;
    cron-watchdog) echo "HARNESS=$HARNESS CRON_WATCHDOG_INTERVAL=${CRON_WATCHDOG_INTERVAL:-60} bash /tmp/cron-watchdog.sh 2>&1 | tee /tmp/cron-watchdog.log" ;;
    *) echo "" ;;
  esac
}

log() { printf '[%s] %s\n' "$(date -Iseconds)" "$*" | tee -a "$LOGF" >&2; }

exec 9>"$LOCK" || { echo "cannot open lock $LOCK" >&2; exit 1; }
if ! flock -n 9; then log "another restart holds the lock; exiting"; exit 0; fi
if [[ -f "$SENTINEL" ]]; then log "sentinel present ($SENTINEL); already done — exiting"; exit 0; fi

log "=== restart #273 begin (clears stale system-cron server argv) ==="
sleep 8

: > "$MAP"
tmux list-panes -a -F '#{session_name}|#{pane_current_path}|#{pane_start_command}' 2>/dev/null \
  | awk -F'|' -v re="$DURABLE_RE" '$1 ~ re { print }' > "$MAP" || true
log "captured $(wc -l < "$MAP" | tr -d ' ') durable pane(s):"
while IFS= read -r line; do log "  $line"; done < "$MAP"
if pgrep -af 'tmux' 2>/dev/null | grep -q -- '-s system-cron'; then
  log "pre-kill: tmux server still advertises stale '-s system-cron' argv (expected — about to clear it)"
fi

log "killing tmux server now"
tmux kill-server 2>/dev/null || true
sleep 2

if [[ -f "$HARNESS/.oh/crons/.pid" ]]; then
  oldpid="$(cat "$HARNESS/.oh/crons/.pid" 2>/dev/null || true)"
  if [[ -n "${oldpid:-}" ]] && ! kill -0 "$oldpid" 2>/dev/null; then
    rm -f "$HARNESS/.oh/crons/.pid"; log "cleared stale .oh/crons/.pid (dead pid $oldpid)"
  fi
fi

relaunch_one() {
  local s="$1" first=1 found=0 cwd cmd name
  while IFS='|' read -r name cwd cmd; do
    [[ "$name" == "$s" ]] || continue
    found=1
    [[ -z "${cwd:-}" ]] && cwd="$HARNESS"
    if [[ -n "${cmd:-}" ]]; then cmd="${cmd#\"}"; cmd="${cmd%\"}"; fi
    if [[ "$first" == 1 ]]; then
      if [[ -n "${cmd:-}" ]]; then tmux new-session -d -s "$s" -c "$cwd" "$cmd" || log "ERROR: new-session $s failed (rc=$?)"
      else tmux new-session -d -s "$s" -c "$cwd" || log "ERROR: new-session $s failed (rc=$?)"; fi
      first=0
    else
      if [[ -n "${cmd:-}" ]]; then tmux split-window -t "$s" -c "$cwd" "$cmd" || log "ERROR: split-window $s failed (rc=$?)"
      else tmux split-window -t "$s" -c "$cwd" || log "ERROR: split-window $s failed (rc=$?)"; fi
    fi
  done < "$MAP"
  if [[ "$found" == 0 ]]; then
    local fb; fb="$(fallback_cmd "$s")"
    if [[ -n "$fb" ]]; then tmux new-session -d -s "$s" -c "$HARNESS" "$fb"; log "relaunched $s (pinned fallback)"; return 0; fi
    log "WARN: no capture and no fallback for $s — skipped"; return 1
  fi
  log "relaunched $s ($(grep -c "^$s|" "$MAP") pane(s))"
}

for s in "${ORDER[@]}"; do
  if [[ "$s" == cron-watchdog ]]; then
    for _ in $(seq 1 20); do
      if [[ -f "$HARNESS/.oh/crons/.pid" ]]; then
        rp="$(cat "$HARNESS/.oh/crons/.pid" 2>/dev/null || true)"
        [[ -n "${rp:-}" ]] && kill -0 "$rp" 2>/dev/null && break
      fi
      sleep 1
    done
  fi
  relaunch_one "$s"
done

while IFS='|' read -r name _ _; do
  printf '%s\n' "${ORDER[@]}" | grep -qx "$name" && continue
  tmux has-session -t "$name" 2>/dev/null && continue
  relaunch_one "$name"
done < "$MAP"

sleep 3
mapfile -t expected < <(cut -d'|' -f1 "$MAP" | sort -u)
for core in cron-system cron-watchdog; do
  printf '%s\n' "${expected[@]}" | grep -qx "$core" || expected+=("$core")
done
missing=()
for s in "${expected[@]}"; do tmux has-session -t "$s" 2>/dev/null || missing+=("$s"); done

argv_clean="no"
if ! pgrep -af 'tmux' 2>/dev/null | grep -q -- '-s system-cron'; then argv_clean="yes"; fi

cron_alive="no"
for _ in $(seq 1 15); do
  if [[ -f "$HARNESS/.oh/crons/.pid" ]]; then
    rp="$(cat "$HARNESS/.oh/crons/.pid" 2>/dev/null || true)"
    if [[ -n "${rp:-}" ]] && kill -0 "$rp" 2>/dev/null; then cron_alive="yes"; break; fi
  fi
  sleep 1
done

site="unchecked"
if command -v curl >/dev/null 2>&1; then
  site="building"
  for _ in $(seq 1 24); do
    code="$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 5 https://mifune.dev/ 2>/dev/null || true)"
    if [[ "$code" == "200" ]]; then site="200"; break; fi
    [[ -n "$code" ]] && site="$code"; sleep 5
  done
fi

status="ok"
[[ "${#missing[@]}" -gt 0 || "$argv_clean" != "yes" || "$cron_alive" != "yes" ]] && status="degraded"

log "verify: status=$status missing=[${missing[*]:-none}] argv-cleared=$argv_clean cron-runtime-alive=$cron_alive mifune.dev=$site"

if [[ -x "$HARNESS/.oh/scripts/locked-append.sh" ]]; then
  printf '[%s] restart-273: status=%s argv-cleared=%s cron-alive=%s missing=%s mifune=%s\n' \
    "$(date -Iseconds)" "$status" "$argv_clean" "$cron_alive" "${missing[*]:-none}" "$site" \
    | "$HARNESS/.oh/scripts/locked-append.sh" "$HARNESS/.oh/crons/.cron.log" || true
fi

body="$(printf 'Automated tmux-server restart (#273) ran via the heartbeat date-gated spec-execute step.\n\n- system-cron argv cleared: %s\n- cron runtime alive (.oh/crons/.pid): %s\n- sessions missing after relaunch: %s\n- https://mifune.dev/ : %s (informational; rebuilds on its own)\n\nLog: %s on the sandbox host.' \
  "$argv_clean" "$cron_alive" "${missing[*]:-none}" "$site" "$LOGF")"

if command -v gh >/dev/null 2>&1; then
  if [[ "$status" == "ok" ]]; then
    gh issue close "$ISSUE" --repo "$REPO" --comment "$body"$'\n\nClosing: restart succeeded.' >/dev/null 2>&1 \
      && log "closed #$ISSUE (success)" || log "gh issue close failed (non-fatal)"
  else
    gh issue comment "$ISSUE" --repo "$REPO" --body "$body"$'\n\n⚠️ Degraded — left open for review.' >/dev/null 2>&1 \
      && log "commented #$ISSUE (degraded)" || log "gh issue comment failed (non-fatal)"
  fi
fi

if [[ "$status" == "ok" ]]; then
  mkdir -p "$(dirname "$SENTINEL")"
  printf 'restart #273 completed %s\n' "$(date -Iseconds)" > "$SENTINEL"
  log "wrote sentinel $SENTINEL"
fi

log "=== restart #273 end (status=$status) ==="
exit 0
