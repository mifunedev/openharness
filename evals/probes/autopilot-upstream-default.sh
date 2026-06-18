#!/usr/bin/env bash
# tier: A
# source: issue #420 — future autopilots must target canonical repo, not personal fork
# desc: /autopilot and /ship-spec default GitHub operations to mifunedev/openharness,
#       resolve the matching local git remote from that repo URL (upstream here,
#       origin in fresh installs), and avoid implicit origin/current-checkout routing.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
AUTO="$ROOT/.claude/skills/autopilot/SKILL.md"
SHIP="$ROOT/.claude/skills/ship-spec/SKILL.md"
PROMPT="$ROOT/.claude/skills/ship-spec/templates/prompt.md"
missing=()

for f in "$AUTO" "$SHIP" "$PROMPT"; do
  [[ -f "$f" ]] || missing+=("missing $f")
done

if [[ -f "$AUTO" ]]; then
  grep -Fq 'AUTOPILOT_REPO="${AUTOPILOT_REPO:-mifunedev/openharness}"' "$AUTO" || missing+=("autopilot repo defaults to mifunedev/openharness")
  grep -Fq 'resolve_autopilot_remote()' "$AUTO" || missing+=("autopilot defines matching-remote resolver")
  grep -Fq 'AUTOPILOT_REMOTE="${AUTOPILOT_REMOTE:-$(resolve_autopilot_remote)}"' "$AUTO" || missing+=("autopilot remote defaults to repo-matched local remote")
  grep -Fq '[ -n "$AUTOPILOT_REMOTE" ] ||' "$AUTO" || missing+=("autopilot fails closed when no matching remote exists")
  grep -Fq 'AUTOPILOT_BASE="${AUTOPILOT_BASE:-development}"' "$AUTO" || missing+=("autopilot base defaults to development")
  grep -Fq 'gh issue list --repo "$AUTOPILOT_REPO"' "$AUTO" || missing+=("autopilot queue reads target repo")
  grep -Fq 'gh issue create --repo "$AUTOPILOT_REPO"' "$AUTO" || missing+=("autopilot research issues create in target repo")
  grep -Fq 'gh pr list --repo "$AUTOPILOT_REPO"' "$AUTO" || missing+=("autopilot PR reads target repo")
  grep -Fq 'git push "$AUTOPILOT_REMOTE" HEAD' "$AUTO" || missing+=("autopilot fallback pushes target remote")
  grep -Fq -- '--repo "$AUTOPILOT_REPO" --remote "$AUTOPILOT_REMOTE" --base "$AUTOPILOT_BASE"' "$AUTO" || missing+=("autopilot passes target repo/remote/base to ship-spec")
fi

if [[ -f "$SHIP" ]]; then
  grep -Fq 'SHIP_SPEC_REPO="${SHIP_SPEC_REPO:-mifunedev/openharness}"' "$SHIP" || missing+=("ship-spec repo defaults to mifunedev/openharness")
  grep -Fq 'resolve_ship_spec_remote()' "$SHIP" || missing+=("ship-spec defines matching-remote resolver")
  grep -Fq 'SHIP_SPEC_REMOTE="${SHIP_SPEC_REMOTE:-$(resolve_ship_spec_remote)}"' "$SHIP" || missing+=("ship-spec remote defaults to repo-matched local remote")
  grep -Fq '[ -n "$SHIP_SPEC_REMOTE" ] ||' "$SHIP" || missing+=("ship-spec fails closed when no matching remote exists")
  grep -Fq 'SHIP_SPEC_BASE="${SHIP_SPEC_BASE:-development}"' "$SHIP" || missing+=("ship-spec base defaults to development")
  grep -Fq 'gh pr create \' "$SHIP" && grep -Fq -- '--repo "$SHIP_SPEC_REPO"' "$SHIP" || missing+=("ship-spec PR creation uses target repo")
  grep -Fq 'git push -u "$SHIP_SPEC_REMOTE"' "$SHIP" || missing+=("ship-spec scaffold push uses target remote")
  grep -Fq 'gh pr ready <PR> --repo "$SHIP_SPEC_REPO"' "$SHIP" || missing+=("ship-spec undraft uses target repo")
fi

if [[ -f "$PROMPT" ]]; then
  grep -Fq ': "${SHIP_SPEC_REMOTE:?SHIP_SPEC_REMOTE must name the git remote that matches SHIP_SPEC_REPO}"' "$PROMPT" || missing+=("ralph prompt requires resolved target remote")
  grep -Fq 'git fetch "$SHIP_SPEC_REMOTE" "${SHIP_SPEC_BASE:-development}"' "$PROMPT" || missing+=("ralph prompt fetches target remote/base")
fi

# No autonomous path should depend on the personal fork literal.
if grep -R "ryaneggz/openharness" "$AUTO" "$SHIP" "$PROMPT" >/dev/null 2>&1; then
  missing+=("autonomous autopilot docs contain personal fork literal")
fi

if (( ${#missing[@]} )); then
  printf 'REGRESSION: autopilot upstream-default contract missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: future autopilot/ship-spec runs default to mifunedev/openharness and resolve the matching local remote for development" >&2
exit 0
