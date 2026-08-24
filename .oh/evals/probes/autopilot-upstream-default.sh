#!/usr/bin/env bash
# tier: A
# source: issue #420 — future autopilots must target canonical repo, not personal fork
# desc: /autopilot and /ship-spec default GitHub operations to mifunedev/openharness,
#       resolve the matching local git remote from that repo URL (upstream here,
#       origin in fresh installs), and avoid implicit origin/current-checkout routing.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
AUTO="$ROOT/.claude/skills/autopilot/SKILL.md"
SHIP="$ROOT/.claude/skills/ship-spec/SKILL.md"
missing=()

for f in "$AUTO" "$SHIP"; do
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
  # Autopilot no longer pushes: /ship-spec owns the whole build including the push,
  # so the target-remote guarantee moves with it (asserted on $SHIP below). What
  # autopilot must still do is hand the resolved target through rather than let gh
  # or git resolve it implicitly.
  grep -Fq 'git push "$AUTOPILOT_REMOTE" HEAD' "$AUTO" && missing+=("autopilot pushes directly again — the build, and its push, belong to /ship-spec")
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
  grep -Fq 'git push "$SHIP_SPEC_REMOTE" HEAD' "$SHIP" || missing+=("ship-spec pre-audit push uses target remote")
fi

# The build session prompt is deliberately NOT checked for remote pinning: the one
# build executor commits locally and never pushes, so it has no remote to get wrong.
# Every remote-bearing operation lives in /ship-spec, asserted above.

# No autonomous path should depend on the personal fork literal.
if grep -R "ryaneggz/openharness" "$AUTO" "$SHIP" >/dev/null 2>&1; then
  missing+=("autonomous autopilot docs contain personal fork literal")
fi

if (( ${#missing[@]} )); then
  printf 'REGRESSION: autopilot upstream-default contract missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: future autopilot/ship-spec runs default to mifunedev/openharness and resolve the matching local remote for development" >&2
exit 0
