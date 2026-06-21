#!/usr/bin/env bash
# tier: A
# source: issue #506 — Codex previous_response_not_found RCA
# desc: Static guard that the auto-loaded Pi extension recovers non-Slack stale Codex response ids once and leaves Slack to bridge-recovery.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EXT="$ROOT/.pi/extensions/codex-stale-response-retry.ts"
TEST="$ROOT/.pi/extensions/__tests__/codex-stale-response-retry.test.ts"
SETTINGS="$ROOT/.pi/settings.json"

if [ ! -f "$EXT" ]; then
  echo "REGRESSION: missing auto-loaded Codex stale-response retry extension: $EXT" >&2
  exit 1
fi

if [ ! -f "$TEST" ]; then
  echo "REGRESSION: missing regression tests for Codex stale-response retry extension: $TEST" >&2
  exit 1
fi

if ! grep -Fq '"./extensions"' "$SETTINGS"; then
  echo "REGRESSION: .pi/settings.json must auto-load .pi/extensions" >&2
  exit 1
fi

for required in \
  "previous_response_not_found" \
  "previous response .*not found" \
  "sendUserMessage(failedText, { deliverAs: \"followUp\" })" \
  "lastRetriedText" \
  "SLACK_PREFIX_RE"; do
  if ! grep -Fq "$required" "$EXT"; then
    echo "REGRESSION: extension missing required recovery literal: $required" >&2
    exit 1
  fi
done

if ! grep -Fq "skips Slack-prefixed turns" "$TEST"; then
  echo "REGRESSION: tests must assert Slack-prefixed turns are left to bridge-recovery" >&2
  exit 1
fi

echo "PASS: codex stale-response retry extension is installed and guarded" >&2
