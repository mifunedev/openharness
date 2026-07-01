#!/usr/bin/env bash
set -euo pipefail

: "${PORT:=3000}"
export PORT
export OPENHARNESS_HOSTED_MODE="${OPENHARNESS_HOSTED_MODE:-railway}"
export OH_PROJECT_ROOT="${OH_PROJECT_ROOT:-/home/sandbox/harness}"

cd "$OH_PROJECT_ROOT"

if ! command -v oh >/dev/null 2>&1; then
  echo "WARN: oh CLI is not on PATH; hosted status page will still start" >&2
fi

echo "Open Harness hosted-smoke mode starting on 0.0.0.0:${PORT}" >&2
echo "Railway mode does not provide a host Docker socket; use local Docker/devcontainer for full sandbox lifecycle." >&2

exec node .oh/deploy/railway/status-server.mjs
