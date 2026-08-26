#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PREFERRED_ENV_PATH="$HOME/.env/.claude/.env.claude"
FALLBACK_ENV_PATH="$(dirname "$SCRIPT_DIR")/.env.claude"

if [[ -f "$PREFERRED_ENV_PATH" ]]; then
    DOTENV_PATH="$PREFERRED_ENV_PATH"
else
    DOTENV_PATH="$FALLBACK_ENV_PATH"
fi

if [[ -f "$DOTENV_PATH" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$DOTENV_PATH"
    set +a
    echo "Loaded env from: $DOTENV_PATH" >&2
fi

if [[ -z "${SLACK_WEBHOOK_URL:-}" ]]; then
    echo "Slack notification skipped: SLACK_WEBHOOK_URL is not set" >&2
    exit 0
fi

INPUT_JSON=$(cat)

if [[ -z "$INPUT_JSON" ]]; then
    echo "Failed to read input from stdin" >&2
    exit 1
fi

EVENT=$(echo "$INPUT_JSON" | jq -r '.hook_event_name // ""')
CWD=$(echo "$INPUT_JSON" | jq -r '.cwd // ""')
SESSION_ID=$(echo "$INPUT_JSON" | jq -r '.session_id // ""')

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

get_final_response() {
    local transcript_path="$1"
    local max_length="${2:-1500}"

    transcript_path="${transcript_path/#\~/$HOME}"

    if [[ -z "$transcript_path" || ! -f "$transcript_path" ]]; then
        echo "(transcript not found)"
        return
    fi

    local final_response=""
    final_response=$(jq -rs '
        [.[] | select(.type == "assistant" and .message.role == "assistant" and .message.content)]
        | last
        | .message.content
        | if type == "array" then
            [.[] | if type == "object" and .type == "text" then .text elif type == "string" then . else empty end]
            | join("\n")
          elif type == "string" then
            .
          else
            ""
          end
        // ""
    ' "$transcript_path" 2>/dev/null || echo "")

    if [[ -z "$final_response" ]]; then
        echo "(no response found)"
        return
    fi

    if [[ ${#final_response} -gt $max_length ]]; then
        echo "${final_response:0:$max_length}...
_(truncated)_"
    else
        echo "$final_response"
    fi
}

TEXT=""
case "$EVENT" in
    "Notification")
        NOTIFICATION_TYPE=$(echo "$INPUT_JSON" | jq -r '.notification_type // ""')
        MESSAGE=$(echo "$INPUT_JSON" | jq -r '.message // ""')
        TEXT="🧠 Claude Code: *${NOTIFICATION_TYPE}*
${MESSAGE}
• time: \`${TIMESTAMP}\`
• cwd: \`${CWD}\`
• session: \`${SESSION_ID}\`"
        ;;
    "Stop")
        STOP_HOOK_ACTIVE=$(echo "$INPUT_JSON" | jq -r '.stop_hook_active // false')
        TRANSCRIPT_PATH=$(echo "$INPUT_JSON" | jq -r '.transcript_path // ""')
        FINAL_RESPONSE=$(get_final_response "$TRANSCRIPT_PATH")
        TEXT="✅ Claude Code: *Stop*
• time: \`${TIMESTAMP}\`
• cwd: \`${CWD}\`
• session: \`${SESSION_ID}\`
• stop_hook_active: \`${STOP_HOOK_ACTIVE}\`

*Final Response:*
\`\`\`
${FINAL_RESPONSE}
\`\`\`"
        ;;
    *)
        TEXT="Claude Code hook: ${EVENT}
• time: \`${TIMESTAMP}\`
• cwd: ${CWD}
• session: ${SESSION_ID}"
        ;;
esac

SLACK_PAYLOAD=$(jq -n --arg text "$TEXT" '{"text": $text}')

HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "$SLACK_WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "$SLACK_PAYLOAD" \
    --max-time 10 \
    2>&1) || {
    echo "Failed to send Slack notification: curl error" >&2
    exit 1
}

HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -n1)

if [[ ! "$HTTP_CODE" =~ ^2[0-9][0-9]$ ]]; then
    RESPONSE_BODY=$(echo "$HTTP_RESPONSE" | sed '$d')
    echo "Failed to send Slack notification: HTTP $HTTP_CODE - $RESPONSE_BODY" >&2
    exit 1
fi