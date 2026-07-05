#!/usr/bin/env bash
set -euo pipefail

# get-oh.sh — bootstrap the standalone `oh` CLI onto a host.
#
# The `oh` CLI is not published to npm (`.oh/cli` is a private package) and the
# sandbox installer (install.sh) only builds `oh` INSIDE the container. This
# script closes that gap: it clones (or reuses) the harness into ~/.openharness,
# builds `.oh/cli` into `dist/oh.js`, and symlinks `oh` onto your PATH — so you
# can then `cd <your-project> && oh init`.
#
# The clone is KEPT on purpose: the built binary resolves its bundled scaffold
# payload relative to itself (`dist/oh.js` → `../../templates` = `.oh/templates`),
# so a clone-anchored `oh` runs `oh init`/`oh update` from the LOCAL payload —
# no per-init network fetch. See .oh/cli/src/cli.ts.
#
# This is the standalone-CLI path (see .oh/docs/installation.md); unlike the
# container installers it requires Node.js (>= 18) on the host. Docker with the
# Compose plugin is only needed later, for `oh sandbox` — not by this script.

# Surface silent set -e exits — without this, any non-zero return mid-script
# kills bash with no `ERROR:` line and the user is left staring at a prompt.
trap 'printf "\n\033[0;31mERROR:\033[0m get-oh.sh aborted (exit %s) at line %s: %s\n" "$?" "$LINENO" "$BASH_COMMAND" >&2' ERR

# ─── Colours / helpers ───────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
banner() { printf "\n${CYAN}==> %s${NC}\n" "$*"; }
ok()     { printf "${GREEN} ✓  %s${NC}\n" "$*"; }
warn()   { printf "${YELLOW}WARN: %s${NC}\n" "$*" >&2; }
die()    { printf "${RED}ERROR: %s${NC}\n" "$*" >&2; exit 1; }

# ─── normalize_gh_slug: strip GitHub URL decoration → owner/repo ─────
normalize_gh_slug() {
  local _url="$1"
  _url="${_url#https://github.com/}"
  _url="${_url#git@github.com:}"
  _url="${_url%.git}"
  printf '%s' "$_url"
}

# ─── Help ────────────────────────────────────────────────────────────
print_help() {
  cat <<HELPEOF
Open Harness — get the standalone 'oh' CLI

Usage:
  curl -fsSL https://oh.mifune.dev/get-oh.sh | bash
  curl -fsSL -o get-oh.sh https://oh.mifune.dev/get-oh.sh
  # Review get-oh.sh in your editor or pager, then:
  bash get-oh.sh
  ./.oh/scripts/get-oh.sh

Clones (or reuses) the harness into ~/.openharness, builds the 'oh' CLI, and
symlinks it onto your PATH. Then: cd <your-project> && oh init

Prerequisites:
  git             (used to clone or update Open Harness)
  Node.js >= 18   (used to build and run the 'oh' binary)
  (Docker + Compose are only needed later, for 'oh sandbox'.)

Flags:
  -h, --help           Show this help and exit.

Env vars:
  OH_HOME              Clone directory (default: ~/.openharness)
  OH_BIN_DIR           Directory to place the 'oh' symlink (default: ~/.local/bin)
  OH_GITHUB_REPO       GitHub repo to clone (default: mifunedev/openharness)
  OH_GITHUB_REF        Git ref (tag/branch/SHA) to clone (alias: OH_INSTALL_REF)

Examples:
  curl -fsSL https://oh.mifune.dev/get-oh.sh | bash
  OH_GITHUB_REPO=myorg/my-harness bash get-oh.sh
  OH_BIN_DIR=/usr/local/bin bash get-oh.sh
HELPEOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) print_help; exit 0 ;;
    *) warn "Unknown argument: $1 (ignoring)" ;;
  esac
  shift
done

# ─── Config (env-overridable — keeps the repo literal override-able) ──
OH_HOME="${OH_HOME:-$HOME/.openharness}"
OH_BIN_DIR="${OH_BIN_DIR:-$HOME/.local/bin}"
OH_GITHUB_REPO="${OH_GITHUB_REPO:-mifunedev/openharness}"
if [[ ! "$OH_GITHUB_REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  die "OH_GITHUB_REPO must be <owner>/<repo>: got '$OH_GITHUB_REPO'"
fi
# OH_GITHUB_REF aliases OH_INSTALL_REF (OH_GITHUB_REF wins if both set).
if [ -n "${OH_GITHUB_REF:-}" ] && [ -n "${OH_INSTALL_REF:-}" ] && [ "$OH_GITHUB_REF" != "$OH_INSTALL_REF" ]; then
  warn "OH_GITHUB_REF and OH_INSTALL_REF both set with different values; OH_GITHUB_REF wins."
fi
OH_GITHUB_REF="${OH_GITHUB_REF:-${OH_INSTALL_REF:-}}"

printf "\n${CYAN}╔══════════════════════════════════════╗${NC}\n"
printf "${CYAN}║   Open Harness — get the 'oh' CLI    ║${NC}\n"
printf "${CYAN}╚══════════════════════════════════════╝${NC}\n\n"

# ─── 1. Check git ────────────────────────────────────────────────────
banner "Checking git"
if ! command -v git >/dev/null 2>&1; then
  die "git is required to clone or update Open Harness. Install git from: https://git-scm.com"
fi
ok "git $(git --version | awk '{print $3}') — OK"

# ─── 2. Check Node.js (>= 18) ────────────────────────────────────────
banner "Checking Node.js"
if ! command -v node >/dev/null 2>&1; then
  die "Node.js >= 18 is required to build the 'oh' CLI. Install it from: https://nodejs.org"
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 18 ] 2>/dev/null; then
  die "Node.js >= 18 required (found $(node --version)). Upgrade from: https://nodejs.org"
fi
if ! command -v npm >/dev/null 2>&1; then
  die "npm is required (ships with Node.js). Install Node.js from: https://nodejs.org"
fi
ok "Node.js $(node --version) — OK"

# ─── 3. Resolve repo directory (reuse a local checkout, else clone) ──
banner "Resolving repository"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd)"
# get-oh.sh lives at .oh/scripts/get-oh.sh; the repo root is two levels up.
REPO_CANDIDATE="$(cd "$SCRIPT_DIR/../.." 2>/dev/null && pwd)"

if [ -n "$REPO_CANDIDATE" ] && [ -f "$REPO_CANDIDATE/.oh/cli/package.json" ] && [ -f "$REPO_CANDIDATE/.oh/scripts/get-oh.sh" ]; then
  REPO_DIR="$REPO_CANDIDATE"
  ok "Using local repo: $REPO_DIR"
else
  REPO_DIR="$OH_HOME"
  if [ "$OH_GITHUB_REPO" != "mifunedev/openharness" ]; then
    warn "Cloning from fork: $OH_GITHUB_REPO"
  fi
  if [ -d "$REPO_DIR" ] && [ ! -d "$REPO_DIR/.git" ]; then
    die "$REPO_DIR exists but is not a git clone. Inspect and remove it, then re-run."
  fi

  if [ -d "$REPO_DIR/.git" ]; then
    # Validate remote origin matches OH_GITHUB_REPO before pulling.
    __ORIGIN_RAW="$(git -C "$REPO_DIR" remote get-url origin 2>/dev/null || true)"
    __ORIGIN_SLUG="$(normalize_gh_slug "${__ORIGIN_RAW:-}")"
    __EXPECTED_SLUG="$(normalize_gh_slug "$OH_GITHUB_REPO")"
    if [ -z "$__ORIGIN_RAW" ] || [ "$__ORIGIN_SLUG" != "$__EXPECTED_SLUG" ]; then
      warn "Existing clone origin (${__ORIGIN_RAW:-<none>}) does not match OH_GITHUB_REPO=${OH_GITHUB_REPO}; skipping pull."
      warn "To switch sources: rm -rf $REPO_DIR and re-run with the desired OH_GITHUB_REPO."
    elif git -C "$REPO_DIR" diff --quiet 2>/dev/null && git -C "$REPO_DIR" diff --cached --quiet 2>/dev/null; then
      printf "  Repository exists — pulling latest changes...\n"
      git -C "$REPO_DIR" pull --ff-only
      ok "Repository updated: $REPO_DIR"
    else
      warn "Local changes detected in $REPO_DIR — skipping git pull. Stash or commit them, then re-run."
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
fi

# ─── 4. Build the 'oh' CLI ───────────────────────────────────────────
banner "Building the 'oh' CLI"
CLI_DIR="$REPO_DIR/.oh/cli"
[ -f "$CLI_DIR/package.json" ] || die "CLI source not found at $CLI_DIR — is $REPO_DIR a full Open Harness checkout?"
( cd "$CLI_DIR" && npm install --no-audit --no-fund && npm run build )
OH_BIN_TARGET="$CLI_DIR/dist/oh.js"
[ -f "$OH_BIN_TARGET" ] || die "build did not produce $OH_BIN_TARGET"
chmod +x "$OH_BIN_TARGET" 2>/dev/null || true
ok "Built $OH_BIN_TARGET"

# ─── 5. Put 'oh' on PATH ─────────────────────────────────────────────
banner "Installing 'oh' onto PATH"
mkdir -p "$OH_BIN_DIR"
ln -sf "$OH_BIN_TARGET" "$OH_BIN_DIR/oh"
ok "Linked $OH_BIN_DIR/oh -> $OH_BIN_TARGET"

# If OH_BIN_DIR is not already on PATH, hint the export (append to a profile
# when we can identify one, but always PRINT the line so the user is unstuck).
case ":$PATH:" in
  *":$OH_BIN_DIR:"*) PATH_OK=1 ;;
  *) PATH_OK=0 ;;
esac
if [ "$PATH_OK" = "0" ]; then
  EXPORT_LINE="export PATH=\"$OH_BIN_DIR:\$PATH\""
  for prof in "$HOME/.zprofile" "$HOME/.profile" "$HOME/.bashrc"; do
    if [ -f "$prof" ] && ! grep -qsF "$OH_BIN_DIR" "$prof"; then
      printf '\n# Added by Open Harness get-oh.sh\n%s\n' "$EXPORT_LINE" >> "$prof"
      warn "Added $OH_BIN_DIR to PATH in $prof — open a new shell or run: $EXPORT_LINE"
      break
    fi
  done
  warn "$OH_BIN_DIR is not on your PATH for this shell. Run: $EXPORT_LINE"
fi

# ─── Done ────────────────────────────────────────────────────────────
banner "Done"
if [ "$PATH_OK" = "1" ]; then
  ok "oh $("$OH_BIN_DIR/oh" --version 2>/dev/null || echo '(run: oh --version)')"
fi
cat <<DONEEOF

Next steps:
  cd <your-project>
  oh init            # equip the repo with Open Harness (uses the local payload)
  oh sandbox         # provision + start the sandbox (needs Docker + Compose)

The clone is kept at $REPO_DIR so 'oh init'/'oh update' work offline.
Upgrade later with:  oh update   (or re-run get-oh.sh)
DONEEOF
