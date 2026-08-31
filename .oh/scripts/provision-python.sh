#!/usr/bin/env bash

set -euo pipefail

SANDBOX_USER="${OH_SANDBOX_USER:-sandbox}"
PY_VERSION="${OH_PYTHON_VERSION:-3.11}"

MODE="provision"
case "${1:-}" in
  --verify)    MODE="verify" ;;
  --print-env) MODE="print-env" ;;
  "")          ;;
  *) echo "usage: $(basename "$0") [--verify|--print-env]" >&2; exit 2 ;;
esac

log()  { echo "[provision-python] $*"; }
warn() { echo "[provision-python] WARNING: $*" >&2; }

die() {
  echo "[provision-python] ERROR: $1" >&2
  shift
  for line in "$@"; do echo "[provision-python]   $line" >&2; done
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
    "$USER_HOME/.local/share" \
    "$USER_HOME/.local/share/uv" \
    "$USER_HOME/.local/share/uv/tools" \
    "$USER_HOME/.local/share/uv/python" \
    "$USER_HOME/.cache" \
    "$USER_HOME/.cache/uv" 2>/dev/null || true

  for d in "$USER_HOME/.local/share/uv" "$USER_HOME/.cache/uv"; do
    [ -d "$d" ] && chown -R "$(id -u "$SANDBOX_USER"):$(id -g "$SANDBOX_USER")" "$d" 2>/dev/null || true
  done

  if command -v gosu >/dev/null 2>&1; then
    exec gosu "$SANDBOX_USER" env HOME="$USER_HOME" "$0" "$@"
  fi
  exec su "$SANDBOX_USER" -s /bin/bash -c "HOME='$USER_HOME' '$0' $*"
fi

HOME="${HOME:-$(getent passwd "$(id -u)" | cut -d: -f6)}"
export HOME

export UV_PYTHON_INSTALL_DIR="${UV_PYTHON_INSTALL_DIR:-$HOME/.local/share/uv/python}"
export UV_CACHE_DIR="${UV_CACHE_DIR:-$HOME/.cache/uv}"
export UV_TOOL_DIR="${UV_TOOL_DIR:-$HOME/.local/share/uv/tools}"
export UV_TOOL_BIN_DIR="${UV_TOOL_BIN_DIR:-$HOME/.local/bin}"

KERNEL_HOME="${OH_PYTHON_KERNEL_HOME:-$HOME/.local/share/oh/kernel}"
KERNEL_PYTHON="$KERNEL_HOME/bin/python"
KERNEL_PACKAGES="${OH_PYTHON_KERNEL_PACKAGES:-ipykernel}"
ENV_FILE="$HOME/.local/share/oh/python-env.sh"

if [ "$MODE" = "print-env" ]; then
  printf 'export UV_PYTHON_INSTALL_DIR=%s\n' "$UV_PYTHON_INSTALL_DIR"
  printf 'export UV_CACHE_DIR=%s\n' "$UV_CACHE_DIR"
  exit 0
fi

command -v uv >/dev/null 2>&1 || die \
  "uv is not on PATH" \
  "the image installs it to /usr/local/bin/uv; rebuild the sandbox image:" \
  "  oh sandbox"

check_writable() {
  local dir="$1"
  if [ ! -d "$dir" ]; then
    mkdir -p "$dir" 2>/dev/null && return 0
    local parent; parent=$(dirname "$dir")
    die "cannot create $dir (parent $parent is owned by $(stat -c '%U:%G' "$parent" 2>/dev/null || echo unknown))" \
        "this is an ownership bug in provisioning, not something to fix with 'sudo uv' —" \
        "a root-owned interpreter is unusable by the '$SANDBOX_USER' user." \
        "repair from the host or as root:" \
        "  docker exec -u root <container> chown -R $SANDBOX_USER:$SANDBOX_USER $parent"
    fi
  if [ ! -w "$dir" ]; then
    die "$dir is not writable by $(id -un) (owned by $(stat -c '%U:%G' "$dir" 2>/dev/null || echo unknown))" \
        "do not work around this with 'sudo uv' — it installs under /root/.local," \
        "which the '$SANDBOX_USER' agent cannot read." \
        "repair from the host or as root:" \
        "  docker exec -u root <container> chown -R $SANDBOX_USER:$SANDBOX_USER $dir"
  fi
}

for d in "$HOME/.local/share/uv" "$UV_PYTHON_INSTALL_DIR" "$HOME/.cache" "$UV_CACHE_DIR" "$UV_TOOL_BIN_DIR"; do
  [ "$MODE" = "verify" ] && [ ! -d "$d" ] && continue
  check_writable "$d"
done

uv_python_path() {
  uv python find --managed-python "$PY_VERSION" 2>/dev/null | head -1
}

if [ "$MODE" = "provision" ]; then
  log "ensuring managed Python $PY_VERSION in $UV_PYTHON_INSTALL_DIR"
  uv python install "$PY_VERSION" \
    || die "uv python install $PY_VERSION failed" \
           "UV_PYTHON_INSTALL_DIR=$UV_PYTHON_INSTALL_DIR must exist and be writable by $(id -un)." \
           "do not retry with sudo — that installs under /root/.local."
fi

PY_PATH="$(uv_python_path)"
[ -n "$PY_PATH" ] || die \
  "no uv-managed Python $PY_VERSION available to $(id -un)" \
  "run: bash .oh/scripts/provision-python.sh"
[ -x "$PY_PATH" ] || die "Python $PY_VERSION at $PY_PATH is not executable by $(id -un)"

case "$PY_PATH" in
  /root/*) die "Python $PY_VERSION resolved to $PY_PATH, which is under /root" \
               "this is the 'sudo uv' failure mode; remove the root install and re-run:" \
               "  bash .oh/scripts/provision-python.sh" ;;
esac

if [ "$MODE" = "provision" ]; then
  if [ ! -x "$KERNEL_PYTHON" ]; then
    log "creating kernel venv at $KERNEL_HOME"
    mkdir -p "$(dirname "$KERNEL_HOME")"
    uv venv --python "$PY_PATH" "$KERNEL_HOME" \
      || die "failed to create the kernel venv at $KERNEL_HOME"
  fi

  # shellcheck disable=SC2086 # KERNEL_PACKAGES is an intentional argv fragment.
  log "installing kernel packages: $KERNEL_PACKAGES"
  uv pip install --python "$KERNEL_PYTHON" $KERNEL_PACKAGES \
    || die "failed to install kernel packages into $KERNEL_HOME" \
           "packages requested: $KERNEL_PACKAGES" \
           "override the list with OH_PYTHON_KERNEL_PACKAGES if a spec is unavailable."

  mkdir -p "$(dirname "$ENV_FILE")"
  cat > "$ENV_FILE" <<ENVEOF
# Generated by .oh/scripts/provision-python.sh — do not edit by hand.
export UV_PYTHON_INSTALL_DIR="$UV_PYTHON_INSTALL_DIR"
export UV_CACHE_DIR="$UV_CACHE_DIR"
export UV_TOOL_DIR="$UV_TOOL_DIR"
export UV_TOOL_BIN_DIR="$UV_TOOL_BIN_DIR"
ENVEOF
fi

[ -x "$KERNEL_PYTHON" ] || die \
  "kernel interpreter missing at $KERNEL_PYTHON" \
  "run: bash .oh/scripts/provision-python.sh"

"$KERNEL_PYTHON" -c "import ipykernel" >/dev/null 2>&1 \
  || die "kernel environment is incomplete — ipykernel is not importable by $KERNEL_PYTHON" \
         "run: bash .oh/scripts/provision-python.sh"

for spec in $KERNEL_PACKAGES; do
  mod="${spec%%[<>=!\[]*}"
  mod="${mod//-/_}"
  [ "$mod" = "ipykernel" ] && continue
  "$KERNEL_PYTHON" -c "import $mod" >/dev/null 2>&1 \
    || warn "requested package '$spec' is installed but module '$mod' is not importable"
done

log "OK  python=$PY_PATH"
log "OK  kernel=$KERNEL_PYTHON (ipykernel present)"
