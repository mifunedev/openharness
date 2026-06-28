#!/usr/bin/env bash
set -euo pipefail
# tier: A
# source: issue #297 — DebugMCP MCP debug-server availability
# desc: Detect DebugMCP MCP server on :3001/mcp via an MCP initialize handshake — SKIPPED if unbound, PASS on a valid JSON-RPC initialize result, REGRESSION if bound-but-bad.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
: "$ROOT"  # repo root resolved per probe contract; runtime-only probe needs nothing under it

URL="http://127.0.0.1:3001/mcp"
HEADERS_FILE=""
BODY_FILE=""

# shellcheck disable=SC2317  # invoked indirectly via trap
cleanup() {
  if [ -n "$HEADERS_FILE" ]; then rm -f "$HEADERS_FILE" 2>/dev/null || true; fi
  if [ -n "$BODY_FILE" ]; then rm -f "$BODY_FILE" 2>/dev/null || true; fi
}
trap cleanup EXIT

# 1) Reachability + handshake in ONE request.
#    DebugMCP speaks MCP Streamable HTTP: a bare GET /mcp returns 404, so the
#    probe MUST POST a JSON-RPC `initialize` (with the SSE-capable Accept header)
#    to elicit a real response. `curl -s` returns 0 for ANY HTTP response (incl.
#    4xx/5xx) and a non-zero exit ONLY on a connect-level failure (7 = couldn't
#    connect, 28 = timeout). A connect failure is the clean-sandbox default →
#    SKIPPED, never REGRESSION. The `|| connect_rc=$?` guard keeps `set -e` from
#    aborting before exit 2.
HEADERS_FILE="$(mktemp)"
BODY_FILE="$(mktemp)"
INIT_BODY='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"openharness-probe","version":"0.0.1"}}}'
connect_rc=0
curl -s -o "$BODY_FILE" -D "$HEADERS_FILE" --max-time 5 \
  -X POST "$URL" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d "$INIT_BODY" 2>/dev/null || connect_rc=$?

if [ "$connect_rc" -ne 0 ]; then
  echo "SKIPPED port 3001 not reachable (DebugMCP server not running) — curl rc=$connect_rc" >&2
  exit 2
fi

# The server answered at the HTTP level; the port is bound. Parse the last HTTP
# status line (handles 1xx/redirect preludes), defaulting to 000 if none seen.
status="$(grep -iE '^HTTP/[0-9.]+ [0-9]{3}' "$HEADERS_FILE" 2>/dev/null | tr -d '\r' | tail -1 | awk '{print $2}' || true)"
[ -n "$status" ] || status="000"
content_type="$(grep -i '^content-type:' "$HEADERS_FILE" 2>/dev/null | tr -d '\r' | head -1 | cut -d: -f2- | tr '[:upper:]' '[:lower:]' | tr -d ' ' || true)"

# 2) PASS only on HTTP 2xx AND an MCP content-type AND a JSON-RPC initialize
#    result. The body is SSE (`data: {...}`) or plain JSON; both carry the
#    result fields, so a substring check for the MCP handshake markers suffices.
if [ "$status" -ge 200 ] && [ "$status" -lt 300 ]; then
  case "$content_type" in
    text/event-stream*|application/json*)
      if grep -qE '"(protocolVersion|serverInfo)"' "$BODY_FILE" 2>/dev/null; then
        echo "PASS DebugMCP MCP server initialized on :3001/mcp (HTTP $status, content-type=$content_type)" >&2
        exit 0
      fi
      echo "REGRESSION :3001/mcp returned HTTP $status ($content_type) but no MCP initialize result (missing protocolVersion/serverInfo)" >&2
      exit 1
      ;;
    *)
      echo "REGRESSION :3001/mcp bound but content-type '$content_type' is not MCP-consistent (expected text/event-stream or application/json)" >&2
      exit 1
      ;;
  esac
fi

# 3) Bound and responded, but not 2xx — a definite detected-bad-state.
echo "REGRESSION :3001/mcp bound but returned HTTP $status (expected 2xx from MCP initialize)" >&2
exit 1
