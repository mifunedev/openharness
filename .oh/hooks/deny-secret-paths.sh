#!/usr/bin/env bash
set -euo pipefail

input=$(cat)

mapfile -t paths < <(jq -r '
  [.tool_input.file_path, .tool_input.notebook_path, .tool_input.path, .tool_input.glob]
  | map(select(type == "string" and . != ""))
  | .[]' <<<"$input")

[ "${#paths[@]}" -eq 0 ] && exit 0

OPERATOR_PATH='(^|/)\.config(/|$)|(^|/)settings\.local\.json$'

DENY_PATH='(^|/)\.env([^/]*)?$'
DENY_PATH+='|\.pem$'
DENY_PATH+='|\.key$'
DENY_PATH+='|\.cert$'
DENY_PATH+='|\.p12$'
DENY_PATH+='|[^/]*id_rsa[^/]*$'
DENY_PATH+='|[^/]*id_ed25519[^/]*$'
DENY_PATH+='|/\.aws/credentials$'
DENY_PATH+='|/\.aws/config$'
DENY_PATH+='|/\.gcp/'
DENY_PATH+='|/\.config/gcloud/'
DENY_PATH+='|/\.azure/'
DENY_PATH+='|/\.kube/config$'
DENY_PATH+='|/\.docker/config\.json$'
DENY_PATH+='|/\.npmrc$'
DENY_PATH+='|/\.pypirc$'
DENY_PATH+='|/\.cargo/credentials[^/]*$'
DENY_PATH+='|/\.git-credentials$'
DENY_PATH+='|/\.netrc$'
DENY_PATH+='|/\.config/gh/hosts\.yml$'
DENY_PATH+='|/\.config/gh/config\.yml$'
DENY_PATH+='|/\.claude/\.credentials\.json$'
DENY_PATH+='|/\.anthropic/'
DENY_PATH+='|/\.pi/.*auth\.json$'
DENY_PATH+='|/\.gnupg/'
DENY_PATH+='|/\.bash_history$'
DENY_PATH+='|/\.zsh_history$'
DENY_PATH+='|/\.psql_history$'
DENY_PATH+='|/\.python_history$'
DENY_PATH+='|/\.node_repl_history$'
DENY_PATH+='|/\.wget-hsts$'

emit() {
  jq -n --arg d "$1" --arg r "$2" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: $d,
      permissionDecisionReason: $r
    }
  }'
}

for path in "${paths[@]}"; do
  if grep -qEi -- "$OPERATOR_PATH" <<<"$path"; then
    emit deny "Operator-only path guard (deny): refusing to access $path — .config/ and settings.local.json hold operator-managed configuration and are off-limits to agents for both read and write. This is a deliberate policy, not a misconfiguration: do not retry via Bash, a subshell, a symlink, or a relative path. If you need a value from it, ask the operator to paste only that value into the chat."
    exit 0
  fi
done

for path in "${paths[@]}"; do
  if grep -qEi -- "$DENY_PATH" <<<"$path"; then
    base=$(basename "$path")
    if grep -qiE '\.env' <<<"$base" && grep -qiE '(example|sample|template)' <<<"$base"; then
      continue
    fi
    emit deny "Secret-exposure guard (deny): refusing to access $path — matches a credential / secret file pattern (env file, private key, cert, cloud credentials, shell history, or similar). This mirrors the permissions.deny list in .claude/settings.json; it's enforced as a hook so it still blocks under bypassPermissions mode. If you genuinely need a specific non-secret value from this file, ask the user to paste only that value into the chat."
    exit 0
  fi
done
