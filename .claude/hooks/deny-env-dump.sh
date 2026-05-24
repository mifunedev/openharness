#!/usr/bin/env bash
# PreToolUse Bash guard: two-tier check for secret exposure.
#   Tier 1 (deny) — bulk env dumps, history dumps, token-printing CLI commands,
#                   echo/printf of secret-named variables, auth headers with
#                   variable interpolation.
#   Tier 2 (ask)  — narrow reads where the value *might* be public.
#   otherwise     — allow (hook exits silently).
#
# Scans the raw command string, so patterns inside `docker exec ... '...'`
# or `bash -c '...'` subshells are still caught.
set -euo pipefail

input=$(cat)
cmd=$(jq -r '.tool_input.command // ""' <<<"$input")

# Strip HEREDOC bodies before any pattern matching. PR / issue / commit
# bodies passed via `gh ... --body "$(cat <<'EOF' ... EOF)"` are prose, not
# shell commands — words like "history" or phrases like "cat .env" inside
# that prose otherwise match command-shape regexes below and produce false
# denies. Handles `<<DELIM`, `<<'DELIM'`, `<<"DELIM"`, and `<<-DELIM`.
if command -v perl >/dev/null 2>&1; then
  cmd=$(perl -0777 -pe 's{<<-?\s*(["\x27]?)(\w+)\1(.*?)\n\s*\2\b}{<<HEREDOC_STRIPPED}gs' <<<"$cmd")
fi

# Collapse newlines to spaces so character classes don't need to care about
# them (and so grep's line-oriented regex doesn't split the pattern string
# either). The literal \n written inside [^#\n] would mean "not \ or n",
# which wrongly excludes the letter n from any text between cmd and target.
cmd=${cmd//$'\n'/ }

# Secret-ish variable-name fragments. Matched case-insensitively inside ${VAR}
# or $VAR dereferences in echo / printf / curl / etc.
SECRET_NAME='(TOKEN|SECRET|PASSWORD|PASSWD|APIKEY|API_KEY|ACCESS_KEY|PRIVATE_KEY|CREDENTIAL|AUTH|BEARER|SESSION|COOKIE|SLACK_[A-Z_]*|OPENAI_[A-Z_]*|ANTHROPIC_[A-Z_]*|GITHUB_TOKEN|GH_TOKEN|AWS_SECRET|AWS_SESSION|GCP_[A-Z_]*|DATABASE_URL|DB_PASSWORD)'

# Tier 1 — hard deny.
DENY='(^|[^A-Za-z0-9._/-])env[[:space:]]*[|>;&]'     # env | / env > / env ; / env & at command position
DENY+='|(^|[^A-Za-z0-9._/-])env[[:space:]]*$'        # bare env at command position (not .env / path/env / example.env)
DENY+='|\bset[[:space:]]*[|>]'                       # set | / set >
DENY+='|\bexport[[:space:]]+-p\b'                    # export -p
DENY+='|\bdeclare[[:space:]]+-[xp]\b'                # declare -x / -p
DENY+='|\bcompgen[[:space:]]+-[vxAe]'                # compgen -v / -x / -A / -e
DENY+='|/proc/[^/[:space:]]+/environ'                # /proc/<pid|self>/environ
DENY+='|\bprintenv[[:space:]]*([|;>&]|$)'            # printenv with no args
DENY+='|\bhistory\b'                                 # shell history dump
DENY+='|\bfc[[:space:]]+-l'                          # fc -l (also lists history)
DENY+="|\\b(echo|printf)\\b[^#]*\\\$\\{?[A-Z0-9_]*${SECRET_NAME}[A-Z0-9_]*\\}?"
DENY+="|Authorization:[[:space:]]*['\"]?(Bearer|Basic|Token)[[:space:]]+\\\$"  # auth header with var interpolation
DENY+='|\baws[[:space:]]+configure[[:space:]]+get\b'
DENY+='|\bgh[[:space:]]+auth[[:space:]]+token\b'
DENY+='|\bgcloud[[:space:]]+auth[[:space:]]+print-(access|identity)-token\b'
DENY+='|\bkubectl[[:space:]]+get[[:space:]]+secret[^|]*-o[[:space:]]*(yaml|json)'
DENY+='|\bdocker[[:space:]]+(secret|config)[[:space:]]+inspect\b'

# Tier 1b — reading secret-laden files via shell tools. Checked separately from
# the main DENY (below) so a basename-allowlist can exempt tracked template env
# files (.example.env, .env.example, .env.sample, .env.template, …). Mirrors
# the Read(**/.env*) family of deny rules so bypassPermissions can't slip past.
SECRET_PATH="(\\.env[^[:space:]/\"']*"
SECRET_PATH+='|[^[:space:]]*\.pem\b'
SECRET_PATH+='|[^[:space:]]*\.p12\b'
SECRET_PATH+='|[^[:space:]]*\.cert\b'
SECRET_PATH+='|[^[:space:]/]*id_rsa[^[:space:]]*'
SECRET_PATH+='|[^[:space:]/]*id_ed25519[^[:space:]]*'
SECRET_PATH+='|\.aws/credentials\b'
SECRET_PATH+='|\.aws/config\b'
SECRET_PATH+='|\.gcp/'
SECRET_PATH+='|\.config/gcloud/'
SECRET_PATH+='|\.azure/'
SECRET_PATH+='|\.kube/config\b'
SECRET_PATH+='|\.docker/config\.json\b'
SECRET_PATH+='|\.npmrc\b'
SECRET_PATH+='|\.pypirc\b'
SECRET_PATH+='|\.cargo/credentials'
SECRET_PATH+='|\.git-credentials\b'
SECRET_PATH+='|\.netrc\b'
SECRET_PATH+='|\.config/gh/hosts\.yml\b'
SECRET_PATH+='|\.config/gh/config\.yml\b'
SECRET_PATH+='|\.claude/\.credentials\.json\b'
SECRET_PATH+='|\.anthropic/'
SECRET_PATH+='|\.pi/[^[:space:]]*auth\.json\b'
SECRET_PATH+='|\.gnupg/'
SECRET_PATH+='|\.bash_history\b'
SECRET_PATH+='|\.zsh_history\b'
SECRET_PATH+='|\.psql_history\b'
SECRET_PATH+='|\.python_history\b'
SECRET_PATH+='|\.node_repl_history\b'
SECRET_PATH+='|\.wget-hsts\b)'
READ_CMD='(cat|tac|less|more|bat|head|tail|xxd|od|strings|hexdump|base64|nano|vim|vi|emacs|view|sed|awk|grep|rg|ripgrep|jq|yq|tee|cp|mv|scp|rsync|install|source|\.)'
SECRET_PATH_DENY="\\b${READ_CMD}\\b[^#|]*${SECRET_PATH}"

# Tier 2 — ask (narrow / possibly legitimate).
ASK='\bprintenv[[:space:]]+[A-Za-z_]'                # printenv VAR [VAR ...]
# Note: the previous catch-all `echo|printf` of any $UPPERCASE_VAR was too
# broad — it asked on benign `echo "Branch: $BRANCH"` / `echo $SHA` /
# `echo $VERSION` patterns used throughout skills. The deny tier above
# already catches `echo`/`printf` of secret-named variables (TOKEN, SECRET,
# AUTH, KEY, GH_TOKEN, AWS_*, …) with prefix/suffix tolerance, which covers
# the actual leak surface. Trust other uppercase vars.

emit() {
  jq -n --arg d "$1" --arg r "$2" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: $d,
      permissionDecisionReason: $r
    }
  }'
}

if grep -qEi -- "$DENY" <<<"$cmd"; then
  emit deny 'Secret-exposure guard (deny): command matches a high-risk pattern — bulk env dump (env/set/export -p/declare -x/-p/compgen/printenv/proc environ), shell history, echo/printf of a secret-named variable (TOKEN/SECRET/KEY/PASSWORD/AUTH/CREDENTIAL/BEARER/SLACK_*/OPENAI_*/ANTHROPIC_*/GH_TOKEN/AWS_SECRET), Authorization header with variable interpolation, or a token-printing CLI (gh auth token, gcloud auth print-*-token, aws configure get, kubectl get secret -o yaml/json, docker secret/config inspect). These almost always leak credentials into the transcript and prompt cache. Do NOT retry a variant that bypasses this check. Ask the user to run the command themselves and paste only the specific non-secret output you need.'
elif grep -qEi -- "$SECRET_PATH_DENY" <<<"$cmd"; then
  # Allowlist: template env files (.example.env, .env.example, .env.sample, .env.template, …)
  # are tracked and hold no real secrets — allow reads against them. Deny all other env
  # paths and all non-env secret paths (pem, id_rsa, .aws/credentials, …).
  ALLOWED=0
  mapfile -t env_tokens < <(grep -oEi "[^[:space:]\"']*\\.env[^[:space:]\"']*" <<<"$cmd" || true)
  if [ "${#env_tokens[@]}" -gt 0 ]; then
    ALLOWED=1
    for token in "${env_tokens[@]}"; do
      base=$(basename "$token")
      if ! { grep -qiE '\.env' <<<"$base" && grep -qiE '(example|sample|template)' <<<"$base"; }; then
        ALLOWED=0
        break
      fi
    done
  fi
  if [ "$ALLOWED" -eq 0 ]; then
    emit deny 'Secret-exposure guard (deny): command reads a secret-laden file path (env file, private key, cert, cloud credentials, shell history, or similar). Mirrors the Read(...) deny list in .claude/settings.json so it still blocks under bypassPermissions. If you need a specific non-secret value from this file, ask the user to paste only that value into the chat.'
  fi
elif grep -qE -- "$ASK" <<<"$cmd"; then
  emit ask 'Secret-exposure guard (ask): command reads or echoes a specific variable / single env value whose contents may include a secret. Requires explicit user approval before running.'
fi
