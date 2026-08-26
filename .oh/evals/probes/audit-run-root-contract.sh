#!/usr/bin/env bash
# tier: A
# source: issue #645 — executable immutable audit root/run correlation
# desc: production lifecycle validates before state, preserves child identity, cleans temp, and reports one run record
set -euo pipefail
# This probe drives audit-run.sh from a TOP-LEVEL position: it asserts what a fresh
# lifecycle does, and sets AUDIT_RUN_ID/AUDIT_ROOT itself for the one child-mode case
# it tests. When the suite is run from INSIDE an audit (`/audit
# implementation` -> Gate 2 -> run.sh), those variables are already exported, audit-run.sh
# reads them as a half-configured child ("inherited run requires AUDIT_ROOT"), and the
# probe reports a green->red that describes the caller's environment rather than the repo.
# Clearing the inherited identity is not weakening the check -- every binding the probe
# actually asserts is set explicitly below.
unset AUDIT_RUN_ID AUDIT_ROOT AUDIT_TMP_ROOT AUDIT_EVIDENCE_PATH \
      AUDIT_ROUTE AUDIT_TARGET AUDIT_TARGET_ARGS_JSON AUDIT_AGENT_COMMAND_JSON
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"; RUN="$REPO/.oh/skills/audit/scripts/audit-run.sh"
tmp=$(mktemp -d); tmpdir=$(mktemp -d); trap 'rm -rf "$tmp" "$tmpdir"' EXIT
mkdir -p "$tmp/.oh/skills/audit/references" "$tmp/.oh/scripts"
for route in implementation pr prs harness context skills eval-quality drift full; do
  printf '# test route %s\n' "$route" >"$tmp/.oh/skills/audit/references/$route.md"
done
printf '# harness route loads references/external-proposal-audit.md only for --external\n' >"$tmp/.oh/skills/audit/references/harness.md"
printf '# private external route\n' >"$tmp/.oh/skills/audit/references/external-proposal-audit.md"
cp "$REPO/.oh/scripts/locked-append.sh" "$tmp/.oh/scripts/locked-append.sh"
mkdir -p "$tmp/.oh/skills/audit/scripts"
cp "$REPO/.oh/skills/audit/scripts/audit-evidence.sh" "$tmp/.oh/skills/audit/scripts/audit-evidence.sh"
cat >"$tmp/complete-driver" <<'DRIVER'
#!/usr/bin/env bash
"$AUDIT_ROOT/.oh/skills/audit/scripts/audit-evidence.sh" complete TEST-COMPLETE
DRIVER
chmod +x "$tmp/complete-driver" "$tmp/.oh/skills/audit/scripts/audit-evidence.sh"
git -C "$tmp" init -q; git -C "$tmp" config user.email test@example.invalid; git -C "$tmp" config user.name test
git -C "$tmp" add .; git -C "$tmp" commit -qm init
fail(){ echo "REGRESSION: $*" >&2; exit 1; }
export TMPDIR="$tmpdir"
# Invalid usage creates neither temp state nor log.
set +e; usage_out=$(CRON_WORKTREE="$tmp" CRON_LOG_ROOT="$tmp" bash "$RUN" nope 2>&1); usage_rc=$?; set -e
[[ $usage_rc -eq 64 ]] || fail 'unknown target accepted/wrong usage rc'
[[ ${usage_out%%$'\n'*} == 'usage: /audit <implementation|pr|prs|harness|context|skills|eval-quality|drift|full> [target options]' ]] || fail 'usage first line is not exact'
for route in implementation pr prs harness context skills eval-quality drift full; do grep -q "^| $route |" <<<"$usage_out" || fail "usage table missing $route"; done
[[ -z $(find "$tmpdir" -mindepth 1 -print -quit) && ! -e "$tmp/.oh/logs" ]] || fail 'invalid usage created lifecycle state'
if CRON_WORKTREE="$tmp" CRON_LOG_ROOT="$tmp" bash "$RUN" harness --external source --focus x -- true >/dev/null 2>&1; then fail 'external/focus conflict accepted'; fi
if CRON_WORKTREE="$tmp" CRON_LOG_ROOT="$tmp" bash "$RUN" harness --wiki-ingest -- true >/dev/null 2>&1; then fail 'external-only option reached survey mode'; fi
if CRON_WORKTREE="$tmp" CRON_LOG_ROOT="$tmp" bash "$RUN" implementation -- true >/dev/null 2>&1; then fail 'missing implementation slug accepted'; fi
if CRON_WORKTREE="$tmp" CRON_LOG_ROOT="$tmp" bash "$RUN" pr 7 --repo bad -- true >/dev/null 2>&1; then fail 'invalid focused repo accepted'; fi
if CRON_WORKTREE="$tmp" CRON_LOG_ROOT="$tmp" bash "$RUN" drift >/dev/null 2>&1; then fail 'missing route driver accepted'; fi
# Focused/queue repositories are optional; focused --base supports stacked PRs.
# A no-op route can never certify completion, even when it exits zero.
if CRON_WORKTREE="$tmp" CRON_LOG_ROOT="$tmp" bash "$RUN" drift -- true >/dev/null 2>&1; then fail 'true callback certified completion'; fi
cat >"$tmp/fake-agent" <<'AGENT'
#!/usr/bin/env bash
prompt=${!#}
grep -q 'AUDIT_TARGET: drift' <<<"$prompt" || exit 9
grep -q '# test route drift' <<<"$prompt" || exit 9
# The agent receives every binding it needs as prompt TEXT. Inheriting the lifecycle
# identity as environment is what made this very probe grade its caller instead of the
# repo, twice (AUDIT_ROOT/AUDIT_RUN_ID, then AUDIT_SIGNALS_RESET). The driver must scrub
# it; a leak here is a real defect, so fail loudly rather than tolerate it.
leaked=$(printenv | grep -c '^AUDIT_' || true)
[[ $leaked -eq 0 ]] || { printf 'agent inherited %s AUDIT_* variable(s)\n' "$leaked" >&2; exit 8; }
printf 'route report\nAUDIT-EVIDENCE: DRIFT-OK\n'
AGENT
chmod +x "$tmp/fake-agent"
AUDIT_AGENT_COMMAND_JSON="[\"$tmp/fake-agent\"]" CRON_WORKTREE="$tmp" CRON_LOG_ROOT="$tmp" \
  bash "$RUN" drift -- "$REPO/.oh/skills/audit/scripts/route-driver.sh" >/dev/null \
  || fail 'canonical production route driver did not publish correlated evidence (rc 8 = it leaked AUDIT_* into the agent)'
CRON_WORKTREE="$tmp" CRON_LOG_ROOT="$tmp" bash "$RUN" pr 7 --base stack-parent -- "$tmp/complete-driver" >/dev/null
CRON_WORKTREE="$tmp" CRON_LOG_ROOT="$tmp" bash "$RUN" prs --mine -- "$tmp/complete-driver" >/dev/null
CRON_WORKTREE="$tmp" CRON_LOG_ROOT="$tmp" bash "$RUN" full --repo owner/name -- "$tmp/complete-driver" >/dev/null
[[ ! -e "$tmp/.oh/logs" ]] || fail 'a run wrote the deleted .oh/logs tier'
# Lifecycle remains active around the actual driver and exposes the selected route.
CRON_WORKTREE="$tmp" CRON_LOG_ROOT="$tmp" bash "$RUN" drift -- bash -c '
  [[ $AUDIT_ROUTE == "$AUDIT_ROOT/.oh/skills/audit/references/drift.md" ]]
  [[ ! -e "$AUDIT_ROOT/.oh/logs" ]]
  [[ $PWD == "$AUDIT_ROOT" ]]
  [[ $AUDIT_TARGET == drift && $AUDIT_TARGET_ARGS_JSON == "[]" ]]
  printf route-ran >"$AUDIT_ROOT/driver-marker"
  "$AUDIT_ROOT/.oh/skills/audit/scripts/audit-evidence.sh" complete DRIFT-OK
'
[[ $(<"$tmp/driver-marker") == route-ran ]] || fail 'selected route driver did not run/chdir or receive bindings'
rm "$tmp/driver-marker"
# The run record is REPORTED on stderr and never written to a file.
rec=$(CRON_WORKTREE="$tmp" CRON_LOG_ROOT="$tmp" bash "$RUN" drift -- "$tmp/complete-driver" 2>&1 >/dev/null)
[[ $(grep -c '^audit -- run-id=' <<<"$rec") -eq 1 ]] || fail 'terminal run record did not follow driver'
[[ ! -e "$tmp/.oh/logs" ]] || fail 'run record was written to the deleted .oh/logs tier'
# Two concurrent outer invocations get unique IDs and each reports exactly one record.
for n in 1 2; do
  CRON_WORKTREE="$tmp" CRON_LOG_ROOT="$tmp" bash "$RUN" drift -- \
    bash -c 'printf "%s|%s" "$AUDIT_RUN_ID" "$AUDIT_ROOT" >"$AUDIT_TMP_ROOT/seen"; "$AUDIT_ROOT/.oh/skills/audit/scripts/audit-evidence.sh" complete DRIFT-OK' 2>"$tmp/rec.$n" & pids[n]=$!
done
wait "${pids[1]}"; wait "${pids[2]}"
[[ ! -e "$tmp/.oh/logs" ]] || fail 'concurrent runs wrote the deleted .oh/logs tier'
mapfile -t ids < <(cat "$tmp/rec.1" "$tmp/rec.2" | sed -n 's/^audit -- run-id=\([^ ]*\).*/\1/p')
[[ ${#ids[@]} -eq 2 && ${ids[0]} != "${ids[1]}" ]] || fail 'run IDs not unique'
[[ ${ids[0]} =~ ^audit-[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9._-]+$ ]] || fail 'run ID shape'
[[ -z $(find "$tmpdir" -mindepth 1 -maxdepth 1 ! -name openharness-locked-append -print -quit) ]] || fail 'invocation temp not cleaned'
# Child mode preserves the immutable root/ID and reports no record of its own.
id=${ids[0]}
child_rec=$(AUDIT_RUN_ID="$id" AUDIT_ROOT="$tmp" TMPDIR="$tmpdir" bash "$RUN" drift -- \
  bash -c '[[ "$AUDIT_RUN_ID" == "$1" && "$AUDIT_ROOT" == "$2" ]]; "$AUDIT_ROOT/.oh/skills/audit/scripts/audit-evidence.sh" complete DRIFT-OK' _ "$id" "$tmp" 2>&1 >/dev/null)
[[ $(grep -c '^audit -- run-id=' <<<"$child_rec") -eq 0 ]] || fail 'child reported its own run record'
[[ -z $(find "$tmpdir" -mindepth 1 -maxdepth 1 ! -name openharness-locked-append -print -quit) ]] || fail 'child temp not cleaned'
# The bridge appends validated arguments verbatim after driver options.
cat >"$tmp/args-driver" <<'DRIVER'
#!/usr/bin/env bash
printf '%s\n' "$PWD" "$AUDIT_TARGET" "$AUDIT_TARGET_ARGS_JSON" "$@" >"$AUDIT_ROOT/args-seen"
"$AUDIT_ROOT/.oh/skills/audit/scripts/audit-evidence.sh" complete PRS-AUDIT-COMPLETE
DRIVER
chmod +x "$tmp/args-driver"
CRON_WORKTREE="$tmp" CRON_LOG_ROOT="$tmp" bash "$RUN" prs --label 'needs review' --base development -- "$tmp/args-driver"
mapfile -t seen <"$tmp/args-seen"
[[ ${seen[0]} == "$tmp" && ${seen[1]} == prs && ${seen[2]} == '["--label","needs review","--base","development"]' ]] || fail 'named argument bindings differ'
[[ ${seen[3]} == prs && ${seen[4]} == --label && ${seen[5]} == 'needs review' && ${seen[6]} == --base && ${seen[7]} == development ]] || fail 'driver argv not exact'
# Failed real work stays inside lifecycle and records its nonzero exit.
set +e
failed_rec=$(CRON_WORKTREE="$tmp" CRON_LOG_ROOT="$tmp" bash "$RUN" drift -- bash -c 'exit 23' 2>&1 >/dev/null)
failed_rc=$?
set -e
[[ $failed_rc -eq 23 ]] || fail 'driver failure rc was not propagated'
grep -q 'state=failed' <<<"$failed_rec" || fail 'failed lifecycle not reported'
grep -q 'exit=23' <<<"$failed_rec" || fail 'failed exit not reported'
# INT/TERM/HUP reach the complete route process group and leave no descendants.
cat >"$tmp/signal-driver" <<'DRIVER'
#!/usr/bin/env bash
sigfile="$AUDIT_ROOT/${SIGNAL_NAME,,}-seen"
trap 'printf INT >"$sigfile"; exit 77' INT
trap 'printf TERM >"$sigfile"; exit 77' TERM
trap 'printf HUP >"$sigfile"; exit 77' HUP
# This descendant deliberately ignores the first signal; lifecycle escalation
# must still remove it before returning.
bash -c 'trap "" INT TERM HUP; sleep 30' & kid=$!
printf '%s %s\n' "$$" "$kid" >"$AUDIT_ROOT/pids-seen"
wait "$kid"
DRIVER
chmod +x "$tmp/signal-driver"
for sig in INT TERM HUP; do
  rm -f "$tmp/pids-seen" "$tmp/${sig,,}-seen"
  SIGNAL_NAME=$sig CRON_WORKTREE="$tmp" CRON_LOG_ROOT="$tmp" bash "$RUN" drift -- "$tmp/signal-driver" 2>"$tmp/sig-rec" & wrapper=$!
  for _ in {1..50}; do [[ -s "$tmp/pids-seen" ]] && break; sleep .05; done
  [[ -s "$tmp/pids-seen" ]] || fail "$sig signal fixture did not start"
  read -r driver_pid grandchild_pid <"$tmp/pids-seen"
  kill -s "$sig" "$wrapper"
  set +e; wait "$wrapper"; signal_rc=$?; set -e
  expected=$((128 + $(kill -l "$sig")))
  [[ $signal_rc -eq $expected && -f "$tmp/${sig,,}-seen" ]] || fail "$sig not propagated/interrupted rc wrong"
  for pid in "$driver_pid" "$grandchild_pid"; do kill -0 "$pid" 2>/dev/null && fail "orphaned $sig route child $pid"; done
  rec_line=$(grep '^audit -- run-id=' "$tmp/sig-rec" | tail -1)
  [[ $rec_line == *state=interrupted* && $rec_line == *"exit=$expected"* ]] || fail "$sig interrupted lifecycle not reported nonzero"
done
# The direct fallback also resets inherited SIGINT and fails nonzero.
cat >"$tmp/direct-driver" <<'DRIVER'
#!/usr/bin/env bash
trap 'printf INT >"$AUDIT_ROOT/int-seen"; exit 77' INT
printf '%s\n' "$$" >"$AUDIT_ROOT/pids-seen"
while :; do sleep 1; done
DRIVER
chmod +x "$tmp/direct-driver"
rm -f "$tmp/pids-seen" "$tmp/int-seen"
AUDIT_FORCE_DIRECT=1 CRON_WORKTREE="$tmp" CRON_LOG_ROOT="$tmp" bash "$RUN" drift -- "$tmp/direct-driver" & wrapper=$!
for _ in {1..50}; do [[ -s "$tmp/pids-seen" ]] && break; sleep .05; done
driver_pid=$(<"$tmp/pids-seen")
kill -INT "$wrapper"
set +e; wait "$wrapper"; signal_rc=$?; set -e
[[ $signal_rc -eq 130 && -f "$tmp/int-seen" ]] || fail 'direct SIGINT not propagated/interrupted'
kill -0 "$driver_pid" 2>/dev/null && fail 'direct route child survived SIGINT'
[[ ! -e "$tmp/.oh/logs" ]] || fail 'the run reported into a file instead of stderr'
echo 'PASS: executable audit evidence/root/run-record/argument/INT/TERM/HUP contract' >&2
