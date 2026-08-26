#!/usr/bin/env bash
# tier: A
# desc: .devcontainer/.example.env is the schema — the oh-init template carries the same keys, and every var docker-compose interpolates is documented there
set -euo pipefail


ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

CORE="$ROOT/.devcontainer/.example.env"
TEMPLATE="$ROOT/.oh/templates/.devcontainer/.example.env"

if [[ ! -f "$CORE" || ! -f "$TEMPLATE" ]]; then
  echo "SKIPPED: one or both .example.env templates absent on this branch" >&2
  exit 2
fi

keys_in() {
  grep -oE '^[[:space:]]*#?[[:space:]]*[A-Z_][A-Z0-9_]*=' "$1" \
    | tr -d '# \t' | tr -d '=' | sort -u
}

fails=()

only_core="$(comm -23 <(keys_in "$CORE") <(keys_in "$TEMPLATE") | paste -sd, -)"
only_tmpl="$(comm -13 <(keys_in "$CORE") <(keys_in "$TEMPLATE") | paste -sd, -)"
[[ -z "$only_core" ]] || fails+=("documented in .devcontainer/.example.env but not in .oh/templates/.devcontainer/.example.env: $only_core")
[[ -z "$only_tmpl" ]] || fails+=("documented in the oh-init template but not in .devcontainer/.example.env: $only_tmpl")

mapfile -t interpolated < <(
  grep -ohE '\$\{[A-Z_][A-Z0-9_]*' "$ROOT"/.devcontainer/docker-compose*.yml 2>/dev/null \
    | sed 's/${//' | sort -u
)
documented="$(keys_in "$CORE")"
undocumented=()
for var in "${interpolated[@]}"; do
  grep -qxF "$var" <<<"$documented" || undocumented+=("$var")
done
(( ${#undocumented[@]} == 0 )) \
  || fails+=("interpolated by a docker-compose file but undocumented in .devcontainer/.example.env: ${undocumented[*]}")

for var in DOCKER_SOCKET SANDBOX_SSH; do
  grep -qxF "$var" <<<"$documented" \
    || fails+=("$var selects a compose overlay but is undocumented in .devcontainer/.example.env")
done

if (( ${#fails[@]} > 0 )); then
  echo "REGRESSION: .env schema parity broken:" >&2
  printf '  - %s\n' "${fails[@]}" >&2
  exit 1
fi

echo "PASS: env schema parity — both .example.env templates carry the same keys, and every compose-interpolated var plus both overlay toggles are documented" >&2
exit 0
