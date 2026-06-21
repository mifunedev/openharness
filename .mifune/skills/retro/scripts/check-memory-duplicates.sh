#!/usr/bin/env bash
set -euo pipefail

# Reads proposed MEMORY/IDENTITY lines from stdin and reports lines whose lesson
# text already appears in memory/MEMORY.md or context/IDENTITY.md. Exact enough to
# catch double-writes without making subjective semantic judgments.
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$SCRIPT_DIR/../../../.." && pwd)
MEMORY_FILE="$ROOT/memory/MEMORY.md"
IDENTITY_FILE="$ROOT/context/IDENTITY.md"

status=0
while IFS= read -r line; do
  [[ -n "$line" ]] || continue
  # Strip common bullet/date prefixes and metadata after the first bracket tag.
  normalized=$(printf '%s' "$line" \
    | sed -E 's/^- +//' \
    | sed -E 's/^\*\*[0-9]{4}-[0-9]{2}-[0-9]{2}\*\*: //' \
    | sed -E 's/^[0-9]{4}-[0-9]{2}-[0-9]{2}: //' \
    | sed -E 's/ \[[^]]+\].*$//')
  [[ -n "$normalized" ]] || continue
  if { [[ -f "$MEMORY_FILE" ]] && grep -Fqi -- "$normalized" "$MEMORY_FILE"; } || \
     { [[ -f "$IDENTITY_FILE" ]] && grep -Fqi -- "$normalized" "$IDENTITY_FILE"; }; then
    echo "DUPLICATE: $line" >&2
    status=1
  fi
done
exit "$status"
