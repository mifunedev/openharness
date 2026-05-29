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
for dir in .claude .codex .pi .deepagents .hermes .cloudflared .config/gh .ssh; do
  if [ -d "/home/sandbox/$dir" ]; then
    chown -R sandbox:sandbox "/home/sandbox/$dir" 2>/dev/null || true
    [ "$dir" = ".ssh" ] && chmod 700 "/home/sandbox/$dir" 2>/dev/null || true
  fi
done

# Fix ownership of parents Docker auto-creates as root to satisfy named-volume
# or bind-mount targets, which then block the sandbox user from creating
# sibling dirs (EACCES on first run). Two known cases:
#   • `.local` / `.local/share` — parents of the opencode state mount; without
#     this `opencode` can't create `.local/state`.
#   • `.config` — parent of the `gh-config` named volume (see
#     docker-compose.yml); without this `opencode` can't create
#     `.config/opencode`, and any other tool writing under `~/.config/<tool>`
#     would hit the same wall.
# Non-recursive so the bind-mounted children (`.local/share/opencode`,
# `.config/gh`) stay untouched.
for parent in /home/sandbox/.local /home/sandbox/.local/share /home/sandbox/.config; do
  if [ -d "$parent" ]; then
    chown sandbox:sandbox "$parent" 2>/dev/null || true
  fi
done

OPENCODE_STATE="/home/sandbox/.local/share/opencode"
if [ -d "$OPENCODE_STATE" ]; then
  chown -R sandbox:sandbox "$OPENCODE_STATE" 2>/dev/null || true
fi

# ─── Host UID reconciliation ────────────────────────────────────────
# The repo is bind-mounted at /home/sandbox/harness with its host UID/GID.
# To avoid permission drift between host and container (host edits files
# created in-container and vice versa; git authorship stays consistent),
# we sync the sandbox user's UID/GID to the host owner. After the sync,
# anything sandbox creates inside the container is owned by the host
# user on the host filesystem — no chown handoff needed.
HARNESS_DIR="/home/sandbox/harness"
if [ -d "$HARNESS_DIR" ]; then
  HOST_UID=$(stat -c '%u' "$HARNESS_DIR")
  HOST_GID=$(stat -c '%g' "$HARNESS_DIR")
  SANDBOX_UID=$(id -u sandbox)
  SANDBOX_GID=$(id -g sandbox)
  if [ "$HOST_GID" != "$SANDBOX_GID" ]; then
    if getent group "$HOST_GID" >/dev/null 2>&1; then
      EXISTING_GROUP=$(getent group "$HOST_GID" | cut -d: -f1)
      if [ "$EXISTING_GROUP" != "sandbox" ]; then
        usermod -g "$HOST_GID" sandbox 2>/dev/null || true
      fi
    else
      groupmod -g "$HOST_GID" sandbox 2>/dev/null || true
    fi
  fi
  if [ "$HOST_UID" != "$SANDBOX_UID" ]; then
    usermod -u "$HOST_UID" sandbox 2>/dev/null || true
    find /home/sandbox -xdev -uid "$SANDBOX_UID" -exec chown -h "$HOST_UID:$HOST_GID" {} + 2>/dev/null || true
    echo "[entrypoint] sandbox UID synced to host ($SANDBOX_UID → $HOST_UID, $SANDBOX_GID → $HOST_GID)"
  fi
fi

# Hermes keeps all runtime state — including auth.json — inside the
# project-local HERMES_HOME directory. An earlier design symlinked
# auth.json into the home-scoped ~/.hermes named volume, but that volume
# is a different filesystem from the bind-mounted checkout, so hermes'
# atomic_replace() (write-temp-then-os.replace) died with EXDEV on every
# auth write. Keeping auth on the same device as its temp file fixes it;
# HERMES_HOME is gitignored, so credentials stay out of version control.
if [ "${INSTALL_HERMES:-false}" = "true" ]; then
  HERMES_RUNTIME="${HERMES_HOME:-/home/sandbox/harness/.hermes}"
  HERMES_LEGACY_AUTH="/home/sandbox/.hermes/auth.json"

  mkdir -p "$HERMES_RUNTIME"

  # Heal the legacy cross-device symlink: drop it and restore any
  # credentials that reached the old volume as a real file.
  if [ -L "$HERMES_RUNTIME/auth.json" ]; then
    rm -f "$HERMES_RUNTIME/auth.json"
    if [ -s "$HERMES_LEGACY_AUTH" ]; then
      cp "$HERMES_LEGACY_AUTH" "$HERMES_RUNTIME/auth.json"
    fi
  fi

  # Seed Hermes with the harness' in-repo skills. Preserve any user config
  # created by `hermes setup`; only add the external skill directory when it
  # is absent.
  HERMES_CONFIG="$HERMES_RUNTIME/config.yaml"
  HERMES_EXTERNAL_SKILLS_DIR="/home/sandbox/harness/.claude/skills"
  python3 - "$HERMES_CONFIG" "$HERMES_EXTERNAL_SKILLS_DIR" <<'PY'
import sys
from pathlib import Path

config_path = Path(sys.argv[1])
skills_dir = sys.argv[2]
config_path.parent.mkdir(parents=True, exist_ok=True)

if not config_path.exists():
    config_path.write_text(
        "skills:\n"
        "  external_dirs:\n"
        f"    - {skills_dir}\n",
        encoding="utf-8",
    )
    raise SystemExit(0)

text = config_path.read_text(encoding="utf-8")
if skills_dir in text:
    raise SystemExit(0)

lines = text.splitlines()

def is_top_level(line: str) -> bool:
    return line and not line.startswith((" ", "\t")) and not line.lstrip().startswith("#")

skills_start = next((i for i, line in enumerate(lines) if line == "skills:"), None)
if skills_start is None:
    if lines and lines[-1].strip():
        lines.append("")
    lines.extend(["skills:", "  external_dirs:", f"    - {skills_dir}"])
else:
    skills_end = len(lines)
    for i in range(skills_start + 1, len(lines)):
        if is_top_level(lines[i]):
            skills_end = i
            break

    external_idx = next(
        (i for i in range(skills_start + 1, skills_end) if lines[i].strip().startswith("external_dirs:")),
        None,
    )
    if external_idx is None:
        lines[skills_start + 1:skills_start + 1] = ["  external_dirs:", f"    - {skills_dir}"]
    elif lines[external_idx].strip() == "external_dirs: []":
        lines[external_idx:external_idx + 1] = ["  external_dirs:", f"    - {skills_dir}"]
    else:
        insert_at = external_idx + 1
        while insert_at < skills_end and lines[insert_at].startswith("    - "):
            insert_at += 1
        lines.insert(insert_at, f"    - {skills_dir}")

config_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
PY

  chown -R sandbox:sandbox "$HERMES_RUNTIME" 2>/dev/null || true

  # The venv is a system path (outside /home/sandbox) that the Dockerfile
  # chowned to the build-time sandbox UID. If the UID-sync above remapped
  # sandbox to the host UID, the venv is left orphaned and ad-hoc
  # `uv pip install --python .../venv 'hermes-agent[slack]'` fails EACCES.
  # Re-chown the install dir + uv tools to the current sandbox UID.
  for d in /usr/local/lib/hermes-agent /opt/uv; do
    [ -d "$d" ] && chown -R sandbox:sandbox "$d" 2>/dev/null || true
  done
fi

# ─── Attach banner wiring (idempotent) ──────────────────────────────
# Source install/banner.sh from the sandbox user's .bashrc so every
# interactive shell (docker exec, VS Code) shows
# sandbox + onboarding status. Safe to run on every boot.
BASHRC="/home/sandbox/.bashrc"
if [ -f "$BASHRC" ] && ! grep -q 'source.*install/banner.sh' "$BASHRC"; then
  gosu sandbox bash -c 'echo "source /home/sandbox/harness/install/banner.sh 2>/dev/null" >> ~/.bashrc'
  echo "[entrypoint] attach banner wired into .bashrc"
fi

HARNESS="/home/sandbox/harness"

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

# ─── pnpm install at harness root ──────────────────────────────────
# Root package.json declares deps that aren't bundled into Pi or any
# global CLI: `croner` for scripts/cron-runtime.ts, plus the four sibling
# packages the in-tree Slack Pi extension imports (`@slack/socket-mode`,
# `@slack/web-api`, `chalk`, and `@sinclair/typebox` for tooling parity).
# Pi loads extensions via jiti, which falls back to Node's node_modules
# walk for non-aliased imports — without these installed at the harness
# root, `pi` fails to load `.pi/extensions/slack/` on a fresh container.
# The harness is bind-mounted, so a Dockerfile-time install gets shadowed
# at runtime; we install on first boot here, idempotently. Set
# SKIP_PNPM_INSTALL=1 to opt out (e.g. air-gapped envs managing deps
# externally).
if [ -f "$HARNESS/package.json" ] && [ "${SKIP_PNPM_INSTALL:-0}" != "1" ]; then
  if [ ! -d "$HARNESS/node_modules" ]; then
    echo "[entrypoint] node_modules missing — running pnpm install at $HARNESS"
    if gosu sandbox bash -c "cd $HARNESS && pnpm install --prefer-offline" >/tmp/pnpm-install.log 2>&1; then
      echo "[entrypoint] pnpm install completed (log: /tmp/pnpm-install.log)"
    else
      echo "[entrypoint] pnpm install failed — see /tmp/pnpm-install.log; cron-runtime and Slack Pi extension will not load"
    fi
  fi
fi

# ─── Start cron runtime in tmux session ────────────────────────────
# Per SPEC v0.7 §"Croner runtime" + .claude/rules/sandbox-processes.md.
# Replaces the legacy heartbeat-daemon watchdog. Runs as sandbox user
# inside the system-cron tmux session; logs tee to /tmp/system-cron.log.
CRONS_DIR="$HARNESS/crons"
mkdir -p "$CRONS_DIR"
# Bind-mounted; sandbox UID is synced to host UID above, so no chown.
if [ -f "$HARNESS/scripts/cron-runtime.ts" ] && command -v tmux &>/dev/null; then
  if ! gosu sandbox tmux has-session -t system-cron 2>/dev/null; then
    gosu sandbox tmux new-session -d -s system-cron \
      "cd $HARNESS && node --experimental-strip-types scripts/cron-runtime.ts 2>&1 | tee /tmp/system-cron.log"
    echo "[entrypoint] system-cron tmux session started (cron-runtime.ts)"
  else
    echo "[entrypoint] system-cron tmux session already running — skipping"
  fi
fi

# ─── Restore client-slack session if Slack is configured ──────────────
# Tokens live in .devcontainer/.env (Compose KEY=value format). When both
# SLACK_APP_TOKEN and SLACK_BOT_TOKEN are set AND `pi` is installed for
# the sandbox user, restore the session that `oh config slack` created.
# Sourcing happens inside the tmux command (same pattern the wizard uses)
# so the child `pi` process inherits the exported vars.
SLACK_ENV="$HARNESS/.devcontainer/.env"
if [ -f "$SLACK_ENV" ] && command -v tmux &>/dev/null; then
  # shellcheck disable=SC1090
  SLACK_APP_TOKEN=$(grep -E '^SLACK_APP_TOKEN=' "$SLACK_ENV" | tail -1 | cut -d= -f2-)
  SLACK_BOT_TOKEN=$(grep -E '^SLACK_BOT_TOKEN=' "$SLACK_ENV" | tail -1 | cut -d= -f2-)
  if [ -n "$SLACK_APP_TOKEN" ] && [ -n "$SLACK_BOT_TOKEN" ] \
     && gosu sandbox bash -lc 'command -v pi' &>/dev/null; then
    if ! gosu sandbox tmux has-session -t client-slack 2>/dev/null; then
      gosu sandbox tmux new-session -d -s client-slack \
        "bash -c 'set -a; source $SLACK_ENV; set +a; pi 2>&1 | tee /tmp/client-slack.log'"
      echo "[entrypoint] client-slack tmux session started (Slack bridge)"
    else
      echo "[entrypoint] client-slack tmux session already running — skipping"
    fi
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
