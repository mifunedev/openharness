#!/usr/bin/env bash
# tier: A
# source: issue #950 US-005 / D10 — `oh sandbox install` owns sandbox creation from a
#         user-level registry, and the CLI carries the compose payload it materialises
# desc: the six texts the built CLI materialises into a registry entry are byte-identical to
#       the tracked .devcontainer/docker-compose*.yml and .oh/scripts/{docker-compose,check-host-port}.sh
#       (image-only base without repo, flavor-A base with repo), lifecycle.ts and sandbox.ts
#       build no `docker` argv of their own, `oh sandbox install microsandbox` refuses with the
#       RFC pointer and the `oh tool install microsandbox` hint, and `--print-argv` writes no entry
set -euo pipefail

ROOT="${SANDBOX_REGISTRY_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"

CLI_DIR="$ROOT/.oh/cli"
DIST="$CLI_DIR/dist/oh.js"
LIFECYCLE="$CLI_DIR/src/commands/lifecycle.ts"
SANDBOX="$CLI_DIR/src/commands/sandbox.ts"

if ! command -v node >/dev/null 2>&1; then
  echo "SKIPPED: node not on PATH — cannot exercise the built oh CLI" >&2
  exit 2
fi
if [[ ! -d "$CLI_DIR/src" ]]; then
  echo "SKIPPED: missing $CLI_DIR/src — not a harness source checkout" >&2
  exit 2
fi
if [[ ! -f "$DIST" ]]; then
  if [[ -d "$CLI_DIR/node_modules" ]] && command -v npm >/dev/null 2>&1; then
    npm --prefix "$CLI_DIR" run build >/dev/null 2>&1 || true
  fi
fi
if [[ ! -f "$DIST" ]]; then
  echo "SKIPPED: $DIST not built and could not be built — run 'npm --prefix .oh/cli run build'" >&2
  exit 2
fi

fails=()

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

oh() {
  local home="$1"
  shift
  env -u SANDBOX_NAME -u SANDBOX_SSH OH_HOME="$home" node "$DIST" "$@" </dev/null
}

materialize_entry() {
  local home="$1" name="$2" repo="${3:-}"
  local entry="$home/sandboxes/$name"
  mkdir -p "$entry"
  if [[ -n "$repo" ]]; then
    printf '{"version":1,"name":"%s","repo":"%s"}\n' "$name" "$repo" >"$entry/oh.json"
  else
    printf '{"version":1,"name":"%s"}\n' "$name" >"$entry/oh.json"
  fi
  oh "$home" destroy "$name" >/dev/null 2>&1 || true
  printf '%s' "$entry"
}

home_plain="$work/home-plain"
entry_plain="$(materialize_entry "$home_plain" "probe-registry-plain")"

check_same() {
  local label="$1" got="$2" want="$3"
  if [[ ! -f "$got" ]]; then
    fails+=("the CLI materialised no $label into the registry entry")
  elif ! cmp -s "$got" "$want"; then
    fails+=("the text the CLI bundles for $label differs from the tracked ${want#"$ROOT"/} — rebuild .oh/cli/dist/oh.js or reconcile the tracked file")
  fi
}

check_same ".devcontainer/docker-compose.yml (no --repo)" \
  "$entry_plain/.devcontainer/docker-compose.yml" \
  "$ROOT/.devcontainer/docker-compose.image-only.yml"
check_same ".devcontainer/docker-compose.ssh.yml" \
  "$entry_plain/.devcontainer/docker-compose.ssh.yml" \
  "$ROOT/.devcontainer/docker-compose.ssh.yml"
check_same ".devcontainer/docker-compose.docker-sock.yml" \
  "$entry_plain/.devcontainer/docker-compose.docker-sock.yml" \
  "$ROOT/.devcontainer/docker-compose.docker-sock.yml"
check_same ".oh/scripts/docker-compose.sh" \
  "$entry_plain/.oh/scripts/docker-compose.sh" \
  "$ROOT/.oh/scripts/docker-compose.sh"
check_same ".oh/scripts/check-host-port.sh" \
  "$entry_plain/.oh/scripts/check-host-port.sh" \
  "$ROOT/.oh/scripts/check-host-port.sh"

home_repo="$work/home-repo"
entry_repo="$(materialize_entry "$home_repo" "probe-registry-repo" "$ROOT")"
check_same ".devcontainer/docker-compose.yml (with --repo)" \
  "$entry_repo/.devcontainer/docker-compose.yml" \
  "$ROOT/.devcontainer/docker-compose.yml"

strip_comments() {
  perl -0pe 's{/\*.*?\*/}{}gs; s{(^|[^:])//[^\n]*}{$1}gm' "$1"
}

for src in "$LIFECYCLE" "$SANDBOX"; do
  if [[ ! -f "$src" ]]; then
    fails+=("${src#"$ROOT"/} is absent — the verb that owns sandbox lifecycle moved")
    continue
  fi
  flat="$(strip_comments "$src" | tr -d '[:space:]')"
  hits="$(grep -oE '[A-Za-z_.$]+\("docker"|\["docker"' <<<"$flat" | sort -u || true)"
  if [[ -n "$hits" ]]; then
    fails+=("${src#"$ROOT"/} builds a \`docker\` argv of its own ($(tr '\n' ' ' <<<"$hits")) — the engine argv belongs to .oh/scripts/docker-compose.sh behind ExecutionTarget")
  fi
done

set +e
refusal="$(oh "$work/home-microsandbox" sandbox install microsandbox 2>&1)"
refusal_rc=$?
set -e
if ((refusal_rc != 1)); then
  fails+=("\`oh sandbox install microsandbox\` exited $refusal_rc — a runtime that cannot be provisioned must refuse with exit 1")
fi
for literal in 'docs/rfcs/rfc-runtime-support.md' 'oh tool install microsandbox'; do
  grep -qF -- "$literal" <<<"$refusal" \
    || fails+=("the \`oh sandbox install microsandbox\` refusal no longer names \`$literal\` — the operator loses the route that works")
done

home_argv="$work/home-argv"
mkdir -p "$home_argv"
set +e
argv_out="$(oh "$home_argv" sandbox install docker --yes --print-argv 2>&1)"
argv_rc=$?
set -e
if ((argv_rc != 0)); then
  fails+=("\`oh sandbox install docker --yes --print-argv\` exited $argv_rc: ${argv_out%%$'\n'*}")
fi
if [[ -n "$(find "$home_argv" -mindepth 1 -print -quit)" ]]; then
  fails+=("\`--print-argv\` wrote into OH_HOME ($(find "$home_argv" -mindepth 1 | head -3 | tr '\n' ' ')) — a preview must register no sandbox")
fi

if ((${#fails[@]})); then
  echo "REGRESSION: sandbox registry contract broken:" >&2
  printf '  - %s\n' "${fails[@]}" >&2
  exit 1
fi

echo "PASS: the CLI materialises the six bundled texts byte-identically to the tracked compose files and wrapper scripts (image-only without --repo, flavor A with it), lifecycle.ts and sandbox.ts build no docker argv, microsandbox refuses with the RFC pointer and the tool route, and --print-argv registers nothing" >&2
exit 0
