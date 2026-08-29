#!/bin/sh
# migrate-harness-yaml.sh — one-shot migration of a local harness.yaml into
# Usage: migrate-harness-yaml.sh [repo-dir]     (default: the repo this lives in)

set -eu

_script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd -P)
_root="${1:-$(dirname -- "$(dirname -- "$_script_dir")")}"

_yaml="$_root/harness.yaml"
[ -f "$_yaml" ] || exit 0

_env="$_root/.env"
_config="$_root/oh.json"
_secrets_src="$_root/.oh/cli/src/lib/secrets.ts"

_parse() {
    awk -v mode="$1" -v sq="'" '
BEGIN {
    envmap["sandbox.name"]          = "SANDBOX_NAME"
    envmap["sandbox.timezone"]      = "TZ"
    envmap["sandbox.docker_socket"] = "DOCKER_SOCKET"
    envmap["sandbox.image"]         = "OH_SANDBOX_IMAGE"
    envmap["sandbox.pull_policy"]   = "OH_PULL_POLICY"
    envmap["git.user_name"]         = "GIT_USER_NAME"
    envmap["git.user_email"]        = "GIT_USER_EMAIL"
    envmap["install.opencode"]      = "INSTALL_OPENCODE"
    envmap["install.grok_build"]    = "INSTALL_GROK_BUILD"
    envmap["install.deepagents"]    = "INSTALL_DEEPAGENTS"
    envmap["install.hermes"]        = "INSTALL_HERMES"
    envmap["install.agent_browser"] = "INSTALL_AGENT_BROWSER"
    envmap["hermes.dashboard"]      = "HERMES_DASHBOARD"
    envmap["hermes.dashboard_port"] = "HERMES_DASHBOARD_PORT"
    envmap["ssh.enabled"]           = "SANDBOX_SSH"
    envmap["ssh.port"]              = "SANDBOX_SSH_PORT"
    envmap["ssh.password_auth"]     = "SANDBOX_SSH_PASSWORD_AUTH"
    envmap["crons.agent_bin"]       = "CRON_AGENT_BIN"
    retiredmap["crons.dir"]         = "crons"
    retiredmap["paths.worktrees"]   = ".worktrees"
    retiredmap["paths.projects"]    = "projects"
    section  = ""
    list_key = ""
    in_list  = 0
}

function strip_trailing_comment(s) {
    sub(/[[:space:]]#.*$/, "", s)
    return s
}

function strip_quotes(s,    n) {
    n = length(s)
    if (n >= 2 && substr(s, 1, 1) == sq && substr(s, n, 1) == sq)
        return substr(s, 2, n - 2)
    if (n >= 2 && substr(s, 1, 1) == "\"" && substr(s, n, 1) == "\"")
        return substr(s, 2, n - 2)
    return s
}

function clean_value(s) {
    s = strip_trailing_comment(s)
    sub(/[[:space:]]+$/, "", s)
    sub(/^[[:space:]]+/, "", s)
    return strip_quotes(s)
}

{
    if ($0 ~ /^[[:space:]]*#/ || $0 ~ /^[[:space:]]*$/) next

    if ($0 ~ /^[a-zA-Z_][a-zA-Z0-9_]*:[[:space:]]*(#.*)?$/) {
        section = $0
        sub(/:.*/, "", section)
        in_list  = 0
        list_key = ""
        next
    }

    if (in_list && $0 ~ /^    -[[:space:]]/) {
        val = $0
        sub(/^[[:space:]]*-[[:space:]]+/, "", val)
        val = clean_value(val)
        if (val != "" && mode == "compose-overrides" && list_key == "compose.overrides")
            print val
        next
    }

    if ($0 ~ /^  [a-zA-Z_][a-zA-Z0-9_]*:/) {
        in_list  = 0
        list_key = ""
        line = substr($0, 3)
        key  = line
        sub(/:.*/, "", key)
        val  = line
        sub(/^[^:]+:[[:space:]]*/, "", val)
        dotkey = section "." key
        if (val == "" || val ~ /^[[:space:]]*(#.*)?$/) {
            in_list  = 1
            list_key = dotkey
            next
        }
        val = clean_value(val)
        if (val == "") next
        if (mode == "env" && (dotkey in envmap))
            print envmap[dotkey] "=" val
        if (mode == "retired" && (dotkey in retiredmap) && val != retiredmap[dotkey])
            print dotkey "=" val "=" retiredmap[dotkey]
    }
}
' "$_yaml"
}

_pairs=$(_parse env)
_overrides=$(_parse compose-overrides)
_retired=$(_parse retired)

_secret_keys() {
    if [ -f "$_secrets_src" ]; then
        sed -n '/^export const SECRET_KEYS/,/^\] as const;/p' "$_secrets_src" \
            | sed -n 's/^[[:space:]]*"\([A-Z0-9_]*\)",\{0,1\}$/\1/p'
        return 0
    fi
    printf '%s\n' GH_TOKEN XAI_API_KEY SANDBOX_PASSWORD PI_SLACK_APP_TOKEN \
        PI_SLACK_BOT_TOKEN LANGFUSE_PUBLIC_KEY LANGFUSE_SECRET_KEY OH_CLOUD_PROVISION_KEY
}

_secrets=$(_secret_keys)

_is_secret() {
    printf '%s\n' "$_secrets" | grep -Fxq "$1"
}

_field_for() {
    case "$1" in
        SANDBOX_NAME)               printf 'name string\n' ;;
        TZ)                         printf 'timezone string\n' ;;
        DOCKER_SOCKET)              printf 'access.dockerSocket boolean\n' ;;
        OH_SANDBOX_IMAGE)           printf 'image.ref string\n' ;;
        OH_PULL_POLICY)             printf 'image.pullPolicy string\n' ;;
        GIT_USER_NAME)              printf 'git.userName string\n' ;;
        GIT_USER_EMAIL)             printf 'git.userEmail string\n' ;;
        INSTALL_OPENCODE)           printf 'install.opencode boolean\n' ;;
        INSTALL_GROK_BUILD)         printf 'install.grokBuild boolean\n' ;;
        INSTALL_DEEPAGENTS)         printf 'install.deepagents boolean\n' ;;
        INSTALL_HERMES)             printf 'install.hermes boolean\n' ;;
        INSTALL_AGENT_BROWSER)      printf 'install.agentBrowser boolean\n' ;;
        HERMES_DASHBOARD)           printf 'hermesDashboard.enabled boolean\n' ;;
        HERMES_DASHBOARD_PORT)      printf 'hermesDashboard.port number\n' ;;
        SANDBOX_SSH)                printf 'access.ssh boolean\n' ;;
        SANDBOX_SSH_PORT)           printf 'access.sshPort number\n' ;;
        SANDBOX_SSH_PASSWORD_AUTH)  printf 'access.sshPasswordAuth boolean\n' ;;
        CRON_AGENT_BIN)             printf 'cron.agentBin string\n' ;;
        *)                          return 1 ;;
    esac
}

_env_set() {
    __k="$1"
    __v="$2"
    [ -f "$_env" ] || : > "$_env"
    chmod 600 "$_env" 2>/dev/null || true
    awk -v key="$__k" -v val="$__v" '
        BEGIN { done = 0 }
        !done && $0 ~ "^[[:space:]]*" key "=" {
            print key "=" val; done = 1; next
        }
        !done && $0 ~ "^[[:space:]]*#[[:space:]]*" key "=" {
            print key "=" val; done = 1; next
        }
        { print }
        END { if (!done) print key "=" val }
    ' "$_env" > "$_env.oh-tmp"
    mv "$_env.oh-tmp" "$_env"
    unset __k __v
}

_json_get() {
    [ -f "$_config" ] || return 0
    __keys=$(printf '%s' "$1" | tr '.' '\n' | jq -R . | jq -s -c .)
    jq -r --argjson keys "$__keys" 'getpath($keys) // empty | tostring' "$_config" 2>/dev/null || true
    unset __keys
}

_json_set() {
    __path="$1"
    __type="$2"
    __value="$3"
    [ -f "$_config" ] || printf '{ "version": 1 }\n' > "$_config"
    __keys=$(printf '%s' "$__path" | tr '.' '\n' | jq -R . | jq -s -c .)
    case "$__type" in
        boolean)
            case "$(printf '%s' "$__value" | tr '[:upper:]' '[:lower:]')" in
                1|true|yes|on) __json=true ;;
                *)             __json=false ;;
            esac
            jq --argjson keys "$__keys" --argjson v "$__json" \
               '.version = 1 | setpath($keys; $v)' "$_config" > "$_config.oh-tmp"
            ;;
        number)
            case "$__value" in
                ''|*[!0-9]*) return 1 ;;
            esac
            jq --argjson keys "$__keys" --argjson v "$__value" \
               '.version = 1 | setpath($keys; $v)' "$_config" > "$_config.oh-tmp"
            ;;
        *)
            jq --argjson keys "$__keys" --arg v "$__value" \
               '.version = 1 | setpath($keys; $v)' "$_config" > "$_config.oh-tmp"
            ;;
    esac
    mv "$_config.oh-tmp" "$_config"
    unset __path __type __value __keys __json
}

printf 'harness.yaml migration\n'
printf -- '----------------------\n'

_have_jq=0
if command -v jq >/dev/null 2>&1; then
    _have_jq=1
fi

if [ "$_have_jq" -eq 0 ] && [ -n "$_pairs$_overrides" ]; then
    printf '  WARNING jq not found — nothing was written to oh.json. Install jq and\n'
    printf '          re-run, or set these by hand with `oh config set`:\n'
fi

_count=0
if [ -n "$_pairs" ]; then
    printf '%s\n' "$_pairs" | while IFS= read -r _pair; do
        [ -n "$_pair" ] || continue
        _key=${_pair%%=*}
        _val=${_pair#*=}
        if _is_secret "$_key"; then
            _env_set "$_key" "$_val"
            printf '  secret  %s -> .env\n' "$_key"
            continue
        fi
        if ! _field=$(_field_for "$_key"); then
            printf '  SKIP    %s=%s (no oh.json field)\n' "$_key" "$_val"
            continue
        fi
        _fpath=${_field%% *}
        _ftype=${_field##* }
        if [ "$_have_jq" -eq 0 ]; then
            printf '            %s = %s\n' "$_fpath" "$_val"
            continue
        fi
        _old=$(_json_get "$_fpath")
        if ! _json_set "$_fpath" "$_ftype" "$_val"; then
            printf '  SKIP    oh.json %s = %s (not a valid %s)\n' "$_fpath" "$_val" "$_ftype"
        elif [ -z "$_old" ]; then
            printf '  set     oh.json %s = %s\n' "$_fpath" "$_val"
        elif [ "$_old" = "$(_json_get "$_fpath")" ]; then
            printf '  same    oh.json %s = %s\n' "$_fpath" "$_old"
        else
            printf '  replace oh.json %s: %s -> %s\n' "$_fpath" "$_old" "$(_json_get "$_fpath")"
        fi
    done
    _count=$(printf '%s\n' "$_pairs" | grep -c . || true)
fi
[ "$_count" -gt 0 ] 2>/dev/null || printf '  (no set keys — nothing to carry over)\n'

if [ -n "$_retired" ]; then
    printf '%s\n' "$_retired" | while IFS= read -r _row; do
        [ -n "$_row" ] || continue
        _rkey=${_row%%=*}
        _rrest=${_row#*=}
        _rval=${_rrest%=*}
        _rfixed=${_rrest##*=}
        printf '  WARNING %s: %s is no longer honoured. The harness layout is a\n' "$_rkey" "$_rval"
        printf '          convention, not a setting; this directory is always %s at the\n' "$_rfixed"
        printf '          repository root. Move any content there.\n'
    done
fi

if [ -n "$_overrides" ]; then
    if [ "$_have_jq" -eq 1 ]; then
        [ -f "$_config" ] || printf '{ "version": 1 }\n' > "$_config"
        _add=$(printf '%s\n' "$_overrides" | jq -R -s 'split("\n") | map(select(length > 0))')
        jq --argjson add "$_add" \
           '.version = 1 | .composeOverrides = ((.composeOverrides // []) + $add | unique)' \
           "$_config" > "$_config.oh-tmp"
        mv "$_config.oh-tmp" "$_config"
        printf '  merge   oh.json composeOverrides[] (%s path(s))\n' \
            "$(printf '%s\n' "$_overrides" | grep -c .)"
    else
        printf '            composeOverrides[]:\n'
        printf '%s\n' "$_overrides" | sed 's/^/              /'
    fi
fi

if [ -f "$_root/.devcontainer/.harness.yaml.env" ]; then
    rm -f "$_root/.devcontainer/.harness.yaml.env"
    printf '  remove  .devcontainer/.harness.yaml.env (derived — no longer used)\n'
fi

mv "$_yaml" "$_root/harness.yaml.migrated"
printf '  rename  harness.yaml -> harness.yaml.migrated\n'
printf -- '----------------------\n'
printf 'Non-secret configuration now lives in the tracked oh.json; secrets live in\n'
printf 'the gitignored root dotenv. harness.yaml.migrated is kept for reference and\n'
printf 'can be deleted once you have checked the values above.\n'
