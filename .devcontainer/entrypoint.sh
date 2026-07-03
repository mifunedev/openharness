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

sandbox_ownership() {
  printf '%s:%s' "$(id -u sandbox)" "$(id -g sandbox)"
}

repair_home_mount_ownership() {
  local owner
  owner="$(sandbox_ownership)"
  echo "[entrypoint] repairing sandbox auth mount ownership as $owner"

  # Fix ownership of mounted volumes (created as root by Docker). Use the
  # sandbox user's numeric uid:gid so this remains correct after UID/GID sync,
  # even when the primary group is remapped to an existing host group whose
  # name is not `sandbox`.
  for dir in .claude .codex .pi .grok .deepagents .cloudflared .config/gh .ssh; do
    if [ -d "/home/sandbox/$dir" ]; then
      chown -hR "$owner" "/home/sandbox/$dir" 2>/dev/null || true
      [ "$dir" = ".ssh" ] && chmod 700 "/home/sandbox/$dir" 2>/dev/null || true
    fi
  done

  # Legacy Hermes home state may exist from earlier layouts. Do not recurse
  # into $HERMES_HOME when it points at the bind-mounted checkout; that
  # project-local runtime is handled by the Hermes block after UID sync.
  if [ -d "/home/sandbox/.hermes" ]; then
    chown -hR "$owner" "/home/sandbox/.hermes" 2>/dev/null || true
  fi

  # Fix ownership of parents Docker auto-creates as root to satisfy named-volume
  # or bind-mount targets, which then block the sandbox user from creating
  # sibling dirs (EACCES on first run). Non-recursive so the bind-mounted
  # children (`.local/share/opencode`, `.config/gh`) stay under the explicit
  # repairs below.
  for parent in /home/sandbox/.local /home/sandbox/.local/share /home/sandbox/.config; do
    if [ -d "$parent" ]; then
      chown -h "$owner" "$parent" 2>/dev/null || true
    fi
  done

  OPENCODE_STATE="/home/sandbox/.local/share/opencode"
  if [ -d "$OPENCODE_STATE" ]; then
    chown -hR "$owner" "$OPENCODE_STATE" 2>/dev/null || true
  fi
}

repair_home_mount_ownership

# ─── Host UID reconciliation ────────────────────────────────────────
# The repo is bind-mounted at /home/sandbox/harness with its host UID/GID.
# To avoid permission drift between host and container (host edits files
# created in-container and vice versa; git authorship stays consistent),
# we sync the sandbox user's UID/GID to the host owner. After the sync,
# anything sandbox creates inside the container is owned by the host
# user on the host filesystem — no chown handoff needed.
OH_PROJECT_ROOT="${OH_PROJECT_ROOT:-/home/sandbox/harness}"
# DEPRECATED alias — prefer $OH_PROJECT_ROOT
HARNESS="${HARNESS:-$OH_PROJECT_ROOT}"

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
if [ -d "$HARNESS_DIR" ]; then
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
    uid_reconcile_step "repair sandbox-owned files after UID/GID sync" find /home/sandbox -xdev -uid "$SANDBOX_UID" -exec chown -h "$HOST_UID:$HOST_GID" {} + || UID_GID_SYNC_OK=false
    if [ "$UID_GID_SYNC_OK" = "true" ]; then
      echo "[entrypoint] sandbox UID synced to host ($SANDBOX_UID → $HOST_UID, $SANDBOX_GID → $HOST_GID)"
    else
      echo "[entrypoint] WARNING: sandbox UID/GID reconciliation incomplete; continuing with current ownership" >&2
    fi
  fi
fi

# Set the sandbox user's LOGIN password so an operator can authenticate on a
# remote box (e.g. `su sandbox` or SSH password auth). This is unconditional
# — independent of whether the UID/GID reconcile above succeeded — and is
# distinct from sudo, which stays NOPASSWD:ALL via /etc/sudoers.d/sandbox.
# The trailing `|| echo ... >&2` (not a bare `|| true`) keeps a chpasswd
# failure (e.g. read-only /etc on some hosts) from aborting boot under
# `set -e`, while still surfacing it as a warning; never log $PW itself.
PW="${SANDBOX_PASSWORD:-test1234}"
echo "sandbox:${PW}" | chpasswd || echo "[entrypoint] WARNING: failed to set sandbox login password" >&2
unset PW

# UID/GID reconciliation can change the numeric identity behind the sandbox
# user after Docker-created auth volumes were repaired above. Repeat the
# idempotent repair with the final uid:gid so persisted credentials remain
# readable on hosts where UID 1000 is already occupied.
repair_home_mount_ownership

HARNESS="${HARNESS:-$OH_PROJECT_ROOT}"

# How the skill pack is wired: the shared skills/agents/hooks are vendored
# directly under .oh/ (no submodule). Create/repair the provider symlinks into
# .oh/ before any provider symlink, hook, eval runner, or Hermes skill path reads it.
if [ -x "$HARNESS/.oh/scripts/link-providers.sh" ]; then
  if ! gosu sandbox bash "$HARNESS/.oh/scripts/link-providers.sh" --init; then
    echo "[entrypoint] failed to link provider skills; run: bash .oh/scripts/link-providers.sh --init"
    exit 1
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
  HERMES_RUNTIME="${HERMES_HOME:-$HARNESS/.hermes}"
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

  # Share the harness' vendored skill pack with Hermes through its normal
  # HERMES_HOME skills tree. Claude, Codex, and Pi point at the same neutral
  # /home/sandbox/harness/.oh/skills directory; Hermes keeps its bundled/runtime
  # skills under $HERMES_RUNTIME/skills and gets the harness collection as a
  # symlinked child so one primitive is visible to every agent.
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

  # The venv is a system path (outside /home/sandbox) that the Dockerfile
  # chowned to the build-time sandbox UID. If the UID-sync above remapped
  # sandbox to the host UID, the venv is left orphaned and ad-hoc
  # `uv pip install --python .../venv 'hermes-agent[slack]'` fails EACCES.
  # Re-chown the install dir + uv tools to the current sandbox UID.
  for d in /usr/local/lib/hermes-agent /opt/uv; do
    [ -d "$d" ] && chown -hR "$(sandbox_ownership)" "$d" 2>/dev/null || true
  done

  # ─── Start Hermes dashboard in tmux session (opt-in) ────────────────
  # Guard: HERMES_DASHBOARD=true AND hermes binary on PATH AND tmux on PATH.
  # Idempotent: skip if the session already exists.
  # Runs as sandbox user via gosu; logs tee to /tmp/app-hermes-dashboard.log.
  # HERMES_DASHBOARD_HOST defaults to 127.0.0.1; set to 0.0.0.0 when the
  # compose overlay publishes the port (Docker's published-port path requires
  # the process to bind a non-loopback interface).
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

# ─── Attach banner wiring (idempotent) ──────────────────────────────
# Source .oh/install/banner.sh from the sandbox user's .bashrc so every
# interactive shell (docker exec, VS Code) shows
# sandbox + onboarding status. Safe to run on every boot.
BASHRC="/home/sandbox/.bashrc"
if [ -f "$BASHRC" ] && ! grep -q 'source.*\.oh/install/banner.sh' "$BASHRC"; then
  gosu sandbox bash -c "echo 'source ${OH_PROJECT_ROOT}/.oh/install/banner.sh 2>/dev/null' >> ~/.bashrc"
  echo "[entrypoint] attach banner wired into .bashrc"
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

# ─── pnpm install at harness root ──────────────────────────────────
# Root package.json declares deps that aren't bundled into Pi or any
# global CLI: `croner` for .oh/scripts/cron-runtime.ts, plus dev tooling such
# as `@sinclair/typebox` (kept as a devDep for tooling parity). The Slack
# bridge no longer needs root npm deps — it is the `pi-messenger-bridge`
# package, npm-installed into a gitignored `.pi/bridge/` dir and loaded only
# in the dedicated client-slack-pi session (see the Slack restore block below).
# The harness is bind-mounted, so a Dockerfile-time install gets shadowed
# at runtime; we install when the root dependency manifest fingerprint differs
# from the marker stored alongside node_modules. Set SKIP_PNPM_INSTALL=1 to opt
# out (e.g. air-gapped envs managing deps externally).
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
    .git/*|.worktrees/*|node_modules/*|*/node_modules/*)
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

# ─── Resolve + pre-create the memory directory ────────────────────
# Single source of truth = MEMORY_DIR (docker-compose passes harness.yaml's
# paths.memory through here; default .oh/memory). Pre-creating it at boot means
# the first skill/cron write lands in the resolved dir instead of racing a mkdir
# — and never silently falls back to a phantom relative `memory/`. Mirrors the
# CRONS_PATH block below; see .oh/scripts/oh-path for the shared resolver.
case "${MEMORY_DIR:-.oh/memory}" in
  /*) MEMORY_PATH="${MEMORY_DIR}" ;;
  *)  MEMORY_PATH="$HARNESS/${MEMORY_DIR:-.oh/memory}" ;;
esac
mkdir -p "$MEMORY_PATH"

# ─── Start/supervise cron runtime in tmux sessions ────────────────
# Per SPEC v0.7 §"Croner runtime" + .oh/skills/t3/references/sandbox-processes.md.
# `cron-system` runs .oh/scripts/cron-runtime.ts. `cron-watchdog` is the outer
# supervisor: if cron-system disappears after boot, it restarts the runtime
# without requiring a container restart. Logs tee to /tmp/cron-system.log and
# /tmp/cron-watchdog.log.
case "${CRONS_DIR:-.oh/crons}" in
  /*) CRONS_PATH="${CRONS_DIR}" ;;
  *)  CRONS_PATH="$HARNESS/${CRONS_DIR:-.oh/crons}" ;;
esac
mkdir -p "$CRONS_PATH"
# Bind-mounted; sandbox UID is synced to host UID above, so no chown.
if [ -f "$HARNESS/.oh/scripts/cron-runtime.ts" ] && command -v tmux &>/dev/null; then
  if gosu sandbox tmux has-session -t system-cron 2>/dev/null; then
    echo "[entrypoint] legacy system-cron tmux session detected — stopping it before starting cron-watchdog"
    gosu sandbox tmux kill-session -t system-cron 2>/dev/null || true
  fi

  cat > /tmp/cron-watchdog.sh <<'CRON_WATCHDOG'
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
  chmod 755 /tmp/cron-watchdog.sh
  chown -h "$(sandbox_ownership)" /tmp/cron-watchdog.sh 2>/dev/null || true

  if gosu sandbox tmux has-session -t cron-watchdog 2>/dev/null; then
    echo "[entrypoint] cron-watchdog tmux session already running — skipping"
  else
    gosu sandbox tmux new-session -d -s cron-watchdog \
      "OH_PROJECT_ROOT=$OH_PROJECT_ROOT HARNESS=$HARNESS CRON_WATCHDOG_INTERVAL=${CRON_WATCHDOG_INTERVAL:-60} bash /tmp/cron-watchdog.sh 2>&1 | tee /tmp/cron-watchdog.log"
    echo "[entrypoint] cron-watchdog tmux session started (supervises cron-system)"
  fi
fi

# ─── Restore client-slack-pi session if Slack is configured ───────────
# The pi-messenger-bridge Slack client (the /msg-bridge config surface) is
# intentionally NOT pinned in .pi/settings.json — it loads ONLY in the dedicated
# client-slack-pi session. Boot and manual `gateway pi` share ONE launch path:
# .oh/scripts/gateway.sh, which sources PI_SLACK_* from the sandbox-owned,
# mode-600 .env, seeds the non-secret bridge config (preserving the operator's
# runtime trust grants, bug #289), clears the single-instance lock, npm-installs
# the fork-pinned bridge if missing, and runs the self-healing supervisor in the
# client-slack-pi session. Here we only gate on Slack being configured (both
# tokens present in .env) and pi being installed, then hand off as the sandbox
# user. The sibling hermes gateway client (client-slack-hermes) is NOT
# auto-started — bring it up manually with `gateway hermes`.
#
# Expose the launcher as a bare `gateway` command. Recreated every boot
# (idempotent) pointing at the live bind-mounted script, so edits to gateway.sh
# take effect without an image rebuild.
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

# ─── Optional: agent-browser (opt-in via INSTALL_AGENT_BROWSER=true) ──
if [ "${INSTALL_AGENT_BROWSER:-false}" = "true" ] && ! command -v agent-browser &>/dev/null; then
  echo "[entrypoint] Installing agent-browser (INSTALL_AGENT_BROWSER=true)..."
  pnpm add -g agent-browser@0.8.5 \
    && find "$PNPM_HOME" -name "agent-browser-linux-*" -exec chmod +x {} \; \
    && agent-browser install --with-deps 2>&1 | tail -5 \
    && echo "[entrypoint] agent-browser installed" \
    || echo "[entrypoint] agent-browser install failed — skipping"
fi

# Source any harness-pack entrypoint hooks (installed by `oh harness add`)
for hook in /usr/local/bin/*-entrypoint-hook.sh; do
  [ -x "$hook" ] && "$hook"
done

# First-boot message if onboarding not complete
if [ ! -f "/home/sandbox/.claude/.onboarded" ]; then
  echo ""
  echo "  ┌─────────────────────────────────────────────────┐"
  echo "  │  First boot detected.                           │"
  echo "  │  Optional Slack bridge setup:                   │"
  echo "  │    see .oh/docs/integrations/slack.md           │"
  echo "  │  Start an agent from this shell:                │"
  echo "  │    claude   # or: codex, pi                     │"
  echo "  └─────────────────────────────────────────────────┘"
  echo ""
fi

exec "$@"
