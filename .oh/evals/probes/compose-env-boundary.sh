#!/usr/bin/env bash
# tier: A
# source: #920 — the epic #903→#911 made the CLI provision harnesses and tools from
#         oh.json, but compose kept pushing eleven of the same settings through
#         .devcontainer/.env. That left two installers for agent-browser and Tailscale
#         with duplicated version and sha256 pins, and left flavor B silently without
#         any Hermes wiring because it never carried INSTALL_HERMES.
# desc: a value belongs in a compose environment: block only if a process OUTSIDE the
#       sandbox — or the entrypoint BEFORE the control plane is readable — must act on
#       it. Across every .devcontainer/docker-compose*.yml including overlays: no
#       INSTALL_* key, no OH_IMAGE_ONLY, and every environment: key is either rendered
#       by config-render.ts or one of the documented literals. ports: and volumes: are
#       unrestricted — that payload is the part only Docker can act on.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"; cd "$ROOT"
RENDER=".oh/cli/src/lib/config-render.ts"

shopt -s nullglob
COMPOSE=(.devcontainer/docker-compose*.yml .devcontainer/docker-compose*.yaml)
if ((${#COMPOSE[@]} == 0)); then
  echo "SKIPPED: no .devcontainer/docker-compose*.yml to check" >&2
  exit 2
fi
if [ ! -f "$RENDER" ]; then
  echo "SKIPPED: $RENDER absent — the rendered set is undefined" >&2
  exit 2
fi

# Read from the container, before oh.json is reachable through the CLI, by a process
# that never learns what oh.json is. Each needs a reason no config read can supply.
LITERALS=(
  SANDBOX_PASSWORD                      # consumed by the entrypoint's user setup
  CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS   # read by the Claude Code binary
  CC_SAFETY_NET_STRICT                  # read by the cc-safety-net binary
  CC_SAFETY_NET_WORKTREE                # read by the cc-safety-net binary
  GH_TOKEN                              # a secret, never rendered from oh.json
)

mapfile -t RENDERED < <(grep -oE 'put\("[A-Z0-9_]+"' "$RENDER" | sed 's/^put("//; s/"$//' | sort -u)
if ((${#RENDERED[@]} == 0)); then
  echo "SKIPPED: no put() calls found in $RENDER — cannot derive the rendered set" >&2
  exit 2
fi

allowed() {
  local key="$1" k
  for k in "${RENDERED[@]}"; do [ "$k" = "$key" ] && return 0; done
  for k in "${LITERALS[@]}"; do [ "$k" = "$key" ] && return 0; done
  return 1
}

missing=()

for f in "${COMPOSE[@]}"; do
  mapfile -t keys < <(awk '
    /^[[:space:]]*environment:[[:space:]]*$/ { indent = match($0, /[^ ]/); inenv = 1; next }
    inenv {
      if ($0 ~ /^[[:space:]]*$/) next
      if ($0 ~ /^[[:space:]]*#/) next
      if (match($0, /[^ ]/) <= indent) { inenv = 0; next }
      line = $0
      sub(/^[[:space:]]*-[[:space:]]*/, "", line)
      sub(/[=:].*$/, "", line)
      gsub(/[[:space:]]/, "", line)
      if (line != "") print line
    }
  ' "$f")

  for key in "${keys[@]}"; do
    case "$key" in
      INSTALL_*)
        missing+=("$f: $key — installs come from the catalogs via oh.json, never from compose")
        continue
        ;;
      OH_IMAGE_ONLY)
        missing+=("$f: OH_IMAGE_ONLY — the flavor is observable inside the container; compose must not narrate it")
        continue
        ;;
    esac
    allowed "$key" \
      || missing+=("$f: $key is neither rendered by $RENDER nor a documented literal — settings belong in oh.json, read through the oh CLI")
  done
done

if ((${#missing[@]})); then
  printf 'REGRESSION: %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "PASS: every compose environment: key across ${#COMPOSE[@]} file(s) is host-side or pre-control-plane; installs and settings stay in oh.json" >&2
