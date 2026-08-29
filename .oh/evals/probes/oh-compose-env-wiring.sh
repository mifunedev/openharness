#!/usr/bin/env bash
# tier: A
# source: issue #880 (oh as the only front door — oh.json is the non-secret config surface)
# desc: guards the two-file compose env wiring — `oh` renders oh.json into a 0600 temp file outside the repo and passes it as the FIRST --env-file with the root dotenv second (secrets win), the temp file does not survive the run, docker-compose.sh takes exactly one --extra-env-file flag and still runs standalone off the dotenv alone, and composeOverrides[] resolves oh.json -> .oh/config.json -> config.json without requiring jq
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WRAPPER="$ROOT/.oh/scripts/docker-compose.sh"
LIFECYCLE="$ROOT/.oh/cli/src/commands/lifecycle.ts"
RENDER_SRC="$ROOT/.oh/cli/src/lib/config-render.ts"
DIST="$ROOT/.oh/cli/dist/oh.js"
DOTENV_NAME=".env"

if [[ ! -f "$WRAPPER" || ! -f "$LIFECYCLE" || ! -f "$RENDER_SRC" ]]; then
  echo "SKIPPED: compose env wiring not present (docker-compose.sh, lifecycle.ts, and/or config-render.ts absent)" >&2
  exit 2
fi

fails=()
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

make_repo() {
  local dir="$1"
  mkdir -p "$dir/.devcontainer" "$dir/.oh/scripts"
  cp "$WRAPPER" "$dir/.oh/scripts/docker-compose.sh"
  printf 'services: {}\n' > "$dir/.devcontainer/docker-compose.yml"
  printf '{ "version": 1, "name": "probe" }\n' > "$dir/oh.json"
  printf 'GH_TOKEN=probe\n' > "$dir/$DOTENV_NAME"
}

env_files() { grep -A1 -Fx -- '--env-file' <<< "$1" | grep -v -e '^--env-file$' -e '^--$'; }

fixture="$tmp/wrapper"
make_repo "$fixture"
printf 'SANDBOX_NAME=rendered\n' > "$tmp/rendered.list"

argv="$(bash "$fixture/.oh/scripts/docker-compose.sh" --repo-dir "$fixture" \
          --extra-env-file "$tmp/rendered.list" --print-argv config 2>/dev/null || true)"
mapfile -t files < <(env_files "$argv")
if [[ "${#files[@]}" -ne 2 ]]; then
  fails+=("docker-compose.sh --extra-env-file must add a second --env-file (saw ${#files[@]})")
elif [[ "${files[0]}" != "$tmp/rendered.list" || "${files[1]}" != "$fixture/$DOTENV_NAME" ]]; then
  fails+=("docker-compose.sh must order --env-file rendered-then-dotenv so secrets win (saw ${files[*]})")
fi

standalone="$(bash "$fixture/.oh/scripts/docker-compose.sh" --repo-dir "$fixture" --print-argv config 2>"$tmp/note.txt" || true)"
mapfile -t solo < <(env_files "$standalone")
if [[ "${#solo[@]}" -ne 1 || "${solo[0]}" != "$fixture/$DOTENV_NAME" ]]; then
  fails+=("docker-compose.sh run directly must fall back to the root dotenv alone (saw ${solo[*]:-none})")
fi
grep -Fq 'oh.json' "$tmp/note.txt" \
  || fails+=("docker-compose.sh run directly must print a note that non-secret config comes from oh.json via \`oh\`")

overrides="$tmp/overrides"
make_repo "$overrides"
mkdir -p "$overrides/.oh"
printf '{ "version": 1, "composeOverrides": ["from-oh-json.yml"] }\n' > "$overrides/oh.json"
printf '{ "composeOverrides": ["from-oh-config.yml"] }\n' > "$overrides/.oh/config.json"
printf '{ "composeOverrides": ["from-legacy.yml"] }\n' > "$overrides/config.json"
chain="$(bash "$overrides/.oh/scripts/docker-compose.sh" --repo-dir "$overrides" --print-argv config 2>/dev/null || true)"
if command -v jq >/dev/null 2>&1; then
  grep -Fxq "$overrides/from-oh-json.yml" <<< "$chain" \
    || fails+=("composeOverrides[] must resolve from oh.json first")
  if grep -Fxq "$overrides/from-oh-config.yml" <<< "$chain"; then
    fails+=("composeOverrides[] must NOT read .oh/config.json once oh.json exists")
  fi
  rm -f "$overrides/oh.json"
  chain="$(bash "$overrides/.oh/scripts/docker-compose.sh" --repo-dir "$overrides" --print-argv config 2>/dev/null || true)"
  grep -Fxq "$overrides/from-oh-config.yml" <<< "$chain" \
    || fails+=("composeOverrides[] must fall back to .oh/config.json when oh.json is absent")
  rm -f "$overrides/.oh/config.json"
  chain="$(bash "$overrides/.oh/scripts/docker-compose.sh" --repo-dir "$overrides" --print-argv config 2>/dev/null || true)"
  grep -Fxq "$overrides/from-legacy.yml" <<< "$chain" \
    || fails+=("composeOverrides[] must fall back to legacy config.json last")
else
  if grep -Fq 'from-oh-json.yml' <<< "$chain"; then
    fails+=("composeOverrides[] must silently no-op without jq, never fail or half-apply")
  fi
fi

grep -Fq 'mode: 0o600' "$LIFECYCLE" \
  || fails+=("lifecycle.ts must create the rendered compose env file with mode 0o600")
grep -Fq 'mkdtempSync' "$LIFECYCLE" \
  || fails+=("lifecycle.ts must render into an mkdtemp-scoped directory, never into the repository tree")
grep -Fq 'renderComposeEnv' "$LIFECYCLE" \
  || fails+=("lifecycle.ts must render the compose env from oh.json via renderComposeEnv")
grep -Fq -- '--extra-env-file' "$LIFECYCLE" \
  || fails+=("lifecycle.ts must pass the rendered file to docker-compose.sh as --extra-env-file")
report() {
  if (( ${#fails[@]} > 0 )); then
    echo "REGRESSION: oh.json -> compose env wiring broken:" >&2
    printf '  - %s\n' "${fails[@]}" >&2
    exit 1
  fi
}

if [[ ! -f "$DIST" ]]; then
  report
  echo "SKIPPED: .oh/cli/dist/oh.js is not built — cannot exercise \`oh sandbox --print-argv\` end to end" >&2
  exit 2
fi
if ! command -v node >/dev/null 2>&1; then
  report
  echo "SKIPPED: node is not on PATH — cannot exercise \`oh sandbox --print-argv\` end to end" >&2
  exit 2
fi

e2e="$tmp/e2e"
make_repo "$e2e"
set +e
out="$(cd "$e2e" && OH_EXECUTION_TARGET=docker-compose node "$DIST" sandbox --print-argv 2>"$tmp/e2e.err")"
status=$?
set -e
if grep -Fq 'unexpected argument "--print-argv"' "$tmp/e2e.err"; then
  report
  echo "SKIPPED: \`oh sandbox\` does not accept --print-argv yet — cli.ts parseSandboxArgs must wire it (issue #880 T6)" >&2
  exit 2
fi

if (( status != 0 )); then
  fails+=("\`oh sandbox --print-argv\` exited $status: $(tr '\n' ' ' < "$tmp/e2e.err")")
else
  mapfile -t e2efiles < <(env_files "$out")
  if [[ "${#e2efiles[@]}" -ne 2 ]]; then
    fails+=("\`oh sandbox --print-argv\` must emit exactly two --env-file flags (saw ${#e2efiles[@]})")
  else
    rendered="${e2efiles[0]}"
    [[ "${e2efiles[1]}" == "$e2e/$DOTENV_NAME" ]] \
      || fails+=("the SECOND --env-file must be the root dotenv so secrets win (saw ${e2efiles[1]})")
    if [[ "$rendered" == "$e2e"/* ]]; then
      fails+=("the rendered env file must not be written into the repository tree (saw $rendered)")
    fi
    if [[ -e "$rendered" ]]; then
      fails+=("the rendered env file must not survive the run (still present at $rendered)")
    fi
    if [[ -e "$(dirname "$rendered")" ]]; then
      fails+=("the mkdtemp directory holding the rendered env file must be removed (still present at $(dirname "$rendered"))")
    fi
  fi
fi

report

echo "PASS: oh renders oh.json into a 0600 temp file outside the repo, passes it as the first --env-file with the root dotenv second, and removes it before exiting; docker-compose.sh takes --extra-env-file, still runs standalone off the dotenv with a note, and resolves composeOverrides[] oh.json -> .oh/config.json -> config.json" >&2
exit 0
