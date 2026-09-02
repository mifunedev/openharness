#!/usr/bin/env bash
# tier: A
# source: issue #937 — a --local guard run watched a killed provision report healthy
# desc: boot provisioning runs under `timeout` in .devcontainer/entrypoint.sh, so the
#   likeliest failure is SIGTERM part-way through an install, not a clean non-zero exit.
#   The provision-failed marker the healthcheck reads must therefore be fail-closed:
#   written before the first install and removed only after a clean completion, so a
#   killed run leaves the sandbox unhealthy instead of healthy-with-nothing-installed.
#   Exercised against the real script with a stub `oh` — one run that hangs and is
#   killed, one that completes.
set -euo pipefail

ROOT="${PROVISION_MARKER_PROBE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
SCRIPT="$ROOT/.oh/scripts/provision-defaults.sh"

[[ -f "$SCRIPT" ]] || {
  echo "REGRESSION provision marker: missing .oh/scripts/provision-defaults.sh" >&2
  exit 1
}
command -v jq >/dev/null 2>&1 || {
  echo "SKIPPED provision marker: jq is not on PATH" >&2
  exit 2
}

WORK=$(mktemp -d "${TMPDIR:-/tmp}/oh-provision-marker.XXXXXX")
trap 'rm -rf "${WORK:?}"' EXIT

CATALOG='[{"id":"stub","kind":"default","installed":false,"enabled":true,"binary":"stub"}]'

make_stub() {
  local behavior="$1" bin="$WORK/bin"
  mkdir -p "$bin"
  cat >"$bin/oh" <<STUB
#!/usr/bin/env bash
[ "\$2" = "list" ] && { printf '%s\n' '$CATALOG'; exit 0; }
$behavior
STUB
  chmod +x "$bin/oh"
}

run_provision() {
  local timeout_secs="$1"
  rm -rf "${WORK:?}/home"; mkdir -p "$WORK/home/.local/bin" "$WORK/home/.local/lib" "$WORK/home/.npm"
  timeout "$timeout_secs" env -i \
    PATH="$WORK/bin:/usr/bin:/bin" \
    HOME="$WORK/home" \
    OH_EXECUTION_TARGET=local \
    OH_BIN="$WORK/bin/oh" \
    NPM_USER_PREFIX="$WORK/home/.local" \
    OH_PROVISION_MARKER="$WORK/home/marker" \
    bash "$SCRIPT" >"$WORK/out" 2>&1
}

failures=()

make_stub 'sleep 60'
run_provision 3 && failures+=("a provision whose install hangs past the timeout still exited 0")
if [[ ! -f "$WORK/home/marker" ]]; then
  failures+=("a provision killed part-way through an install left no provision-failed marker, so sandbox-healthcheck.sh would report the sandbox healthy with defaults missing")
fi

make_stub 'exit 0'
if run_provision 30; then
  if [[ -f "$WORK/home/marker" ]]; then
    failures+=("a clean provision left the provision-failed marker behind, which would hold the sandbox unhealthy forever")
  fi
else
  failures+=("a provision whose installs all succeed did not exit 0: $(tail -3 "$WORK/out" | tr '\n' ' ')")
fi

if ((${#failures[@]})); then
  printf 'REGRESSION provision marker fail-closed: %s\n' "${failures[*]}" >&2
  exit 1
fi

echo "PASS provision marker fail-closed: a killed provision leaves the marker sandbox-healthcheck.sh reads, and only a clean completion clears it" >&2
exit 0
