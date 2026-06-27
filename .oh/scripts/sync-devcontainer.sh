#!/usr/bin/env bash
# sync-devcontainer.sh — regenerate the root .devcontainer/devcontainer.json
# compat layer from this script's canonical heredoc (RFC #531 Phase 2 slice 2).
#
# GENERATED — do not hand-edit .devcontainer/devcontainer.json. It is a thin
# VS Code compat shim produced by this script; the real build assets live under
# .oh/devcontainer/. To change it, edit the heredoc below and re-run this script.
# (The "GENERATED" notice lives ONLY here and in .oh/README.md — never inside the
# emitted JSON, which has no comment syntax and must parse with `jq .`.)
#
# Usage:
#   sync-devcontainer.sh            write .devcontainer/devcontainer.json (idempotent)
#   sync-devcontainer.sh --check    diff the generated content against the committed
#                                   file; exit 1 on drift, 0 if identical.

set -euo pipefail

# Resolve repo root: prefer git, fall back to this script's location (.oh/scripts/).
if REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" && [ -n "$REPO_ROOT" ]; then
  :
else
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
fi

TARGET="$REPO_ROOT/.devcontainer/devcontainer.json"

# Canonical content of the generated compat layer. Pure JSON — no comments.
render() {
  cat <<'JSON'
{
  "name": "Open Harness Sandbox",
  "dockerComposeFile": ["../.oh/devcontainer/docker-compose.yml"],
  "service": "sandbox",
  "workspaceFolder": "/home/sandbox/harness",
  "remoteUser": "sandbox",
  "customizations": {
    "vscode": {
      "settings": {
        "terminal.integrated.defaultProfile.linux": "bash"
      }
    }
  }
}
JSON
}

if [ "${1:-}" = "--check" ]; then
  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' EXIT
  render > "$tmp"
  if diff -u "$TARGET" "$tmp" >&2; then
    exit 0
  else
    echo "drift: $TARGET differs from the generator (run sync-devcontainer.sh to regenerate)" >&2
    exit 1
  fi
fi

mkdir -p "$(dirname "$TARGET")"
render > "$TARGET"
echo "wrote $TARGET"
