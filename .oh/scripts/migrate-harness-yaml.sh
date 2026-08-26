#!/bin/sh
# migrate-harness-yaml.sh — one-shot migration of a local harness.yaml into
# .devcontainer/.env, run automatically by every lifecycle path.
#
# WHY THIS FILE IS SELF-CONTAINED. It carries its own copy of the awk parser
# that used to live in .oh/scripts/harness-config.sh. That script is deleted in
# the same release, so the whole harness.yaml compatibility story is ONE file:
# delete this script in a later release and nothing else has to change.
#
# Behaviour, in order:
#   1. No harness.yaml  -> exit 0. This is the steady state and costs one [ -f ].
#   2. Seed .devcontainer/.env from .example.env when it is absent.
#   3. Translate the 21 allowlisted section.key pairs into KEY=value.
#   4. Set each key in .env, UNCOMMENTING THE TEMPLATE LINE IN PLACE when the
#      key ships commented. harness.yaml won at runtime before this change, so a
#      differing .env value is overwritten -- and both values are printed, so the
#      change is visible rather than silent.
#   5. compose.overrides -> merge into .oh/config.json composeOverrides[] via jq.
#      Without jq the paths are printed for the operator instead of dropped.
#   6. Remove the derived .devcontainer/.harness.yaml.env.
#   7. mv harness.yaml harness.yaml.migrated -- idempotent, original preserved.
#
# Usage: migrate-harness-yaml.sh [repo-dir]     (default: the repo this lives in)

set -eu

_script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd -P)
_root="${1:-$(dirname -- "$(dirname -- "$_script_dir")")}"

_yaml="$_root/harness.yaml"
[ -f "$_yaml" ] || exit 0

_env="$_root/.devcontainer/.env"
_example="$_root/.devcontainer/.example.env"
_config="$_root/.oh/config.json"

# ── The parser (lifted from the deleted harness-config.sh) ────────────
# mode=env               KEY=value for the allowlist
# mode=compose-overrides one overlay path per line
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
    envmap["crons.dir"]             = "CRONS_DIR"
    envmap["crons.agent_bin"]       = "CRON_AGENT_BIN"
    envmap["paths.worktrees"]       = "WORKTREES_DIR"
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
    }
}
' "$_yaml"
}

_pairs=$(_parse env)
_overrides=$(_parse compose-overrides)

# ── Read one key out of .env, ignoring commented lines ────────────────
_env_get() {
    [ -f "$_env" ] || return 0
    awk -F= -v key="$1" '
        $0 ~ "^[[:space:]]*#" { next }
        $1 == key { print substr($0, index($0, "=") + 1); exit }
    ' "$_env"
}

# ── Set one key in .env, uncommenting the template line in place ──────
# Same discipline as the CLI writer: a commented `# KEY=default` line becomes
# `KEY=value` at the SAME line index, so the file keeps its shape and prose.
_env_set() {
    __k="$1"
    __v="$2"
    [ -f "$_env" ] || : > "$_env"
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

printf 'harness.yaml migration\n'
printf -- '----------------------\n'

# ── 2. Seed .env when absent ──────────────────────────────────────────
if [ ! -f "$_env" ]; then
    if [ -f "$_example" ]; then
        cp "$_example" "$_env"
        chmod 600 "$_env" 2>/dev/null || true
        printf '  create  .devcontainer/.env (from .example.env)\n'
    else
        : > "$_env"
        chmod 600 "$_env" 2>/dev/null || true
        printf '  create  .devcontainer/.env (empty — no .example.env found)\n'
    fi
fi

# ── 3-4. Translate and write ──────────────────────────────────────────
_count=0
if [ -n "$_pairs" ]; then
    # A value may contain spaces, so split on the FIRST '=' only.
    printf '%s\n' "$_pairs" | while IFS= read -r _pair; do
        [ -n "$_pair" ] || continue
        _key=${_pair%%=*}
        _val=${_pair#*=}
        _old=$(_env_get "$_key")
        _env_set "$_key" "$_val"
        if [ -z "$_old" ]; then
            printf '  set     %s=%s\n' "$_key" "$_val"
        elif [ "$_old" = "$_val" ]; then
            printf '  same    %s=%s\n' "$_key" "$_val"
        else
            # harness.yaml won at runtime before, so the YAML value is kept.
            printf '  replace %s: %s -> %s\n' "$_key" "$_old" "$_val"
        fi
    done
    _count=$(printf '%s\n' "$_pairs" | grep -c . || true)
fi
[ "$_count" -gt 0 ] 2>/dev/null || printf '  (no set keys — nothing to carry over)\n'

# ── 5. compose.overrides -> .oh/config.json composeOverrides[] ────────
if [ -n "$_overrides" ]; then
    if command -v jq >/dev/null 2>&1; then
        [ -f "$_config" ] || printf '{}\n' > "$_config"
        _tmp="$_config.oh-tmp"
        _add=$(printf '%s\n' "$_overrides" | jq -R -s 'split("\n") | map(select(length > 0))')
        jq --argjson add "$_add" \
           '.composeOverrides = ((.composeOverrides // []) + $add | unique)' \
           "$_config" > "$_tmp"
        mv "$_tmp" "$_config"
        printf '  merge   .oh/config.json composeOverrides[] (%s path(s))\n' \
            "$(printf '%s\n' "$_overrides" | grep -c .)"
    else
        printf '  WARNING jq not found — compose.overrides NOT migrated. Add these\n'
        printf '          paths to composeOverrides[] in .oh/config.json by hand:\n'
        printf '%s\n' "$_overrides" | sed 's/^/            /'
    fi
fi

# ── 6. Drop the derived env-file ──────────────────────────────────────
if [ -f "$_root/.devcontainer/.harness.yaml.env" ]; then
    rm -f "$_root/.devcontainer/.harness.yaml.env"
    printf '  remove  .devcontainer/.harness.yaml.env (derived — no longer used)\n'
fi

# ── 7. Retire the file ────────────────────────────────────────────────
mv "$_yaml" "$_root/harness.yaml.migrated"
printf '  rename  harness.yaml -> harness.yaml.migrated\n'
printf -- '----------------------\n'
printf 'Configuration now lives in .devcontainer/.env on every path, including\n'
printf 'VS Code "Reopen in Container". harness.yaml.migrated is kept for reference\n'
printf 'and can be deleted once you have checked the values above.\n'
