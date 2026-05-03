#!/usr/bin/env bash
set -euo pipefail

# Surface silent set -e exits — without this, any non-zero return mid-script
# kills bash with no `ERROR:` line and the user is left staring at a prompt
# wondering why install bailed.
trap 'printf "\n\033[0;31mERROR:\033[0m install.sh aborted (exit %s) at line %s: %s\n" "$?" "$LINENO" "$BASH_COMMAND" >&2' ERR

# ─── Colours / helpers ───────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
banner() { printf "\n${CYAN}==> %s${NC}\n" "$*"; }
ok()     { printf "${GREEN} ✓  %s${NC}\n" "$*"; }
warn()   { printf "${YELLOW}WARN: %s${NC}\n" "$*" >&2; }
die()    { printf "${RED}ERROR: %s${NC}\n" "$*" >&2; exit 1; }

# ─── prompt_input: env-var > /dev/tty > default fallback > die ──────
# Args: $1=varname, $2=prompt msg, $3=default (optional), $4=-s for secret
# Reads from /dev/tty so curl-piped installs still get keystrokes (stdin
# is the script source in pipe mode, not the user's keyboard).
prompt_input() {
  local __var="$1"; local __msg="$2"; local __default="${3:-}"; local __secret="${4:-}"
  if [ -n "${!__var:-}" ]; then
    ok "Using $__var from environment"
    return 0
  fi
  if [ -r /dev/tty ]; then
    if [ -n "$__default" ]; then
      printf "  %s [%s]: " "$__msg" "$__default"
    else
      printf "  %s: " "$__msg"
    fi
    local reply
    if [ "$__secret" = "-s" ]; then
      read -rs reply </dev/tty || reply=""
      printf "\n"
    else
      read -r reply </dev/tty || reply=""
    fi
    printf -v "$__var" '%s' "${reply:-$__default}"
  else
    if [ -n "$__default" ]; then
      printf -v "$__var" '%s' "$__default"
      warn "$__var defaulted (no TTY available)"
    else
      die "$__var required but no TTY available. Set ${__var}=<value> as env var and re-run."
    fi
  fi
}

# ─── prompt_yn: yes/no prompt with /dev/tty discipline ──────────────
# Args: $1=prompt msg, $2=default ("y" or "n")
# Returns 0 for yes, 1 for no.
# Respects ASSUME_YES=true and ASSUME_NO=true.
prompt_yn() {
  local __msg="$1"; local __default="${2:-y}"
  if [ "${ASSUME_YES:-false}" = true ]; then
    return 0
  fi
  if [ "${ASSUME_NO:-false}" = true ]; then
    return 1
  fi
  local __bracket
  if [ "$__default" = "y" ] || [ "$__default" = "Y" ]; then
    __bracket="[Y/n]"
  else
    __bracket="[y/N]"
  fi
  if [ -r /dev/tty ]; then
    local __reply
    printf "  %s %s: " "$__msg" "$__bracket"
    read -r __reply </dev/tty || __reply=""
    __reply="${__reply:-$__default}"
    case "$__reply" in
      [Yy]*) return 0 ;;
      *)     return 1 ;;
    esac
  else
    warn "No TTY available — using default for: $__msg"
    case "$__default" in
      [Yy]*) return 0 ;;
      *)     return 1 ;;
    esac
  fi
}

# ─── Help ────────────────────────────────────────────────────────────
print_help() {
  cat <<HELPEOF
Open Harness — Installer

Usage:
  curl -fsSL https://oh.mifune.dev/install.sh | bash [-s -- <flags>]
  ./scripts/install.sh [<flags>]

Clones (or pulls) the repo into ~/openharness, prepares host auth dirs,
and brings up the sandbox via 'docker compose'. Per SPEC v0.7, docker
compose is the canonical substrate; the legacy 'oh' CLI is removed.

Flags:
  -y, --yes            Accept default at any prompt.
  -n, --no             Decline at any prompt (abort path).
  -h, --help           Show this help and exit.

Env vars:
  OH_INSTALL_REF       Git ref (tag/SHA) to clone instead of main
  OH_ASSUME_YES        Set to 1 for --yes
  SANDBOX_NAME         Skip the "Container name" prompt
  SANDBOX_PASSWORD     Skip the credential prompt

Examples:
  curl -fsSL https://oh.mifune.dev/install.sh | bash
  curl -fsSL https://oh.mifune.dev/install.sh | bash -s -- --yes
  ./scripts/install.sh
HELPEOF
}

# ─── Arg parsing ─────────────────────────────────────────────────────
ASSUME_YES="${OH_ASSUME_YES:+true}"; ASSUME_YES="${ASSUME_YES:-false}"
ASSUME_NO=false

while [ $# -gt 0 ]; do
  case "$1" in
    -y|--yes)
      ASSUME_YES=true
      ;;
    -n|--no)
      ASSUME_NO=true
      ;;
    -h|--help)
      print_help; exit 0
      ;;
    --yes=*|--no=*)
      die "Flags do not take =value (got '$1'). Use space-separated form, e.g. '--yes'."
      ;;
    *)
      warn "Unknown argument: $1 (ignoring)"
      ;;
  esac
  shift
done

[ "$ASSUME_YES" = true ] && [ "$ASSUME_NO" = true ] && die "--yes and --no are mutually exclusive."

# ─── Banner ──────────────────────────────────────────────────────────
printf "\n${CYAN}╔══════════════════════════════════════╗${NC}\n"
printf "${CYAN}║   Open Harness — Installer           ║${NC}\n"
printf "${CYAN}╚══════════════════════════════════════╝${NC}\n\n"

# ─── 1. Check Docker ────────────────────────────────────────────────
banner "Checking Docker"
if ! command -v docker >/dev/null 2>&1; then
  die "Docker is not installed. Install Docker from: https://docs.docker.com/get-docker/"
fi
if ! docker compose version >/dev/null 2>&1; then
  die "Docker Compose plugin is not installed. Install it from: https://docs.docker.com/compose/install/"
fi
ok "Docker $(docker --version | awk '{print $3}') — OK"
ok "Docker Compose $(docker compose version --short) — OK"

# ─── 2. Check git ────────────────────────────────────────────────────
banner "Checking git"
if ! command -v git >/dev/null 2>&1; then
  die "git is not installed. Install git from: https://git-scm.com"
fi
ok "git $(git --version | awk '{print $3}') — OK"

# ─── 3. Resolve repo directory ────────────────────────────────────────
banner "Resolving repository"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd)"
# install.sh lives at scripts/install.sh; the repo root is its parent.
REPO_CANDIDATE="$(cd "$SCRIPT_DIR/.." 2>/dev/null && pwd)"

if [ -n "$REPO_CANDIDATE" ] && [ -f "$REPO_CANDIDATE/.devcontainer/docker-compose.yml" ] && [ -f "$REPO_CANDIDATE/scripts/install.sh" ]; then
  REPO_DIR="$REPO_CANDIDATE"
  ok "Using local repo: $REPO_DIR"
else
  REPO_DIR="$HOME/openharness"
  # One-time migration: legacy curl-pipe installs cloned to ~/.openharness,
  # which collides visually with the in-repo `.openharness/` config dir.
  # If the new path is absent and the old one is a clone, move it.
  LEGACY_REPO="$HOME/.openharness"
  if [ ! -d "$REPO_DIR" ] && [ -d "$LEGACY_REPO/.git" ]; then
    mv "$LEGACY_REPO" "$REPO_DIR"
    ok "Migrated $LEGACY_REPO → $REPO_DIR"
  fi
  unset LEGACY_REPO
  if [ -d "$REPO_DIR/.git" ]; then
    # Gate pull on clean working tree — don't abort on local edits.
    if git -C "$REPO_DIR" diff --quiet 2>/dev/null && git -C "$REPO_DIR" diff --cached --quiet 2>/dev/null; then
      printf "  Repository exists — pulling latest changes...\n"
      git -C "$REPO_DIR" pull --ff-only
      ok "Repository updated: $REPO_DIR"
    else
      warn "Local changes detected in $REPO_DIR — skipping git pull. Stash or commit them, then re-run if you want the latest main."
    fi
  else
    if [ -n "${OH_INSTALL_REF:-}" ]; then
      git clone --branch "$OH_INSTALL_REF" https://github.com/ryaneggz/open-harness.git "$REPO_DIR"
      ok "Repository cloned at ref '$OH_INSTALL_REF': $REPO_DIR"
    else
      git clone https://github.com/ryaneggz/open-harness.git "$REPO_DIR"
      ok "Repository cloned: $REPO_DIR"
    fi
  fi
fi

cd "$REPO_DIR"

# ─── 4. Configure sandbox ────────────────────────────────────────────
banner "Configuring sandbox"

DEFAULT_NAME=$(basename "$REPO_DIR")
prompt_input SANDBOX_NAME "Container name" "$DEFAULT_NAME"
ok "Name: $SANDBOX_NAME"

# SANDBOX_PASSWORD is only consumed by the opt-in sshd overlay; use a
# silent default rather than prompting every install.
SANDBOX_PASSWORD="${SANDBOX_PASSWORD:-changeme}"

# Single-quoting handles names containing shell metacharacters; literal
# single quotes are escaped.
mkdir -p "$REPO_DIR/.devcontainer"

if [ -f "$REPO_DIR/.devcontainer/.env" ]; then
  ok "Existing .devcontainer/.env preserved (delete it to regenerate)"
else
  # Detect host values for pre-population
  __TZ="$(cat /etc/timezone 2>/dev/null || echo America/Denver)"
  __GIT_NAME="$(git config --get user.name 2>/dev/null || true)"
  __GIT_EMAIL="$(git config --get user.email 2>/dev/null || true)"
  __SN_ESC="${SANDBOX_NAME//\'/\'\\\'\'}"
  __SP_ESC="${SANDBOX_PASSWORD//\'/\'\\\'\'}"

  cat > "$REPO_DIR/.devcontainer/.env" <<ENVEOF
# ─── Open Harness — Generated environment ─────────────────────────────────
# Generated by install.sh. Edit freely; rerun \`make destroy && make sandbox\`
# to apply changes.

# ─── Sandbox ─────────────────────────────────────────────────────────────────
SANDBOX_NAME='$__SN_ESC'

# Only honored when sshd overlay is active (docker-compose.sshd.yml).
SANDBOX_PASSWORD='$__SP_ESC'

# ─── Timezone ────────────────────────────────────────────────────────────────
TZ=$__TZ

# ─── GitHub ──────────────────────────────────────────────────────────────────
# Personal access token. Entrypoint runs gh auth login + setup-git on boot.
# Leave blank to authenticate manually inside the sandbox.
GH_TOKEN=

# ─── Heartbeat ───────────────────────────────────────────────────────────────
HEARTBEAT_AGENT=claude

# ─── Agent Browser ───────────────────────────────────────────────────────────
# Set true to install Chromium (~1 GB, +3 min build).
INSTALL_AGENT_BROWSER=false
ENVEOF

  # Append optional git identity lines only when non-empty
  if [ -n "$__GIT_NAME" ]; then
    __GN_ESC="${__GIT_NAME//\'/\'\\\'\'}"
    printf "GIT_USER_NAME='%s'\n" "$__GN_ESC" >> "$REPO_DIR/.devcontainer/.env"
    unset __GN_ESC
  fi
  if [ -n "$__GIT_EMAIL" ]; then
    __GE_ESC="${__GIT_EMAIL//\'/\'\\\'\'}"
    printf "GIT_USER_EMAIL='%s'\n" "$__GE_ESC" >> "$REPO_DIR/.devcontainer/.env"
    unset __GE_ESC
  fi

  unset __SN_ESC __SP_ESC __TZ __GIT_NAME __GIT_EMAIL
  ok "Wrote .devcontainer/.env"

  # ─── Auto-detect host gh token ────────────────────────────────────────
  __GH_AUTOCONFIGURED=0
  if command -v gh >/dev/null 2>&1; then
    if __GH_TOKEN_RAW="$(gh auth token 2>/dev/null)" && [ -n "$__GH_TOKEN_RAW" ]; then
      banner "Detected host gh token"
      if prompt_yn "Share host gh token with sandbox? (skips in-sandbox 'gh auth login')" y; then
        __GHT_ESC="${__GH_TOKEN_RAW//\'/\'\\\'\'}"
        printf "GH_TOKEN='%s'\n" "$__GHT_ESC" >> "$REPO_DIR/.devcontainer/.env"
        ok "Wrote GH_TOKEN to .devcontainer/.env"
        __GH_AUTOCONFIGURED=1
        unset __GHT_ESC
      else
        ok "Skipped — you'll run 'gh auth login' inside the sandbox"
      fi
      unset __GH_TOKEN_RAW
    fi
  fi
fi

# ─── Pre-create host auth source dirs ────────────────────────────────
# Default config enables host-bind overlays (claude-host.yml, codex-host.yml)
# that bind ~/.claude and ~/.codex from the host into the container. Two
# preconditions (each documented in the overlay headers):
#   1. Host UID == 1000 (credential files are mode 0600 — group-membership
#      trick in entrypoint.sh cannot bypass owner-only reads).
#   2. Host source dir pre-exists. Otherwise docker auto-creates it as
#      root, and the sandbox user (UID 1000) gets EACCES on first write.
#
# This block satisfies (2) by creating the dirs as the running user.
# (1) is checked below and surfaced as a warning — the user must opt
# out by hand if their host UID isn't 1000.
banner "Preparing host auth dirs for sandbox bind-mounts"
for d in .claude .codex .pi; do
  if [ ! -d "$HOME/$d" ]; then
    mkdir -p "$HOME/$d"
    ok "Created ~/$d (empty — first-time auth will populate it)"
  else
    ok "~/$d already exists — host auth will share into the sandbox"
  fi
done
if [ ! -e "$HOME/.claude.json" ]; then
  printf '{}\n' > "$HOME/.claude.json"
  ok "Created ~/.claude.json (empty)"
fi

__HOST_UID="$(id -u)"
if [ "$__HOST_UID" != "1000" ]; then
  __OH_CONFIG="$REPO_DIR/.openharness/config.json"
  if command -v jq >/dev/null 2>&1 && [ -f "$__OH_CONFIG" ]; then
    # Filter *-host.yml entries out of composeOverrides. Mode-0600
    # credential files in ~/.claude / ~/.codex can't be read by the
    # sandbox user (UID 1000) when the host UID differs. Drop the
    # overlays so the base named volumes (claude-auth, codex-auth)
    # take over; entrypoint.sh chowns those to UID 1000.
    __OH_TMP="$(mktemp)"
    if jq '.composeOverrides |= map(select(test("-host\\.yml$") | not))' \
         "$__OH_CONFIG" > "$__OH_TMP" 2>/dev/null; then
      if ! cmp -s "$__OH_CONFIG" "$__OH_TMP"; then
        mv "$__OH_TMP" "$__OH_CONFIG"
        ok "Host UID $__HOST_UID ≠ 1000 — disabled host-bind overlays in $__OH_CONFIG"
        ok "Auth will live in named volumes; first run of claude/codex inside the sandbox will authenticate"
        warn "$__OH_CONFIG now has a local diff — \`git pull\` in $REPO_DIR will be skipped until you commit or revert it"
      else
        rm -f "$__OH_TMP"
        ok "Host UID $__HOST_UID ≠ 1000 — host-bind overlays already disabled"
      fi
    else
      rm -f "$__OH_TMP"
      warn "jq failed to rewrite $__OH_CONFIG — falling back to manual instructions below."
      __OH_FALLBACK=1
    fi
    unset __OH_TMP
  else
    __OH_FALLBACK=1
  fi
  if [ "${__OH_FALLBACK:-0}" = "1" ]; then
    warn "Host UID is $__HOST_UID — sandbox user is UID 1000."
    warn "Credential files in ~/.claude / ~/.codex are mode 0600;"
    warn "the sandbox WILL NOT be able to read them despite the bind-mount."
    warn ""
    warn "Install jq, OR edit $REPO_DIR/.openharness/config.json"
    warn "and remove these overlays from composeOverrides:"
    warn "    .devcontainer/docker-compose.claude-host.yml"
    warn "    .devcontainer/docker-compose.codex-host.yml"
    warn ""
    warn "The base named volumes (claude-auth, codex-auth) will take over"
    warn "and entrypoint.sh chowns them to UID 1000 on boot."
  fi
  unset __OH_CONFIG __OH_FALLBACK
fi
unset __HOST_UID

# ─── 5. Bring up the sandbox ─────────────────────────────────────────
banner "Building and starting sandbox"
printf "${CYAN}==> Building image — ~10 min on cold cache, ~30s on warm cache. Compose output below.${NC}\n"
COMPOSE_FILES="-f .devcontainer/docker-compose.yml"
if command -v jq >/dev/null 2>&1 && [ -f "$REPO_DIR/.openharness/config.json" ]; then
  while IFS= read -r override; do
    [ -n "$override" ] && COMPOSE_FILES="$COMPOSE_FILES -f $override"
  done < <(jq -r '.composeOverrides[]?' "$REPO_DIR/.openharness/config.json")
fi
docker compose $COMPOSE_FILES up -d --build
ok "Sandbox '$SANDBOX_NAME' started"

# ─── Next Steps ──────────────────────────────────────────────────────
printf "\n${GREEN}Installation complete!${NC}\n\n"
printf "  ${CYAN}Configuration${NC}\n"
printf "  ──────────────────────────────────────\n"
printf "       ${CYAN}.devcontainer/.env${NC}  — sandbox name, timezone, optional GH_TOKEN, etc.\n"
printf "                             Defaults work; edit if you want to customize.\n"
printf "\n"
printf "  ${CYAN}Lifecycle (from %s)${NC}\n" "$REPO_DIR"
printf "  ──────────────────────────────────────\n"
printf "       cd %s\n" "$REPO_DIR"
printf "       make shell        # enter the sandbox\n"
printf "                         # then pick your agent: claude, codex, pi, ...\n"
printf "       make help         # all targets\n"
printf "       make destroy      # tear down later\n"
printf "\n"
printf "  ${CYAN}VS Code (alternative)${NC}\n"
printf "  ──────────────────────────────────────\n"
printf "       Open the repo → Cmd+Shift+P → \"Reopen in Container\"\n"

if [ "${__GH_AUTOCONFIGURED:-0}" = "0" ]; then
  printf "\n"
  printf "  ${CYAN}First run inside the sandbox${NC}\n"
  printf "  ──────────────────────────────────────\n"
  printf "       gh auth login && gh auth setup-git\n"
fi

printf "\n"
