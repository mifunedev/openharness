#!/usr/bin/env bash

case $- in *i*) ;; *) return 0 ;; esac

[ -n "$OH_BANNER_SHOWN" ] && return 0
export OH_BANNER_SHOWN=1


sandbox_name="${SANDBOX_NAME:-$(hostname)}"
timezone="${TZ:-$(date +%Z 2>/dev/null)}"
project_dir="${HOME}/harness"

overlays=""
config_json="${HOME}/harness/.oh/config.json"
[ -f "$config_json" ] || config_json="${HOME}/harness/config.json"
if command -v jq >/dev/null 2>&1; then
  overlays=$(jq -r \
    '.composeOverrides[]? | sub("^\\.devcontainer/docker-compose\\."; "") | sub("\\.yml$"; "")' \
    "$config_json" 2>/dev/null \
    | paste -sd, -)
fi
[ -z "$overlays" ] && overlays="(none)"


case "${OH_BANNER_STATUS_STYLE:-auto}" in
  emoji)
    status_ok="✅"
    status_x="❌"
    status_empty="⬜"
    ;;
  legacy)
    status_ok="[✓]"
    status_x="[✗]"
    status_empty="[ ]"
    ;;
  *)
    if printf '%s' "${LC_ALL:-${LC_CTYPE:-${LANG:-}}}" | grep -qiE 'utf-?8'; then
      status_ok="✅"
      status_x="❌"
      status_empty="⬜"
    else
      status_ok="[✓]"
      status_x="[✗]"
      status_empty="[ ]"
    fi
    ;;
esac

gh_status="$status_x"
gh_detail="not authenticated — run: gh auth login"
if command -v gh >/dev/null 2>&1 && gh auth status -h github.com >/dev/null 2>&1; then
  gh_user=$(gh api user --jq .login 2>/dev/null)
  if [ -n "$gh_user" ]; then
    gh_status="$status_ok"
    gh_detail="authenticated as ${gh_user}"
  else
    gh_status="$status_ok"
    gh_detail="authenticated"
  fi
fi

claude_status="$status_x"
claude_detail="not authenticated — run: claude"
if [ -s "${HOME}/.claude/.credentials.json" ]; then
  claude_status="$status_ok"
  claude_detail="authenticated"
fi

codex_status="$status_x"
codex_detail="not authenticated — run: codex"
if [ -s "${HOME}/.codex/auth.json" ]; then
  codex_status="$status_ok"
  codex_detail="authenticated"
fi

pi_status="$status_x"
pi_detail="not authenticated — run: pi"
if [ -s "${HOME}/.pi/agent/auth.json" ]; then
  pi_status="$status_ok"
  pi_detail="authenticated"
fi

opencode_status="$status_x"
opencode_detail="not installed — run: oh harness install opencode"
if command -v opencode >/dev/null 2>&1; then
  if [ -s "${HOME}/.local/share/opencode/auth.json" ]; then
    opencode_status="$status_ok"
    opencode_detail="authenticated"
  else
    opencode_status="$status_ok"
    opencode_detail="installed — run: opencode auth login"
  fi
fi

grok_status="$status_x"
grok_detail="not installed — run: oh harness install grok-build"
if command -v grok >/dev/null 2>&1; then
  if [ -s "${HOME}/.grok/auth.json" ]; then
    grok_status="$status_ok"
    grok_detail="authenticated"
  elif [ -n "${XAI_API_KEY:-}" ]; then
    grok_status="$status_ok"
    grok_detail="configured via XAI_API_KEY"
  else
    grok_status="$status_ok"
    grok_detail="installed — run: grok login --device-auth (or grok login)"
  fi
fi

hermes_status="$status_x"
hermes_detail="not installed — run: oh harness install hermes"
if command -v hermes >/dev/null 2>&1; then
  if [ -s "${HERMES_HOME:-${OH_PROJECT_ROOT:-/home/sandbox/harness}/.hermes}/auth.json" ]; then
    hermes_status="$status_ok"
    hermes_detail="authenticated"
  else
    hermes_status="$status_ok"
    hermes_detail="installed — run: hermes setup"
  fi
fi

dashboard_status=""
dashboard_detail=""
if command -v hermes >/dev/null 2>&1; then
  if echo "${HERMES_DASHBOARD:-}" | grep -qiE '^(true|1|yes|on)$'; then
    if tmux has-session -t app-hermes-dashboard 2>/dev/null; then
      dashboard_status="$status_ok"
      dashboard_detail="dashboard — http://127.0.0.1:${HERMES_DASHBOARD_PORT:-9119}"
    else
      dashboard_status="$status_x"
      dashboard_detail="dashboard — enabled but not running (see /tmp/app-hermes-dashboard.log)"
    fi
  else
    dashboard_status="$status_empty"
    dashboard_detail="dashboard — disabled (set hermes.dashboard: true)"
  fi
fi

# oh CLI — verify the bind-mounted package built and symlinked
oh_status="$status_x"
oh_detail="not installed — check entrypoint logs"
if command -v oh >/dev/null 2>&1; then
  oh_version=$(oh --version 2>/dev/null | head -1)
  oh_status="$status_ok"
  oh_detail="${oh_version:-installed}"
fi


printf '\n'
printf '━━━ openharness: %s ━━━\n' "$sandbox_name"
printf '  Project:   %s\n' "$project_dir"
printf '  Timezone:  %s\n' "$timezone"
printf '  Overlays:  %s\n' "$overlays"
printf '\n'
printf '  Onboarding:\n'
printf '    %-6s %-11s %s\n' "$gh_status"         "gh"          "$gh_detail"
printf '    %-6s %-11s %s\n' "$claude_status"     "claude"      "$claude_detail"
printf '    %-6s %-11s %s\n' "$codex_status"      "codex"       "$codex_detail"
printf '    %-6s %-11s %s\n' "$opencode_status"   "opencode"    "$opencode_detail"
printf '    %-6s %-11s %s\n' "$grok_status"       "grok"        "$grok_detail"
printf '    %-6s %-11s %s\n' "$pi_status"         "pi"          "$pi_detail"
printf '    %-6s %-11s %s\n' "$hermes_status"     "hermes"      "$hermes_detail"
[ -n "$dashboard_status" ] && printf '    %-6s %-11s %s\n' "$dashboard_status" "dashboard" "$dashboard_detail"
printf '    %-6s %-11s %s\n' "$oh_status"         "oh"          "$oh_detail"
printf '\n'
shortcuts="claude · codex · pi"
command -v opencode >/dev/null 2>&1 && shortcuts="$shortcuts · opencode"
command -v grok >/dev/null 2>&1 && shortcuts="$shortcuts · grok"
command -v hermes >/dev/null 2>&1 && shortcuts="$shortcuts · hermes"
printf '  Recovery commands: %s · tmux attach -t cron-system\n' "$shortcuts"
printf '\n'
printf '  Next: run `herdr` to open your persistent Open Harness workspace.\n'
printf '  Complete setup, authentication, agents, tests, and servers inside Herdr.\n'
printf '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
printf '\n'

if [ -d "/home/orchestrator" ] && [ "$(whoami)" = "sandbox" ]; then
  printf '\n'
  printf '  [!] Container reverted orchestrator → sandbox. /home/orchestrator still present.\n'
  printf '      Recommended (preserves auth):\n'
  printf '        sudo chown -R 1000:1000 /home/sandbox\n'
  printf '      Reset: docker compose down -v && docker compose up --build\n'
  printf '\n'
fi
