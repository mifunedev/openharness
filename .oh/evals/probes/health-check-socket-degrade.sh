#!/usr/bin/env bash
# tier: A
# source: issue #762 (refs #756) — /health-check degrades to one statement, not nine failures
# desc: /health-check's scope preflight resolves every endpoint to a decided state, contacts no daemon on the host-only path, and never calls a dead socket available
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PREFLIGHT="$ROOT/.oh/skills/health-check/scripts/scope-preflight.sh"
SKILL="$ROOT/.oh/skills/health-check/SKILL.md"
NOTICE='HEALTH-CHECK SCOPE-NOTICE:'

[ -f "$PREFLIGHT" ] || { echo "SKIPPED: preflight not found at $PREFLIGHT" >&2; exit 2; }
[ -x "$PREFLIGHT" ] || { echo "REGRESSION: preflight is not executable: $PREFLIGHT" >&2; exit 1; }
[ -f "$SKILL" ]     || { echo "SKIPPED: skill not found at $SKILL" >&2; exit 2; }
bash -n "$PREFLIGHT" 2>/dev/null || { echo "REGRESSION: preflight fails bash -n" >&2; exit 1; }

TMP="$(mktemp -d /tmp/hc-probe.XXXXXX)" || { echo "SKIPPED: cannot create temp dir" >&2; exit 2; }
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/bin" "$TMP/nodocker"

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

NODOCKER_BASH=""
for t in bash env grep head timeout sed cut; do
  p="$(command -v "$t" 2>/dev/null)" && ln -sf "$p" "$TMP/nodocker/$t"
done
[ -x "$TMP/nodocker/bash" ] && NODOCKER_BASH="$TMP/nodocker/bash"

fails=0
note() { echo "REGRESSION: $*" >&2; fails=$((fails + 1)); }

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

run 0 "$TMP/absent.sock"
[ "$(field DOCKER_TRIAGE)" = "host-only" ] \
  || note "A1 absent endpoint: DOCKER_TRIAGE='$(field DOCKER_TRIAGE)', want host-only"
[ "$(notices)" -eq 1 ] \
  || note "A1 absent endpoint: $(notices) notice lines, want exactly 1"
[ "$RC" -eq 0 ] \
  || note "A1 absent endpoint: exit $RC, want 0 — a classification step must not read as a failure"

[ -z "$(calls)" ] \
  || note "A2 host-only branch invoked docker [$(calls)] — the branch must contact no daemon"

run 0 "tcp://127.0.0.1:2375"
[ "$(field DOCKER_TRIAGE)" = "available" ] \
  || note "A3 reachable endpoint: DOCKER_TRIAGE='$(field DOCKER_TRIAGE)', want available"
[ "$(notices)" -eq 0 ] \
  || note "A3 reachable endpoint: $(notices) notice lines, want 0 — a working daemon needs no host-only notice"
case " $(calls)" in
  *" version "*) : ;;
  *) note "A3 reachable endpoint: docker calls were [$(calls)], want a 'version' round-trip" ;;
esac

run 1 "tcp://127.0.0.1:2375"
[ "$(field DOCKER_TRIAGE)" = "unreachable" ] \
  || note "A4 dead daemon: DOCKER_TRIAGE='$(field DOCKER_TRIAGE)', want unreachable — a present-but-dead endpoint must never be called available"
[ "$(notices)" -eq 1 ] \
  || note "A4 dead daemon: $(notices) notice lines, want exactly 1"
[ "$RC" -eq 0 ] \
  || note "A4 dead daemon: exit $RC, want 0"

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

grep -qF 'unverified' "$PREFLIGHT" \
  && note "A7 preflight reintroduces an 'unverified' state — every endpoint must resolve to available|host-only|unreachable"

grep -qF 'scripts/scope-preflight.sh' "$SKILL" \
  || note "A8 SKILL.md does not invoke scripts/scope-preflight.sh — the preflight is unwired"
grep -qF 'DOCKER_TRIAGE' "$SKILL" \
  || note "A8 SKILL.md does not branch on DOCKER_TRIAGE"

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
