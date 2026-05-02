#!/usr/bin/env bash
set -e

# Match the container's docker group GID to the host socket's GID
# so the sandbox user can use Docker without sudo.
SOCK=/var/run/docker.sock
if [ -S "$SOCK" ]; then
  HOST_GID=$(stat -c '%g' "$SOCK")
  CUR_GID=$(getent group docker | cut -d: -f3)
  if [ "$HOST_GID" != "$CUR_GID" ]; then
    groupmod -g "$HOST_GID" docker 2>/dev/null || true
  fi
fi

# Fix ownership of mounted .claude auth directory
if [ -d /home/sandbox/.claude ]; then
  chown -R sandbox:sandbox /home/sandbox/.claude 2>/dev/null || true
fi

# Initialize gh CLI auth from GH_TOKEN if provided
if [ -n "${GH_TOKEN:-}" ]; then
  echo "[entrypoint] Setting up gh CLI auth from GH_TOKEN..."
  gosu sandbox gh auth login --with-token <<< "$GH_TOKEN" 2>/dev/null && \
  gosu sandbox gh auth setup-git 2>/dev/null && \
  echo "[entrypoint] gh CLI auth initialized" || \
  echo "[entrypoint] WARNING: gh auth setup failed"
fi

# Cron runtime is launched by .devcontainer/entrypoint.sh per SPEC v0.7
# §"Croner runtime"; this script no longer starts schedulers.

# Install cloudflared if requested but missing (requires root)
if [ "${INSTALL_CLOUDFLARED:-false}" = "true" ] && ! command -v cloudflared &>/dev/null; then
  echo "[entrypoint] Installing cloudflared..."
  apt-get update -qq && \
  apt-get install -y -qq --no-install-recommends lsb-release gnupg && \
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
    -o /usr/share/keyrings/cloudflare-main.gpg && \
  ARCH=$(dpkg --print-architecture) && \
  CODENAME=$(lsb_release -cs) && \
  echo "deb [arch=${ARCH} signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared ${CODENAME} main" \
    > /etc/apt/sources.list.d/cloudflared.list && \
  apt-get update -qq && \
  apt-get install -y -qq --no-install-recommends cloudflared && \
  rm -rf /var/lib/apt/lists/* && \
  echo "[entrypoint] cloudflared $(cloudflared --version 2>&1 | head -1) installed" || \
  echo "[entrypoint] WARNING: cloudflared install failed"
fi

# Install agent-browser + Chromium if requested but missing (requires root)
if [ "${INSTALL_BROWSER:-false}" = "true" ] && ! command -v agent-browser &>/dev/null; then
  echo "[entrypoint] Installing agent-browser + Chromium..."
  pnpm add -g agent-browser@0.8.5 && \
  agent-browser install --with-deps && \
  echo "[entrypoint] agent-browser installed" || \
  echo "[entrypoint] WARNING: agent-browser install failed"
fi

# Run workspace startup (dev server + tunnel) as sandbox user
STARTUP="/home/sandbox/harness/workspace/startup.sh"
if [ -f "$STARTUP" ]; then
  gosu sandbox bash "$STARTUP" 2>&1 | sed 's/^/  /' || true
fi

# Build and link Slack bot from bind-mount (replaces /opt/slack image copy).
# Entrypoint runs as root, so $HOME is /root — use the sandbox user's absolute
# path and run pnpm as that user so the global link lands on their PATH.
SLACK_PKG="/home/sandbox/harness/packages/slack"
if [ -f "$SLACK_PKG/package.json" ]; then
  echo "[entrypoint] Building and linking Slack bot package..."
  # PNPM_HOME defaults to /usr/local/share/pnpm (root-owned). pnpm link --global
  # writes there, so ensure the sandbox user can. Create + chown before gosu.
  PNPM_HOME_DIR="${PNPM_HOME:-/usr/local/share/pnpm}"
  mkdir -p "$PNPM_HOME_DIR"
  chown -R sandbox:sandbox "$PNPM_HOME_DIR"
  if gosu sandbox bash -c "cd '$SLACK_PKG' && pnpm install && pnpm run build && pnpm link --global"; then
    echo "[entrypoint] Slack bot linked ($(gosu sandbox bash -lc 'command -v mom || echo missing'))"
  else
    echo "[entrypoint] WARNING: Slack bot build/link failed — mom CLI will be unavailable"
  fi
fi

exec gosu sandbox "$@"
