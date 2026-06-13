#!/usr/bin/env bash
# banner.sh — sourced from .bashrc to print a one-shot onboarding banner
# on interactive shell start. Never use `exit` here; always use `return`.

# Only print in interactive shells
case $- in *i*) ;; *) return 0 ;; esac

# Guard against nested shells
[ -n "$OH_BANNER_SHOWN" ] && return 0
export OH_BANNER_SHOWN=1

# ---------------------------------------------------------------------------
# Collect environment info
# ---------------------------------------------------------------------------

sandbox_name="${SANDBOX_NAME:-$(hostname)}"
timezone="${TZ:-$(date +%Z 2>/dev/null)}"
workspace_dir="${HOME}/harness/workspace"

# Parse compose overlays from openharness config
overlays=""
if command -v jq >/dev/null 2>&1; then
  overlays=$(jq -r \
    '.composeOverrides[]? | sub("^\\.devcontainer/docker-compose\\."; "") | sub("\\.yml$"; "")' \
    "${HOME}/harness/config.json" 2>/dev/null \
    | paste -sd, -)
fi
[ -z "$overlays" ] && overlays="(none)"

# ---------------------------------------------------------------------------
# Onboarding status checks
# ---------------------------------------------------------------------------

# gh — check auth status and extract username
gh_status="[✗]"
gh_detail="not authenticated — run: gh auth login"
if command -v gh >/dev/null 2>&1 && gh auth status -h github.com >/dev/null 2>&1; then
  gh_user=$(gh api user --jq .login 2>/dev/null)
  if [ -n "$gh_user" ]; then
    gh_status="[✓]"
    gh_detail="authenticated as ${gh_user}"
  else
    gh_status="[✓]"
    gh_detail="authenticated"
  fi
fi

# claude — check for populated .credentials.json
claude_status="[✗]"
claude_detail="not authenticated — run: claude"
if [ -s "${HOME}/.claude/.credentials.json" ]; then
  claude_status="[✓]"
  claude_detail="authenticated"
fi

# codex — check for populated auth.json
codex_status="[✗]"
codex_detail="not authenticated — run: codex"
if [ -s "${HOME}/.codex/auth.json" ]; then
  codex_status="[✓]"
  codex_detail="authenticated"
fi

# pi — check for populated .pi directory
pi_status="[✗]"
pi_detail="not authenticated — run: pi"
if [ -s "${HOME}/.pi/agent/auth.json" ]; then
  pi_status="[✓]"
  pi_detail="authenticated"
fi

# opencode — check for populated provider auth file
opencode_status="[✗]"
opencode_detail="not installed — set INSTALL_OPENCODE=true and rebuild"
if command -v opencode >/dev/null 2>&1; then
  if [ -s "${HOME}/.local/share/opencode/auth.json" ]; then
    opencode_status="[✓]"
    opencode_detail="authenticated"
  else
    opencode_status="[✓]"
    opencode_detail="installed — run: opencode auth login"
  fi
fi

# grok — optional image-level CLI; auth state lives under ~/.grok, with
# XAI_API_KEY as a secret-only non-interactive fallback.
grok_status="[✗]"
grok_detail="not installed — enable via install.grok_build / INSTALL_GROK_BUILD"
if command -v grok >/dev/null 2>&1; then
  if [ -s "${HOME}/.grok/auth.json" ]; then
    grok_status="[✓]"
    grok_detail="authenticated"
  elif [ -n "${XAI_API_KEY:-}" ]; then
    grok_status="[✓]"
    grok_detail="configured via XAI_API_KEY"
  else
    grok_status="[✓]"
    grok_detail="installed — run: grok login --device-auth (or grok login)"
  fi
fi

# deepagents — installed status from PATH; configured status from
# ~/.deepagents/.env or ~/.deepagents/config.toml so that an empty mounted
# directory (named volume on first boot) is not treated as authenticated.
deepagents_status="[✗]"
deepagents_detail="not installed — set INSTALL_DEEPAGENTS=true and rebuild"
if command -v deepagents >/dev/null 2>&1; then
  if [ -s "${HOME}/.deepagents/.env" ] || [ -s "${HOME}/.deepagents/config.toml" ]; then
    deepagents_status="[✓]"
    deepagents_detail="configured"
  else
    deepagents_status="[✓]"
    deepagents_detail="installed — configure ~/.deepagents/.env or run: deepagents"
  fi
fi

# hermes — optional image-level CLI; auth status checks HERMES_HOME's
# auth.json (project-local, gitignored) rather than config.yaml/.env,
# because setup can seed config files before the user authenticates.
hermes_status="[✗]"
hermes_detail="not installed — set INSTALL_HERMES=true and rebuild"
if command -v hermes >/dev/null 2>&1; then
  if [ -s "${HERMES_HOME:-/home/sandbox/harness/.hermes}/auth.json" ]; then
    hermes_status="[✓]"
    hermes_detail="authenticated"
  else
    hermes_status="[✓]"
    hermes_detail="installed — run: hermes setup"
  fi
fi

# dashboard — hermes-related dashboard service; leave empty if hermes not installed
dashboard_status=""
dashboard_detail=""
if command -v hermes >/dev/null 2>&1; then
  if echo "${HERMES_DASHBOARD:-}" | grep -qiE '^(true|1|yes|on)$'; then
    if tmux has-session -t app-hermes-dashboard 2>/dev/null; then
      dashboard_status="[✓]"
      dashboard_detail="dashboard — http://127.0.0.1:${HERMES_DASHBOARD_PORT:-9119}"
    else
      dashboard_status="[✗]"
      dashboard_detail="dashboard — enabled but not running (see /tmp/app-hermes-dashboard.log)"
    fi
  else
    dashboard_status="[ ]"
    dashboard_detail="dashboard — disabled (set hermes.dashboard: true)"
  fi
fi

# openharness CLI — verify the bind-mounted package built and symlinked
oh_status="[✗]"
oh_detail="not installed — check entrypoint logs"
if command -v openharness >/dev/null 2>&1; then
  oh_version=$(openharness --version 2>/dev/null | head -1)
  oh_status="[✓]"
  oh_detail="${oh_version:-installed}"
fi

# ---------------------------------------------------------------------------
# Print banner
# ---------------------------------------------------------------------------

printf '\n'
printf '━━━ openharness: %s ━━━\n' "$sandbox_name"
printf '  Workspace: %s\n' "$workspace_dir"
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
printf '    %-6s %-11s %s\n' "$deepagents_status" "deepagents"  "$deepagents_detail"
printf '    %-6s %-11s %s\n' "$hermes_status"     "hermes"      "$hermes_detail"
[ -n "$dashboard_status" ] && printf '    %-6s %-11s %s\n' "$dashboard_status" "dashboard" "$dashboard_detail"
printf '    %-6s %-11s %s\n' "$oh_status"         "openharness" "$oh_detail"
printf '\n'
shortcuts="claude · codex · pi"
command -v opencode >/dev/null 2>&1 && shortcuts="$shortcuts · opencode"
command -v grok >/dev/null 2>&1 && shortcuts="$shortcuts · grok"
command -v deepagents >/dev/null 2>&1 && shortcuts="$shortcuts · deepagents"
command -v hermes >/dev/null 2>&1 && shortcuts="$shortcuts · hermes"
printf '  Shortcuts: %s · tmux attach -t cron-system\n' "$shortcuts"
printf '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
printf '\n'

# Migration guard — orchestrator → sandbox user revert
# Fires only when the old /home/orchestrator directory still exists and the
# current user is sandbox (upgraded container post-revert, no volume reset).
if [ -d "/home/orchestrator" ] && [ "$(whoami)" = "sandbox" ]; then
  printf '\n'
  printf '  [!] Container reverted orchestrator → sandbox. /home/orchestrator still present.\n'
  printf '      Recommended (preserves auth):\n'
  printf '        sudo chown -R 1000:1000 /home/sandbox\n'
  printf '      Reset: docker compose down -v && docker compose up --build\n'
  printf '\n'
fi
