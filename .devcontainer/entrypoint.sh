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

# Fix ownership of mounted volumes (created as root by Docker).
# Skip .claude / .codex when their host-mount overlays are active —
# they're host bind-mounts and chown would rewrite host file ownership
# (see docker-compose.claude-host.yml, docker-compose.codex-host.yml).
# Harness packs that introduce their own host-mount overlays should add
# their own skip clauses or run a *-entrypoint-hook.sh.
for dir in .claude .codex .cloudflared .config/gh .ssh .openharness; do
  if [ -d "/home/sandbox/$dir" ]; then
    if [ "$dir" = ".claude" ] && [ "${CLAUDE_HOST_BIND_MOUNT:-0}" = "1" ]; then
      continue
    fi
    if [ "$dir" = ".codex" ] && [ "${CODEX_HOST_BIND_MOUNT:-0}" = "1" ]; then
      continue
    fi
    chown -R sandbox:sandbox "/home/sandbox/$dir" 2>/dev/null || true
    [ "$dir" = ".ssh" ] && chmod 700 "/home/sandbox/$dir" 2>/dev/null || true
  fi
done

# ─── Host UID reconciliation ────────────────────────────────────────
# The repo is bind-mounted at /home/sandbox/harness with its host UID/GID.
# If the host user's UID differs from the container sandbox user (1000),
# pnpm / git operations would fail with EACCES. Add sandbox to the host
# owning group so it can write via group permissions (repo is mode 775).
HARNESS_DIR="/home/sandbox/harness"
if [ -d "$HARNESS_DIR" ]; then
  HOST_UID=$(stat -c '%u' "$HARNESS_DIR")
  HOST_GID=$(stat -c '%g' "$HARNESS_DIR")
  SANDBOX_UID=$(id -u sandbox)
  if [ "$HOST_UID" != "$SANDBOX_UID" ]; then
    if ! getent group "$HOST_GID" >/dev/null 2>&1; then
      groupadd -g "$HOST_GID" hostuser 2>/dev/null || true
    fi
    HOST_GROUP=$(getent group "$HOST_GID" | cut -d: -f1)
    if [ -n "$HOST_GROUP" ] && ! id -nG sandbox | tr ' ' '\n' | grep -qx "$HOST_GROUP"; then
      usermod -aG "$HOST_GROUP" sandbox
      echo "[entrypoint] sandbox added to host group $HOST_GROUP (gid=$HOST_GID) for bind-mount write access"
    fi
  fi
fi

# ─── Attach banner wiring (idempotent) ──────────────────────────────
# Source install/banner.sh from the sandbox user's .bashrc so every
# interactive shell (docker exec, SSH via sshd overlay, VS Code) shows
# sandbox + onboarding status. Safe to run on every boot.
BASHRC="/home/sandbox/.bashrc"
if [ -f "$BASHRC" ] && ! grep -q 'source.*install/banner.sh' "$BASHRC"; then
  gosu sandbox bash -c 'echo "source /home/sandbox/harness/install/banner.sh 2>/dev/null" >> ~/.bashrc'
  echo "[entrypoint] attach banner wired into .bashrc"
fi

# ─── Git worktree resolution ────────────────────────────────────────
# When the sandbox runs from a git worktree, .git is a file (not a dir)
# pointing to the main repo's .git/worktrees/<name>. The main .git/ is
# outside the bind mount, so we mount it separately at /home/sandbox/.git-main
# (via docker-compose.git.yml) and rewrite the .git file to resolve inside
# the container.
HARNESS="/home/sandbox/harness"
GIT_MAIN="/home/sandbox/.git-main"

if [ -f "$HARNESS/.git" ] && [ -d "$GIT_MAIN" ]; then
  WORKTREE_NAME=$(sed -n 's|.*worktrees/||p' "$HARNESS/.git")
  if [ -n "$WORKTREE_NAME" ] && [ -d "$GIT_MAIN/worktrees/$WORKTREE_NAME" ]; then
    echo "gitdir: $GIT_MAIN/worktrees/$WORKTREE_NAME" > "$HARNESS/.git"
    chown sandbox:sandbox "$HARNESS/.git"
    chown -R sandbox:sandbox "$GIT_MAIN" 2>/dev/null || true
    gosu sandbox git config --global --add safe.directory "$HARNESS"
    echo "[entrypoint] git worktree resolved → $GIT_MAIN/worktrees/$WORKTREE_NAME"
  fi
elif [ -d "$HARNESS/.git" ]; then
  # Regular repo (not a worktree) — just fix ownership
  chown -R sandbox:sandbox "$HARNESS/.git" 2>/dev/null || true
fi

# ─── GitHub CLI auth via PAT (optional) ─────────────────────────────
# When GH_TOKEN is provided, persist it into ~/.config/gh/hosts.yml on
# disk (via the gh-config volume) so auth survives env changes and
# `gh auth setup-git` has proper host config to reference. gh refuses
# `--with-token` while GH_TOKEN is in env, so unset it in the subprocess.
# Disk-auth check uses `env -u GH_TOKEN` so we don't mistake the env var
# for a persisted login.
if [ -n "${GH_TOKEN:-}" ]; then
  if ! gosu sandbox env -u GH_TOKEN -u GITHUB_TOKEN gh auth status &>/dev/null; then
    if echo "$GH_TOKEN" | gosu sandbox env -u GH_TOKEN -u GITHUB_TOKEN gh auth login --with-token 2>/dev/null; then
      echo "[entrypoint] GitHub CLI authenticated via GH_TOKEN (persisted to ~/.config/gh)"
    else
      echo "[entrypoint] GH_TOKEN provided but gh auth login failed"
    fi
  else
    echo "[entrypoint] GitHub CLI already authenticated on disk — skipping gh auth login"
  fi
fi

# ─── Git identity + credential helper ───────────────────────────────
# Set git user from env vars (fallback to gh-authenticated user)
if [ -n "${GIT_USER_NAME:-}" ]; then
  gosu sandbox git config --global user.name "$GIT_USER_NAME"
elif gosu sandbox gh auth status &>/dev/null; then
  GH_USER=$(gosu sandbox gh api user --jq .name 2>/dev/null || true)
  [ -n "$GH_USER" ] && gosu sandbox git config --global user.name "$GH_USER"
fi
if [ -n "${GIT_USER_EMAIL:-}" ]; then
  gosu sandbox git config --global user.email "$GIT_USER_EMAIL"
elif gosu sandbox gh auth status &>/dev/null; then
  GH_EMAIL=$(gosu sandbox gh api user --jq .email 2>/dev/null || true)
  # GitHub may return null for private emails — use noreply fallback
  if [ -z "$GH_EMAIL" ] || [ "$GH_EMAIL" = "null" ]; then
    GH_LOGIN=$(gosu sandbox gh api user --jq .login 2>/dev/null || true)
    [ -n "$GH_LOGIN" ] && GH_EMAIL="${GH_LOGIN}@users.noreply.github.com"
  fi
  [ -n "$GH_EMAIL" ] && gosu sandbox git config --global user.email "$GH_EMAIL"
fi
# Register gh as git credential helper so `git push`/`git fetch` just work
# over HTTPS on first attach — no SSH key setup required.
# Must run with GH_TOKEN unset: gh refuses setup-git when env-var auth
# would shadow the stored host config it's trying to wire up.
if gosu sandbox env -u GH_TOKEN -u GITHUB_TOKEN gh auth status &>/dev/null; then
  if gosu sandbox env -u GH_TOKEN -u GITHUB_TOKEN gh auth setup-git 2>/dev/null; then
    echo "[entrypoint] git credential helper configured via gh auth setup-git"
  fi
fi

# ─── SSH key generation + GitHub upload ─────────────────────────────
# Mirrors what the interactive `gh auth login` flow does when you pick
# SSH as the git protocol: generate an ed25519 keypair and register the
# public key with GitHub. `gh auth login --with-token` has no SSH path,
# so we do it ourselves. Requires the PAT to carry `admin:public_key`
# scope; without it the generation still runs but the upload is skipped
# (HTTPS + credential helper continues to work).
if [ -n "${GH_TOKEN:-}" ] && gosu sandbox env -u GH_TOKEN -u GITHUB_TOKEN gh auth status &>/dev/null; then
  SSH_DIR="/home/sandbox/.ssh"
  SSH_KEY="$SSH_DIR/id_ed25519"
  if [ ! -f "$SSH_KEY" ]; then
    mkdir -p "$SSH_DIR"
    chown sandbox:sandbox "$SSH_DIR"
    chmod 700 "$SSH_DIR"
    if gosu sandbox ssh-keygen -t ed25519 -f "$SSH_KEY" -N "" \
         -C "openharness-${SANDBOX_NAME:-$(hostname)}" &>/dev/null; then
      echo "[entrypoint] Generated SSH key at $SSH_KEY"
    fi
  fi
  if [ -f "$SSH_KEY.pub" ]; then
    KEY_TITLE="openharness-${SANDBOX_NAME:-$(hostname)}"
    PUB_MATERIAL=$(awk '{print $2}' "$SSH_KEY.pub")
    if gosu sandbox env -u GH_TOKEN -u GITHUB_TOKEN gh ssh-key list 2>/dev/null \
         | grep -Fq "$PUB_MATERIAL"; then
      echo "[entrypoint] SSH public key already registered on GitHub"
    else
      if gosu sandbox env -u GH_TOKEN -u GITHUB_TOKEN \
           gh ssh-key add "$SSH_KEY.pub" --title "$KEY_TITLE" 2>/dev/null; then
        echo "[entrypoint] SSH public key uploaded to GitHub as '$KEY_TITLE'"
      else
        echo "[entrypoint] Could not upload SSH key (PAT likely missing 'admin:public_key' scope)"
      fi
    fi
  fi
fi

# ─── SSH server setup (only when sshd overlay is active) ──────────
if echo "$@" | grep -q sshd; then
  # Set password for SSH login from env var
  echo "sandbox:${SANDBOX_PASSWORD:-changeme}" | chpasswd 2>/dev/null || true
  # Configure sshd for password + environment auth
  mkdir -p /run/sshd
  sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config 2>/dev/null || true
  sed -i 's/#PermitUserEnvironment no/PermitUserEnvironment yes/' /etc/ssh/sshd_config 2>/dev/null || true
  # Generate SSH host keys if missing
  if [ ! -f /etc/ssh/ssh_host_rsa_key ]; then
    ssh-keygen -A
  fi
  # Generate SSH keypair if none exists
  if [ -d "/home/sandbox/.ssh" ] && [ ! -f "/home/sandbox/.ssh/id_ed25519" ]; then
    gosu sandbox ssh-keygen -t ed25519 -f /home/sandbox/.ssh/id_ed25519 -N "" -C "sandbox@$(hostname)" 2>/dev/null || true
  fi
fi

# ─── Start cron runtime in tmux session ────────────────────────────
# Per SPEC v0.7 §"Croner runtime" + .claude/rules/sandbox-processes.md.
# Replaces the legacy heartbeat-daemon watchdog. Runs as sandbox user
# inside the system-cron tmux session; logs tee to /tmp/system-cron.log.
CRONS_DIR="$HARNESS/crons"
mkdir -p "$CRONS_DIR"
chown -R sandbox:sandbox "$CRONS_DIR" 2>/dev/null || true
if [ -f "$HARNESS/scripts/cron-runtime.ts" ] && command -v tmux &>/dev/null; then
  if ! gosu sandbox tmux has-session -t system-cron 2>/dev/null; then
    gosu sandbox tmux new-session -d -s system-cron \
      "cd $HARNESS && node --experimental-strip-types scripts/cron-runtime.ts 2>&1 | tee /tmp/system-cron.log"
    echo "[entrypoint] system-cron tmux session started (cron-runtime.ts)"
  else
    echo "[entrypoint] system-cron tmux session already running — skipping"
  fi
fi

# ─── Optional: agent-browser (opt-in via INSTALL_AGENT_BROWSER=true) ──
if [ "${INSTALL_AGENT_BROWSER:-false}" = "true" ] && ! command -v agent-browser &>/dev/null; then
  echo "[entrypoint] Installing agent-browser (INSTALL_AGENT_BROWSER=true)..."
  pnpm add -g agent-browser@0.8.5 \
    && find "$PNPM_HOME" -name "agent-browser-linux-*" -exec chmod +x {} \; \
    && agent-browser install --with-deps 2>&1 | tail -5 \
    && echo "[entrypoint] agent-browser installed" \
    || echo "[entrypoint] agent-browser install failed — skipping"
fi

# Run workspace startup (dev server + tunnel) as sandbox user
STARTUP="/home/sandbox/harness/workspace/startup.sh"
if [ -f "$STARTUP" ]; then
  gosu sandbox bash "$STARTUP" 2>&1 | sed 's/^/  /' || true
fi

# Source any harness-pack entrypoint hooks (installed by `oh harness add`)
for hook in /usr/local/bin/*-entrypoint-hook.sh; do
  [ -x "$hook" ] && "$hook"
done

# First-boot message if onboarding not complete
if [ ! -f "/home/sandbox/.claude/.onboarded" ]; then
  echo ""
  echo "  ┌─────────────────────────────────────────────────┐"
  echo "  │  First boot detected. Complete setup:           │"
  echo "  │    openharness onboard <name>                   │"
  echo "  │  Or from inside the container:                  │"
  echo "  │    openharness onboard                          │"
  echo "  └─────────────────────────────────────────────────┘"
  echo ""
fi

exec "$@"
