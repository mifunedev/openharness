#!/usr/bin/env bash
# Codex file-tool guard for operator-owned settings.local.json files.
set -euo pipefail

input=$(cat)
if jq -e '
  [.tool_input.file_path, .tool_input.notebook_path, .tool_input.path, .tool_input.glob]
  | map(select(type == "string"))
  | any(test("(^|/)settings\\.local\\.json$"; "i"))
' >/dev/null <<<"$input"; then
  root=$(git rev-parse --show-toplevel)
  exec bash "$root/.oh/hooks/deny-secret-paths.sh" <<<"$input"
fi
