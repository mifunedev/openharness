#!/usr/bin/env bash
# tier: A
# source: #165 — core sandbox config files must trigger harness CI
# desc: ci-harness.yml push and pull_request path filters must include Makefile and harness.yaml.example
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORKFLOW="$ROOT/.github/workflows/ci-harness.yml"

if [[ ! -f "$WORKFLOW" ]]; then
  echo "SKIPPED: workflow file absent: $WORKFLOW" >&2
  exit 2
fi

extract_paths() {
  local event="$1"
  awk -v event="$event" '
    $0 ~ "^  " event ":" { in_event=1; in_paths=0; next }
    in_event && $0 ~ /^  [A-Za-z0-9_-]+:/ { exit }
    in_event && $0 ~ /^[^[:space:]]/ { exit }
    in_event && $0 ~ /^[[:space:]]+paths:[[:space:]]*$/ { in_paths=1; next }
    in_paths && $0 ~ /^[[:space:]]+-[[:space:]]*/ {
      line=$0
      sub(/^[[:space:]]+-[[:space:]]*/, "", line)
      gsub(/["'"'"']/, "", line)
      sub(/[[:space:]]*#.*/, "", line)
      sub(/^[[:space:]]+/, "", line)
      sub(/[[:space:]]+$/, "", line)
      print line
      next
    }
    in_paths && $0 ~ /^[[:space:]]+[A-Za-z0-9_-]+:/ { in_paths=0 }
  ' "$WORKFLOW"
}

missing=()
for event in push pull_request; do
  paths="$(extract_paths "$event")"
  for required in Makefile harness.yaml.example; do
    if ! grep -Fxq "$required" <<<"$paths"; then
      missing+=("$event.paths:$required")
    fi
  done
done

if (( ${#missing[@]} == 0 )); then
  echo "PASS: ci-harness.yml covers Makefile and harness.yaml.example in push.paths and pull_request.paths" >&2
  exit 0
fi

printf 'REGRESSION: ci-harness.yml missing core path filter(s): %s\n' "${missing[*]}" >&2
exit 1
