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

# ─── normalize_gh_slug: strip GitHub URL decoration → owner/repo ─────
# Handles four forms:
#   https://github.com/owner/repo.git  →  owner/repo
#   https://github.com/owner/repo      →  owner/repo
#   git@github.com:owner/repo.git      →  owner/repo
#   git@github.com:owner/repo          →  owner/repo
normalize_gh_slug() {
  local _url="$1"
  # Strip https://github.com/ prefix (case-insensitive via tr would add
  # complexity; GitHub slugs are case-insensitive but we preserve original case
  # for comparison — OH_GITHUB_REPO is user-supplied already normalized).
  _url="${_url#https://github.com/}"
  # Strip git@github.com: prefix
  _url="${_url#git@github.com:}"
  # Strip trailing .git suffix
  _url="${_url%.git}"
  printf '%s' "$_url"
}


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

Clones (or pulls) the repo into ~/.openharness, prepares host auth dirs,
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
  OH_GITHUB_REPO       GitHub repo to clone (default: ryaneggz/open-harness)
  OH_GITHUB_REF        Git ref to clone (alias: OH_INSTALL_REF)

Examples:
  curl -fsSL https://oh.mifune.dev/install.sh | bash
  curl -fsSL https://oh.mifune.dev/install.sh | bash -s -- --yes
  ./scripts/install.sh
  OH_GITHUB_REPO=myorg/my-harness curl -fsSL \
    https://raw.githubusercontent.com/myorg/my-harness/main/scripts/install.sh | bash
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
  # Install target is ~/.openharness (hidden dir, no collision with repo subdirs).
  # OLD_REPO is the post-#200 path that was briefly the install target.
  OLD_REPO="$HOME/openharness"
  REPO_DIR="$HOME/.openharness"

  # ── OH_GITHUB_REPO: fork-parameterized clone source ───────────────────
  OH_GITHUB_REPO="${OH_GITHUB_REPO:-ryaneggz/open-harness}"
  if [[ ! "$OH_GITHUB_REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
    die "OH_GITHUB_REPO must be <owner>/<repo>: got '$OH_GITHUB_REPO'"
  fi
  if [ "$OH_GITHUB_REPO" != "ryaneggz/open-harness" ]; then
    warn "Cloning from fork: $OH_GITHUB_REPO"
  fi

  # ── OH_GITHUB_REF: alias for OH_INSTALL_REF (OH_GITHUB_REF wins if set) ─
  if [ -n "${OH_GITHUB_REF:-}" ] && [ -n "${OH_INSTALL_REF:-}" ] && [ "$OH_GITHUB_REF" != "$OH_INSTALL_REF" ]; then
    warn "OH_GITHUB_REF and OH_INSTALL_REF both set with different values; OH_GITHUB_REF wins."
  fi
  OH_GITHUB_REF="${OH_GITHUB_REF:-${OH_INSTALL_REF:-}}"

  # ── Population classification + migration ─────────────────────────────
  __HAS_OLD=0; __HAS_NEW=0
  [ -d "$OLD_REPO/.git" ] && __HAS_OLD=1
  if [ -d "$REPO_DIR" ] && [ ! -d "$REPO_DIR/.git" ]; then
    die "~/.openharness exists but is not a git clone. Inspect and remove it, then re-run."
  fi
  [ -d "$REPO_DIR/.git" ] && __HAS_NEW=1

  if [ "$__HAS_OLD" = "1" ] && [ "$__HAS_NEW" = "1" ]; then
    # ── B+C collision: both paths exist ───────────────────────────────────
    __OLD_DIRTY=0; __NEW_DIRTY=0
    git -C "$OLD_REPO" diff --quiet 2>/dev/null && git -C "$OLD_REPO" diff --cached --quiet 2>/dev/null || __OLD_DIRTY=1
    git -C "$REPO_DIR" diff --quiet 2>/dev/null && git -C "$REPO_DIR" diff --cached --quiet 2>/dev/null || __NEW_DIRTY=1
    if [ "$__OLD_DIRTY" = "1" ] && [ "$__NEW_DIRTY" = "0" ]; then
      # OLD has changes; keep OLD as active (rename to new), archive NEW
      __ARCHIVE="${REPO_DIR}.legacy.$(date +%Y%m%d%H%M%S)"
      mv "$REPO_DIR" "$__ARCHIVE"
      warn "Archived $REPO_DIR → $__ARCHIVE"
      git -C "$OLD_REPO" stash push -u -m "install.sh: pre-rename autostash" 2>/dev/null || true
      mv "$OLD_REPO" "$REPO_DIR"
      ok "Migrated $OLD_REPO → $REPO_DIR (had local changes — autostashed)"
    elif [ "$__NEW_DIRTY" = "1" ] && [ "$__OLD_DIRTY" = "0" ]; then
      # NEW has changes; keep NEW, archive OLD
      __ARCHIVE="${OLD_REPO}.legacy.$(date +%Y%m%d%H%M%S)"
      mv "$OLD_REPO" "$__ARCHIVE"
      warn "Archived $OLD_REPO → $__ARCHIVE"
      ok "Keeping $REPO_DIR (had local changes)"
    else
      # Neither (or both) dirty: prefer OLD_REPO (post-#200, more recent install)
      __ARCHIVE="${REPO_DIR}.legacy.$(date +%Y%m%d%H%M%S)"
      mv "$REPO_DIR" "$__ARCHIVE"
      warn "Archived $REPO_DIR → $__ARCHIVE"
      git -C "$OLD_REPO" stash push -u -m "install.sh: pre-rename autostash" 2>/dev/null || true
      mv "$OLD_REPO" "$REPO_DIR"
      ok "Migrated $OLD_REPO → $REPO_DIR"
    fi
    unset __OLD_DIRTY __NEW_DIRTY __ARCHIVE
  elif [ "$__HAS_OLD" = "1" ] && [ "$__HAS_NEW" = "0" ]; then
    # ── Population B: ~/openharness only — rename to ~/.openharness ────────
    git -C "$OLD_REPO" stash push -u -m "install.sh: pre-rename autostash" 2>/dev/null || true
    mv "$OLD_REPO" "$REPO_DIR"
    ok "Migrated $OLD_REPO → $REPO_DIR"
  fi
  # Population C (~/.openharness only) and A (neither) fall through to the
  # pull / clone logic below.
  unset __HAS_OLD __HAS_NEW OLD_REPO

  if [ -d "$REPO_DIR/.git" ]; then
    # ── US-003: Validate remote origin matches OH_GITHUB_REPO ─────────────
    __ORIGIN_RAW="$(git -C "$REPO_DIR" remote get-url origin 2>/dev/null || true)"
    __ORIGIN_SLUG="$(normalize_gh_slug "${__ORIGIN_RAW:-}")"
    __EXPECTED_SLUG="$(normalize_gh_slug "$OH_GITHUB_REPO")"
    if [ -z "$__ORIGIN_RAW" ] || [ "$__ORIGIN_SLUG" != "$__EXPECTED_SLUG" ]; then
      warn "Existing clone origin (${__ORIGIN_RAW:-<none>}) does not match OH_GITHUB_REPO=${OH_GITHUB_REPO}."
      warn "Skipping pull. To switch sources:"
      warn "  1. Back up customizations:  cp ~/.openharness/.devcontainer/.env /tmp/oh.env.bak"
      warn "  2. Remove the clone:        rm -rf ~/.openharness"
      warn "  3. Re-run with the desired OH_GITHUB_REPO and (if needed) OH_GITHUB_REF."
      warn "  Note: rm -rf also discards any local changes and pinned OH_INSTALL_REF state."
    else
      # ── Pull (clean tree only) ─────────────────────────────────────────────
      if git -C "$REPO_DIR" diff --quiet 2>/dev/null && git -C "$REPO_DIR" diff --cached --quiet 2>/dev/null; then
        printf "  Repository exists — pulling latest changes...\n"
        git -C "$REPO_DIR" pull --ff-only
        ok "Repository updated: $REPO_DIR"
      else
        warn "Local changes detected in $REPO_DIR — skipping git pull. Stash or commit them, then re-run if you want the latest main."
      fi
    fi
    unset __ORIGIN_RAW __ORIGIN_SLUG __EXPECTED_SLUG
  else
    # ── Population A: fresh clone ──────────────────────────────────────────
    if [ -n "$OH_GITHUB_REF" ]; then
      git clone --branch "$OH_GITHUB_REF" "https://github.com/${OH_GITHUB_REPO}.git" "$REPO_DIR"
      ok "Repository cloned at ref '$OH_GITHUB_REF': $REPO_DIR"
    else
      git clone "https://github.com/${OH_GITHUB_REPO}.git" "$REPO_DIR"
      ok "Repository cloned: $REPO_DIR"
    fi
  fi

  # ── Seed config.json from example if missing ──────────────────────────
  if [ ! -f "$REPO_DIR/config.json" ] && [ -f "$REPO_DIR/config.example.json" ]; then
    cp "$REPO_DIR/config.example.json" "$REPO_DIR/config.json"
    ok "Seeded config.json from config.example.json"
  fi

  # ── Shell CWD notice (for B migration) ────────────────────────────────
  # If the user's shell was open in ~/openharness, that path no longer exists.
  printf "\n"
  warn "If your current shell is still in ~/openharness, run: cd ~/.openharness"
  printf "\n"
fi

cd "$REPO_DIR"

# ─── 4. Configure sandbox ────────────────────────────────────────────
banner "Configuring sandbox"

DEFAULT_NAME=$(basename "$REPO_DIR")
prompt_input SANDBOX_NAME "Container name" "$DEFAULT_NAME"
ok "Name: $SANDBOX_NAME"

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

  cat > "$REPO_DIR/.devcontainer/.env" <<ENVEOF
# ─── Open Harness — Generated environment ─────────────────────────────────
# Generated by install.sh. Edit freely; rerun \`make destroy && make sandbox\`
# to apply changes.

# ─── Sandbox ─────────────────────────────────────────────────────────────────
SANDBOX_NAME='$__SN_ESC'

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

  unset __SN_ESC __TZ __GIT_NAME __GIT_EMAIL
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

# ─── 5. Bring up the sandbox ─────────────────────────────────────────
banner "Building and starting sandbox"
printf "${CYAN}==> Building image — ~10 min on cold cache, ~30s on warm cache. Compose output below.${NC}\n"
# Base ships with zero in-tree overlays. Downstream packs (e.g. Pi
# extensions, BYO harness packs) can register their own overlays by
# appending paths to composeOverrides[] in config.json.
COMPOSE_FILES="-f .devcontainer/docker-compose.yml"
if command -v jq >/dev/null 2>&1 && [ -f "$REPO_DIR/config.json" ]; then
  while IFS= read -r override; do
    [ -n "$override" ] && COMPOSE_FILES="$COMPOSE_FILES -f $override"
  done < <(jq -r '.composeOverrides[]?' "$REPO_DIR/config.json")
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
printf "                         # then pick your agent: claude, codex, opencode, pi, ...\n"
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
