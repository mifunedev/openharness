#!/usr/bin/env bash
set -euo pipefail

trap 'printf "\n\033[0;31mERROR:\033[0m install.sh aborted (exit %s) at line %s: %s\n" "$?" "$LINENO" "$BASH_COMMAND" >&2' ERR

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
banner() { printf "\n${CYAN}==> %s${NC}\n" "$*"; }
ok()     { printf "${GREEN} ✓  %s${NC}\n" "$*"; }
warn()   { printf "${YELLOW}WARN: %s${NC}\n" "$*" >&2; }
die()    { printf "${RED}ERROR: %s${NC}\n" "$*" >&2; exit 1; }

normalize_gh_slug() {
  local _url="$1"
  _url="${_url#https://github.com/}"
  _url="${_url#git@github.com:}"
  _url="${_url%.git}"
  printf '%s' "$_url"
}


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

print_help() {
  cat <<HELPEOF
Open Harness — Installer

Usage:
  curl -fsSL https://oh.mifune.dev/install.sh | bash [-s -- <flags>]
  curl -fsSL -o openharness-install.sh https://oh.mifune.dev/install.sh
  # Review openharness-install.sh in your editor or pager, then:
  bash openharness-install.sh [<flags>]
  ./.oh/scripts/install.sh [<flags>]

Clones (or pulls) the repo into ~/.openharness, prepares host auth dirs,
and brings up the sandbox via 'docker compose' — the canonical substrate for
this installer. A standalone 'oh' CLI is a separate path that equips an
existing project repo instead (see .oh/docs/installation.md).

Prerequisites:
  Docker with the Compose plugin
  git (used to clone or update Open Harness)
  make (build-essential) — recommended for the post-install lifecycle
                           (make shell / make destroy / make help)

Flags:
  -y, --yes            Accept default at any prompt.
  -n, --no             Decline at any prompt (abort path).
  -h, --help           Show this help and exit.

Env vars:
  OH_INSTALL_REF       Git ref (tag/SHA) to clone instead of main
  OH_ASSUME_YES        Set to 1 for --yes
  SANDBOX_NAME         Skip the "Container name" prompt
  OH_GITHUB_REPO       GitHub repo to clone (default: mifunedev/openharness)
  OH_GITHUB_REF        Git ref to clone (alias: OH_INSTALL_REF)
  OH_REPLACE           Set to 1 to rebuild in place even when a sandbox of the
                       same name is already running (default: refuse, so a live
                       sandbox is never overwritten)
  INSTALL_HERMES=true  Enable an optional agent non-interactively. Also:
                       INSTALL_OPENCODE, INSTALL_DEEPAGENTS, INSTALL_GROK_BUILD,
                       INSTALL_AGENT_BROWSER
  DOCKER_SOCKET=true   Mount the host Docker socket into the sandbox
                       non-interactively. OFF by default (socket access is
                       effectively host root). Otherwise you're prompted (TTY),
                       and --yes/--no keep it off.

Examples:
  curl -fsSL https://oh.mifune.dev/install.sh | bash
  curl -fsSL -o openharness-install.sh https://oh.mifune.dev/install.sh
  # Review openharness-install.sh before running it.
  bash openharness-install.sh
  curl -fsSL https://oh.mifune.dev/install.sh | bash -s -- --yes
  ./.oh/scripts/install.sh
  OH_GITHUB_REPO=myorg/my-harness curl -fsSL \
    https://raw.githubusercontent.com/myorg/my-harness/main/.oh/scripts/install.sh | bash
  curl -fsSL -o openharness-install.sh \
    https://raw.githubusercontent.com/myorg/my-harness/main/.oh/scripts/install.sh
  # Review openharness-install.sh, then run it against your fork.
  OH_GITHUB_REPO=myorg/my-harness bash openharness-install.sh
HELPEOF
}

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

printf "\n${CYAN}╔══════════════════════════════════════╗${NC}\n"
printf "${CYAN}║   Open Harness — Installer           ║${NC}\n"
printf "${CYAN}╚══════════════════════════════════════╝${NC}\n\n"

banner "Checking Docker"
if ! command -v docker >/dev/null 2>&1; then
  die "Docker is not installed. Install Docker from: https://docs.docker.com/get-docker/"
fi
if ! docker compose version >/dev/null 2>&1; then
  die "Docker Compose plugin is not installed. Install it from: https://docs.docker.com/compose/install/"
fi
ok "Docker $(docker --version | awk '{print $3}') — OK"
ok "Docker Compose $(docker compose version --short) — OK"

banner "Checking git"
if ! command -v git >/dev/null 2>&1; then
  die "git is required to clone or update Open Harness. Install git from: https://git-scm.com"
fi
ok "git $(git --version | awk '{print $3}') — OK"

if ! command -v make >/dev/null 2>&1; then
  warn "make not found — the sandbox still comes up, but the documented lifecycle (make shell / make destroy / make help) needs it. Install build-essential (Debian/Ubuntu) or Xcode Command Line Tools (macOS)."
fi

banner "Resolving repository"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd)"
REPO_CANDIDATE="$(cd "$SCRIPT_DIR/../.." 2>/dev/null && pwd)"

if [ -n "$REPO_CANDIDATE" ] && [ -f "$REPO_CANDIDATE/.devcontainer/docker-compose.yml" ] && [ -f "$REPO_CANDIDATE/.oh/scripts/install.sh" ]; then
  REPO_DIR="$REPO_CANDIDATE"
  ok "Using local repo: $REPO_DIR"
else
  OLD_REPO="$HOME/openharness"
  REPO_DIR="$HOME/.openharness"

  OH_GITHUB_REPO="${OH_GITHUB_REPO:-mifunedev/openharness}"
  if [[ ! "$OH_GITHUB_REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
    die "OH_GITHUB_REPO must be <owner>/<repo>: got '$OH_GITHUB_REPO'"
  fi
  if [ "$OH_GITHUB_REPO" != "mifunedev/openharness" ]; then
    warn "Cloning from fork: $OH_GITHUB_REPO"
  fi

  if [ -n "${OH_GITHUB_REF:-}" ] && [ -n "${OH_INSTALL_REF:-}" ] && [ "$OH_GITHUB_REF" != "$OH_INSTALL_REF" ]; then
    warn "OH_GITHUB_REF and OH_INSTALL_REF both set with different values; OH_GITHUB_REF wins."
  fi
  OH_GITHUB_REF="${OH_GITHUB_REF:-${OH_INSTALL_REF:-}}"

  __HAS_OLD=0; __HAS_NEW=0
  [ -d "$OLD_REPO/.git" ] && __HAS_OLD=1
  if [ -d "$REPO_DIR" ] && [ ! -d "$REPO_DIR/.git" ]; then
    # shellcheck disable=SC2088  # ~ is intentional display text in this user-facing message; do not substitute $HOME
    die "~/.openharness exists but is not a git clone. Inspect and remove it, then re-run."
  fi
  [ -d "$REPO_DIR/.git" ] && __HAS_NEW=1

  if [ "$__HAS_OLD" = "1" ] && [ "$__HAS_NEW" = "1" ]; then
    __OLD_DIRTY=0; __NEW_DIRTY=0
    git -C "$OLD_REPO" diff --quiet 2>/dev/null && git -C "$OLD_REPO" diff --cached --quiet 2>/dev/null || __OLD_DIRTY=1
    git -C "$REPO_DIR" diff --quiet 2>/dev/null && git -C "$REPO_DIR" diff --cached --quiet 2>/dev/null || __NEW_DIRTY=1
    if [ "$__OLD_DIRTY" = "1" ] && [ "$__NEW_DIRTY" = "0" ]; then
      __ARCHIVE="${REPO_DIR}.legacy.$(date +%Y%m%d%H%M%S)"
      mv "$REPO_DIR" "$__ARCHIVE"
      warn "Archived $REPO_DIR → $__ARCHIVE"
      git -C "$OLD_REPO" stash push -u -m "install.sh: pre-rename autostash" 2>/dev/null || true
      mv "$OLD_REPO" "$REPO_DIR"
      ok "Migrated $OLD_REPO → $REPO_DIR (had local changes — autostashed)"
    elif [ "$__NEW_DIRTY" = "1" ] && [ "$__OLD_DIRTY" = "0" ]; then
      __ARCHIVE="${OLD_REPO}.legacy.$(date +%Y%m%d%H%M%S)"
      mv "$OLD_REPO" "$__ARCHIVE"
      warn "Archived $OLD_REPO → $__ARCHIVE"
      ok "Keeping $REPO_DIR (had local changes)"
    else
      __ARCHIVE="${REPO_DIR}.legacy.$(date +%Y%m%d%H%M%S)"
      mv "$REPO_DIR" "$__ARCHIVE"
      warn "Archived $REPO_DIR → $__ARCHIVE"
      git -C "$OLD_REPO" stash push -u -m "install.sh: pre-rename autostash" 2>/dev/null || true
      mv "$OLD_REPO" "$REPO_DIR"
      ok "Migrated $OLD_REPO → $REPO_DIR"
    fi
    unset __OLD_DIRTY __NEW_DIRTY __ARCHIVE
  elif [ "$__HAS_OLD" = "1" ] && [ "$__HAS_NEW" = "0" ]; then
    git -C "$OLD_REPO" stash push -u -m "install.sh: pre-rename autostash" 2>/dev/null || true
    mv "$OLD_REPO" "$REPO_DIR"
    ok "Migrated $OLD_REPO → $REPO_DIR"
  fi
  unset __HAS_OLD __HAS_NEW OLD_REPO

  if [ -d "$REPO_DIR/.git" ]; then
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
    if [ -n "$OH_GITHUB_REF" ]; then
      git clone --branch "$OH_GITHUB_REF" "https://github.com/${OH_GITHUB_REPO}.git" "$REPO_DIR"
      ok "Repository cloned at ref '$OH_GITHUB_REF': $REPO_DIR"
    else
      git clone "https://github.com/${OH_GITHUB_REPO}.git" "$REPO_DIR"
      ok "Repository cloned: $REPO_DIR"
    fi
  fi

  printf "\n"
  warn "If your current shell is still in ~/openharness, run: cd ~/.openharness"
  printf "\n"
fi

cd "$REPO_DIR"

if [ -x .oh/scripts/link-providers.sh ]; then
  bash .oh/scripts/link-providers.sh --init
fi

banner "Configuring sandbox"

DEFAULT_NAME=$(basename "$REPO_DIR"); DEFAULT_NAME="${DEFAULT_NAME#.}"
[ -n "$DEFAULT_NAME" ] || DEFAULT_NAME="openharness"
prompt_input SANDBOX_NAME "Container name" "$DEFAULT_NAME"
ok "Name: $SANDBOX_NAME"

if [ "${OH_REPLACE:-}" != "1" ] && docker ps -a --format '{{.Names}}' 2>/dev/null | grep -Fxq "$SANDBOX_NAME"; then
  die "A sandbox named '$SANDBOX_NAME' already exists (a container with that name is present — running or stopped) — refusing to overwrite it and risk losing its .devcontainer/.env or .hermes state. Choose a unique name (re-run with SANDBOX_NAME=<name>), or pass OH_REPLACE=1 to rebuild this one in place."
fi

mkdir -p "$REPO_DIR/.devcontainer"

ENV_FILE="$REPO_DIR/.devcontainer/.env"
mkdir -p "$REPO_DIR/.devcontainer"
if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$REPO_DIR/.devcontainer/.example.env" ]; then
    cp "$REPO_DIR/.devcontainer/.example.env" "$ENV_FILE"
    chmod 600 "$ENV_FILE" 2>/dev/null || true
    ok "Created .devcontainer/.env from .devcontainer/.example.env"
  else
    : > "$ENV_FILE"
    chmod 600 "$ENV_FILE" 2>/dev/null || true
    warn ".devcontainer/.example.env missing — sandbox will boot from compose defaults only."
  fi
  __ENV_WAS_NEW=1
else
  ok "Existing .devcontainer/.env preserved — updating keys in place"
  __ENV_WAS_NEW=0
fi

if [ -f "$REPO_DIR/harness.yaml" ] && [ -f "$REPO_DIR/.oh/scripts/migrate-harness-yaml.sh" ]; then
  sh "$REPO_DIR/.oh/scripts/migrate-harness-yaml.sh" "$REPO_DIR"
fi

_env_set() {
  [ -n "${2:-}" ] || return 0
  awk -v key="$1" -v val="$2" '
    BEGIN { done = 0 }
    !done && $0 ~ "^" key "=" { print key "=" val; done = 1; next }
    !done && $0 ~ "^[[:space:]]*#[[:space:]]*" key "=" { print key "=" val; done = 1; next }
    { print }
    END { if (!done) print key "=" val }
  ' "$ENV_FILE" > "$ENV_FILE.oh-tmp" || { rm -f "$ENV_FILE.oh-tmp"; return 1; }
  mv "$ENV_FILE.oh-tmp" "$ENV_FILE" || return 1
  ok ".devcontainer/.env: $1"
}

# THE CONFIG WRITES ALWAYS RUN. They used to sit inside `if [ ! -f .env ]`, so

_sedi() {
  if sed --version >/dev/null 2>&1; then
    sed -i "$@"
  else
    sed -i '' "$@"
  fi
}
_sed_val() {
  printf '%s' "$1" \
    | sed 's/\\/\\\\/g' \
    | sed 's/|/\\|/g' \
    | sed 's/&/\\&/g'
}

__TZ="$(cat /etc/timezone 2>/dev/null || echo America/Los_Angeles)"
__GIT_NAME="$(git config --get user.name 2>/dev/null || true)"
__GIT_EMAIL="$(git config --get user.email 2>/dev/null || true)"

_env_set SANDBOX_NAME   "$SANDBOX_NAME"
if [ "$__ENV_WAS_NEW" = "1" ]; then
  _env_set TZ             "$__TZ"
  _env_set GIT_USER_NAME  "$__GIT_NAME"
  _env_set GIT_USER_EMAIL "$__GIT_EMAIL"
fi

unset __TZ __GIT_NAME __GIT_EMAIL

__GH_AUTOCONFIGURED=0
if command -v gh >/dev/null 2>&1 && ! grep -qE '^GH_TOKEN=.+' "$ENV_FILE"; then
  if __GH_TOKEN_RAW="$(gh auth token 2>/dev/null)" && [ -n "$__GH_TOKEN_RAW" ]; then
    banner "Detected host gh token"
    if prompt_yn "Share host gh token with sandbox? (skips in-sandbox 'gh auth login')" y; then
      __GHT_SAFE="$(_sed_val "$__GH_TOKEN_RAW")"
      _sedi "s|^GH_TOKEN=.*|GH_TOKEN=${__GHT_SAFE}|" "$ENV_FILE"
      ok "Wrote GH_TOKEN to .devcontainer/.env"
      __GH_AUTOCONFIGURED=1
      unset __GHT_SAFE
    else
      ok "Skipped — you'll run 'gh auth login' inside the sandbox"
    fi
    unset __GH_TOKEN_RAW
  fi
fi

banner "Optional installs (off by default)"
_opt_install() {
  local __k="INSTALL_$1"
  if [ "${!__k:-}" = "true" ]; then
    _env_set "INSTALL_$1" true
    return 0
  fi
  if grep -qE "^INSTALL_$1=true" "$ENV_FILE"; then
    return 0
  fi
  if [ "$ASSUME_YES" = true ] || [ "$ASSUME_NO" = true ] || [ ! -r /dev/tty ]; then
    return 0
  fi
  if prompt_yn "Install $2?" n; then
    _env_set "INSTALL_$1" true
  fi
}
_opt_install HERMES        "Hermes — Nous self-improving agent CLI"
_opt_install OPENCODE      "OpenCode — OpenAI-OAuth terminal agent"
_opt_install DEEPAGENTS    "DeepAgents — LangChain multi-provider agent"
_opt_install GROK_BUILD    "Grok Build — xAI terminal agent"
_opt_install AGENT_BROWSER "agent-browser + Chromium (~1 GB)"

banner "Host Docker socket (off by default)"
if grep -qE '^DOCKER_SOCKET=' "$ENV_FILE"; then
  ok "DOCKER_SOCKET already set — leaving it alone"
elif [ "${DOCKER_SOCKET:-}" = "true" ]; then
  _env_set DOCKER_SOCKET true
  ok "DOCKER_SOCKET=true (from environment) — host Docker socket will be mounted"
elif [ "$ASSUME_YES" = true ] || [ "$ASSUME_NO" = true ] || [ ! -r /dev/tty ]; then
  :
elif prompt_yn "Mount host Docker socket into the sandbox? (effectively host root — enable only if the agent must drive Docker)" n; then
  _env_set DOCKER_SOCKET true
  ok "DOCKER_SOCKET=true — host Docker socket will be mounted"
fi


banner "Building and starting sandbox"
printf "${CYAN}==> Building image — ~10 min on cold cache, ~30s on warm cache. Compose output below.${NC}\n"
(
  cd "$REPO_DIR"
  "$REPO_DIR/.oh/scripts/docker-compose.sh" up -d --build
)
ok "Sandbox '$SANDBOX_NAME' started"

printf "\n${GREEN}Installation complete!${NC}\n\n"
printf "  ${CYAN}Configuration${NC}\n"
printf "  ──────────────────────────────────────\n"
printf "       ${CYAN}.devcontainer/.env${NC}  — your answers were written here. The ONE local\n"
printf "                             (gitignored) config file, read on every path including\n"
printf "                             VS Code \"Reopen in Container\".\n"
printf "       ${CYAN}.devcontainer/.example.env${NC} — the tracked schema: every key, with its default.\n"
printf "                             Defaults work; edit .env if you want to customize.\n"
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

printf "\n"
printf "  ${CYAN}Optional capabilities${NC}  (installed live — no rebuild)\n"
printf "  ──────────────────────────────────────\n"
printf "       oh harness install hermes        — Hermes agent (then 'hermes setup'; optional dashboard)\n"
printf "       oh harness install opencode      — OpenCode terminal agent\n"
printf "       oh harness install deepagents    — LangChain DeepAgents\n"
printf "       oh harness install grok-build    — xAI Grok Build\n"
printf "       oh tool install agent-browser    — headless Chromium for screenshots / previews (~1 GB)\n"
printf "                                          (each uncomments the .devcontainer/.env key for you)\n"
printf "\n"
printf "  ${CYAN}Messaging gateways${NC}\n"
printf "  ──────────────────────────────────────\n"
printf "       inside the sandbox:  gateway pi | gateway hermes | gateway status\n"
printf "       from the host:       make gateway <pi|hermes>\n"
printf "       details:             .oh/docs/integrations/slack.md\n"

if [ "${__GH_AUTOCONFIGURED:-0}" = "0" ]; then
  printf "\n"
  printf "  ${CYAN}First run inside the sandbox${NC}\n"
  printf "  ──────────────────────────────────────\n"
  printf "       gh auth login && gh auth setup-git\n"
fi

printf "\n"
