#!/usr/bin/env bash
# tier: A
# source: retro lesson 2026-06-04
# desc: public mifune.dev is not served by next dev
set -euo pipefail


WEBSITE_PATH_PATTERN="mifunedev/website"

dev_pids=()
while IFS= read -r line; do
    dev_pids+=("$line")
done < <(pgrep -af "next dev" 2>/dev/null | grep -v "^$BASHPID " | grep -v "pgrep" || true)

if [[ ${#dev_pids[@]} -gt 0 && -n "${dev_pids[0]}" ]]; then
    echo "REGRESSION: 'next dev' process detected: ${dev_pids[0]}" >&2
    exit 1
fi

found_website_context=0

while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    cwd=""
    cwd=$(readlink "/proc/${pid}/cwd" 2>/dev/null || true)
    if [[ "$cwd" == *"$WEBSITE_PATH_PATTERN"* ]]; then
        found_website_context=1
        parent_pid=""
        parent_pid=$(awk '/^PPid:/{print $2}' "/proc/${pid}/status" 2>/dev/null || true)
        parent_args=""
        if [[ -n "$parent_pid" ]]; then
            parent_args=$(tr -d '\0' < "/proc/${parent_pid}/cmdline" 2>/dev/null || true)
        fi
        if echo "$parent_args" | grep -q "next dev"; then
            echo "REGRESSION: next-server under mifunedev/website has 'next dev' parent (pid=${pid}, parent_args=${parent_args})" >&2
            exit 1
        fi
        if ! echo "$parent_args" | grep -qE "next[[:space:]]start|next-server"; then
            echo "REGRESSION: next-server under mifunedev/website without production parent (pid=${pid}, cwd=${cwd})" >&2
            exit 1
        fi
    fi
done < <(pgrep -f "next-server" 2>/dev/null || true)

website_session=0
if tmux ls 2>/dev/null | grep -q "^app-website:"; then
    website_session=1
fi

if [[ $found_website_context -eq 0 && $website_session -eq 0 ]]; then
    echo "SKIPPED: no mifunedev/website process or app-website tmux session found — cannot verify" >&2
    exit 2
fi

echo "PASS: no 'next dev' process found for mifunedev/website (production mode or not running)" >&2
exit 0
