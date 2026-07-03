#!/usr/bin/env bash
# tier: A
# source: #523 — post-bridge live publishing requires an explicit final confirmation gate
# desc: post-bridge skill must default to draft/dry-run and require POST BRIDGE LIVE CONFIRMED before non-draft post creation
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILL="$ROOT/.oh/skills/post-bridge/SKILL.md"

if [[ ! -f "$SKILL" ]]; then
  echo "SKIPPED: post-bridge skill absent: $SKILL" >&2
  exit 2
fi

require_literal() {
  local needle="$1"
  if ! grep -Fq "$needle" "$SKILL"; then
    echo "REGRESSION: post-bridge skill missing required publish-safety text: $needle" >&2
    exit 1
  fi
}

require_literal "## Safety Gate for External Side Effects"
require_literal "POST BRIDGE LIVE CONFIRMED"
require_literal 'Use `"is_draft": true` by default'
require_literal 'Treat `POST /v1/posts` without `"is_draft": true` as irreversible'
require_literal 'destination account IDs and platforms'
require_literal 'endpoint and redacted JSON payload'

if [[ $(grep -Fc 'POST BRIDGE LIVE CONFIRMED' "$SKILL") -lt 3 ]]; then
  echo "REGRESSION: post-bridge confirmation phrase is not reinforced in workflow/examples/guidelines" >&2
  exit 1
fi

if [[ $(grep -Fc '\"is_draft\": true' "$SKILL") -lt 3 ]]; then
  echo "REGRESSION: post-bridge examples no longer default create-post payloads to draft" >&2
  exit 1
fi

echo "PASS: post-bridge live post creation is guarded by draft defaults and explicit confirmation" >&2
exit 0
