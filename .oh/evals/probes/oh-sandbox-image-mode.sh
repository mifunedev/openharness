#!/usr/bin/env bash
# tier: A
# source: conversation 2026-07-05 (basic Docker deployment — prebuilt-image mode)
# desc: guards prebuilt-image deployment mode — compose image/pull_policy parameterized (OH_SANDBOX_IMAGE/OH_PULL_POLICY) with the build: block retained so local build stays default; oh.json carries image.ref/image.pullPolicy, config-render.ts renders both, docs/configuration.md documents both; docker-compose.sh passes `up -d --no-build` through verbatim; oh sandbox (lifecycle.ts/cli.ts) wires --image/--no-build, defaults to ghcr.io/mifunedev/openharness, and threads OH_SANDBOX_IMAGE; get-oh.sh no longer claims the CLI is unpublished
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
COMPOSE="$ROOT/.devcontainer/docker-compose.yml"
CONFIG_DOC="$ROOT/docs/configuration.md"
CONFIG_SRC="$ROOT/.oh/cli/src/lib/oh-config.ts"
RENDER_SRC="$ROOT/.oh/cli/src/lib/config-render.ts"
WRAPPER="$ROOT/.oh/scripts/docker-compose.sh"
LIFECYCLE="$ROOT/.oh/cli/src/commands/lifecycle.ts"
CLI="$ROOT/.oh/cli/src/cli.ts"
GETOH="$ROOT/.oh/scripts/get-oh.sh"

if [[ ! -f "$COMPOSE" || ! -f "$CONFIG_DOC" || ! -f "$CONFIG_SRC" || ! -f "$RENDER_SRC" || ! -f "$LIFECYCLE" ]]; then
  echo "SKIPPED: prebuilt-image mode not present (docker-compose.yml, docs/configuration.md, oh-config.ts, config-render.ts, and/or lifecycle.ts absent)" >&2
  exit 2
fi

fails=()

grep -Eq 'image:[[:space:]]*\$\{OH_SANDBOX_IMAGE:-' "$COMPOSE" \
  || fails+=("docker-compose.yml image: must interpolate \${OH_SANDBOX_IMAGE:-...}")
grep -Eq 'pull_policy:[[:space:]]*\$\{OH_PULL_POLICY:-' "$COMPOSE" \
  || fails+=("docker-compose.yml must set pull_policy: \${OH_PULL_POLICY:-...}")
grep -Eq '^[[:space:]]*build:' "$COMPOSE" \
  || fails+=("docker-compose.yml must RETAIN the build: block (local build stays default)")

[[ -e "$ROOT/.devcontainer/.example.env" ]] \
  && fails+=(".devcontainer/.example.env is retired — image settings live in oh.json")

grep -Eq '^[[:space:]]*ref\?:[[:space:]]*string' "$CONFIG_SRC" \
  || fails+=("oh-config.ts ImageSettings must declare image.ref")
grep -Eq '^[[:space:]]*pullPolicy\?:[[:space:]]*PullPolicy' "$CONFIG_SRC" \
  || fails+=("oh-config.ts ImageSettings must declare image.pullPolicy")
grep -Fq '"missing", "always", "never"' "$CONFIG_SRC" \
  || fails+=("oh-config.ts must validate image.pullPolicy against missing/always/never")

grep -Fq 'put("OH_SANDBOX_IMAGE", config.image?.ref)' "$RENDER_SRC" \
  || fails+=("config-render.ts must render oh.json image.ref as OH_SANDBOX_IMAGE")
grep -Fq 'put("OH_PULL_POLICY", config.image?.pullPolicy)' "$RENDER_SRC" \
  || fails+=("config-render.ts must render oh.json image.pullPolicy as OH_PULL_POLICY")

doc_row() { grep -Eq "^\| \`$1\` \|.*\`$2\`" "$CONFIG_DOC"; }
doc_row 'image\.ref' 'OH_SANDBOX_IMAGE' \
  || fails+=("docs/configuration.md must document image.ref -> OH_SANDBOX_IMAGE in the field table")
doc_row 'image\.pullPolicy' 'OH_PULL_POLICY' \
  || fails+=("docs/configuration.md must document image.pullPolicy -> OH_PULL_POLICY in the field table")
grep -Eq '^\| `image\.mode` \|' "$CONFIG_DOC" \
  || fails+=("docs/configuration.md must document image.mode (build vs image)")

if [[ -f "$WRAPPER" ]]; then
  argv="$(bash "$WRAPPER" --repo-dir "$ROOT" --print-argv up -d --no-build 2>/dev/null || true)"
  printf '%s\n' "$argv" | grep -Fxq -- '--no-build' \
    || fails+=("docker-compose.sh must pass 'up -d --no-build' through verbatim (--print-argv)")
fi

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

if [[ -f "$GETOH" ]] && grep -Fq 'not published to npm' "$GETOH"; then
  fails+=("get-oh.sh still claims the oh CLI is 'not published to npm' — it is published as @mifune/openharness")
fi

if (( ${#fails[@]} > 0 )); then
  echo "REGRESSION: prebuilt-image deployment mode contract broken:" >&2
  printf '  - %s\n' "${fails[@]}" >&2
  exit 1
fi

echo "PASS: prebuilt-image mode — compose image/pull_policy parameterized (build: retained), oh.json carries image.ref/image.pullPolicy and config-render.ts renders both, docs/configuration.md documents them, docker-compose.sh passes --no-build verbatim, oh sandbox wires --image/--no-build with the ghcr.io default, get-oh.sh publish note current" >&2
exit 0
