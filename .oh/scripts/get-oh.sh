#!/usr/bin/env bash

# ─── Sourced-vs-executed detection ───────────────────────────────────
# When this script is `source`d (e.g. `source <(curl -fsSL .../get-oh.sh)`)
# so it can mutate the CALLER's live PATH, it must NOT enable strict mode,
# must NOT install traps on the caller's interactive shell, and must NOT
# `exit` — any of those would corrupt or kill the interactive session.
if [ "${BASH_SOURCE[0]}" != "$0" ]; then _OH_SOURCED=1; else _OH_SOURCED=0; fi

# Strict mode only when executed as its own process — never when sourced.
[ "$_OH_SOURCED" = 0 ] && set -euo pipefail

# get-oh.sh — install the standalone `oh` CLI onto a host.
#
# This script is the npm-free bootstrap: it places the single, self-contained
# `oh` binary at its destination (default ~/.local/bin/oh) and nothing else — it
# does NOT clone the harness repo and does NOT touch the sandbox install dir or
# any existing config. It prefers a prebuilt bundle (https://oh.mifune.dev/oh.js)
# and falls back to building from source in a temp dir if that download fails.
# (The CLI is also published to npm as `@mifune/openharness` — `npm i -g
# @mifune/openharness` — for hosts that already have Node >= 20.)
#
# `oh init` fetches its scaffold payload on demand (a shallow clone into a temp
# dir that it deletes), so no local repo is needed after install.
#
# Requires Node.js >= 20 to RUN `oh`; if it's missing this script offers to
# install nvm + Node 22 and sources it so `oh` works in the same shell.
# git is only needed for the build fallback and for `oh init`'s payload fetch.

# Surface silent set -e exits — without this, any non-zero return mid-script
# kills bash with no `ERROR:` line and the user is left staring at a prompt.
# Executed path only: never install traps on a sourcing caller's shell.
[ "$_OH_SOURCED" = 0 ] && trap 'printf "\n\033[0;31mERROR:\033[0m get-oh.sh aborted (exit %s) at line %s: %s\n" "$?" "$LINENO" "$BASH_COMMAND" >&2' ERR

# ─── Colours / helpers ───────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
banner() { printf "\n${CYAN}==> %s${NC}\n" "$*"; }
ok()     { printf "${GREEN} ✓  %s${NC}\n" "$*"; }
warn()   { printf "${YELLOW}WARN: %s${NC}\n" "$*" >&2; }
die()    { printf "${RED}ERROR: %s${NC}\n" "$*" >&2; if [ "${_OH_SOURCED:-0}" = 1 ]; then _oh_cleanup; return 1; else exit 1; fi; }
# Remove the temp dir. On the executed path an EXIT trap calls this; on the
# sourced path there is no EXIT trap (we must not install one on the caller),
# so we invoke it explicitly at the end and from die().
_oh_cleanup() { [ -n "${TMP:-}" ] && rm -rf "$TMP" 2>/dev/null || true; }

# ─── prompt_yn: yes/no prompt with /dev/tty discipline ──────────────
# Reads keystrokes from /dev/tty so it works when the script is piped from
# curl (stdin is the script source in pipe mode, not the keyboard).
# Respects ASSUME_YES / ASSUME_NO. Returns 0 for yes, 1 for no.
prompt_yn() {
  local __msg="$1"; local __default="${2:-y}"
  if [ "${ASSUME_YES:-false}" = true ]; then return 0; fi
  if [ "${ASSUME_NO:-false}" = true ]; then return 1; fi
  local __bracket
  if [ "$__default" = "y" ] || [ "$__default" = "Y" ]; then __bracket="[Y/n]"; else __bracket="[y/N]"; fi
  if [ -r /dev/tty ]; then
    local __reply
    printf "  %s %s: " "$__msg" "$__bracket"
    read -r __reply </dev/tty || __reply=""
    __reply="${__reply:-$__default}"
    case "$__reply" in [Yy]*) return 0 ;; *) return 1 ;; esac
  else
    warn "No TTY available — using default for: $__msg"
    case "$__default" in [Yy]*) return 0 ;; *) return 1 ;; esac
  fi
}

# ─── Help ────────────────────────────────────────────────────────────
print_help() {
  cat <<HELPEOF
Open Harness — install the standalone 'oh' CLI

Usage:
  curl -fsSL https://oh.mifune.dev/get-oh.sh | bash
  curl -fsSL -o get-oh.sh https://oh.mifune.dev/get-oh.sh
  # Review get-oh.sh in your editor or pager, then:
  bash get-oh.sh
  ./.oh/scripts/get-oh.sh

Installs the single self-contained 'oh' binary to ~/.local/bin/oh (no repo
clone). Then: cd <your-project> && oh init

Prerequisites:
  Node.js >= 20   (to RUN 'oh'; if missing, this script offers to install nvm + Node 22)
  git             (only for the build fallback and for 'oh init' payload fetch)

Flags:
  -y, --yes            Accept prompts (e.g. auto-install nvm + Node 22).
  -n, --no             Decline prompts.
  -h, --help           Show this help and exit.

Env vars:
  OH_BIN_DIR           Where to install 'oh' (default: ~/.local/bin)
  OH_JS_URL            Prebuilt bundle URL (default: https://oh.mifune.dev/oh.js)
  OH_GITHUB_REPO       Repo for the build fallback (default: mifunedev/openharness)
  OH_GITHUB_REF        Git ref for the build fallback (alias: OH_INSTALL_REF)
  OH_NVM_VERSION       nvm version tag for the Node install (default: v0.40.3)

Examples:
  curl -fsSL https://oh.mifune.dev/get-oh.sh | bash -s -- --yes
  OH_BIN_DIR=/usr/local/bin bash get-oh.sh
HELPEOF
}

# ─── Arg parsing ─────────────────────────────────────────────────────
ASSUME_YES="${OH_ASSUME_YES:+true}"; ASSUME_YES="${ASSUME_YES:-false}"
ASSUME_NO=false
while [ $# -gt 0 ]; do
  case "$1" in
    -y|--yes) ASSUME_YES=true ;;
    -n|--no)  ASSUME_NO=true ;;
    -h|--help) print_help; exit 0 ;;
    --yes=*|--no=*) die "Flags do not take =value (got '$1'). Use '--yes'." ;;
    *) warn "Unknown argument: $1 (ignoring)" ;;
  esac
  shift
done
[ "$ASSUME_YES" = true ] && [ "$ASSUME_NO" = true ] && die "--yes and --no are mutually exclusive."

# ─── Config (env-overridable) ────────────────────────────────────────
OH_BIN_DIR="${OH_BIN_DIR:-$HOME/.local/bin}"
OH_JS_URL="${OH_JS_URL:-https://oh.mifune.dev/oh.js}"
OH_GITHUB_REPO="${OH_GITHUB_REPO:-mifunedev/openharness}"
if [[ ! "$OH_GITHUB_REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  die "OH_GITHUB_REPO must be <owner>/<repo>: got '$OH_GITHUB_REPO'"
fi
OH_GITHUB_REF="${OH_GITHUB_REF:-${OH_INSTALL_REF:-}}"
OH_NVM_VERSION="${OH_NVM_VERSION:-v0.40.3}"

# Detect a local OpenHarness checkout (used only as a build-fallback source).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd)"
LOCAL_CLI_DIR=""
if [ -n "$SCRIPT_DIR" ]; then
  __cand="$(cd "$SCRIPT_DIR/../.." 2>/dev/null && pwd || true)"
  if [ -n "$__cand" ] && [ -f "$__cand/.oh/cli/package.json" ]; then LOCAL_CLI_DIR="$__cand/.oh/cli"; fi
fi

# ─── Node install (offer nvm + Node 22 when missing/too old) ─────────
node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

install_node_via_nvm() {
  banner "Installing nvm + Node 22"
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    curl -fsSL "https://raw.githubusercontent.com/nvm-sh/nvm/${OH_NVM_VERSION}/install.sh" | bash
  fi
  # nvm.sh is not `set -eu` clean; relax strict mode while sourcing + installing,
  # then source it into THIS shell so `node` works right away.
  set +eu
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
  nvm install 22
  nvm use 22
  # Restore strict mode only when executed; never enable set -e in a sourcing caller.
  [ "$_OH_SOURCED" = 0 ] && set -eu
}

ensure_node() {
  banner "Checking Node.js"
  if command -v node >/dev/null 2>&1 && [ "$(node_major)" -ge 20 ] 2>/dev/null; then
    ok "Node.js $(node --version) — OK"; return 0
  fi
  if command -v node >/dev/null 2>&1; then
    warn "Node.js $(node --version) is too old (need >= 20)"
  else
    warn "Node.js not found (need >= 20 to run 'oh')"
  fi
  if prompt_yn "Install nvm + Node 22 now?" y; then
    install_node_via_nvm
  else
    die "Node.js >= 20 is required to run 'oh'. Install it from https://nodejs.org and re-run."
  fi
  command -v node >/dev/null 2>&1 && [ "$(node_major)" -ge 20 ] 2>/dev/null \
    || die "Node.js >= 20 still not available after install."
  ok "Node.js $(node --version) — OK"
}

# ─── Obtain oh.js ────────────────────────────────────────────────────
build_from_source() {
  local workdir="$1" clidir
  command -v git >/dev/null 2>&1 || die "git is required to build 'oh' from source (prebuilt download failed). Install git from https://git-scm.com"
  if [ -n "$LOCAL_CLI_DIR" ]; then
    clidir="$LOCAL_CLI_DIR"
    banner "Building 'oh' from local checkout: $clidir"
  else
    banner "Building 'oh' from source ($OH_GITHUB_REPO)"
    if [ -n "$OH_GITHUB_REF" ]; then
      git clone --depth 1 --branch "$OH_GITHUB_REF" "https://github.com/${OH_GITHUB_REPO}.git" "$workdir/src"
    else
      git clone --depth 1 "https://github.com/${OH_GITHUB_REPO}.git" "$workdir/src"
    fi
    clidir="$workdir/src/.oh/cli"
  fi
  [ -f "$clidir/package.json" ] || die "CLI source not found at $clidir"
  ( cd "$clidir" && npm install --no-audit --no-fund && npm run build )
  OH_JS="$clidir/dist/oh.js"
  [ -f "$OH_JS" ] || die "build did not produce $OH_JS"
}

# ─── Main ────────────────────────────────────────────────────────────
printf "\n${CYAN}╔══════════════════════════════════════╗${NC}\n"
printf "${CYAN}║   Open Harness — install 'oh' CLI    ║${NC}\n"
printf "${CYAN}╚══════════════════════════════════════╝${NC}\n\n"

# `|| return 1` is dead code when executed (die exits under strict mode); it only
# fires on the sourced path, where die returns instead of killing the caller's shell.
ensure_node || return 1

TMP="$(mktemp -d)"
# EXIT trap only on the executed path; the sourced path cleans up explicitly.
[ "$_OH_SOURCED" = 0 ] && trap '_oh_cleanup' EXIT
OH_JS=""

banner "Fetching the 'oh' CLI"
if curl -fsSL "$OH_JS_URL" -o "$TMP/oh.js" 2>/dev/null && head -n1 "$TMP/oh.js" | grep -q '^#!'; then
  OH_JS="$TMP/oh.js"
  ok "Downloaded prebuilt 'oh' from $OH_JS_URL"
else
  warn "Prebuilt download from $OH_JS_URL unavailable — building from source"
  build_from_source "$TMP"
fi

# ─── Install to destination (single self-contained file) ─────────────
# Guard against a sourced run continuing past a failed fetch/build (die returns
# rather than exits when sourced), which would otherwise try to install nothing.
if [ -z "${OH_JS:-}" ] || [ ! -f "$OH_JS" ]; then
  warn "Could not obtain the 'oh' bundle (download and source build both failed)."
  _oh_cleanup
  [ "$_OH_SOURCED" = 1 ] && return 1
  exit 1
fi
banner "Installing 'oh' to $OH_BIN_DIR/oh"
mkdir -p "$OH_BIN_DIR"
install -m 0755 "$OH_JS" "$OH_BIN_DIR/oh"
ok "Installed $OH_BIN_DIR/oh"

# ─── Ensure it's on PATH ─────────────────────────────────────────────
# EXPORT_LINE is the resolved activation line ($OH_BIN_DIR expanded, $PATH literal).
EXPORT_LINE="export PATH=\"$OH_BIN_DIR:\$PATH\""
case ":$PATH:" in
  *":$OH_BIN_DIR:"*) PATH_OK=1 ;;
  *) PATH_OK=0 ;;
esac
NEED_PATH=0
if [ "$PATH_OK" = "0" ]; then
  NEED_PATH=1
  # Idempotent profile append so FUTURE shells pick it up (append only, never dup).
  for prof in "$HOME/.zprofile" "$HOME/.profile" "$HOME/.bashrc"; do
    if [ -f "$prof" ] && ! grep -qsF "$OH_BIN_DIR" "$prof"; then
      printf '\n# Added by Open Harness get-oh.sh\n%s\n' "$EXPORT_LINE" >> "$prof"
      ok "Added $OH_BIN_DIR to PATH in $prof (for new shells)"
      break
    fi
  done
  # Sourced path: mutate the CALLER's live PATH so `oh` is usable immediately in
  # the current shell — prepend only when not already present.
  if [ "$_OH_SOURCED" = 1 ]; then
    export PATH="$OH_BIN_DIR:$PATH"
    PATH_OK=1
    NEED_PATH=0
    ok "Prepended $OH_BIN_DIR to PATH for THIS shell (sourced)"
  fi
fi

# ─── Done ────────────────────────────────────────────────────────────
banner "Done"
if [ "$PATH_OK" = "1" ]; then
  ok "oh $("$OH_BIN_DIR/oh" --version 2>/dev/null || echo '(run: oh --version)')"
fi
cat <<DONEEOF

Next steps:
  cd <your-project>
  oh init            # equip the repo with Open Harness (fetches the payload on demand)
  oh sandbox         # provision + start the sandbox (needs Docker + Compose)

'oh' is a single file at $OH_BIN_DIR/oh — no repo clone was created.
Upgrade later by re-running get-oh.sh.
DONEEOF

# ─── PATH activation (executed path) ─────────────────────────────────
# A child `bash` cannot mutate its parent's PATH, so when run as its own
# process we can only PRINT how to activate `oh` in the CURRENT shell. Make
# this the last, unmissable thing the user sees — with the resolved line and
# the same-shell sourcing alternative.
if [ "$_OH_SOURCED" = 0 ] && [ "$NEED_PATH" = "1" ]; then
  printf "\n${YELLOW}╔══════════════════════════════════════════════════════════════╗${NC}\n"
  printf "${YELLOW}║  ACTION REQUIRED — activate 'oh' in your CURRENT shell        ║${NC}\n"
  printf "${YELLOW}╚══════════════════════════════════════════════════════════════╝${NC}\n"
  printf "  '%s' is on PATH for NEW shells. For THIS shell, run ONE of:\n\n" "$OH_BIN_DIR"
  printf "    ${GREEN}%s${NC}\n" "$EXPORT_LINE"
  printf "    ${GREEN}source <(curl -fsSL https://oh.mifune.dev/get-oh.sh)${NC}\n\n"
  printf "  …or just open a new terminal.\n"
fi

# Sourced path has no EXIT trap — clean the temp dir up explicitly.
[ "$_OH_SOURCED" = 1 ] && _oh_cleanup
