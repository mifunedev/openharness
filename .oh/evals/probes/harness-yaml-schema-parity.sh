#!/usr/bin/env bash
# tier: A
# desc: the two harness.yaml schemas (tracked harness.yaml.example and the oh init template) carry the same sections and keys, and oh init has exactly one line-editor
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

EXAMPLE="$ROOT/harness.yaml.example"
TEMPLATE="$ROOT/.oh/templates/harness.yaml"
INIT_CMD="$ROOT/.oh/cli/src/commands/init.ts"
YAML_LIB="$ROOT/.oh/cli/src/lib/harness-yaml.ts"

# SKIPPED (exit 2): one of the two schemas is not present on this branch.
if [[ ! -f "$EXAMPLE" || ! -f "$TEMPLATE" ]]; then
  echo "SKIPPED: harness.yaml schema pair not present (need harness.yaml.example and .oh/templates/harness.yaml)" >&2
  exit 2
fi

# Section headers: `name:` at column 0 with no value — exactly what
# .oh/scripts/harness-config.sh's awk treats as a section.
_sections() { grep -oE '^[a-zA-Z_][a-zA-Z0-9_]*:' "$1" | sort -u; }
# Keys: the commented template form `  # key: default   # ENV_VAR — …`, plus any
# live `  key: value` line, normalized to the bare key name.
_keys() {
  grep -oE '^ +#? *[a-zA-Z_][a-zA-Z0-9_]*:' "$1" \
    | tr -d ' #' \
    | sort -u
}

fails=()

while read -r s; do
  [[ -n "$s" ]] && fails+=("section '${s%:}' is in harness.yaml.example but missing from .oh/templates/harness.yaml")
done < <(comm -23 <(_sections "$EXAMPLE") <(_sections "$TEMPLATE"))

while read -r s; do
  [[ -n "$s" ]] && fails+=("section '${s%:}' is in .oh/templates/harness.yaml but missing from harness.yaml.example")
done < <(comm -13 <(_sections "$EXAMPLE") <(_sections "$TEMPLATE"))

while read -r k; do
  [[ -n "$k" ]] && fails+=("key '${k%:}' is in harness.yaml.example but has no home in .oh/templates/harness.yaml")
done < <(comm -23 <(_keys "$EXAMPLE") <(_keys "$TEMPLATE"))

while read -r k; do
  [[ -n "$k" ]] && fails+=("key '${k%:}' is in .oh/templates/harness.yaml but missing from harness.yaml.example")
done < <(comm -13 <(_keys "$EXAMPLE") <(_keys "$TEMPLATE"))

# ONE writer. `oh init` used to carry a second, section-blind regex editor that
# silently no-opped on a key absent from the template, so a wizard answer could
# be dropped without a word. lib/harness-yaml.ts is the single line editor.
if [[ -f "$INIT_CMD" ]]; then
  grep -q 'function setHarnessKey' "$INIT_CMD" \
    && fails+=("commands/init.ts reintroduced a second harness.yaml line editor (setHarnessKey) — use lib/harness-yaml.ts setKeyInSection")
  grep -q 'setKeyInSection' "$INIT_CMD" \
    || fails+=("commands/init.ts no longer routes wizard writes through setKeyInSection")
fi

if [[ -f "$YAML_LIB" ]]; then
  grep -q 'export function setKeyInSection' "$YAML_LIB" \
    || fails+=("lib/harness-yaml.ts no longer exports setKeyInSection (the one writer)")
fi

if (( ${#fails[@]} > 0 )); then
  echo "REGRESSION: harness.yaml schema parity broken:" >&2
  printf '  - %s\n' "${fails[@]}" >&2
  exit 1
fi

echo "PASS: harness.yaml schema parity — harness.yaml.example and .oh/templates/harness.yaml carry the same sections and keys, and setKeyInSection is the single line editor" >&2
exit 0
