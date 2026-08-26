#!/usr/bin/env bash
# tier: A
# desc: the wrapper path and the VS Code "Reopen in Container" path resolve the same service — the parity harness.yaml made impossible
set -euo pipefail

# WHY THIS PROBE EXISTS, AND WHY IT COULD NOT PASS BEFORE 0.3.0.
#
# There are two ways a sandbox comes up:
#   A. `make ...` / `oh ...`  -> .oh/scripts/docker-compose.sh -> docker compose
#   B. VS Code "Reopen in Container" -> .devcontainer/devcontainer.json names
#      .devcontainer/docker-compose.yml DIRECTLY, so compose auto-loads
#      .devcontainer/.env from that directory and the wrapper never runs.
#
# harness.yaml was readable only on path A. Any key set there produced a
# different resolved service on the two paths, silently. That was the reason to
# remove it, and this probe is the assertion that the reason is now discharged:
# with .devcontainer/.env as the only surface, both paths must resolve the same
# service, because both read the same file.
#
# Note the ASYMMETRY that is legitimate: path A also applies the opt-in overlays
# (ssh, docker-sock, hermes-dashboard). Those are the wrapper's job and are
# tested elsewhere. This probe pins the BASE service, with every toggle off, so
# a difference can only come from a configuration surface one path cannot read.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WRAPPER="$ROOT/.oh/scripts/docker-compose.sh"
COMPOSE_FILE="$ROOT/.devcontainer/docker-compose.yml"

if [[ ! -f "$WRAPPER" || ! -f "$COMPOSE_FILE" ]]; then
  echo "SKIPPED: compose wrapper or base compose file absent on this branch" >&2
  exit 2
fi

fails=()

# --- 1. Structural: ONE env-file, and it is the one compose auto-loads --------
# This half needs no docker. A second --env-file would be a surface path B
# cannot see — exactly the harness.yaml shape, rebuilt.
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

# --- 2. Behavioural: both paths resolve the same service ----------------------
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

# A fixture repo with a .env that sets keys on BOTH paths. Every overlay toggle
# is left off so the two argv lists differ in nothing but the wrapper's own
# --env-file, which is the point being tested.
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

# `docker compose config` needs the build context to exist; both invocations get
# the same tree, so any difference is configuration, not layout.
#
# THE `env -u` MATTERS. Compose resolves a shell-exported variable AHEAD of any
# env-file, and this probe usually runs INSIDE the sandbox, whose own compose
# run exported SANDBOX_NAME, TZ and friends into every process. Without clearing
# them the fixture's .env would be shadowed by the ambient values and the probe
# would measure the container it is running in, not the file under test.
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

# Compare the values that came from .env, not the whole document: the two
# invocations legitimately differ in the working directory they record.
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
