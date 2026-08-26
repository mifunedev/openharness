#!/usr/bin/env bash
# tier: A
# desc: .devcontainer/.example.env is the schema — the oh-init template carries the same keys, and every var docker-compose interpolates is documented there
set -euo pipefail

# WHY THIS PROBE EXISTS. Removing harness.yaml made .devcontainer/.example.env
# the one schema document, so two silent failure modes became possible:
#
#   1. a key added to the core template but not the `oh init` one, which ships a
#      scaffold documenting less than the harness it scaffolds;
#   2. a var interpolated by a compose file but documented nowhere, which is how
#      DOCKER_SOCKET, SANDBOX_SSH, OH_SANDBOX_IMAGE, OH_PULL_POLICY and
#      SKIP_PNPM_INSTALL were all consumed-but-undocumented before 0.4.0.
#
# It compares KEY NAMES only. Values and prose deliberately differ (the template
# tells an `oh init` repo to run `oh`, not `make`).

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

CORE="$ROOT/.devcontainer/.example.env"
TEMPLATE="$ROOT/.oh/templates/.devcontainer/.example.env"

if [[ ! -f "$CORE" || ! -f "$TEMPLATE" ]]; then
  echo "SKIPPED: one or both .example.env templates absent on this branch" >&2
  exit 2
fi

# Every `KEY=` at column 0, live or commented. A trailing `# note` after the
# value is prose, not a second key, so only the leading token is taken.
keys_in() {
  grep -oE '^[[:space:]]*#?[[:space:]]*[A-Z_][A-Z0-9_]*=' "$1" \
    | tr -d '# \t' | tr -d '=' | sort -u
}

fails=()

# --- 1. The two templates carry the same keys ---------------------------------
only_core="$(comm -23 <(keys_in "$CORE") <(keys_in "$TEMPLATE") | paste -sd, -)"
only_tmpl="$(comm -13 <(keys_in "$CORE") <(keys_in "$TEMPLATE") | paste -sd, -)"
[[ -z "$only_core" ]] || fails+=("documented in .devcontainer/.example.env but not in .oh/templates/.devcontainer/.example.env: $only_core")
[[ -z "$only_tmpl" ]] || fails+=("documented in the oh-init template but not in .devcontainer/.example.env: $only_tmpl")

# --- 2. Every compose-interpolated var is documented --------------------------
# GH_TOKEN and friends are secrets, but they are still interpolated and still
# have to be named, so no key is exempt.
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

# --- 3. The wrapper-only toggles are documented too ---------------------------
# DOCKER_SOCKET and SANDBOX_SSH select overlays inside
# .oh/scripts/docker-compose.sh and are interpolated by no compose file, so
# check 2 cannot see them. They are the two most security-relevant keys in the
# file; name them explicitly rather than trusting the general rule.
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
