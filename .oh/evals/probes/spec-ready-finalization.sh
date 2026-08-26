#!/usr/bin/env bash
# tier: A
# source: issue #134 — the build path must finalize ready PRs after gates, not stop at a draft
#         scaffold. Repointed by spec-simplification US-003 (issue #816) when /ship-spec was
#         absorbed into /spec execute and deleted; the rule moved with the mechanics it guards.
# desc: /spec execute's instructions and the AGENTS.md skill table must describe draft PRs as
#       checkpoints and ready-for-review as the successful terminal state.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
EXEC="$ROOT/.claude/skills/spec/references/execute.md"
AGENTS="$ROOT/AGENTS.md"
PI_EXEC="$ROOT/.pi/skills/spec/references/execute.md"

[ -f "$EXEC" ] || { echo "SKIPPED: missing /spec execute procedure: $EXEC" >&2; exit 2; }
[ -f "$AGENTS" ] || { echo "SKIPPED: missing AGENTS.md" >&2; exit 2; }

bad_exec=$(grep -nE 'stops at draft PR|draft PR creation; loop launch|launch \+ CI verification stay manual|manual: `gh pr ready|manual: `/ci-status`' "$EXEC" || true)
if [[ -n "$bad_exec" ]]; then
  echo "REGRESSION: /spec execute reintroduced draft-only/manual-finalization guidance:" >&2
  echo "$bad_exec" >&2
  exit 1
fi

for token in 'ready-for-review' 'gh pr ready' 'Finalization contract' '/eval' '/ci-status' 'observability checkpoint'; do
  if ! grep -qF "$token" "$EXEC"; then
    echo "REGRESSION: /spec execute missing ready-finalization token: $token" >&2
    exit 1
  fi
done

final_section="$(awk '/^### [0-9]+\. Promotable gate/{f=1} f' "$EXEC")"
if [[ -z "$final_section" ]]; then
  echo "REGRESSION: /spec execute has no 'Promotable gate → undraft' section" >&2
  exit 1
fi
if ! grep -qE 'ready[^.]*\*\*only\*\* when|only when .*promotable|only if it is classified promotable' <<<"$final_section"; then
  echo "REGRESSION: /spec execute's gh pr ready is no longer gated on the promotable classification" >&2
  exit 1
fi
if ! grep -qF 'gh pr ready' <<<"$final_section"; then
  echo "REGRESSION: /spec execute's finalization section no longer performs the undraft" >&2
  exit 1
fi
if ! grep -qF 'Never `gh pr merge`' <<<"$final_section"; then
  echo "REGRESSION: /spec execute's finalization section no longer forbids gh pr merge" >&2
  exit 1
fi

if ! grep -qF 'evidence.md' <<<"$final_section"; then
  echo "REGRESSION: /spec execute's merge gate no longer requires .oh/tasks/<slug>/evidence.md" >&2
  exit 1
fi
if ! grep -qE 'Refuse the undraft|left draft[^|]*evidence\.md is missing' <<<"$final_section"; then
  echo "REGRESSION: /spec execute mentions evidence.md but no longer REFUSES the undraft without it" >&2
  exit 1
fi
if ! grep -qF 'git ls-files --error-unmatch' <<<"$final_section"; then
  echo "REGRESSION: /spec execute's evidence gate no longer verifies evidence.md is TRACKED (gitignored path)" >&2
  exit 1
fi
for section in 'diverged' 'unverified'; do
  if ! grep -qi "$section" <<<"$final_section"; then
    echo "REGRESSION: /spec execute's PR body no longer carries the '$section' section" >&2
    exit 1
  fi
done

spec_line=$(grep -E '^\| `/spec` \|' "$AGENTS" || true)
if [[ -z "$spec_line" ]]; then
  echo "REGRESSION: AGENTS.md missing /spec skill-table row" >&2
  exit 1
fi
if grep -qE '→ draft PR[[:space:]]*\|' <<<"$spec_line"; then
  echo "REGRESSION: AGENTS.md /spec row still ends at draft PR:" >&2
  echo "$spec_line" >&2
  exit 1
fi
if ! grep -qE 'ready PR|ready-for-review' <<<"$spec_line"; then
  echo "REGRESSION: AGENTS.md /spec row must name the ready PR terminal state" >&2
  echo "$spec_line" >&2
  exit 1
fi

if [[ -e "$PI_EXEC" ]] && ! grep -qF 'Finalization contract' "$PI_EXEC"; then
  echo "REGRESSION: .pi /spec execute surface lacks the finalization contract" >&2
  exit 1
fi

echo "PASS: /spec execute treats the draft PR as a checkpoint, refuses the undraft without a tracked evidence.md, surfaces divergence + unverified in the PR body, and gates ready-for-review on the promotable classification" >&2
exit 0
