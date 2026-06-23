#!/usr/bin/env bash
set -euo pipefail
# tier: A
# source: issue #297 — DebugMCP MCP debug-server availability
# desc: Detect DebugMCP MCP server on :3001/mcp — SKIPPED if unbound, PASS if 2xx+MCP content-type, REGRESSION if bound-but-bad.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
: "$ROOT"  # repo root resolved per probe contract; runtime-only probe needs nothing under it

URL="http://127.0.0.1:3001/mcp"
HEADERS_FILE=""

# shellcheck disable=SC2317  # invoked indirectly via trap
cleanup() {
  if [ -n "$HEADERS_FILE" ]; then
    rm -f "$HEADERS_FILE" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# 1) Reachability — is anything bound on :3001?
#    `curl -s` returns 0 for ANY HTTP response (incl. 4xx/5xx) and a non-zero
#    exit ONLY on a connect-level failure (7 = couldn't connect, 28 = timeout).
#    A connect failure is the clean-sandbox default → SKIPPED, never REGRESSION.
#    The `|| connect_rc=$?` guard keeps `set -e` from aborting before exit 2.
HEADERS_FILE="$(mktemp)"
connect_rc=0
curl -s -o /dev/null -D "$HEADERS_FILE" --max-time 5 "$URL" 2>/dev/null || connect_rc=$?

if [ "$connect_rc" -ne 0 ]; then
  echo "SKIPPED port 3001 not reachable (DebugMCP server not running) — curl rc=$connect_rc" >&2
  exit 2
fi

# The server answered at the HTTP level; the port is bound. Parse the status
# from the last HTTP status line in the dumped headers (handles 1xx/redirect
# preludes), defaulting to 000 if none was captured.
status="$(grep -iE '^HTTP/[0-9.]+ [0-9]{3}' "$HEADERS_FILE" 2>/dev/null | tr -d '\r' | tail -1 | awk '{print $2}' || true)"
[ -n "$status" ] || status="000"
content_type="$(grep -i '^content-type:' "$HEADERS_FILE" 2>/dev/null | tr -d '\r' | head -1 | cut -d: -f2- | tr '[:upper:]' '[:lower:]' | tr -d ' ' || true)"

# 2) PASS only on HTTP 2xx AND a DebugMCP-consistent content-type.
if [ "$status" -ge 200 ] && [ "$status" -lt 300 ]; then
  case "$content_type" in
    text/event-stream*|application/json*)
      echo "PASS DebugMCP server reachable on :3001/mcp (HTTP $status, content-type=$content_type)" >&2
      exit 0
      ;;
    *)
      echo "REGRESSION :3001/mcp bound but content-type '$content_type' is not DebugMCP-consistent (expected text/event-stream or application/json)" >&2
      exit 1
      ;;
  esac
fi

# 3) Bound and responded, but not 2xx — a definite detected-bad-state.
echo "REGRESSION :3001/mcp bound but returned HTTP $status (expected 2xx)" >&2
exit 1
