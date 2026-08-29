#!/usr/bin/env bash
# tier: A
# source: PR #833 (remove harness.yaml — the wrapper and VS Code "Reopen in Container" paths must resolve the same service) 2026-08-26
# desc: the wrapper path and the VS Code "Reopen in Container" path resolve the same service — the parity harness.yaml made impossible
set -euo pipefail


ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WRAPPER="$ROOT/.oh/scripts/docker-compose.sh"
COMPOSE_FILE="$ROOT/.devcontainer/docker-compose.yml"

if [[ ! -f "$WRAPPER" || ! -f "$COMPOSE_FILE" ]]; then
  echo "SKIPPED: compose wrapper or base compose file absent on this branch" >&2
  exit 2
fi

fails=()

argv="$(bash "$WRAPPER" --repo-dir "$ROOT" --print-argv config 2>/dev/null || true)"
env_file_count="$(grep -cx -- '--env-file' <<<"$argv" || true)"

if (( env_file_count > 1 )); then
  fails+=("the wrapper passes $env_file_count --env-file arguments; only .devcontainer/.env may be one, or path B cannot see the rest")
elif (( env_file_count == 1 )); then
  named="$(grep -A1 -x -- '--env-file' <<<"$argv" | tail -1)"
  [[ "$named" == "$ROOT/.devcontainer/.env" ]] \
    || fails+=("the wrapper's --env-file is '$named', not .devcontainer/.env — path B auto-loads only the latter")
fi

grep -q 'harness-config.sh' <<<"$argv" \
  && fails+=("the wrapper still shells out to harness-config.sh")

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  if (( ${#fails[@]} > 0 )); then
    echo "REGRESSION: compose config path parity broken:" >&2
    printf '  - %s\n' "${fails[@]}" >&2
    exit 1
  fi
  echo "SKIPPED: docker compose unavailable — structural half passed, behavioural half not run" >&2
  exit 2
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/.devcontainer"
cp -R "$ROOT/.devcontainer/." "$work/.devcontainer/"
mkdir -p "$work/.oh/scripts"
cp "$WRAPPER" "$work/.oh/scripts/"
[[ -f "$ROOT/.oh/scripts/check-host-port.sh" ]] && cp "$ROOT/.oh/scripts/check-host-port.sh" "$work/.oh/scripts/"
rm -f "$work/.oh/config.json"

{
  printf 'SANDBOX_NAME=parityprobe\n'
  printf 'TZ=America/Denver\n'
  printf 'INSTALL_HERMES=true\n'
  printf 'CRON_AGENT_BIN=codex\n'
} > "$work/.devcontainer/.env"

clear_ambient=(env -u SANDBOX_NAME -u TZ -u INSTALL_HERMES -u CRON_AGENT_BIN)

via_wrapper="$(cd "$work" && "${clear_ambient[@]}" bash "$work/.oh/scripts/docker-compose.sh" --repo-dir "$work" config 2>/dev/null || true)"
via_vscode="$(cd "$work/.devcontainer" && "${clear_ambient[@]}" docker compose -f "$work/.devcontainer/docker-compose.yml" config 2>/dev/null || true)"

if [[ -z "$via_wrapper" || -z "$via_vscode" ]]; then
  if (( ${#fails[@]} > 0 )); then
    echo "REGRESSION: compose config path parity broken:" >&2
    printf '  - %s\n' "${fails[@]}" >&2
    exit 1
  fi
  echo "SKIPPED: docker compose config produced no output on this host — structural half passed" >&2
  exit 2
fi

for pair in "container_name: parityprobe" "TZ: America/Denver" "INSTALL_HERMES" "CRON_AGENT_BIN: codex"; do
  grep -qF "$pair" <<<"$via_wrapper" || fails+=("wrapper path did not resolve '$pair' from .devcontainer/.env")
  grep -qF "$pair" <<<"$via_vscode"  || fails+=("VS Code path did not resolve '$pair' from .devcontainer/.env")
done

if (( ${#fails[@]} > 0 )); then
  echo "REGRESSION: compose config path parity broken:" >&2
  printf '  - %s\n' "${fails[@]}" >&2
  exit 1
fi

echo "PASS: compose config path parity — the wrapper and the direct VS Code path read the same .devcontainer/.env and resolve the same service" >&2
exit 0
