#!/usr/bin/env bash

set -euo pipefail

SANDBOX_USER="${OH_SANDBOX_USER:-sandbox}"
OH_BIN="${OH_BIN:-oh}"

MODE="provision"
case "${1:-}" in
  --verify) MODE="verify" ;;
  "")       ;;
  *) echo "usage: $(basename "$0") [--verify]" >&2; exit 2 ;;
esac

log() { echo "[provision-harnesses] $*"; }

die() {
  echo "[provision-harnesses] ERROR: $1" >&2
  shift
  for line in "$@"; do echo "[provision-harnesses]   $line" >&2; done
  exit 1
}

if [ "$(id -u)" = "0" ]; then
  if ! id "$SANDBOX_USER" >/dev/null 2>&1; then
    die "user '$SANDBOX_USER' does not exist" \
        "set OH_SANDBOX_USER to the in-container agent user."
  fi
  USER_HOME=$(getent passwd "$SANDBOX_USER" | cut -d: -f6)
  [ -n "$USER_HOME" ] || die "cannot resolve home directory for '$SANDBOX_USER'"

  install -d -o "$SANDBOX_USER" -g "$SANDBOX_USER" \
    "$USER_HOME/.local" \
    "$USER_HOME/.local/bin" \
    "$USER_HOME/.local/lib" \
    "$USER_HOME/.npm" 2>/dev/null || true

  if command -v gosu >/dev/null 2>&1; then
    exec gosu "$SANDBOX_USER" env HOME="$USER_HOME" "$0" "$@"
  fi
  exec su "$SANDBOX_USER" -s /bin/bash -c "HOME='$USER_HOME' '$0' $*"
fi

HOME="${HOME:-$(getent passwd "$(id -u)" | cut -d: -f6)}"
export HOME

NPM_USER_PREFIX="${NPM_USER_PREFIX:-$HOME/.local}"
export NPM_USER_PREFIX
export PATH="$NPM_USER_PREFIX/bin:$PATH"

check_writable() {
  local dir="$1"
  if [ ! -d "$dir" ]; then
    mkdir -p "$dir" 2>/dev/null && return 0
    local parent; parent=$(dirname "$dir")
    die "cannot create $dir (parent $parent is owned by $(stat -c '%U:%G' "$parent" 2>/dev/null || echo unknown))" \
        "this is an ownership bug in provisioning, not something to fix with 'sudo npm' —" \
        "a root-owned harness under $NPM_USER_PREFIX is unusable by the '$SANDBOX_USER' user." \
        "repair from the host or as root:" \
        "  docker exec -u root <container> chown -R $SANDBOX_USER:$SANDBOX_USER $parent"
  fi
  if [ ! -w "$dir" ]; then
    die "$dir is not writable by $(id -un) (owned by $(stat -c '%U:%G' "$dir" 2>/dev/null || echo unknown))" \
        "do not work around this with 'sudo npm' — it installs under /usr/lib/node_modules," \
        "which no running sandbox can upgrade in place." \
        "repair from the host or as root:" \
        "  docker exec -u root <container> chown -R $SANDBOX_USER:$SANDBOX_USER $dir"
  fi
}

for d in "$NPM_USER_PREFIX" "$NPM_USER_PREFIX/bin" "$NPM_USER_PREFIX/lib" "$HOME/.npm"; do
  [ "$MODE" = "verify" ] && [ ! -d "$d" ] && continue
  check_writable "$d"
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
export OH_EXECUTION_TARGET="${OH_EXECUTION_TARGET:-local}"

command -v "$OH_BIN" >/dev/null 2>&1 || die \
  "the oh CLI is not on PATH as '$OH_BIN'" \
  "the image installs it to /usr/local/bin/oh; rebuild the sandbox image:" \
  "  oh sandbox"

command -v jq >/dev/null 2>&1 || die \
  "jq is not on PATH" \
  "the image installs it with apt; rebuild the sandbox image:" \
  "  oh sandbox"

STATES=""
if ! STATES="$("$OH_BIN" harness list --json 2>/dev/null)" || [ -z "$STATES" ]; then
  die "'$OH_BIN harness list --json' produced no catalog" \
      "the CLI at $(command -v "$OH_BIN") predates \`oh harness\`; the harness catalog" \
      "is the only source of truth for what to install, so there is nothing to provision." \
      "rebuild the sandbox image from this control plane:" \
      "  oh sandbox"
fi

DEFAULTS="$(jq -r '.[] | select(.kind == "default") | "\(.id)\t\(.installed)"' <<<"$STATES")"
[ -n "$DEFAULTS" ] || die \
  "the harness catalog declares no default harnesses" \
  "check .oh/cli/src/lib/harnesses/catalog.ts"

missing=()
failed=()

while IFS=$'\t' read -r id installed; do
  [ -n "$id" ] || continue
  if [ "$installed" = "true" ]; then
    log "OK  $id present (unpinned — an existing install is never replaced)"
    continue
  fi
  if [ "$MODE" = "verify" ]; then
    missing+=("$id")
    continue
  fi
  log "installing $id into $NPM_USER_PREFIX"
  if "$OH_BIN" harness install "$id" --no-persist; then
    log "OK  $id installed"
  else
    failed+=("$id")
  fi
done <<<"$DEFAULTS"

if [ "$MODE" = "verify" ] && ((${#missing[@]})); then
  die "default harnesses are not installed: ${missing[*]}" \
      "run: bash .oh/scripts/provision-harnesses.sh"
fi

if ((${#failed[@]})); then
  die "failed to install: ${failed[*]}" \
      "each install runs as '$SANDBOX_USER' into $NPM_USER_PREFIX; a network outage is the usual cause." \
      "re-run once the sandbox has network:" \
      "  bash .oh/scripts/provision-harnesses.sh"
fi

log "OK  default harnesses provisioned under $NPM_USER_PREFIX"
