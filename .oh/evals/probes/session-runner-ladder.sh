#!/usr/bin/env bash
# tier: A
# source: .oh/tasks/firstmate-executor/ (issue #746) — the shared herdr -> tmux -> foreground runner ladder and its safety gates
# desc: .oh/scripts/lib/session-runner.sh resolves the ladder herdr -> tmux -> foreground; herdr
#       health is pinned to the two literal fields `status: running` and `compatible: yes`;
#       runner_detect carries the nesting guard BEFORE any probe pane and the execution-context
#       fingerprint gate whose mismatch degrades to tmux with the reason logged; resolve_timeout_ms
#       is the single session-budget source with the 14400000 default and bounds the tmux/foreground
#       poll loop; every exit path runs runner_teardown, removes the per-slug lock and appends
#       FIRSTMATE-INCOMPLETE; every herdr launch passes --no-focus; teardown is `pane close` (0.7.4
#       has no agent stop/kill verb); the sourceable library sets no file-scope shell options; and
#       the herdr commands that would disturb a shared server stay absent while `herdr agent get`
#       (the liveness oracle) stays present.
# shellcheck disable=SC2016
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RUNNER="$ROOT/.oh/scripts/lib/session-runner.sh"

missing=()

if [ ! -f "$RUNNER" ]; then
  printf 'REGRESSION: .oh/scripts/lib/session-runner.sh absent — the shared runner ladder is gone\n' >&2
  exit 1
fi

fn_body() {
  awk -v pat="$1() {" 'index($0, pat) == 1 { f = 1 } f { print } f && $0 == "}" { exit }' "$RUNNER"
}

code_only() {
  grep -vE '^[[:space:]]*#' | grep -vE '^[[:space:]]*(printf|echo|runner_log)[[:space:]]'
}

for fn in runner_detect runner_launch runner_verify_cwd runner_alive runner_teardown resolve_timeout_ms; do
  grep -qE "^$fn\(\) \{" "$RUNNER" || missing+=("session-runner.sh: function $fn is missing")
done

detect="$(fn_body runner_detect)"
eligible="$(fn_body runner_herdr_eligible)"
watch="$(fn_body runner_watch)"
teardown="$(fn_body runner_teardown)"
abort="$(fn_body runner_abort)"

grep -qE 'herdr[^A-Za-z]+->[^A-Za-z]+tmux[^A-Za-z]+->[^A-Za-z]+foreground' "$RUNNER" \
  || missing+=("session-runner.sh: the ladder order herdr -> tmux -> foreground is not declared")

ladder="$(printf '%s\n' "$detect" | awk '/Automatic ladder/{f=1; next} f' | grep -v '^[[:space:]]*#')"
if [ -z "$ladder" ]; then
  missing+=("runner_detect: no automatic-ladder branch found (only explicit-request handling remains)")
else
  h_at="$(printf '%s\n' "$ladder" | grep -n 'herdr' | head -1 | cut -d: -f1)"
  t_at="$(printf '%s\n' "$ladder" | grep -n 'tmux' | head -1 | cut -d: -f1)"
  f_at="$(printf '%s\n' "$ladder" | grep -n 'foreground' | head -1 | cut -d: -f1)"
  if [ -z "$h_at" ] || [ -z "$t_at" ] || [ -z "$f_at" ]; then
    missing+=("runner_detect automatic ladder: one of herdr/tmux/foreground is not a rung at all")
  elif [ "$h_at" -ge "$t_at" ] || [ "$t_at" -ge "$f_at" ]; then
    missing+=("runner_detect automatic ladder: rungs are not in herdr -> tmux -> foreground order (herdr@$h_at tmux@$t_at foreground@$f_at)")
  fi
fi

if [ -z "$eligible" ]; then
  missing+=("session-runner.sh: runner_herdr_eligible is missing — herdr eligibility has no gate")
else
  for field in 'status: running' 'compatible: yes'; do
    printf '%s\n' "$eligible" | grep -F "$field" | grep -q 'grep' \
      || missing+=("runner_herdr_eligible: the literal field '$field' is not TESTED (naming it in a message is not a health check)")
  done
fi

if [ -n "$eligible" ]; then
  eligible_code="$(printf '%s\n' "$eligible" | code_only)"
  guard_at="$(printf '%s\n' "$eligible_code" | grep -n 'HERDR_ENV' | head -1 | cut -d: -f1)"
  probe_at="$(printf '%s\n' "$eligible_code" | grep -n 'runner_probe_fingerprint' | head -1 | cut -d: -f1)"
  if [ -z "$guard_at" ]; then
    missing+=("runner_herdr_eligible: no HERDR_ENV nesting guard (the detection path could nest a herdr pane)")
  elif [ -n "$probe_at" ] && [ "$guard_at" -ge "$probe_at" ]; then
    missing+=("runner_herdr_eligible: the HERDR_ENV nesting guard runs AFTER the probe pane (guard@$guard_at probe@$probe_at)")
  fi
fi

for fn in runner_local_fingerprint runner_probe_fingerprint; do
  grep -qE "^$fn\(\) \{" "$RUNNER" || missing+=("session-runner.sh: the execution-context gate helper $fn is gone")
done
if [ -n "$eligible" ]; then
  printf '%s\n' "$eligible" | code_only | grep -Fq 'runner_local_fingerprint' \
    || missing+=("runner_herdr_eligible: no caller-side fingerprint is gathered to compare against")
  printf '%s\n' "$eligible" | code_only | grep -q '"\$probe_fp" != "\$caller_fp"\|"\$caller_fp" != "\$probe_fp"' \
    || missing+=("runner_herdr_eligible: the probe/caller fingerprints are never compared — an out-of-environment herdr would be selected")
  printf '%s\n' "$eligible" | grep -Fq 'fingerprint mismatch' \
    || missing+=("runner_herdr_eligible: a fingerprint mismatch sets no named ineligibility reason")
fi
printf '%s\n' "$detect" | grep -Fq 'degrading to tmux' \
  || missing+=("runner_detect: an ineligible herdr does not degrade to tmux with a logged reason")
printf '%s\n' "$detect" | grep -Fq 'RUNNER_INELIGIBLE_REASON' \
  || missing+=("runner_detect: the degrade reason is not carried into the log (a silent degrade is unauditable)")
probe_fn="$(fn_body runner_probe_fingerprint)"
printf '%s\n' "$probe_fn" | code_only | grep -Fq 'herdr pane close' \
  || missing+=("runner_probe_fingerprint: the probe pane is not closed (the gate leaks a pane per detection)")

printf '%s\n' "$probe_fn" | code_only | grep -Fq 'runner_probe_pane_script' \
  || missing+=("runner_probe_fingerprint: the pane runs the bare fingerprint snippet — it exits before the read and the gate can never admit herdr (#761)")
grep -Fq 'RUNNER_PROBE_KEEPALIVE_SUFFIX=' "$RUNNER" \
  || missing+=("session-runner.sh: RUNNER_PROBE_KEEPALIVE_SUFFIX is gone — nothing keeps the probe pane alive across the read")
pane_script_fn="$(fn_body runner_probe_pane_script)"
printf '%s\n' "$pane_script_fn" | code_only | grep -Fq 'RUNNER_PROBE_SCRIPT' \
  || missing+=("runner_probe_pane_script: the pane snippet is not built from RUNNER_PROBE_SCRIPT — pane and caller fingerprints stop being the same snippet")
printf '%s\n' "$pane_script_fn" | code_only | grep -Fq 'RUNNER_PROBE_KEEPALIVE_SUFFIX' \
  || missing+=("runner_probe_pane_script: the keep-alive suffix is not applied to the pane snippet")

grep -E '^RUNNER_PROBE_SCRIPT=' "$RUNNER" | grep -Fq 'sleep' \
  && missing+=("session-runner.sh: the keep-alive leaked into RUNNER_PROBE_SCRIPT — runner_local_fingerprint would sleep on every call")
printf '%s\n' "$(fn_body runner_local_fingerprint)" | code_only | grep -Fq 'runner_probe_pane_script' \
  && missing+=("runner_local_fingerprint: the caller-side fingerprint runs the keep-alive pane snippet instead of the bare one")

keepalive_fn="$(fn_body runner_probe_keepalive_s)"
if [ -z "$keepalive_fn" ]; then
  missing+=("session-runner.sh: runner_probe_keepalive_s is missing — the keep-alive budget has no source")
else
  printf '%s\n' "$keepalive_fn" | code_only | grep -Fq 'RUNNER_PROBE_TIMEOUT_MS' \
    || missing+=("runner_probe_keepalive_s: the keep-alive is not derived from RUNNER_PROBE_TIMEOUT_MS — the pane can die inside the read window")
fi

grep -Fq 'RUNNER_DEFAULT_TIMEOUT_MS=14400000' "$RUNNER" \
  || missing+=("session-runner.sh: the 14400000 (4h) session-budget default literal is gone")
if [ -z "$watch" ]; then
  missing+=("session-runner.sh: runner_watch is missing — nothing bounds the session")
else
  printf '%s\n' "$watch" | grep -Fq 'resolve_timeout_ms' \
    || missing+=("runner_watch: the budget does not come from resolve_timeout_ms (a second budget source can diverge)")
  printf '%s\n' "$watch" | grep -Eq 'deadline=.*budget_ms' \
    || missing+=("runner_watch: the poll deadline is not derived from the resolved budget")
  printf '%s\n' "$watch" | grep -Eq 'while .*deadline' \
    || missing+=("runner_watch: the tmux/foreground poll loop is not bounded by the deadline (it could run unbounded)")
  printf '%s\n' "$watch" | grep -Fq -- '--timeout "$budget_ms"' \
    || missing+=("runner_watch: the herdr wait output timeout is not the resolved budget")
fi

if [ -z "$abort" ]; then
  missing+=("session-runner.sh: runner_abort is missing — there is no single exit path")
else
  printf '%s\n' "$abort" | grep -Fq 'runner_teardown' \
    || missing+=("runner_abort: does not call runner_teardown")
  printf '%s\n' "$abort" | grep -Fq 'runner_lock_path' \
    || missing+=("runner_abort: does not resolve the per-slug lock path")
  printf '%s\n' "$abort" | grep -Eq 'rm -[a-z]* "\$lock"' \
    || missing+=("runner_abort: does not remove the lock (a stale lock wedges the slug permanently)")
  printf '%s\n' "$abort" | grep -Fq 'FIRSTMATE-INCOMPLETE' \
    || missing+=("runner_abort: does not append FIRSTMATE-INCOMPLETE to progress.txt")
fi
if [ -n "$watch" ]; then
  abort_calls="$(printf '%s\n' "$watch" | grep -c 'runner_abort')"
  [ "$abort_calls" -ge 2 ] \
    || missing+=("runner_watch: only $abort_calls of the two non-sentinel endings (expiry, death) route through runner_abort")
fi
trap_fn="$(fn_body runner_install_abort_trap)"
printf '%s\n' "$trap_fn" | grep -Fq 'runner_abort' \
  || missing+=("runner_install_abort_trap: an operator abort does not route through runner_abort")
printf '%s\n' "$trap_fn" | grep -Fq 'INT TERM' \
  || missing+=("runner_install_abort_trap: INT/TERM are not trapped")

start_lines="$(grep -n 'herdr agent start' "$RUNNER" \
  | grep -vE '^[0-9]+:[[:space:]]*#' \
  | grep -vE '^[0-9]+:[[:space:]]*(printf|echo|runner_log)[[:space:]]')" || start_lines=""
if [ -z "$start_lines" ]; then
  missing+=("session-runner.sh: no herdr agent start invocation — the herdr rung of the ladder is gone")
else
  for ln in $(printf '%s\n' "$start_lines" | cut -d: -f1); do
    sed -n "${ln},$((ln + 2))p" "$RUNNER" | grep -Fq -- '--no-focus' \
      || missing+=("session-runner.sh:$ln — a herdr agent start invocation is missing --no-focus (it would steal the operator's focus)")
  done
fi

printf '%s\n' "$teardown" | code_only | grep -Fq 'herdr pane close' \
  || missing+=("runner_teardown: the herdr branch does not INVOKE the live-verified 'herdr pane close' teardown verb (a log line naming it is not a teardown)")
printf '%s\n' "$teardown" | code_only | grep -Fq 'tmux kill-session' \
  || missing+=("runner_teardown: the tmux branch does not kill the agent- session")

FORBIDDEN=(
  'herdr server stop'
  'herdr update'
  'herdr channel set'
  'herdr agent stop'
  'herdr agent kill'
  '.config/herdr'
)
for cmd in "${FORBIDDEN[@]}"; do
  grep -Fq "$cmd" "$RUNNER" \
    && missing+=("session-runner.sh contains a forbidden command or path: '$cmd'")
done

alive="$(fn_body runner_alive | code_only)"
printf '%s\n' "$alive" | grep -Fq 'herdr agent get' \
  || missing+=("runner_alive: herdr-mode liveness no longer uses 'herdr agent get' (its exit code is the oracle)")
printf '%s\n' "$alive" | grep -Fq 'tmux has-session' \
  || missing+=("runner_alive: tmux-mode liveness no longer uses 'tmux has-session'")

if grep -nE '^set ' "$RUNNER" >/dev/null 2>&1; then
  missing+=("session-runner.sh sets shell options at file scope — a sourced library must not mutate the caller's options")
fi

if [ "${#missing[@]}" -gt 0 ]; then
  printf 'REGRESSION: session-runner ladder contract broken:\n' >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "PASS: ladder herdr->tmux->foreground, health pinned to status: running + compatible: yes, nesting guard before the probe pane, fingerprint gate degrades+logs, resolve_timeout_ms bounds every watch at 14400000 default, exit paths teardown+unlock+FIRSTMATE-INCOMPLETE, --no-focus on every launch, teardown via pane close, no server-disturbing commands, agent get oracle intact, no file-scope set" >&2
exit 0
