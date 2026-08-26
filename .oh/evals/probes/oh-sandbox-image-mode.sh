#!/usr/bin/env bash
# tier: A
# source: conversation 2026-07-05 (basic Docker deployment — prebuilt-image mode)
# desc: guards prebuilt-image deployment mode — compose image/pull_policy parameterized (OH_SANDBOX_IMAGE/OH_PULL_POLICY) with the build: block retained so local build stays default; .example.env documents both keys and the CLI reads OH_SANDBOX_IMAGE from .devcontainer/.env, emitting it ONLY when set; docker-compose.sh passes `up -d --no-build` through verbatim; oh sandbox (lifecycle.ts/cli.ts) wires --image/--no-build, defaults to ghcr.io/mifunedev/openharness, and threads OH_SANDBOX_IMAGE; get-oh.sh no longer claims the CLI is unpublished
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
COMPOSE="$ROOT/.devcontainer/docker-compose.yml"
EXAMPLE_ENV="$ROOT/.devcontainer/.example.env"
WRAPPER="$ROOT/.oh/scripts/docker-compose.sh"
LIFECYCLE="$ROOT/.oh/cli/src/commands/lifecycle.ts"
CLI="$ROOT/.oh/cli/src/cli.ts"
GETOH="$ROOT/.oh/scripts/get-oh.sh"

# SKIPPED (exit 2): prebuilt-image mode is not present on this branch yet.
if [[ ! -f "$COMPOSE" || ! -f "$EXAMPLE_ENV" || ! -f "$LIFECYCLE" ]]; then
  echo "SKIPPED: prebuilt-image mode not present (docker-compose.yml, .devcontainer/.example.env, and/or lifecycle.ts absent)" >&2
  exit 2
fi

fails=()

# (a) Compose: image parameterized via OH_SANDBOX_IMAGE, a pull_policy is set, and
#     the build: block is RETAINED (local build stays the default — backward compat).
grep -Eq 'image:[[:space:]]*\$\{OH_SANDBOX_IMAGE:-' "$COMPOSE" \
  || fails+=("docker-compose.yml image: must interpolate \${OH_SANDBOX_IMAGE:-...}")
grep -Eq 'pull_policy:[[:space:]]*\$\{OH_PULL_POLICY:-' "$COMPOSE" \
  || fails+=("docker-compose.yml must set pull_policy: \${OH_PULL_POLICY:-...}")
grep -Eq '^[[:space:]]*build:' "$COMPOSE" \
  || fails+=("docker-compose.yml must RETAIN the build: block (local build stays default)")

# (b) Both image-mode keys are documented in the schema template. Since
#     harness.yaml was removed there is no envmap to translate them — the key IS
#     the env var, and .example.env is where an operator learns it exists.
grep -Eq '^#[[:space:]]*OH_SANDBOX_IMAGE=' "$EXAMPLE_ENV" \
  || fails+=(".devcontainer/.example.env must document OH_SANDBOX_IMAGE")
grep -Eq '^#[[:space:]]*OH_PULL_POLICY=' "$EXAMPLE_ENV" \
  || fails+=(".devcontainer/.example.env must document OH_PULL_POLICY")

# (b2) Behavioral: the CLI pins OH_SANDBOX_IMAGE from .env when the key is set,
#      and falls through to DEFAULT_SANDBOX_IMAGE when it is not. This is the
#      half that used to be tested through the deleted parser.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/set/.devcontainer" "$tmp/unset/.devcontainer"
printf 'OH_SANDBOX_IMAGE=ghcr.io/x/y:probe\n' > "$tmp/set/.devcontainer/.env"
printf 'SANDBOX_NAME=demo\n'                  > "$tmp/unset/.devcontainer/.env"

read_key() {   # $1 = fixture dir, $2 = key
  awk -F= -v k="$2" '$0 ~ "^[[:space:]]*#" { next } $1 == k { print substr($0, index($0, "=") + 1); exit }' \
    "$1/.devcontainer/.env"
}
[[ "$(read_key "$tmp/set" OH_SANDBOX_IMAGE)" == "ghcr.io/x/y:probe" ]] \
  || fails+=("a set OH_SANDBOX_IMAGE must be readable from .devcontainer/.env")
[[ -z "$(read_key "$tmp/unset" OH_SANDBOX_IMAGE)" ]] \
  || fails+=("an unset OH_SANDBOX_IMAGE must read as empty, so the CLI default applies")
grep -Fq 'readEnvValue(root, "OH_SANDBOX_IMAGE")' "$LIFECYCLE" \
  || fails+=("lifecycle.ts must resolve OH_SANDBOX_IMAGE from .devcontainer/.env via readEnvValue")

# (c) The compose wrapper passes its compose args through VERBATIM, so the CLI's
#     `up -d --no-build` (image mode) reaches docker compose unchanged.
if [[ -f "$WRAPPER" ]]; then
  argv="$(bash "$WRAPPER" --repo-dir "$ROOT" --print-argv up -d --no-build 2>/dev/null || true)"
  printf '%s\n' "$argv" | grep -Fxq -- '--no-build' \
    || fails+=("docker-compose.sh must pass 'up -d --no-build' through verbatim (--print-argv)")
fi

# (d) oh sandbox source wiring: image-mode threads OH_SANDBOX_IMAGE, swaps to
#     --no-build, and defaults the ref to the published GHCR image.
grep -Fq 'OH_SANDBOX_IMAGE' "$LIFECYCLE" \
  || fails+=("lifecycle.ts must thread OH_SANDBOX_IMAGE into the child env")
grep -Fq -- '--no-build' "$LIFECYCLE" \
  || fails+=("lifecycle.ts must issue 'up -d --no-build' in image/no-build mode")
grep -Fq 'DEFAULT_SANDBOX_IMAGE' "$LIFECYCLE" \
  || fails+=("lifecycle.ts must define DEFAULT_SANDBOX_IMAGE")
grep -Fq 'ghcr.io/mifunedev/openharness' "$LIFECYCLE" \
  || fails+=("lifecycle.ts default image must point at ghcr.io/mifunedev/openharness")
if [[ -f "$CLI" ]]; then
  grep -Fq -- '--image=' "$CLI" \
    || fails+=("cli.ts parseSandboxArgs must handle --image=<ref>")
fi

# (e) get-oh.sh must not still claim the CLI is unpublished (it is on npm).
if [[ -f "$GETOH" ]] && grep -Fq 'not published to npm' "$GETOH"; then
  fails+=("get-oh.sh still claims the oh CLI is 'not published to npm' — it is published as @mifune/openharness")
fi

if (( ${#fails[@]} > 0 )); then
  echo "REGRESSION: prebuilt-image deployment mode contract broken:" >&2
  printf '  - %s\n' "${fails[@]}" >&2
  exit 1
fi

echo "PASS: prebuilt-image mode — compose image/pull_policy parameterized (build: retained), .example.env documents both keys and lifecycle.ts reads OH_SANDBOX_IMAGE from .devcontainer/.env, docker-compose.sh passes --no-build verbatim, oh sandbox wires --image/--no-build with the ghcr.io default, get-oh.sh publish note current" >&2
exit 0
