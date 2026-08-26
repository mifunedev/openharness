#!/usr/bin/env bash
# tier: A
# source: issue #420 — future autopilots must target canonical repo, not personal fork
# desc: /autopilot and /spec execute default GitHub operations to mifunedev/openharness,
#       resolve the matching local git remote from that repo URL (upstream here,
#       origin in fresh installs), and avoid implicit origin/current-checkout routing.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
AUTO="$ROOT/.claude/skills/autopilot/SKILL.md"
SPEC="$ROOT/.claude/skills/spec/references/execute.md"
missing=()

for f in "$AUTO" "$SPEC"; do
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
  # Autopilot no longer pushes: /spec execute owns the whole build including the push,
  # so the target-remote guarantee moves with it (asserted on $SPEC below). What
  # autopilot must still do is hand the resolved target through rather than let gh
  # or git resolve it implicitly.
  grep -Fq 'git push "$AUTOPILOT_REMOTE" HEAD' "$AUTO" && missing+=("autopilot pushes directly again — the build, and its push, belong to /spec execute")
  grep -Fq -- '--repo "$AUTOPILOT_REPO" --remote "$AUTOPILOT_REMOTE" --base "$AUTOPILOT_BASE"' "$AUTO" || missing+=("autopilot passes target repo/remote/base to /spec")
fi

if [[ -f "$SPEC" ]]; then
  grep -Fq 'SPEC_REPO="${SPEC_REPO:-mifunedev/openharness}"' "$SPEC" || missing+=("/spec execute repo defaults to mifunedev/openharness")
  grep -Fq 'resolve_spec_remote()' "$SPEC" || missing+=("/spec execute defines matching-remote resolver")
  grep -Fq 'SPEC_REMOTE="${SPEC_REMOTE:-$(resolve_spec_remote)}"' "$SPEC" || missing+=("/spec execute remote defaults to repo-matched local remote")
  grep -Fq '[ -n "$SPEC_REMOTE" ] ||' "$SPEC" || missing+=("/spec execute fails closed when no matching remote exists")
  grep -Fq 'SPEC_BASE="${SPEC_BASE:-development}"' "$SPEC" || missing+=("/spec execute base defaults to development")
  # Scoped per invocation: `--repo "$SPEC_REPO"` appears several times in the file, so an
  # unscoped conjunction stays green after ONE call loses its --repo and starts resolving
  # the repo implicitly (which is exactly how a PR lands on a fork). Take the 6 lines that
  # follow each verb — the whole flag list of both invocations fits inside that window.
  for verb in 'gh pr create' 'gh issue create'; do
    block="$(grep -A6 -F "$verb" "$SPEC")"
    if [[ -z "$block" ]]; then
      missing+=("/spec execute no longer contains a '$verb' invocation")
    elif ! grep -Fq -- '--repo "$SPEC_REPO"' <<<"$block"; then
      missing+=("/spec execute's '$verb' does not pass --repo \"\$SPEC_REPO\" (it would resolve the repo implicitly)")
    fi
  done
  grep -Fq 'git push -u "$SPEC_REMOTE"' "$SPEC" || missing+=("/spec execute scaffold push uses target remote")
  grep -Fq 'gh pr ready <PR> --repo "$SPEC_REPO"' "$SPEC" || missing+=("/spec execute undraft uses target repo")
  grep -Fq 'git push "$SPEC_REMOTE" HEAD' "$SPEC" || missing+=("/spec execute pre-audit push uses target remote")
fi

# The build session prompt is deliberately NOT checked for remote pinning: the one
# build executor commits locally and never pushes, so it has no remote to get wrong.
# Every remote-bearing operation lives in /spec execute, asserted above.

# No autonomous path should depend on the personal fork literal.
if grep -R "ryaneggz/openharness" "$AUTO" "$SPEC" >/dev/null 2>&1; then
  missing+=("autonomous autopilot docs contain personal fork literal")
fi

if (( ${#missing[@]} )); then
  printf 'REGRESSION: autopilot upstream-default contract missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: future autopilot / spec execute runs default to mifunedev/openharness and resolve the matching local remote for development" >&2
exit 0
