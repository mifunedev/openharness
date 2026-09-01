#!/usr/bin/env bash

set -euo pipefail

SANDBOX_USER="sandbox"
OH_BIN="${OH_BIN:-oh}"

MODE="provision"
case "${1:-}" in
  --verify) MODE="verify" ;;
  "")       ;;
  *) echo "usage: $(basename "$0") [--verify]" >&2; exit 2 ;;
esac

log() { echo "[provision-defaults] $*"; }

# entrypoint.sh downgrades a failure here to a WARNING and lets boot continue, so
# a sandbox can come up `healthy` with a harness or tool the operator explicitly
# asked for simply absent. This marker is how that reaches the healthcheck: it is
# written when a requested install is missing and removed on a clean run, so
# `bash .oh/scripts/provision-defaults.sh` is both the documented recovery and the
# thing that clears the signal.
PROVISION_MARKER="${OH_PROVISION_MARKER:-$HOME/.local/share/oh/provision-failed}"

mark_failed() {
  mkdir -p "$(dirname "$PROVISION_MARKER")" 2>/dev/null || return 0
  printf '%s\n' "$*" >"$PROVISION_MARKER" 2>/dev/null || true
}

clear_marker() {
  rm -f "$PROVISION_MARKER" 2>/dev/null || true
}

die() {
  echo "[provision-defaults] ERROR: $1" >&2
  shift
  for line in "$@"; do echo "[provision-defaults]   $line" >&2; done
  exit 1
}

inside_sandbox() {
  case "${OH_EXECUTION_TARGET:-}" in
    local)          return 0 ;;
    docker-compose) return 1 ;;
  esac
  [ -f /.dockerenv ] && [ -n "${SANDBOX_NAME:-}" ]
}

inside_sandbox || die \
  "this provisions /home/$SANDBOX_USER/.local inside the sandbox and must not run on the host" \
  "open a sandbox shell first:" \
  "  oh shell" \
  "  bash .oh/scripts/provision-defaults.sh"

export OH_EXECUTION_TARGET=local

if [ "$(id -u)" = "0" ]; then
  if ! id "$SANDBOX_USER" >/dev/null 2>&1; then
    die "user '$SANDBOX_USER' does not exist" \
        "this script provisions the sandbox image's agent user; rebuild the image:" \
        "  oh sandbox"
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
  exec su "$SANDBOX_USER" -s /bin/bash -c "HOME='$USER_HOME' OH_EXECUTION_TARGET=local '$0' $*"
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

command -v "$OH_BIN" >/dev/null 2>&1 || die \
  "the oh CLI is not on PATH as '$OH_BIN'" \
  "the image installs it to /usr/local/bin/oh; rebuild the sandbox image:" \
  "  oh sandbox"

command -v jq >/dev/null 2>&1 || die \
  "jq is not on PATH" \
  "the image installs it with apt; rebuild the sandbox image:" \
  "  oh sandbox"

# Both catalogs answer the same question — "what does a working sandbox need that
# is not in the image?" — and get the same policy: install what is missing, never
# replace what is already there. The catalogs are the only source of truth for
# the list, so this script never names a package.
missing=()
failed=()
provisioned=0

provision_catalog() {
  local noun="$1" cmd="$2" catalog="$3"
  local states defaults wanted id installed

  # The full listing, not --defaults: an operator who set install.<key> in
  # oh.json declared intent that a fresh home mount must honour too, and
  # `enabled` is computed from oh.json rather than the environment.
  if ! states="$("$OH_BIN" "$cmd" list --json 2>/dev/null)" || [ -z "$states" ]; then
    die "'$OH_BIN $cmd list --json' produced no catalog" \
        "the CLI at $(command -v "$OH_BIN") predates \`oh $cmd\`; the catalog" \
        "is the only source of truth for what to install, so there is nothing to provision." \
        "rebuild the sandbox image from this control plane:" \
        "  oh sandbox"
  fi

  defaults="$(jq -r '.[] | select(.kind == "default") | "\(.id)\t\(.installed)"' <<<"$states")"
  [ -n "$defaults" ] || die \
    "the $noun catalog declares no defaults" \
    "check $catalog"

  # Opted-in extras ride along; absent any, this is empty and nothing changes.
  wanted="$(jq -r '.[] | select(.kind != "default" and .enabled == true) | "\(.id)\t\(.installed)"' <<<"$states")"
  [ -n "$wanted" ] && defaults="$defaults"$'\n'"$wanted"

  while IFS=$'\t' read -r id installed; do
    [ -n "$id" ] || continue
    provisioned=$((provisioned + 1))
    if [ "$installed" = "true" ]; then
      log "OK  $id present (unpinned — an existing install is never replaced)"
      continue
    fi
    if [ "$MODE" = "verify" ]; then
      missing+=("$id")
      continue
    fi
    log "installing $id into $NPM_USER_PREFIX"
    if "$OH_BIN" "$cmd" install "$id" --no-persist </dev/null; then
      log "OK  $id installed"
    else
      failed+=("$id")
    fi
  done <<<"$defaults"
}

provision_catalog harness harness .oh/cli/src/lib/harnesses/catalog.ts
provision_catalog tool    tool    .oh/cli/src/lib/tools/catalog.ts

if ((provisioned == 0)); then
  die "neither catalog declared a default to provision" \
      "this would report success without installing anything; check" \
      "  .oh/cli/src/lib/harnesses/catalog.ts" \
      "  .oh/cli/src/lib/tools/catalog.ts"
fi

if [ "$MODE" = "verify" ] && ((${#missing[@]})); then
  mark_failed "not installed: ${missing[*]}"
  die "defaults are not installed: ${missing[*]}" \
      "run inside the sandbox (\`oh shell\` from the host):" \
      "  bash .oh/scripts/provision-defaults.sh"
fi

if ((${#failed[@]})); then
  mark_failed "failed to install: ${failed[*]}"
  die "failed to install: ${failed[*]}" \
      "each install runs as '$SANDBOX_USER' into $NPM_USER_PREFIX; a network outage is the usual cause." \
      "re-run inside the sandbox once it has network:" \
      "  bash .oh/scripts/provision-defaults.sh"
fi

clear_marker

if [ "$MODE" = "verify" ]; then
  log "OK  all $provisioned default harnesses and tools present under $NPM_USER_PREFIX"
else
  log "OK  all $provisioned default harnesses and tools provisioned under $NPM_USER_PREFIX"
fi
