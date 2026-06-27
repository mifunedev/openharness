#!/usr/bin/env bash
# restart-openharness-tmux.sh — clear the stale `system-cron` argv on the tmux server (issue #273).
#
# WHY THIS EXISTS
#   The tmux *server* process permanently advertises the argv of the FIRST session that
#   spawned it (historically `tmux new-session -d -s system-cron …`). tmux cannot rewrite a
#   running server's argv, so the only way to clear the misleading string is a full
#   `tmux kill-server` + relaunch of the durable session stack. The first new-session after
#   the kill becomes the new server and defines its (clean) argv.
#
# WHY DETACHED
#   `tmux kill-server` kills every session — INCLUDING the one the launcher runs in. This
#   script is therefore meant to be launched DETACHED so it outlives the server it kills:
#       setsid bash .oh/scripts/maintenance/restart-openharness-tmux.sh </dev/null >/tmp/oh-restart-273.boot.log 2>&1 &
#   It is the spec-execute artifact for tasks/restart-openharness-tmux/ (see that PRD).
#
# SAFETY
#   - flock single-instance + a done-sentinel make it a no-op on re-run.
#   - It captures the LIVE session→(cwd,command) map BEFORE the kill and replays it, so it
#     adapts to whatever is actually running; pinned fallbacks cover the two cron sessions.
#   - Relaunch order puts the website origin before its tunnel and cron-system before its
#     watchdog, so nothing races. The cron singleton lock (crons/.pid) self-heals on a dead
#     pid (cron-runtime.ts acquireLock); we also clear it defensively.
#   - It NEVER recreates the legacy `system-cron` session name (the watchdog self-exits on it).
set -uo pipefail
trap '' HUP   # survive the SIGHUP that the dying server sends to our (now-detached) group

HARNESS="${HARNESS:-${OH_PROJECT_ROOT:-/home/sandbox/harness}}"
REPO="${OH_REPO:-ryaneggz/openharness}"
ISSUE=273
LOCK=/tmp/oh-restart-273.lock
LOGF=/tmp/oh-restart-273.log
MAP=/tmp/oh-restart-273.sessions.txt
# Sentinel lives in /tmp, NOT under tasks/ — an untracked file in the tracked tasks/ tree
# would make the weekly cleanup pre-flight (`git status --porcelain -- tasks/`) emit
# BLOCKED-TASKS-WIP. /tmp survives `tmux kill-server` (only a container restart clears it,
# which is not expected in the one-shot window). The heartbeat gate checks the same path.
SENTINEL="/tmp/oh-restart-273.done"

# Durable sessions to preserve across the restart. Transients (cron-autopilot-*, agent-*,
# the heartbeat's own session) are intentionally NOT relaunched.
DURABLE_RE='^(cron-system|cron-watchdog|app-.*|expose-public-.*)$'
# Fixed relaunch order: website origin before tunnel; cron-system before its watchdog.
ORDER=(app-website app-website-preview app-orchestra expose-public-mifune cron-system cron-watchdog)

# Canonical fallbacks (.devcontainer/entrypoint.sh) for the two cron sessions if live
# capture misses them.
fallback_cmd() {
  case "$1" in
    cron-system)   echo "cd $HARNESS && node --experimental-strip-types .oh/scripts/cron-runtime.ts 2>&1 | tee /tmp/cron-system.log" ;;
    cron-watchdog) echo "HARNESS=$HARNESS CRON_WATCHDOG_INTERVAL=${CRON_WATCHDOG_INTERVAL:-60} bash /tmp/cron-watchdog.sh 2>&1 | tee /tmp/cron-watchdog.log" ;;
    *) echo "" ;;
  esac
}

log() { printf '[%s] %s\n' "$(date -Iseconds)" "$*" | tee -a "$LOGF" >&2; }

# --- single-instance + idempotency guards ------------------------------------------------
exec 9>"$LOCK" || { echo "cannot open lock $LOCK" >&2; exit 1; }
if ! flock -n 9; then log "another restart holds the lock; exiting"; exit 0; fi
if [[ -f "$SENTINEL" ]]; then log "sentinel present ($SENTINEL); already done — exiting"; exit 0; fi

log "=== restart #273 begin (clears stale system-cron server argv) ==="
# Grace window so the launching heartbeat agent can finish this pulse's memory/liveness
# logging before we tear the server (and the agent's own session) down.
sleep 8

# --- capture the live durable session map BEFORE the kill --------------------------------
: > "$MAP"
tmux list-panes -a -F '#{session_name}|#{pane_current_path}|#{pane_start_command}' 2>/dev/null \
  | awk -F'|' -v re="$DURABLE_RE" '$1 ~ re { print }' > "$MAP" || true
log "captured $(wc -l < "$MAP" | tr -d ' ') durable pane(s):"
while IFS= read -r line; do log "  $line"; done < "$MAP"
# The stale server argv uniquely uses the new-session `-s system-cron` form; the watchdog's
# `tmux has-session -t system-cron` uses `-t`, so `-s system-cron` won't false-match it.
if pgrep -af 'tmux' 2>/dev/null | grep -q -- '-s system-cron'; then
  log "pre-kill: tmux server still advertises stale '-s system-cron' argv (expected — about to clear it)"
fi

# --- kill the server (drops mifune.dev briefly) -----------------------------------------
log "killing tmux server now"
tmux kill-server 2>/dev/null || true
sleep 2

# Defensive: clear a singleton lock that names a now-dead runtime (cron-runtime also self-heals).
if [[ -f "$HARNESS/crons/.pid" ]]; then
  oldpid="$(cat "$HARNESS/crons/.pid" 2>/dev/null || true)"
  if [[ -n "${oldpid:-}" ]] && ! kill -0 "$oldpid" 2>/dev/null; then
    rm -f "$HARNESS/crons/.pid"; log "cleared stale crons/.pid (dead pid $oldpid)"
  fi
fi

# --- relaunch durable sessions in dependency order --------------------------------------
relaunch_one() {
  local s="$1" first=1 found=0 cwd cmd name
  while IFS='|' read -r name cwd cmd; do
    [[ "$name" == "$s" ]] || continue
    found=1
    [[ -z "${cwd:-}" ]] && cwd="$HARNESS"
    # tmux reports `pane_start_command` WRAPPED in literal double-quotes when it contains shell
    # metacharacters (verified against the live sessions). Strip one leading + one trailing
    # quote so the replayed command is the bare `sh -c` string, not a quoted blob that sh would
    # try to exec as a single filename.
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
    # Wait for the cron RUNTIME (not just the session) to be alive and lock-holding before the
    # watchdog, so the watchdog never double-launches it and we don't proceed past a crashed
    # pane. `has-session` alone can't tell a live runtime from a pane holding a crash.
    for _ in $(seq 1 20); do
      if [[ -f "$HARNESS/crons/.pid" ]]; then
        rp="$(cat "$HARNESS/crons/.pid" 2>/dev/null || true)"
        [[ -n "${rp:-}" ]] && kill -0 "$rp" 2>/dev/null && break
      fi
      sleep 1
    done
  fi
  relaunch_one "$s"
done

# Any durable session present in the capture but not in ORDER (unexpected) — relaunch last.
while IFS='|' read -r name _ _; do
  printf '%s\n' "${ORDER[@]}" | grep -qx "$name" && continue
  tmux has-session -t "$name" 2>/dev/null && continue
  relaunch_one "$name"
done < "$MAP"

# --- verify ------------------------------------------------------------------------------
sleep 3
# Expected = the sessions that were actually LIVE at capture (plus the always-on cron core),
# NOT a fixed list — so a session that legitimately wasn't running (e.g. a transient
# app-website-preview) is neither relaunched nor falsely flagged missing/degraded.
mapfile -t expected < <(cut -d'|' -f1 "$MAP" | sort -u)
for core in cron-system cron-watchdog; do
  printf '%s\n' "${expected[@]}" | grep -qx "$core" || expected+=("$core")
done
missing=()
for s in "${expected[@]}"; do tmux has-session -t "$s" 2>/dev/null || missing+=("$s"); done

argv_clean="no"
if ! pgrep -af 'tmux' 2>/dev/null | grep -q -- '-s system-cron'; then argv_clean="yes"; fi

# Cron runtime must be ALIVE (a session existing is not enough — the pane could hold a crash).
cron_alive="no"
for _ in $(seq 1 15); do
  if [[ -f "$HARNESS/crons/.pid" ]]; then
    rp="$(cat "$HARNESS/crons/.pid" 2>/dev/null || true)"
    if [[ -n "${rp:-}" ]] && kill -0 "$rp" 2>/dev/null; then cron_alive="yes"; break; fi
  fi
  sleep 1
done

# mifune.dev is INFORMATIONAL only. `npm run build` in the relaunched app-website can take
# minutes and the named tunnel reconnects on its own, so a slow build must NOT mark the
# restart degraded (that would falsely leave #273 open while the site is healthily building).
# Poll ~2m and report whatever code we see.
site="unchecked"
if command -v curl >/dev/null 2>&1; then
  site="building"
  for _ in $(seq 1 24); do
    code="$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 5 https://mifune.dev/ 2>/dev/null || true)"
    if [[ "$code" == "200" ]]; then site="200"; break; fi
    [[ -n "$code" ]] && site="$code"; sleep 5
  done
fi

# Success = the #273 goal (argv cleared) + the durable stack back + a LIVE cron runtime.
# The public site returning is verified but does NOT gate success (it self-heals post-build).
status="ok"
[[ "${#missing[@]}" -gt 0 || "$argv_clean" != "yes" || "$cron_alive" != "yes" ]] && status="degraded"

log "verify: status=$status missing=[${missing[*]:-none}] argv-cleared=$argv_clean cron-runtime-alive=$cron_alive mifune.dev=$site"

# --- liveness + audit trail --------------------------------------------------------------
if [[ -x "$HARNESS/.oh/scripts/locked-append.sh" ]]; then
  printf '[%s] restart-273: status=%s argv-cleared=%s cron-alive=%s missing=%s mifune=%s\n' \
    "$(date -Iseconds)" "$status" "$argv_clean" "$cron_alive" "${missing[*]:-none}" "$site" \
    | "$HARNESS/.oh/scripts/locked-append.sh" "$HARNESS/crons/.cron.log" || true
fi

body="$(printf 'Automated tmux-server restart (#273) ran via the heartbeat date-gated spec-execute step.\n\n- system-cron argv cleared: %s\n- cron runtime alive (crons/.pid): %s\n- sessions missing after relaunch: %s\n- https://mifune.dev/ : %s (informational; rebuilds on its own)\n\nLog: %s on the sandbox host.' \
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

# Mark done only on a clean restart so a degraded run can be retried.
if [[ "$status" == "ok" ]]; then
  mkdir -p "$(dirname "$SENTINEL")"
  printf 'restart #273 completed %s\n' "$(date -Iseconds)" > "$SENTINEL"
  log "wrote sentinel $SENTINEL"
fi

log "=== restart #273 end (status=$status) ==="
exit 0
