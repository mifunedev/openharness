#!/usr/bin/env bash
set -euo pipefail

input=$(cat)
cmd=$(jq -r '.tool_input.command // ""' <<<"$input")

if command -v perl >/dev/null 2>&1; then
  cmd=$(perl -0777 -pe 's{<<-?\s*(["\x27]?)(\w+)\1(.*?)\n\s*\2\b}{<<HEREDOC_STRIPPED}gs' <<<"$cmd")
fi

cmd=${cmd//$'\n'/ }

SECRET_NAME='(TOKEN|SECRET|PASSWORD|PASSWD|APIKEY|API_KEY|ACCESS_KEY|PRIVATE_KEY|CREDENTIAL|AUTH|BEARER|SESSION|COOKIE|SLACK_[A-Z_]*|OPENAI_[A-Z_]*|ANTHROPIC_[A-Z_]*|GITHUB_TOKEN|GH_TOKEN|AWS_SECRET|AWS_SESSION|GCP_[A-Z_]*|DATABASE_URL|DB_PASSWORD)'

DENY='(^|[^A-Za-z0-9._/-])env[[:space:]]*[|>;&]'
DENY+='|(^|[^A-Za-z0-9._/-])env[[:space:]]*$'
DENY+='|\bset[[:space:]]*[|>]'
DENY+='|\bexport[[:space:]]+-p\b'
DENY+='|\bdeclare[[:space:]]+-[xp]\b'
DENY+='|\bcompgen[[:space:]]+-[vxAe]'
DENY+='|/proc/[^/[:space:]]+/environ'
DENY+='|\bprintenv[[:space:]]*([|;>&]|$)'
DENY+='|\bhistory\b'
DENY+='|\bfc[[:space:]]+-l'
DENY+="|\\b(echo|printf)\\b[^#]*\\\$\\{?[A-Z0-9_]*${SECRET_NAME}[A-Z0-9_]*\\}?"
DENY+="|Authorization:[[:space:]]*['\"]?(Bearer|Basic|Token)[[:space:]]+\\\$"
DENY+='|\baws[[:space:]]+configure[[:space:]]+get\b'
DENY+='|\bgh[[:space:]]+auth[[:space:]]+token\b'
DENY+='|\bgcloud[[:space:]]+auth[[:space:]]+print-(access|identity)-token\b'
DENY+='|\bkubectl[[:space:]]+get[[:space:]]+secret[^|]*-o[[:space:]]*(yaml|json)'
DENY+='|\bdocker[[:space:]]+(secret|config)[[:space:]]+inspect\b'

DOCKER_INSPECT='\b(docker|podman|nerdctl)[[:space:]]+([^|;&]{0,160}[[:space:]])?inspect\b'
DOCKER_FMT='(--format[=[:space:]]|(^|[[:space:]])-f[=[:space:]])'
DOCKER_FMT_UNSAFE='env'
DOCKER_FMT_UNSAFE+='|\{\{[[:space:]]*(json[[:space:]]*)?\.(Config)?[[:space:]]*\}\}'
DOCKER_FMT_UNSAFE+='|(--format|(^|[[:space:]])-f)[=[:space:]]+["\x27]?json["\x27]?([[:space:]]|$)'

OPERATOR_PATH='(^|[^A-Za-z0-9._-])\.config([^A-Za-z0-9_-]|$)'
OPERATOR_PATH+='|(^|[^A-Za-z0-9._-])settings\.local\.json([^A-Za-z0-9._-]|$)'

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

ASK='\bprintenv[[:space:]]+[A-Za-z_]'

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
elif grep -qEi -- "$DOCKER_INSPECT" <<<"$cmd"; then
  seg=$(grep -oEi -- "${DOCKER_INSPECT}.*" <<<"$cmd" | head -1)
  if ! grep -qEi -- "$DOCKER_FMT" <<<"$seg"; then
    emit deny 'Container-inspect guard (deny): a bare `docker inspect` prints the full container JSON, including `Config.Env` — every environment variable the container was started with, secrets included. Inspect is NOT blocked outright: re-run it with an explicit narrow Go template naming only the field you need, e.g. `docker inspect --format "{{.State.Health.Status}}" <container>`, `--format "{{.NetworkSettings.IPAddress}}"`, or `--format "{{range .Mounts}}{{.Source}} {{end}}"`. Piping the full JSON through jq/grep does not qualify — the guard cannot verify the filter, so use --format. If you genuinely need an env value, ask the operator to paste that one value.'
  elif grep -qEi -- "$DOCKER_FMT_UNSAFE" <<<"$seg"; then
    emit deny 'Container-inspect guard (deny): the inspect template names env or dumps the whole object (`{{.}}`, `{{json .}}`, `{{.Config}}`, `--format json`), which re-exposes `Config.Env`. Narrow the template to the specific non-env field you need. Do not retry a variant that spells the env path differently or reaches it through a wider subtree.'
  fi
elif grep -qEi -- "$OPERATOR_PATH" <<<"$cmd"; then
  emit deny 'Operator-only path guard (deny): command references .config/ or settings.local.json, which hold operator-managed configuration and are off-limits to agents for both read and write. This is a deliberate policy, not a misconfiguration — do not retry a variant that spells the path differently, resolves it through a variable or symlink, or reaches it from a subshell. If you need a value from it, ask the operator to paste only that value into the chat. If you only need to mention the path in prose (commit message, PR body), pass it via a file (`git commit -F msg.txt`, `gh pr create --body-file body.md`) or a HEREDOC, which this guard strips.'
elif grep -qEi -- "$SECRET_PATH_DENY" <<<"$cmd"; then
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
