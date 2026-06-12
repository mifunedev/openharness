#!/bin/sh
# scripts/harness-config.sh — POSIX sh + awk parser for harness.yaml.
#
# Usage:
#   harness-config.sh env [file]                KEY=value lines for docker compose --env-file
#   harness-config.sh compose-overrides [file]   one overlay path per line
#   harness-config.sh get <section.key> [file]   single raw value
#
# Default file: harness.yaml (relative to cwd).
# Absent or missing file: exit 0, no output (graceful degradation).
#
# Only allowlisted keys are emitted in env mode; unknown keys are silently
# ignored.  Values may contain spaces; trailing " # comment" is stripped
# when the # is preceded by whitespace; enclosing single/double quotes are
# stripped.

set -eu

_usage() {
    printf 'Usage: %s env [file]\n'               "$0" >&2
    printf '       %s compose-overrides [file]\n'  "$0" >&2
    printf '       %s get <section.key> [file]\n'  "$0" >&2
}

if [ "$#" -lt 1 ]; then
    _usage
    exit 2
fi

_mode="$1"
shift
_filter_key=""

case "$_mode" in
    env)
        _file="${1:-harness.yaml}"
        ;;
    compose-overrides)
        _file="${1:-harness.yaml}"
        ;;
    get)
        if [ "$#" -lt 1 ]; then
            _usage
            exit 2
        fi
        _filter_key="$1"
        shift
        _file="${1:-harness.yaml}"
        ;;
    *)
        printf 'harness-config.sh: unknown mode "%s"\n' "$_mode" >&2
        _usage
        exit 2
        ;;
esac

[ -f "$_file" ] || exit 0

awk -v mode="$_mode" -v filter_key="$_filter_key" -v sq="'" '
BEGIN {
    envmap["sandbox.name"]          = "SANDBOX_NAME"
    envmap["sandbox.timezone"]      = "TZ"
    envmap["git.user_name"]         = "GIT_USER_NAME"
    envmap["git.user_email"]        = "GIT_USER_EMAIL"
    envmap["install.opencode"]      = "INSTALL_OPENCODE"
    envmap["install.grok_build"]    = "INSTALL_GROK_BUILD"
    envmap["install.deepagents"]    = "INSTALL_DEEPAGENTS"
    envmap["install.hermes"]        = "INSTALL_HERMES"
    envmap["install.agent_browser"] = "INSTALL_AGENT_BROWSER"
    envmap["hermes.dashboard"]      = "HERMES_DASHBOARD"
    envmap["hermes.dashboard_port"] = "HERMES_DASHBOARD_PORT"
    envmap["crons.dir"]             = "CRONS_DIR"
    envmap["crons.agent_bin"]       = "CRON_AGENT_BIN"
    envmap["slack.allow_users"]     = "SLACK_ALLOW_USERS"
    envmap["slack.allow_channels"]  = "SLACK_ALLOW_CHANNELS"
    section  = ""
    list_key = ""
    in_list  = 0
}

# Strip a trailing " # comment" — only when # is preceded by whitespace.
function strip_trailing_comment(s) {
    sub(/[[:space:]]#.*$/, "", s)
    return s
}

# Strip matching enclosing single or double quotes.
function strip_quotes(s,    n) {
    n = length(s)
    if (n >= 2 && substr(s, 1, 1) == sq && substr(s, n, 1) == sq)
        return substr(s, 2, n - 2)
    if (n >= 2 && substr(s, 1, 1) == "\"" && substr(s, n, 1) == "\"")
        return substr(s, 2, n - 2)
    return s
}

# Full value clean-up: strip trailing comment, trim whitespace, strip quotes.
function clean_value(s) {
    s = strip_trailing_comment(s)
    sub(/[[:space:]]+$/, "", s)
    sub(/^[[:space:]]+/, "", s)
    return strip_quotes(s)
}

{
    # Skip full-line comments (first non-space char is #) and blank lines.
    if ($0 ~ /^[[:space:]]*#/ || $0 ~ /^[[:space:]]*$/) next

    # Section header at column 0: "word:" with no value (optional comment ok).
    if ($0 ~ /^[a-zA-Z_][a-zA-Z0-9_]*:[[:space:]]*(#.*)?$/) {
        section = $0
        sub(/:.*/, "", section)
        in_list  = 0
        list_key = ""
        next
    }

    # List item at 4-space indent inside an active list key: "    - value"
    if (in_list && $0 ~ /^    -[[:space:]]/) {
        val = $0
        sub(/^[[:space:]]*-[[:space:]]+/, "", val)
        val = clean_value(val)
        if (val != "") {
            if (mode == "compose-overrides" && list_key == "compose.overrides")
                print val
            else if (mode == "get" && list_key == filter_key)
                print val
        }
        next
    }

    # Key-value pair at exactly 2-space indent: "  key: value"
    if ($0 ~ /^  [a-zA-Z_][a-zA-Z0-9_]*:/) {
        in_list  = 0
        list_key = ""
        line = substr($0, 3)        # strip the 2-char indent
        key  = line
        sub(/:.*/, "", key)         # everything up to (not including) the colon
        val  = line
        sub(/^[^:]+:[[:space:]]*/, "", val)  # everything after "key: "
        dotkey = section "." key
        # Empty value (or comment-only) after the colon marks the start of a list.
        if (val == "" || val ~ /^[[:space:]]*(#.*)?$/) {
            in_list  = 1
            list_key = dotkey
            next
        }
        val = clean_value(val)
        if (val == "") next
        if (mode == "env" && (dotkey in envmap))
            print envmap[dotkey] "=" val
        else if (mode == "get" && dotkey == filter_key)
            print val
    }
}
' "$_file"
