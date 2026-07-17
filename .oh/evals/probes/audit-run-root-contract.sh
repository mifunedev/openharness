#!/usr/bin/env bash
# tier: A
# source: issue #645 — executable immutable audit root/run/log correlation
# desc: production lifecycle validates before state, preserves child identity, cleans temp, and locks one append
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"; RUN="$REPO/.oh/skills/audit/scripts/audit-run.sh"
tmp=$(mktemp -d); tmpdir=$(mktemp -d); trap 'rm -rf "$tmp" "$tmpdir"' EXIT
mkdir -p "$tmp/.oh/skills/audit/references" "$tmp/.oh/scripts"
for route in implementation pr prs harness context skills eval-quality drift full; do
  printf '# test route %s\n' "$route" >"$tmp/.oh/skills/audit/references/$route.md"
done
printf '# harness route loads references/external-proposal-audit.md only for --external\n' >"$tmp/.oh/skills/audit/references/harness.md"
printf '# private external route\n' >"$tmp/.oh/skills/audit/references/external-proposal-audit.md"
cp "$REPO/.oh/scripts/locked-append.sh" "$tmp/.oh/scripts/locked-append.sh"
git -C "$tmp" init -q; git -C "$tmp" config user.email test@example.invalid; git -C "$tmp" config user.name test
git -C "$tmp" add .; git -C "$tmp" commit -qm init
fail(){ echo "REGRESSION: $*" >&2; exit 1; }
export TMPDIR="$tmpdir"
# Invalid usage creates neither temp state nor log.
set +e; usage_out=$(CRON_WORKTREE="$tmp" AUTOPILOT_LOG_ROOT="$tmp" bash "$RUN" nope 2>&1); usage_rc=$?; set -e
[[ $usage_rc -eq 64 ]] || fail 'unknown target accepted/wrong usage rc'
[[ ${usage_out%%$'\n'*} == 'usage: /audit <implementation|pr|prs|harness|context|skills|eval-quality|drift|full> [target options]' ]] || fail 'usage first line is not exact'
for route in implementation pr prs harness context skills eval-quality drift full; do grep -q "^| $route |" <<<"$usage_out" || fail "usage table missing $route"; done
[[ -z $(find "$tmpdir" -mindepth 1 -print -quit) && ! -e "$tmp/.oh/memory" ]] || fail 'invalid usage created lifecycle state'
if CRON_WORKTREE="$tmp" AUTOPILOT_LOG_ROOT="$tmp" bash "$RUN" harness --external source --focus x -- true >/dev/null 2>&1; then fail 'external/focus conflict accepted'; fi
if CRON_WORKTREE="$tmp" AUTOPILOT_LOG_ROOT="$tmp" bash "$RUN" harness --wiki-ingest -- true >/dev/null 2>&1; then fail 'external-only option reached survey mode'; fi
if CRON_WORKTREE="$tmp" AUTOPILOT_LOG_ROOT="$tmp" bash "$RUN" implementation -- true >/dev/null 2>&1; then fail 'missing implementation slug accepted'; fi
if CRON_WORKTREE="$tmp" AUTOPILOT_LOG_ROOT="$tmp" bash "$RUN" pr 7 --repo bad -- true >/dev/null 2>&1; then fail 'invalid focused repo accepted'; fi
if CRON_WORKTREE="$tmp" AUTOPILOT_LOG_ROOT="$tmp" bash "$RUN" drift >/dev/null 2>&1; then fail 'missing route driver accepted'; fi
# Focused/queue repositories are optional; full accepts and forwards the queue repo.
CRON_WORKTREE="$tmp" AUTOPILOT_LOG_ROOT="$tmp" bash "$RUN" pr 7 -- true >/dev/null
CRON_WORKTREE="$tmp" AUTOPILOT_LOG_ROOT="$tmp" bash "$RUN" prs --mine -- true >/dev/null
CRON_WORKTREE="$tmp" AUTOPILOT_LOG_ROOT="$tmp" bash "$RUN" full --repo owner/name -- true >/dev/null
rm -rf "$tmp/.oh/memory"
[[ ! -e "$tmp/.oh/memory" ]] || fail 'invalid target arguments created lifecycle state'
# Lifecycle remains active around the actual driver and exposes the selected route.
CRON_WORKTREE="$tmp" AUTOPILOT_LOG_ROOT="$tmp" bash "$RUN" drift -- bash -c '
  [[ $AUDIT_ROUTE == "$AUDIT_ROOT/.oh/skills/audit/references/drift.md" ]]
  [[ ! -e "$AUDIT_LOG_ROOT/.oh/memory" ]]
  [[ $PWD == "$AUDIT_ROOT" ]]
  [[ $AUDIT_TARGET == drift && $AUDIT_TARGET_ARGS_JSON == "[]" ]]
  printf route-ran >"$AUDIT_ROOT/driver-marker"
'
[[ $(<"$tmp/driver-marker") == route-ran ]] || fail 'selected route driver did not run/chdir or receive bindings'
rm "$tmp/driver-marker"
first_log=$(find "$tmp/.oh/memory" -name log.md -print -quit)
[[ -f $first_log && $(grep -c '^## audit --' "$first_log") -eq 1 ]] || fail 'terminal append did not follow driver'
rm -rf "$tmp/.oh/memory"
# Two concurrent outer invocations get unique IDs and whole-record locked appends.
for n in 1 2; do
  CRON_WORKTREE="$tmp" AUTOPILOT_LOG_ROOT="$tmp" bash "$RUN" drift -- \
    bash -c 'printf "%s|%s|%s" "$AUDIT_RUN_ID" "$AUDIT_ROOT" "$AUDIT_LOG_ROOT" >"$AUDIT_TMP_ROOT/seen"' & pids[n]=$!
done
wait "${pids[1]}"; wait "${pids[2]}"
log=$(find "$tmp/.oh/memory" -name log.md -print -quit); [[ -f $log ]] || fail 'outer log missing'
[[ $(grep -c '^## audit --' "$log") -eq 2 ]] || fail 'outer append count/locking'
mapfile -t ids < <(grep '^\- \*\*Run-ID\*\*:' "$log" | awk '{print $3}')
[[ ${#ids[@]} -eq 2 && ${ids[0]} != "${ids[1]}" ]] || fail 'run IDs not unique'
[[ ${ids[0]} =~ ^audit-[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9._-]+$ ]] || fail 'run ID shape'
[[ -z $(find "$tmpdir" -mindepth 1 -maxdepth 1 ! -name openharness-locked-append -print -quit) ]] || fail 'invocation temp not cleaned'
# Child mode preserves immutable roots/ID and performs no third append.
id=${ids[0]}
AUDIT_RUN_ID="$id" AUDIT_ROOT="$tmp" AUDIT_LOG_ROOT="$tmp" TMPDIR="$tmpdir" bash "$RUN" drift -- \
  bash -c '[[ "$AUDIT_RUN_ID" == "$1" && "$AUDIT_ROOT" == "$2" && "$AUDIT_LOG_ROOT" == "$2" ]]' _ "$id" "$tmp"
[[ $(grep -c '^## audit --' "$log") -eq 2 ]] || fail 'child appended independently'
[[ -z $(find "$tmpdir" -mindepth 1 -maxdepth 1 ! -name openharness-locked-append -print -quit) ]] || fail 'child temp not cleaned'
# The bridge appends validated arguments verbatim after driver options.
cat >"$tmp/args-driver" <<'DRIVER'
#!/usr/bin/env bash
printf '%s\n' "$PWD" "$AUDIT_TARGET" "$AUDIT_TARGET_ARGS_JSON" "$@" >"$AUDIT_ROOT/args-seen"
DRIVER
chmod +x "$tmp/args-driver"
CRON_WORKTREE="$tmp" AUTOPILOT_LOG_ROOT="$tmp" bash "$RUN" prs --label 'needs review' --base development -- "$tmp/args-driver"
mapfile -t seen <"$tmp/args-seen"
[[ ${seen[0]} == "$tmp" && ${seen[1]} == prs && ${seen[2]} == '["--label","needs review","--base","development"]' ]] || fail 'named argument bindings differ'
[[ ${seen[3]} == prs && ${seen[4]} == --label && ${seen[5]} == 'needs review' && ${seen[6]} == --base && ${seen[7]} == development ]] || fail 'driver argv not exact'
# Failed real work stays inside lifecycle and records its nonzero exit.
set +e
CRON_WORKTREE="$tmp" AUTOPILOT_LOG_ROOT="$tmp" bash "$RUN" drift -- bash -c 'exit 23'
failed_rc=$?
set -e
[[ $failed_rc -eq 23 ]] || fail 'driver failure rc was not propagated'
grep -A6 '^## audit --' "$log" | grep -q '\*\*State\*\*: failed' || fail 'failed lifecycle not logged'
grep -A6 '^## audit --' "$log" | grep -q '\*\*Exit\*\*: 23' || fail 'failed exit not logged'
# TERM reaches the route process group (driver and grandchild), then logs interrupted.
cat >"$tmp/signal-driver" <<'DRIVER'
#!/usr/bin/env bash
trap 'printf term >"$AUDIT_ROOT/term-seen"; exit 77' TERM
sleep 30 & kid=$!
printf '%s %s\n' "$$" "$kid" >"$AUDIT_ROOT/pids-seen"
wait "$kid"
DRIVER
chmod +x "$tmp/signal-driver"
CRON_WORKTREE="$tmp" AUTOPILOT_LOG_ROOT="$tmp" bash "$RUN" drift -- "$tmp/signal-driver" & wrapper=$!
for _ in {1..50}; do [[ -s "$tmp/pids-seen" ]] && break; sleep .05; done
[[ -s "$tmp/pids-seen" ]] || fail 'signal fixture did not start'
read -r driver_pid grandchild_pid <"$tmp/pids-seen"
kill -TERM "$wrapper"
set +e; wait "$wrapper"; signal_rc=$?; set -e
[[ $signal_rc -eq 143 && -f "$tmp/term-seen" ]] || fail 'TERM not propagated/interrupted rc wrong'
for pid in "$driver_pid" "$grandchild_pid"; do kill -0 "$pid" 2>/dev/null && fail "orphaned route child $pid"; done
last_state=$(grep '^\- \*\*State\*\*:' "$log" | tail -1); last_exit=$(grep '^\- \*\*Exit\*\*:' "$log" | tail -1)
[[ $last_state == *interrupted && $last_exit == *143 ]] || fail 'interrupted lifecycle not logged nonzero'
echo 'PASS: executable audit root/run/log/argument/signal contract' >&2
