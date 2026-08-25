#!/usr/bin/env bash
# tier: A
# source: conversation 2026-08-24 — CHANGELOG.md grew to 259KB of bullet prose because "one line" was unquantified
# desc: every `## [Unreleased]` bullet is one sentence of at most 250 characters; depth belongs in the PR body.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CHANGELOG="$ROOT/CHANGELOG.md"
CAP=250

if [[ ! -f "$CHANGELOG" ]]; then
  echo "PASS: no CHANGELOG.md to check" >&2
  exit 0
fi

mapfile -t offenders < <(
  CAP="$CAP" awk '
    /^## \[/ {
      in_section = ($0 ~ /^## \[Unreleased\]/)
      section = $0
      sub(/^## /, "", section)
      flush()
      next
    }
    !in_section { next }
    /^- / { flush(); buf = $0; open = 1; next }
    open && /^[[:space:]]*$/ { flush(); next }
    open && /^#/ { flush(); next }
    open { line = $0; sub(/^[[:space:]]+/, " ", line); buf = buf line; next }
    END { flush() }

    function flush(   n, head) {
      if (!open) { buf = ""; return }
      open = 0
      n = length(buf)
      if (n > ENVIRON["CAP"]) {
        head = substr(buf, 1, 60)
        printf "%s | %s… | %d chars\n", section, head, n
      }
      buf = ""
    }
  ' "$CHANGELOG"
)

if (( ${#offenders[@]} )); then
  printf 'REGRESSION: %d changelog entry/entries exceed %d characters:\n' "${#offenders[@]}" "$CAP" >&2
  printf '  %s\n' "${offenders[@]}" >&2
  exit 1
fi

echo "PASS: all [Unreleased] changelog entries are at most $CAP characters" >&2
exit 0
