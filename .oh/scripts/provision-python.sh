#!/usr/bin/env bash
# provision-python.sh — user-scoped uv/Python provisioning for the sandbox user.
#
# Why this exists
# ---------------
# uv keeps its managed interpreters, tool installs and cache under $HOME. When
# any level of that tree is created by root (a Dockerfile `install -d` that only
# chowns its final component, a Docker-created volume parent, a stray `sudo uv`),
# the sandbox user cannot write into it and provisioning dies with:
#
#   error: failed to create directory /home/sandbox/.local/share/uv/python: Permission denied
#
# `sudo uv python install` is NOT a fix: it installs under /root/.local, and the
# agent runs as `sandbox`. This script therefore does all of its work as the
# target user, with HOME pinned to that user's home, and never touches /root.
#
# It is idempotent: every step is a no-op when already satisfied, so it is safe
# to run from the image build, from every container boot, and by hand.
#
# Usage:
#   provision-python.sh            # provision, then verify
#   provision-python.sh --verify   # verify only; never installs
#   provision-python.sh --print-env  # print the resolved env assignments
#
# Tunables (env):
#   OH_PYTHON_VERSION            interpreter to manage        (default 3.11)
#   OH_PYTHON_KERNEL_PACKAGES    space-separated pip specs     (default ipykernel)
#   OH_PYTHON_KERNEL_HOME        venv location                 (default ~/.local/share/oh/kernel)
#   OH_SANDBOX_USER              target user                   (default sandbox)

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

# An actionable error: say what failed, why it is not fixable with sudo, and the
# exact command that repairs it.
die() {
  echo "[provision-python] ERROR: $1" >&2
  shift
  for line in "$@"; do echo "[provision-python]   $line" >&2; done
  exit 1
}

# ─── Re-exec as the sandbox user ────────────────────────────────────
# Running as root would recreate the exact bug this script fixes. Drop
# privileges first, and pin HOME so uv resolves user-scoped paths.
if [ "$(id -u)" = "0" ]; then
  if ! id "$SANDBOX_USER" >/dev/null 2>&1; then
    die "user '$SANDBOX_USER' does not exist" \
        "set OH_SANDBOX_USER to the in-container agent user."
  fi
  USER_HOME=$(getent passwd "$SANDBOX_USER" | cut -d: -f6)
  [ -n "$USER_HOME" ] || die "cannot resolve home directory for '$SANDBOX_USER'"

  # Parents must exist and be user-owned BEFORE the drop, because after the drop
  # there is no way to chown them. `install -d` applies -o/-g to the final
  # component only, so every level is named explicitly, parents first.
  install -d -o "$SANDBOX_USER" -g "$SANDBOX_USER" \
    "$USER_HOME/.local" \
    "$USER_HOME/.local/bin" \
    "$USER_HOME/.local/share" \
    "$USER_HOME/.local/share/uv" \
    "$USER_HOME/.local/share/uv/tools" \
    "$USER_HOME/.local/share/uv/python" \
    "$USER_HOME/.cache" \
    "$USER_HOME/.cache/uv" 2>/dev/null || true

  # Repair anything a previous root-owned run (or a root `uv`) left behind.
  # Scoped to the uv/cache subtrees so unrelated home state is untouched.
  for d in "$USER_HOME/.local/share/uv" "$USER_HOME/.cache/uv"; do
    [ -d "$d" ] && chown -R "$(id -u "$SANDBOX_USER"):$(id -g "$SANDBOX_USER")" "$d" 2>/dev/null || true
  done

  if command -v gosu >/dev/null 2>&1; then
    exec gosu "$SANDBOX_USER" env HOME="$USER_HOME" "$0" "$@"
  fi
  exec su "$SANDBOX_USER" -s /bin/bash -c "HOME='$USER_HOME' '$0' $*"
fi

# ─── From here on we are the unprivileged target user ───────────────
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
  printf 'export PRIME_AGENT_KERNEL_PYTHON=%s\n' "$KERNEL_PYTHON"
  exit 0
fi

command -v uv >/dev/null 2>&1 || die \
  "uv is not on PATH" \
  "the image installs it to /usr/local/bin/uv; rebuild the sandbox image:" \
  "  make sandbox"

# ─── Writability preflight ──────────────────────────────────────────
# Fail here with a precise repair command rather than letting uv emit a bare
# "Permission denied" several layers down.
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

# ─── Managed interpreter ────────────────────────────────────────────
uv_python_path() {
  uv python find --managed-python "$PY_VERSION" 2>/dev/null | head -1
}

if [ "$MODE" = "provision" ]; then
  # Unconditional: `uv python install` is itself idempotent (a fast no-op when
  # the version is already managed), and running it every time is what proves
  # the user-scoped install dir is writable. Do NOT gate it on `uv python find`
  # — a system interpreter would satisfy the check while leaving the managed
  # tree unprovisioned.
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

# ─── Kernel environment ─────────────────────────────────────────────
if [ "$MODE" = "provision" ]; then
  if [ ! -x "$KERNEL_PYTHON" ]; then
    log "creating kernel venv at $KERNEL_HOME"
    mkdir -p "$(dirname "$KERNEL_HOME")"
    uv venv --python "$PY_PATH" "$KERNEL_HOME" \
      || die "failed to create the kernel venv at $KERNEL_HOME"
  fi

  # `uv pip install` is idempotent; already-satisfied specs resolve to a no-op.
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
export PRIME_AGENT_KERNEL_PYTHON="\${PRIME_AGENT_KERNEL_PYTHON:-$KERNEL_PYTHON}"
ENVEOF
fi

# ─── Verification ───────────────────────────────────────────────────
[ -x "$KERNEL_PYTHON" ] || die \
  "kernel interpreter missing at $KERNEL_PYTHON" \
  "run: bash .oh/scripts/provision-python.sh"

missing=()
for mod in ipykernel; do
  "$KERNEL_PYTHON" -c "import $mod" >/dev/null 2>&1 || missing+=("$mod")
done
if [ ${#missing[@]} -gt 0 ]; then
  die "kernel environment is incomplete — missing: ${missing[*]}" \
      "run: bash .oh/scripts/provision-python.sh"
fi

# Optional runtime packages: verified when requested, never silently assumed.
for spec in $KERNEL_PACKAGES; do
  mod="${spec%%[<>=!\[]*}"
  mod="${mod//-/_}"
  [ "$mod" = "ipykernel" ] && continue
  "$KERNEL_PYTHON" -c "import $mod" >/dev/null 2>&1 \
    || warn "requested package '$spec' is installed but module '$mod' is not importable"
done

log "OK  python=$PY_PATH"
log "OK  kernel=$KERNEL_PYTHON (ipykernel present)"
log "OK  PRIME_AGENT_KERNEL_PYTHON=$KERNEL_PYTHON"
