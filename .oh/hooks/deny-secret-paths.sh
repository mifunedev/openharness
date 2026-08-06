#!/usr/bin/env bash
# PreToolUse file-path guard: blocks Read/Write/Edit/NotebookEdit/Grep/Glob
# against operator-only paths and known secret/credential paths. Mirrors the
# Read(...) deny list in .claude/settings.json — present as a hook because
# `bypassPermissions` defaultMode skips the permission engine entirely, so deny
# rules alone don't fire.
#
# Works by inspecting every path-shaped field of tool_input and matching each
# case-insensitively against a combined regex of the deny-listed globs.
set -euo pipefail

input=$(cat)

# Path-shaped inputs across the matched tools: Read/Write/Edit use file_path,
# NotebookEdit uses notebook_path, Grep/Glob use path (and Grep also takes a
# glob filter). Grep's `pattern` is a regex over file *contents*, not a path,
# so it is deliberately not scanned.
mapfile -t paths < <(jq -r '
  [.tool_input.file_path, .tool_input.notebook_path, .tool_input.path, .tool_input.glob]
  | map(select(type == "string" and . != ""))
  | .[]' <<<"$input")

[ "${#paths[@]}" -eq 0 ] && exit 0

# Operator-only configuration. `.config/` — at the repo root and in $HOME — is
# owned by the operator; agents get neither read nor write. Anchored to a whole
# path SEGMENT so ordinary tool config (jest.config.js, app.config, .configrc)
# is unaffected.
OPERATOR_PATH='(^|/)\.config(/|$)'

# Mirrors .claude/settings.json permissions.deny Read(...) globs.
DENY_PATH='(^|/)\.env([^/]*)?$'                 # **/.env*
DENY_PATH+='|\.pem$'                            # **/*.pem
DENY_PATH+='|\.key$'                            # **/*.key
DENY_PATH+='|\.cert$'                           # **/*.cert
DENY_PATH+='|\.p12$'                            # **/*.p12
DENY_PATH+='|[^/]*id_rsa[^/]*$'                 # **/*id_rsa*
DENY_PATH+='|[^/]*id_ed25519[^/]*$'             # **/*id_ed25519*
DENY_PATH+='|/\.aws/credentials$'               # **/.aws/credentials
DENY_PATH+='|/\.aws/config$'                    # **/.aws/config
DENY_PATH+='|/\.gcp/'                           # **/.gcp/**
DENY_PATH+='|/\.config/gcloud/'                 # **/.config/gcloud/**
DENY_PATH+='|/\.azure/'                         # **/.azure/**
DENY_PATH+='|/\.kube/config$'                   # **/.kube/config
DENY_PATH+='|/\.docker/config\.json$'           # **/.docker/config.json
DENY_PATH+='|/\.npmrc$'                         # **/.npmrc
DENY_PATH+='|/\.pypirc$'                        # **/.pypirc
DENY_PATH+='|/\.cargo/credentials[^/]*$'        # **/.cargo/credentials*
DENY_PATH+='|/\.git-credentials$'               # **/.git-credentials
DENY_PATH+='|/\.netrc$'                         # **/.netrc
DENY_PATH+='|/\.config/gh/hosts\.yml$'          # **/.config/gh/hosts.yml
DENY_PATH+='|/\.config/gh/config\.yml$'         # **/.config/gh/config.yml
DENY_PATH+='|/\.claude/\.credentials\.json$'    # **/.claude/.credentials.json
DENY_PATH+='|/\.anthropic/'                     # **/.anthropic/**
DENY_PATH+='|/\.pi/.*auth\.json$'               # **/.pi/**/auth.json
DENY_PATH+='|/\.gnupg/'                         # **/.gnupg/**
DENY_PATH+='|/\.bash_history$'                  # **/.bash_history
DENY_PATH+='|/\.zsh_history$'                   # **/.zsh_history
DENY_PATH+='|/\.psql_history$'                  # **/.psql_history
DENY_PATH+='|/\.python_history$'                # **/.python_history
DENY_PATH+='|/\.node_repl_history$'             # **/.node_repl_history
DENY_PATH+='|/\.wget-hsts$'                     # **/.wget-hsts

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
    emit deny "Operator-only path guard (deny): refusing to access $path — the .config/ directory holds operator-managed configuration and is off-limits to agents for both read and write. This is a deliberate policy, not a misconfiguration: do not retry via Bash, a subshell, a symlink, or a relative path. If you need a value from it, ask the operator to paste only that value into the chat."
    exit 0
  fi
done

for path in "${paths[@]}"; do
  if grep -qEi -- "$DENY_PATH" <<<"$path"; then
    # Template env files (.example.env, .env.example, etc.) are tracked and hold no real secrets — allow.
    base=$(basename "$path")
    if grep -qiE '\.env' <<<"$base" && grep -qiE '(example|sample|template)' <<<"$base"; then
      continue
    fi
    emit deny "Secret-exposure guard (deny): refusing to access $path — matches a credential / secret file pattern (env file, private key, cert, cloud credentials, shell history, or similar). This mirrors the permissions.deny list in .claude/settings.json; it's enforced as a hook so it still blocks under bypassPermissions mode. If you genuinely need a specific non-secret value from this file, ask the user to paste only that value into the chat."
    exit 0
  fi
done
