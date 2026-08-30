#!/usr/bin/env bash
set -e

SOCK=/var/run/docker.sock
if [ -S "$SOCK" ]; then
  HOST_GID=$(stat -c '%g' "$SOCK")
  CUR_GID=$(getent group docker | cut -d: -f3)
  if [ "$HOST_GID" != "$CUR_GID" ]; then
    groupmod -g "$HOST_GID" docker 2>/dev/null || true
  fi
fi

sandbox_ownership() {
  printf '%s:%s' "$(id -u sandbox)" "$(id -g sandbox)"
}

repair_home_mount_ownership() {
  local owner
  owner="$(sandbox_ownership)"
  echo "[entrypoint] repairing sandbox home mount ownership as $owner"

  install -d -o sandbox -g sandbox \
    /home/sandbox/.local/share/uv \
    /home/sandbox/.local/share/uv/tools \
    /home/sandbox/.local/share/uv/python \
    /home/sandbox/.cache \
    /home/sandbox/.cache/uv 2>/dev/null || true

  find /home/sandbox -path "$OH_PROJECT_ROOT" -prune -o \
    -exec chown -h "$owner" {} + 2>/dev/null || true

  if [ -d /home/sandbox/.ssh ]; then
    chmod 700 /home/sandbox/.ssh 2>/dev/null || true
  fi
}

# >>> seed_home >>>
seed_home() {
  local dest="${1:-/home/sandbox}"
  local src="${OH_HOME_SEED_SRC:-/opt/home-seed}"
  [ -d "$src" ] || return 0
  mkdir -p "$dest"
  cp -a -n "$src/." "$dest/" 2>/dev/null || true
}
# <<< seed_home <<<

# >>> seed_workspace_volume >>>
seed_workspace_volume() {
  local dest="$1"
  local marker="$dest/.oh/.image-seeded"
  local src="${OH_IMAGE_SEED_SRC:-/opt/oh-seed}"
  OH_IMAGE_SEEDED_THIS_BOOT=0
  if [ -n "$src" ] && [ -d "$src/.claude" ]; then
    local _rel
    for _rel in protected-paths.txt settings.json; do
      if [ ! -e "$dest/.claude/$_rel" ] && [ -f "$src/.claude/$_rel" ]; then
        mkdir -p "$dest/.claude"
        cp -a "$src/.claude/$_rel" "$dest/.claude/$_rel" 2>/dev/null || true
      fi
    done
  fi
  if [ -f "$marker" ]; then
    return 0
  fi
  if [ -n "$src" ] && [ -d "$src" ] && [ ! -d "$dest/.oh" ]; then
    cp -a "$src/." "$dest/" 2>/dev/null || true
  fi
  if [ -d "$dest/.oh" ]; then
    : > "$marker" 2>/dev/null || true
    OH_IMAGE_SEEDED_THIS_BOOT=1
  fi
  return 0
}
# <<< seed_workspace_volume <<<

OH_PROJECT_ROOT="${OH_PROJECT_ROOT:-/home/sandbox/harness}"
HARNESS="${HARNESS:-$OH_PROJECT_ROOT}"

seed_home /home/sandbox

# ─── Host UID reconciliation ────────────────────────────────────────

uid_reconcile_step() {
  local description="$1"
  shift

  if "$@"; then
    return 0
  fi

  echo "[entrypoint] WARNING: failed to ${description}" >&2
  return 1
}

HARNESS_DIR="$OH_PROJECT_ROOT"
if [ "${OH_IMAGE_ONLY:-}" = "1" ]; then
  echo "[entrypoint] OH_IMAGE_ONLY=1 — no-bind mode; skipping host UID/GID sync"
  seed_workspace_volume "$OH_PROJECT_ROOT"
  if [ "${OH_IMAGE_SEEDED_THIS_BOOT:-0}" = "1" ]; then
    echo "[entrypoint] seeded control plane into $OH_PROJECT_ROOT from ${OH_IMAGE_SEED_SRC:-/opt/oh-seed}"
    chown -R "$(id -u sandbox):$(id -g sandbox)" "$OH_PROJECT_ROOT" 2>/dev/null || true
  else
    chown "$(id -u sandbox):$(id -g sandbox)" "$OH_PROJECT_ROOT" 2>/dev/null || true
  fi
elif [ -d "$HARNESS_DIR" ]; then
  HOST_UID=$(stat -c '%u' "$HARNESS_DIR")
  HOST_GID=$(stat -c '%g' "$HARNESS_DIR")
  SANDBOX_UID=$(id -u sandbox)
  SANDBOX_GID=$(id -g sandbox)
  UID_GID_SYNC_OK=true
  if [ "$HOST_GID" != "$SANDBOX_GID" ]; then
    if getent group "$HOST_GID" >/dev/null 2>&1; then
      EXISTING_GROUP=$(getent group "$HOST_GID" | cut -d: -f1)
      if [ "$EXISTING_GROUP" != "sandbox" ]; then
        uid_reconcile_step "set sandbox primary group to existing host GID $HOST_GID" usermod -g "$HOST_GID" sandbox || UID_GID_SYNC_OK=false
      fi
    else
      uid_reconcile_step "set sandbox group GID to host GID $HOST_GID" groupmod -g "$HOST_GID" sandbox || UID_GID_SYNC_OK=false
    fi
  fi
  if [ "$HOST_UID" != "$SANDBOX_UID" ]; then
    uid_reconcile_step "set sandbox UID to host UID $HOST_UID" usermod -u "$HOST_UID" sandbox || UID_GID_SYNC_OK=false
    if [ "$UID_GID_SYNC_OK" = "true" ]; then
      echo "[entrypoint] sandbox UID synced to host ($SANDBOX_UID → $HOST_UID, $SANDBOX_GID → $HOST_GID)"
    else
      echo "[entrypoint] WARNING: sandbox UID/GID reconciliation incomplete; continuing with current ownership" >&2
    fi
  fi
fi

PW="${SANDBOX_PASSWORD:-test1234}"
echo "sandbox:${PW}" | chpasswd || echo "[entrypoint] WARNING: failed to set sandbox password" >&2
unset PW

# UID/GID reconciliation can change the numeric identity behind the sandbox
repair_home_mount_ownership

HARNESS="${HARNESS:-$OH_PROJECT_ROOT}"

if [ -x "$HARNESS/.oh/scripts/link-providers.sh" ]; then
  if ! gosu sandbox bash "$HARNESS/.oh/scripts/link-providers.sh" --init; then
    echo "[entrypoint] failed to link provider skills; run: bash .oh/scripts/link-providers.sh --init"
    exit 1
  fi
fi

if [ "${OH_PROVISION_PYTHON:-true}" = "true" ] \
   && [ -x "$HARNESS/.oh/scripts/provision-python.sh" ]; then
  if ! bash "$HARNESS/.oh/scripts/provision-python.sh"; then
    echo "[entrypoint] WARNING: Python provisioning did not complete; run: bash .oh/scripts/provision-python.sh" >&2
  fi
fi

# Hermes keeps all runtime state — including auth.json — inside the
if [ "${INSTALL_HERMES:-false}" = "true" ]; then
  HERMES_RUNTIME="${HERMES_HOME:-$HARNESS/.hermes}"
  HERMES_LEGACY_AUTH="/home/sandbox/.hermes/auth.json"

  mkdir -p "$HERMES_RUNTIME"

  if [ -L "$HERMES_RUNTIME/auth.json" ]; then
    rm -f "$HERMES_RUNTIME/auth.json"
    if [ -s "$HERMES_LEGACY_AUTH" ]; then
      cp "$HERMES_LEGACY_AUTH" "$HERMES_RUNTIME/auth.json"
    fi
  fi

  HERMES_SHARED_SKILLS_DIR="$HARNESS/.oh/skills"
  HERMES_SHARED_SKILLS_LINK="$HERMES_RUNTIME/skills/openharness"
  mkdir -p "$HERMES_RUNTIME/skills"
  if [ -d "$HERMES_SHARED_SKILLS_DIR" ]; then
    if [ -L "$HERMES_SHARED_SKILLS_LINK" ]; then
      current_target="$(readlink "$HERMES_SHARED_SKILLS_LINK" || true)"
      if [ "$current_target" != "../../.oh/skills" ] && [ "$current_target" != "$HERMES_SHARED_SKILLS_DIR" ]; then
        rm -f "$HERMES_SHARED_SKILLS_LINK"
        ln -s ../../.oh/skills "$HERMES_SHARED_SKILLS_LINK"
      fi
    elif [ ! -e "$HERMES_SHARED_SKILLS_LINK" ]; then
      ln -s ../../.oh/skills "$HERMES_SHARED_SKILLS_LINK"
    else
      echo "[entrypoint] $HERMES_SHARED_SKILLS_LINK exists and is not a symlink — leaving it untouched"
    fi
  fi

  chown -hR "$(sandbox_ownership)" "$HERMES_RUNTIME" 2>/dev/null || true

  for d in /usr/local/lib/hermes-agent /opt/uv; do
    [ -d "$d" ] && chown -hR "$(sandbox_ownership)" "$d" 2>/dev/null || true
  done

  if [ "${HERMES_DASHBOARD:-false}" = "true" ] && command -v hermes &>/dev/null \
     && command -v tmux &>/dev/null; then
    _dash_port="${HERMES_DASHBOARD_PORT:-9119}"
    case "$_dash_port" in
      *[!0-9]|"")
        echo "[entrypoint] HERMES_DASHBOARD_PORT='${_dash_port}' is not numeric — skipping dashboard launch"
        ;;
      *)
        if ! gosu sandbox tmux has-session -t app-hermes-dashboard 2>/dev/null; then
          _dash_host="${HERMES_DASHBOARD_HOST:-127.0.0.1}"
          _dash_insecure=""
          case "${HERMES_DASHBOARD_INSECURE:-}" in
            [Tt][Rr][Uu][Ee]|1|[Yy][Ee][Ss]|[Oo][Nn]) _dash_insecure=" --insecure" ;;
          esac
          gosu sandbox tmux new-session -d -s app-hermes-dashboard \
            "hermes dashboard --no-open --host \"${_dash_host}\" --port \"${_dash_port}\"${_dash_insecure} 2>&1 | tee /tmp/app-hermes-dashboard.log"
          echo "[entrypoint] starting Hermes dashboard on ${_dash_host}:${_dash_port}"
        else
          echo "[entrypoint] app-hermes-dashboard tmux session already running — skipping"
        fi
        ;;
    esac
  fi
fi

if [ "${SANDBOX_SSH:-false}" = "true" ] && [ -x /usr/sbin/sshd ]; then
  if pgrep -x sshd >/dev/null 2>&1; then
    echo "[entrypoint] sshd already running — skipping"
  else
    mkdir -p /run/sshd
    ssh-keygen -A >/dev/null 2>&1 || true

    _ssh_dir=/home/sandbox/.ssh
    _have_keys=0
    if [ -n "${SANDBOX_SSH_AUTHORIZED_KEYS:-}" ]; then
      mkdir -p "$_ssh_dir"
      _ssh_keys="${SANDBOX_SSH_AUTHORIZED_KEYS//\\n/$'\n'}"
      printf '%s\n' "$_ssh_keys" > "$_ssh_dir/authorized_keys"
      unset _ssh_keys
      chmod 700 "$_ssh_dir"
      chmod 600 "$_ssh_dir/authorized_keys"
      chown -R "$(sandbox_ownership)" "$_ssh_dir"
      _have_keys=1
    elif [ -s "$_ssh_dir/authorized_keys" ]; then
      _have_keys=1
    fi

    _pw_auth=no
    case "$(printf '%s' "${SANDBOX_SSH_PASSWORD_AUTH:-false}" | tr '[:upper:]' '[:lower:]')" in
      1|true|yes|on) _pw_auth=yes ;;
    esac

    mkdir -p /etc/ssh/sshd_config.d
    cat > /etc/ssh/sshd_config.d/openharness.conf <<EOF
# Managed by Open Harness entrypoint — regenerated every boot.
PermitRootLogin no
PubkeyAuthentication yes
PasswordAuthentication ${_pw_auth}
EOF

    if [ "$_pw_auth" = "no" ] && [ "$_have_keys" -eq 0 ]; then
      echo "[entrypoint] WARNING: sshd starting with NO authorized_keys and password auth OFF —" >&2
      echo "[entrypoint]          no one can log in. Set SANDBOX_SSH_AUTHORIZED_KEYS in .devcontainer/.env" >&2
      echo "[entrypoint]          or SANDBOX_SSH_PASSWORD_AUTH=true in .devcontainer/.env. See docs/integrations/sshd.md" >&2
    fi

    if /usr/sbin/sshd; then
      echo "[entrypoint] sshd started (password auth: ${_pw_auth}, pubkeys: $([ "$_have_keys" -eq 1 ] && echo present || echo none))"
    else
      echo "[entrypoint] WARNING: sshd failed to start" >&2
    fi
  fi
fi

BASHRC="/home/sandbox/.bashrc"
if [ -f "$BASHRC" ] && ! grep -q 'source.*\.oh/install/banner.sh' "$BASHRC"; then
  gosu sandbox bash -c "echo 'source ${OH_PROJECT_ROOT}/.oh/install/banner.sh 2>/dev/null' >> ~/.bashrc"
  echo "[entrypoint] attach banner wired into .bashrc"
fi

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
  if [ -z "$GH_EMAIL" ] || [ "$GH_EMAIL" = "null" ]; then
    GH_LOGIN=$(gosu sandbox gh api user --jq .login 2>/dev/null || true)
    [ -n "$GH_LOGIN" ] && GH_EMAIL="${GH_LOGIN}@users.noreply.github.com"
  fi
  [ -n "$GH_EMAIL" ] && gosu sandbox git config --global user.email "$GH_EMAIL"
fi
if gosu sandbox env -u GH_TOKEN -u GITHUB_TOKEN gh auth status &>/dev/null; then
  if gosu sandbox env -u GH_TOKEN -u GITHUB_TOKEN gh auth setup-git 2>/dev/null; then
    echo "[entrypoint] git credential helper configured via gh auth setup-git"
  fi
fi

if [ -n "${GH_TOKEN:-}" ] && gosu sandbox env -u GH_TOKEN -u GITHUB_TOKEN gh auth status &>/dev/null; then
  SSH_DIR="/home/sandbox/.ssh"
  SSH_KEY="$SSH_DIR/id_ed25519"
  if [ ! -f "$SSH_KEY" ]; then
    mkdir -p "$SSH_DIR"
    chown -h "$(sandbox_ownership)" "$SSH_DIR"
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

# from the marker stored alongside node_modules. Set SKIP_PNPM_INSTALL=1 to opt
pnpm_workspace_package_patterns() {
  local workspace="$1/pnpm-workspace.yaml"
  [ -f "$workspace" ] || return 0

  awk '
    function trim(value) {
      sub(/^[[:space:]]+/, "", value)
      sub(/[[:space:]]+$/, "", value)
      return value
    }
    function emit(value) {
      value = trim(value)
      sub(/[[:space:]]+#.*$/, "", value)
      value = trim(value)
      gsub(/^\047|\047$/, "", value)
      gsub(/^"|"$/, "", value)
      if (value != "" && substr(value, 1, 1) != "!") {
        print value
      }
    }
    /^[[:space:]]*packages:[[:space:]]*\[/ {
      line = $0
      sub(/^[[:space:]]*packages:[[:space:]]*\[/, "", line)
      sub(/\].*$/, "", line)
      count = split(line, values, ",")
      for (i = 1; i <= count; i++) {
        emit(values[i])
      }
      exit
    }
    /^[[:space:]]*packages:[[:space:]]*$/ {
      in_packages = 1
      next
    }
    in_packages && /^[^[:space:]#][^:]*:/ {
      exit
    }
    in_packages && /^[[:space:]]*-[[:space:]]*/ {
      line = $0
      sub(/^[[:space:]]*-[[:space:]]*/, "", line)
      emit(line)
    }
  ' "$workspace"
}

pnpm_manifest_rel_is_excluded() {
  case "$1" in
    .git/*|.worktrees/*|projects/*|node_modules/*|*/node_modules/*)
      return 0
      ;;
  esac
  return 1
}

pnpm_workspace_package_manifest_paths() {
  local root="$1"
  local pattern candidate rel
  shopt -s nullglob globstar

  while IFS= read -r pattern; do
    pattern="${pattern#./}"
    pattern="${pattern%/}"
    [ -n "$pattern" ] || continue

    case "$pattern" in
      /*|../*|*/../*)
        continue
        ;;
    esac

    if [[ "$pattern" == *package.json ]]; then
      for candidate in "$root"/$pattern; do
        [ -f "$candidate" ] || continue
        rel="${candidate#"$root"/}"
        rel="${rel#./}"
        pnpm_manifest_rel_is_excluded "$rel" || printf '%s\n' "$rel"
      done
    else
      for candidate in "$root"/$pattern/package.json; do
        [ -f "$candidate" ] || continue
        rel="${candidate#"$root"/}"
        rel="${rel#./}"
        pnpm_manifest_rel_is_excluded "$rel" || printf '%s\n' "$rel"
      done
    fi
  done < <(pnpm_workspace_package_patterns "$root")
}

pnpm_manifest_fingerprint() {
  local root="$1"
  local rel
  {
    for rel in package.json pnpm-lock.yaml pnpm-workspace.yaml; do
      [ -f "$root/$rel" ] && printf '%s\n' "$rel"
    done
    pnpm_workspace_package_manifest_paths "$root"
  } | LC_ALL=C sort -u | while IFS= read -r rel; do
    [ -n "$rel" ] || continue
    printf '%s %s\n' "$rel" "$(sha256sum "$root/$rel" | awk '{print $1}')"
  done | sha256sum | awk '{print $1}'
}

if [ -f "$HARNESS/package.json" ] && [ "${SKIP_PNPM_INSTALL:-0}" != "1" ]; then
  PNPM_INSTALL_MARKER_FILENAME=".openharness-root-pnpm-manifest.sha256"
  PNPM_INSTALL_MARKER="$HARNESS/node_modules/$PNPM_INSTALL_MARKER_FILENAME"
  PNPM_MANIFEST_FINGERPRINT="$(pnpm_manifest_fingerprint "$HARNESS")"
  PNPM_INSTALL_REQUIRED=false

  if [ ! -d "$HARNESS/node_modules" ]; then
    echo "[entrypoint] node_modules missing — running pnpm install at $HARNESS"
    PNPM_INSTALL_REQUIRED=true
  elif [ ! -f "$PNPM_INSTALL_MARKER" ] || [ "$(cat "$PNPM_INSTALL_MARKER" 2>/dev/null || true)" != "$PNPM_MANIFEST_FINGERPRINT" ]; then
    echo "[entrypoint] manifest drift detected; reinstalling"
    PNPM_INSTALL_REQUIRED=true
  else
    echo "[entrypoint] dependencies current"
  fi

  if [ "$PNPM_INSTALL_REQUIRED" = "true" ]; then
    if gosu sandbox bash -c 'cd "$1" && pnpm install --prefer-offline' _ "$HARNESS" >/tmp/pnpm-install.log 2>&1; then
      PNPM_MANIFEST_FINGERPRINT="$(pnpm_manifest_fingerprint "$HARNESS")"
      PNPM_INSTALL_MARKER_TMP="$PNPM_INSTALL_MARKER.tmp.$$"
      if gosu sandbox bash -c 'printf "%s\n" "$1" > "$2" && mv -f "$2" "$3"' _ "$PNPM_MANIFEST_FINGERPRINT" "$PNPM_INSTALL_MARKER_TMP" "$PNPM_INSTALL_MARKER" >>/tmp/pnpm-install.log 2>&1; then
        echo "[entrypoint] pnpm install completed (log: /tmp/pnpm-install.log)"
      else
        echo "[entrypoint] pnpm install marker refresh failed — see /tmp/pnpm-install.log; aborting sandbox boot"
        exit 1
      fi
    else
      echo "[entrypoint] pnpm install failed — see /tmp/pnpm-install.log; aborting sandbox boot"
      exit 1
    fi
  fi
fi

WORKTREES_PATH="$HARNESS/.worktrees"
PROJECTS_PATH="$HARNESS/projects"
CRONS_PATH="$HARNESS/crons"
mkdir -p "$WORKTREES_PATH" "$PROJECTS_PATH" "$CRONS_PATH"
if [ -f "$HARNESS/.oh/scripts/cron-runtime.ts" ] && command -v tmux &>/dev/null; then
  if gosu sandbox tmux has-session -t system-cron 2>/dev/null; then
    echo "[entrypoint] legacy system-cron tmux session detected — stopping it before starting cron-watchdog"
    gosu sandbox tmux kill-session -t system-cron 2>/dev/null || true
  fi

  rm -f /tmp/cron-watchdog.sh 2>/dev/null || true
  if cat > /tmp/cron-watchdog.sh <<'CRON_WATCHDOG'
#!/usr/bin/env bash
set -u
HARNESS="${HARNESS:-${OH_PROJECT_ROOT:-/home/sandbox/harness}}"
INTERVAL="${CRON_WATCHDOG_INTERVAL:-60}"
while true; do
  if tmux has-session -t system-cron 2>/dev/null; then
    echo "[$(date -Iseconds)] legacy system-cron detected; stopping it before supervising cron-system"
    tmux kill-session -t system-cron 2>/dev/null || true
  fi
  if ! tmux has-session -t cron-system 2>/dev/null; then
    echo "[$(date -Iseconds)] cron-system missing; starting cron-runtime.ts"
    tmux new-session -d -s cron-system \
      "cd $HARNESS && node --experimental-strip-types .oh/scripts/cron-runtime.ts 2>&1 | tee /tmp/cron-system.log"
  fi
  sleep "$INTERVAL"
done
CRON_WATCHDOG
  then
    chmod 755 /tmp/cron-watchdog.sh 2>/dev/null || true
    if gosu sandbox tmux has-session -t cron-watchdog 2>/dev/null; then
      echo "[entrypoint] cron-watchdog tmux session already running — skipping"
    elif gosu sandbox tmux new-session -d -s cron-watchdog \
      "OH_PROJECT_ROOT=$OH_PROJECT_ROOT HARNESS=$HARNESS CRON_WATCHDOG_INTERVAL=${CRON_WATCHDOG_INTERVAL:-60} bash /tmp/cron-watchdog.sh 2>&1 | tee /tmp/cron-watchdog.log"; then
      echo "[entrypoint] cron-watchdog tmux session started (supervises cron-system)"
    else
      echo "[entrypoint] WARN: cron-watchdog tmux launch failed — skipping (sandbox boot continues)"
    fi
  else
    echo "[entrypoint] WARN: could not write /tmp/cron-watchdog.sh — skipping cron-watchdog (sandbox boot continues)"
  fi
fi

ln -sf "$HARNESS/.oh/scripts/gateway.sh" /usr/local/bin/gateway 2>/dev/null || true
SLACK_ENV="$HARNESS/.devcontainer/.env"
if [ -f "$SLACK_ENV" ] \
   && grep -qE '^PI_SLACK_APP_TOKEN=.' "$SLACK_ENV" \
   && grep -qE '^PI_SLACK_BOT_TOKEN=.' "$SLACK_ENV" \
   && command -v tmux &>/dev/null \
   && gosu sandbox bash -lc 'command -v pi' &>/dev/null; then
  if gosu sandbox bash -lc "exec bash \"$HARNESS\"/.oh/scripts/gateway.sh pi"; then
    echo "[entrypoint] client-slack-pi started via gateway.sh"
  else
    echo "[entrypoint] client-slack-pi failed to start via gateway.sh"
  fi
else
  echo "[entrypoint] Slack not configured (or pi missing) — skipping client-slack-pi"
fi

if [ "${INSTALL_AGENT_BROWSER:-false}" = "true" ] && ! command -v agent-browser &>/dev/null; then
  echo "[entrypoint] Installing agent-browser (INSTALL_AGENT_BROWSER=true)..."
  pnpm add -g agent-browser@0.8.5 \
    && find "$PNPM_HOME" -name "agent-browser-linux-*" -exec chmod +x {} \; \
    && agent-browser install --with-deps 2>&1 | tail -5 \
    && echo "[entrypoint] agent-browser installed" \
    || echo "[entrypoint] agent-browser install failed — skipping"
fi

for hook in /usr/local/bin/*-entrypoint-hook.sh; do
  [ -x "$hook" ] && "$hook"
done

# First-boot message if onboarding not complete
if [ ! -f "/home/sandbox/.claude/.onboarded" ]; then
  echo ""
  echo "  ┌─────────────────────────────────────────────────┐"
  echo "  │  First boot detected.                           │"
  echo "  │  Optional Slack bridge setup:                   │"
  echo "  │    see docs/integrations/slack.md           │"
  echo "  │  First command after attaching:                 │"
  echo "  │    herdr   # then complete setup in its panes   │"
  echo "  └─────────────────────────────────────────────────┘"
  echo ""
fi

exec "$@"
