#!/usr/bin/env bash
# tier: A
# source: memory/MEMORY.md 2026-06-04
# desc: public mifune.dev is not served by next dev
set -euo pipefail

# Strategy:
#   1. Scan for any process whose args contain "next dev" (dev mode launcher).
#   2. Scan for any next-server process whose cwd resolves under a mifunedev/website path.
#   3. Use `tmux ls` for the app-website session as a corroborating signal only —
#      not sufficient alone (session may exist after a server stop).
# If a dev-mode process is found → REGRESSION (exit 1).
# If no website process/context found at all → SKIPPED (exit 2).
# If website context found but no dev-mode process → PASS (exit 0).
# Exiting 0 when nothing can be verified is FORBIDDEN.

WEBSITE_PATH_PATTERN="mifunedev/website"

# --- 1. Detect explicit "next dev" invocations ---
dev_pids=()
while IFS= read -r line; do
    dev_pids+=("$line")
done < <(pgrep -af "next dev" 2>/dev/null | grep -v "^$BASHPID " | grep -v "pgrep" || true)

if [[ ${#dev_pids[@]} -gt 0 && -n "${dev_pids[0]}" ]]; then
    echo "REGRESSION: 'next dev' process detected: ${dev_pids[0]}" >&2
    exit 1
fi

# --- 2. Detect next-server processes whose cwd is under mifunedev/website ---
found_website_context=0

while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    cwd=""
    cwd=$(readlink "/proc/${pid}/cwd" 2>/dev/null || true)
    if [[ "$cwd" == *"$WEBSITE_PATH_PATTERN"* ]]; then
        found_website_context=1
        # next-server launched by "next dev" will NOT have "start" in its cmdline;
        # "next start" (production) spawns a next-server too, but the parent
        # process will be "next start", not "next dev".
        # We already checked for "next dev" parents above.
        # A remaining next-server under mifunedev/website with no "next start"
        # parent indicates a dev-mode server.
        parent_pid=""
        parent_pid=$(awk '/^PPid:/{print $2}' "/proc/${pid}/status" 2>/dev/null || true)
        parent_args=""
        if [[ -n "$parent_pid" ]]; then
            parent_args=$(tr -d '\0' < "/proc/${parent_pid}/cmdline" 2>/dev/null || true)
        fi
        # Flag as dev if parent args contain "next dev" or do NOT contain "next start"
        # (i.e., orphaned/direct next-server without a production start parent)
        if echo "$parent_args" | grep -q "next dev"; then
            echo "REGRESSION: next-server under mifunedev/website has 'next dev' parent (pid=${pid}, parent_args=${parent_args})" >&2
            exit 1
        fi
        if ! echo "$parent_args" | grep -qE "next[[:space:]]start|next-server"; then
            # Parent is not a known production launcher — treat as dev-mode
            echo "REGRESSION: next-server under mifunedev/website without production parent (pid=${pid}, cwd=${cwd})" >&2
            exit 1
        fi
    fi
done < <(pgrep -f "next-server" 2>/dev/null || true)

# --- 3. Corroborating: app-website tmux session ---
website_session=0
if tmux ls 2>/dev/null | grep -q "^app-website:"; then
    website_session=1
fi

# --- 4. Verdict ---
if [[ $found_website_context -eq 0 && $website_session -eq 0 ]]; then
    echo "SKIPPED: no mifunedev/website process or app-website tmux session found — cannot verify" >&2
    exit 2
fi

echo "PASS: no 'next dev' process found for mifunedev/website (production mode or not running)" >&2
exit 0
