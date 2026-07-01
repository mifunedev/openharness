#!/usr/bin/env bash
# tier: A
# source: issue #531 Phase 1 (OH_PROJECT_ROOT project-root seam) 2026-06-26
# desc: Guards the OH_PROJECT_ROOT project-root seam — #531 Phase 1
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
# Phase 2 slice 2 (#531) relocated these build assets from .devcontainer/ to .oh/devcontainer/.
COMPOSE="$ROOT/.oh/devcontainer/docker-compose.yml"
DOCKERFILE="$ROOT/.oh/devcontainer/Dockerfile"
ENTRYPOINT="$ROOT/.oh/devcontainer/entrypoint.sh"

[[ -f "$COMPOSE" ]]    || { echo "SKIPPED: missing $COMPOSE" >&2; exit 2; }
[[ -f "$DOCKERFILE" ]] || { echo "SKIPPED: missing $DOCKERFILE" >&2; exit 2; }
[[ -f "$ENTRYPOINT" ]] || { echo "SKIPPED: missing $ENTRYPOINT" >&2; exit 2; }

missing=()

# --- docker-compose.yml: OH_PROJECT_ROOT as build arg AND as env ---
grep -qE 'OH_PROJECT_ROOT:' "$COMPOSE" \
  || missing+=("compose: OH_PROJECT_ROOT build arg missing")
grep -qE 'OH_PROJECT_ROOT=' "$COMPOSE" \
  || missing+=("compose: OH_PROJECT_ROOT env var missing")

# --- Dockerfile: ARG + ENV so it persists to entrypoint and interactive shells ---
grep -qF 'ARG OH_PROJECT_ROOT=' "$DOCKERFILE" \
  || missing+=("Dockerfile: ARG OH_PROJECT_ROOT= missing")
grep -qF 'ENV OH_PROJECT_ROOT' "$DOCKERFILE" \
  || missing+=("Dockerfile: ENV OH_PROJECT_ROOT missing")

# --- entrypoint.sh: seam definition ---
grep -qF "OH_PROJECT_ROOT=\"\${OH_PROJECT_ROOT:-/home/sandbox/harness}\"" "$ENTRYPOINT" \
  || missing+=("entrypoint: OH_PROJECT_ROOT seam definition missing")

# --- entrypoint.sh: HARNESS alias chains through the seam, not a bare literal ---
grep -qF "HARNESS=\"\${HARNESS:-\$OH_PROJECT_ROOT}\"" "$ENTRYPOINT" \
  || missing+=("entrypoint: HARNESS alias must be \${HARNESS:-\$OH_PROJECT_ROOT}")

if (( ${#missing[@]} )); then
  printf 'REGRESSION: project-root-seam contract missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

# Negative guard: no unconditional bare HARNESS=/home/sandbox/harness assignment.
# Excludes:
#   - comment lines    (grep -vE '^[[:space:]]*#')
#   - conditional-default forms containing :-  (grep -vE ':-')
# The two Dockerfile single-quoted JSON exceptions do not assign HARNESS at all,
# so they cannot trigger this guard.
bare_harness=$(grep -vE '^[[:space:]]*#' "$ENTRYPOINT" \
  | grep -E "HARNESS=['\"]?/home/sandbox/harness" \
  | grep -vE ':-' || true)
if [[ -n "$bare_harness" ]]; then
  echo "REGRESSION: entrypoint.sh has a bare unconditional HARNESS=/home/sandbox/harness (defeats the seam)" >&2
  exit 1
fi

echo "PASS: OH_PROJECT_ROOT project-root seam defined in compose, Dockerfile, and entrypoint; HARNESS alias chains through the seam" >&2
exit 0
