#!/usr/bin/env bash
# tier: A
# source: issue #134 — /ship-spec must finalize ready PRs after gates, not stop at draft scaffold
# desc: /ship-spec instructions and root skill table must describe draft PRs as checkpoints and ready-for-review as the successful terminal state.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SHIP="$ROOT/.claude/skills/ship-spec/SKILL.md"
AGENTS="$ROOT/AGENTS.md"
PI_SHIP="$ROOT/.pi/skills/ship-spec/SKILL.md"

[ -f "$SHIP" ] || { echo "SKIPPED: missing ship-spec skill: $SHIP" >&2; exit 2; }
[ -f "$AGENTS" ] || { echo "SKIPPED: missing AGENTS.md" >&2; exit 2; }

bad_ship=$(grep -nE 'v1 stops at draft PR|draft PR creation; loop launch|loop launch \+ CI verification stay manual|manual: `gh pr ready|manual: `/ci-status`' "$SHIP" || true)
if [[ -n "$bad_ship" ]]; then
  echo "REGRESSION: /ship-spec reintroduced draft-only/manual-finalization guidance:" >&2
  echo "$bad_ship" >&2
  exit 1
fi

for token in 'ready-for-review PR' 'Stage 13 — `gh pr ready`' 'Finalization contract' '/eval' '/ci-status'; do
  if ! grep -qF "$token" "$SHIP"; then
    echo "REGRESSION: /ship-spec missing ready-finalization token: $token" >&2
    exit 1
  fi
done

ship_line=$(grep -E '^\| `/ship-spec` \|' "$AGENTS" || true)
if [[ -z "$ship_line" ]]; then
  echo "REGRESSION: AGENTS.md missing /ship-spec skill-table row" >&2
  exit 1
fi
if grep -qE '→ draft PR[[:space:]]*\|' <<<"$ship_line"; then
  echo "REGRESSION: AGENTS.md /ship-spec row still ends at draft PR:" >&2
  echo "$ship_line" >&2
  exit 1
fi
if ! grep -q 'ready-for-review PR' <<<"$ship_line"; then
  echo "REGRESSION: AGENTS.md /ship-spec row must mention ready-for-review PR terminal state" >&2
  echo "$ship_line" >&2
  exit 1
fi

# Runtime Pi skills are symlinked to .claude/skills in this repo. If that ever stops
# being true, the Pi copy must still carry the same finalization contract.
if [[ -e "$PI_SHIP" ]] && ! grep -qF 'Finalization contract' "$PI_SHIP"; then
  echo "REGRESSION: .pi /ship-spec surface lacks the finalization contract" >&2
  exit 1
fi

echo "PASS: /ship-spec now treats draft PR as checkpoint and ready-for-review as successful terminal state" >&2
exit 0
