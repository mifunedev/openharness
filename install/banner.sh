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
opencode_detail="not authenticated — run: opencode, then /connect"
if [ -s "${HOME}/.local/share/opencode/auth.json" ]; then
  opencode_status="[✓]"
  opencode_detail="authenticated"
fi

# deepagents — installed status from PATH; configured status from
# ~/.deepagents/.env or ~/.deepagents/config.toml so that an empty mounted
# directory (named volume on first boot) is not treated as authenticated.
deepagents_status="[✗]"
deepagents_detail="not installed"
if command -v deepagents >/dev/null 2>&1; then
  if [ -s "${HOME}/.deepagents/.env" ] || [ -s "${HOME}/.deepagents/config.toml" ]; then
    deepagents_status="[✓]"
    deepagents_detail="configured"
  else
    deepagents_status="[✓]"
    deepagents_detail="installed — configure ~/.deepagents/.env or run: deepagents"
  fi
fi

# hermes — opt-in via INSTALL_HERMES=true; installed status from PATH;
# configured status falls back to "any non-empty contents in ~/.hermes"
# because the upstream README does not name a single sentinel file.
hermes_status="[✗]"
hermes_detail="not installed — set INSTALL_HERMES=true and restart"
if command -v hermes >/dev/null 2>&1; then
  if [ -d "${HOME}/.hermes" ] && [ -n "$(ls -A "${HOME}/.hermes" 2>/dev/null)" ]; then
    hermes_status="[✓]"
    hermes_detail="configured"
  else
    hermes_status="[✓]"
    hermes_detail="installed — run: hermes setup"
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
printf '    %-6s %-11s %s\n' "$pi_status"         "pi"          "$pi_detail"
printf '    %-6s %-11s %s\n' "$deepagents_status" "deepagents"  "$deepagents_detail"
printf '    %-6s %-11s %s\n' "$hermes_status"     "hermes"      "$hermes_detail"
printf '    %-6s %-11s %s\n' "$oh_status"         "openharness" "$oh_detail"
printf '\n'
printf '  Shortcuts: claude · codex · opencode · pi · deepagents · hermes · tmux attach -t system-cron\n'
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
