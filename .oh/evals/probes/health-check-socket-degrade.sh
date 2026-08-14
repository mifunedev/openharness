#!/usr/bin/env bash
# tier: A
# source: issue #762 (refs #756) — /health-check degrades to one statement, not nine failures
# desc: /health-check's scope preflight resolves every endpoint to a decided state, contacts no daemon on the host-only path, and never calls a dead socket available
#
# This probe EXECUTES the preflight and asserts its behaviour. It deliberately does
# not assert that a file exists: a skill file can exist and still emit the wall of
# connection errors #762 is about.
#
# The `available` arm cannot be faked with a real socket — a python-bound socket does
# not speak Docker's HTTP API, so a genuine round-trip against it can only fail. The
# arms therefore drive a `docker` SHIM first on PATH, which both decides the
# round-trip outcome and records every invocation. That shim is also what proves the
# host-only branch contacts no daemon: a static grep cannot show what the runtime
# path did not do.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PREFLIGHT="$ROOT/.oh/skills/health-check/scripts/scope-preflight.sh"
SKILL="$ROOT/.oh/skills/health-check/SKILL.md"
NOTICE='HEALTH-CHECK SCOPE-NOTICE:'

[ -f "$PREFLIGHT" ] || { echo "SKIPPED: preflight not found at $PREFLIGHT" >&2; exit 2; }
[ -x "$PREFLIGHT" ] || { echo "REGRESSION: preflight is not executable: $PREFLIGHT" >&2; exit 1; }
[ -f "$SKILL" ]     || { echo "SKIPPED: skill not found at $SKILL" >&2; exit 2; }
bash -n "$PREFLIGHT" 2>/dev/null || { echo "REGRESSION: preflight fails bash -n" >&2; exit 1; }

# Fixtures live outside the repo tree so a crash cannot leak into git status, and
# under a SHORT path: AF_UNIX sun_path is capped at 108 bytes and a deep temp path
# fails to bind for reasons unrelated to what this probe tests.
TMP="$(mktemp -d /tmp/hc-probe.XXXXXX)" || { echo "SKIPPED: cannot create temp dir" >&2; exit 2; }
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/bin" "$TMP/nodocker"

# The shim: one line per invocation carrying the resolved SUBCOMMAND, so the
# host-only assertion is about calls made rather than about strings in the source.
# `-H <value>` is skipped explicitly — capturing the first non-flag argument would
# record the endpoint and silently never record `version`, which would make the
# available arm's assertion pass for the wrong reason.
cat > "$TMP/bin/docker" <<'SHIM'
#!/usr/bin/env bash
sub=""
while [ $# -gt 0 ]; do
  case "$1" in
    -H|--host) shift 2 2>/dev/null || shift ;;
    -*) shift ;;
    *) sub="$1"; break ;;
  esac
done
printf '%s\n' "${sub:-<none>}" >> "$SHIM_LOG"
exit "${SHIM_RC:-0}"
SHIM
chmod +x "$TMP/bin/docker"

# A PATH with the tools the preflight needs but WITHOUT docker, for the absent-CLI
# arm. Pointing PATH at an empty directory would break the probe's own utilities
# instead of testing the branch.
NODOCKER_BASH=""
for t in bash env grep head timeout sed cut; do
  p="$(command -v "$t" 2>/dev/null)" && ln -sf "$p" "$TMP/nodocker/$t"
done
[ -x "$TMP/nodocker/bash" ] && NODOCKER_BASH="$TMP/nodocker/bash"

fails=0
note() { echo "REGRESSION: $*" >&2; fails=$((fails + 1)); }

# run <shim-rc> <endpoint> [extra env assignments...] -> stdout in $OUT, rc in $RC
run() {
  local rc="$1" ep="$2"; shift 2
  : > "$TMP/log"
  OUT="$(SHIM_LOG="$TMP/log" SHIM_RC="$rc" PATH="$TMP/bin:$PATH" \
    HEALTH_CHECK_DOCKER_SOCK="$ep" HEALTH_CHECK_PROBE_TIMEOUT_S=5 \
    "$@" bash "$PREFLIGHT" 2>/dev/null)"
  RC=$?
}
field()   { printf '%s\n' "$OUT" | sed -n "s/^$1=//p" | head -1; }
notices() { printf '%s\n' "$OUT" | grep -cF "$NOTICE"; }
calls()   { tr '\n' ' ' < "$TMP/log"; }

# --- ARM 1: absent unix endpoint -> host-only, exactly one notice, exit 0 --------
run 0 "$TMP/absent.sock"
[ "$(field DOCKER_TRIAGE)" = "host-only" ] \
  || note "A1 absent endpoint: DOCKER_TRIAGE='$(field DOCKER_TRIAGE)', want host-only"
[ "$(notices)" -eq 1 ] \
  || note "A1 absent endpoint: $(notices) notice lines, want exactly 1"
[ "$RC" -eq 0 ] \
  || note "A1 absent endpoint: exit $RC, want 0 — a classification step must not read as a failure"

# --- ARM 2: the host-only branch contacts NO daemon ------------------------------
# Same run as ARM 1. An explicit endpoint override short-circuits resolution, so a
# correct preflight invokes docker zero times here.
[ -z "$(calls)" ] \
  || note "A2 host-only branch invoked docker [$(calls)] — the branch must contact no daemon"

# --- ARM 3: reachable endpoint -> available, and NO notice -----------------------
run 0 "tcp://127.0.0.1:2375"
[ "$(field DOCKER_TRIAGE)" = "available" ] \
  || note "A3 reachable endpoint: DOCKER_TRIAGE='$(field DOCKER_TRIAGE)', want available"
[ "$(notices)" -eq 0 ] \
  || note "A3 reachable endpoint: $(notices) notice lines, want 0 — a working daemon needs no host-only notice"
case " $(calls)" in
  *" version "*) : ;;
  *) note "A3 reachable endpoint: docker calls were [$(calls)], want a 'version' round-trip" ;;
esac

# --- ARM 4: endpoint present, daemon dead -> unreachable, ONE notice, exit 0 -----
# The central regression guard. `[ -S path ]` is true for a socket an OOM-killed
# daemon left behind and for a chmod-000 socket; classifying either `available` is
# how the nine-failure wall comes back wearing a passing preflight.
run 1 "tcp://127.0.0.1:2375"
[ "$(field DOCKER_TRIAGE)" = "unreachable" ] \
  || note "A4 dead daemon: DOCKER_TRIAGE='$(field DOCKER_TRIAGE)', want unreachable — a present-but-dead endpoint must never be called available"
[ "$(notices)" -eq 1 ] \
  || note "A4 dead daemon: $(notices) notice lines, want exactly 1"
[ "$RC" -eq 0 ] \
  || note "A4 dead daemon: exit $RC, want 0"

# --- ARM 5: a real unix socket counts as an endpoint -----------------------------
if command -v python3 >/dev/null 2>&1; then
  if python3 -c 'import socket,sys
s = socket.socket(socket.AF_UNIX)
s.bind(sys.argv[1])
s.listen(1)' "$TMP/live.sock" 2>/dev/null && [ -S "$TMP/live.sock" ]; then
    run 0 "$TMP/live.sock"
    [ "$(field DOCKER_TRIAGE)" = "available" ] \
      || note "A5 present socket + answering daemon: DOCKER_TRIAGE='$(field DOCKER_TRIAGE)', want available"
  else
    echo "note: A5 skipped — could not bind a unix socket under $TMP" >&2
  fi
else
  echo "note: A5 skipped — python3 unavailable" >&2
fi

# --- ARM 6: no docker CLI at all -> host-only -----------------------------------
# The CLI and the endpoint are separate facts. Testing for the binary is what made
# the old behaviour wrong: /usr/bin/docker is present in this sandbox and proves
# nothing about reachability. The inverse must also hold.
OUT=""
if [ -n "$NODOCKER_BASH" ]; then
  OUT="$(SHIM_LOG="$TMP/log" PATH="$TMP/nodocker" HEALTH_CHECK_DOCKER_SOCK="$TMP/live.sock" \
    "$NODOCKER_BASH" "$PREFLIGHT" 2>/dev/null)"
fi
if [ -n "$OUT" ]; then
  [ "$(field DOCKER_CLI)" = "absent" ] \
    || note "A6 no docker on PATH: DOCKER_CLI='$(field DOCKER_CLI)', want absent"
  [ "$(field DOCKER_TRIAGE)" = "host-only" ] \
    || note "A6 no docker on PATH: DOCKER_TRIAGE='$(field DOCKER_TRIAGE)', want host-only"
else
  echo "note: A6 skipped — minimal PATH could not run the preflight" >&2
fi

# --- ARM 7: no terminal `unverified` state --------------------------------------
# An earlier design reported `unverified` for endpoints no file test could settle and
# never required resolving it, which left a tcp:// operator exactly where the old
# skill left them. Every path must end at a decided state.
grep -qF 'unverified' "$PREFLIGHT" \
  && note "A7 preflight reintroduces an 'unverified' state — every endpoint must resolve to available|host-only|unreachable"

# --- ARM 8: SKILL.md actually wires step 0 to the script ------------------------
# An unwired script is a no-op no matter how correct it is.
grep -qF 'scripts/scope-preflight.sh' "$SKILL" \
  || note "A8 SKILL.md does not invoke scripts/scope-preflight.sh — the preflight is unwired"
grep -qF 'DOCKER_TRIAGE' "$SKILL" \
  || note "A8 SKILL.md does not branch on DOCKER_TRIAGE"

# --- ARM 9: the relocated Docker steps are marked host-only, not deleted --------
grep -qF 'docker stats' "$SKILL" \
  || note "A9 SKILL.md lost the 'docker stats' RAM-reclaim step"
grep -qiF 'host-only' "$SKILL" \
  || note "A9 SKILL.md carries no host-only marker on the relocated Docker steps"

if [ "$fails" -eq 0 ]; then
  echo "PASS: preflight resolves every endpoint, contacts no daemon when host-only, and refuses to call a dead socket available" >&2
  exit 0
fi
echo "REGRESSION: $fails assertion(s) failed" >&2
exit 1
