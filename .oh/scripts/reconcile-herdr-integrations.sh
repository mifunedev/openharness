#!/usr/bin/env bash
# Reconcile the official integrations bundled with the pinned Herdr binary.
# Run as the final sandbox user after persistent provider homes are mounted.
set -euo pipefail

case "${HERDR_AUTO_INTEGRATIONS:-true}" in
  0|false|FALSE|no|NO|off|OFF)
    echo "[herdr-integrations] automatic integration disabled"
    exit 0
    ;;
esac

if ! command -v herdr >/dev/null 2>&1; then
  echo "[herdr-integrations] WARNING: herdr is not on PATH" >&2
  exit 1
fi

home="${HOME:-/home/sandbox}"
failures=0
installed=()

install_integration() {
  local target="$1"
  shift
  if "$@" herdr integration install "$target" >/tmp/herdr-integration-"$target".log 2>&1; then
    installed+=("$target")
  else
    echo "[herdr-integrations] WARNING: failed to install $target integration" >&2
    sed -n '1,20p' /tmp/herdr-integration-"$target".log >&2 2>/dev/null || true
    failures=1
  fi
}

# Default Open Harness agents. Herdr requires these roots to exist, and Pi's
# extension directory must pre-exist. Its installer structurally merges config
# and is content-idempotent, so rerunning also reconciles bundled-version bumps.
mkdir -p "$home/.claude" "$home/.codex" "$home/.pi/agent/extensions"
install_integration claude env HOME="$home"
install_integration codex env HOME="$home"
install_integration pi env HOME="$home"

# Optional agents are configured only when their executable is installed.
if command -v opencode >/dev/null 2>&1; then
  mkdir -p "$home/.config/opencode"
  install_integration opencode env HOME="$home"
fi

if command -v hermes >/dev/null 2>&1; then
  hermes_home="${HERMES_HOME:-$home/.hermes}"
  if [ "$(basename "$hermes_home")" = ".hermes" ]; then
    mkdir -p "$hermes_home"
    # Herdr 0.7.4 resolves Hermes at $HOME/.hermes and does not read
    # HERMES_HOME. Point HOME at the configured directory's parent so its
    # bundled installer writes into Open Harness's project-local Hermes home.
    install_integration hermes env HOME="$(dirname "$hermes_home")"
  else
    echo "[herdr-integrations] WARNING: HERMES_HOME must end in .hermes for the official installer; skipping Hermes" >&2
    failures=1
  fi
fi

if [ "${#installed[@]}" -gt 0 ]; then
  printf '[herdr-integrations] reconciled: %s\n' "${installed[*]}"
fi
exit "$failures"
