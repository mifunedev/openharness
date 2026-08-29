#!/usr/bin/env bash
# tier: A
# source: issue #449 (sandbox image build CI guard) 2026-06-19;
#         issue #807 (Debian Trixie base compatibility and parity CI)
# desc: PR CI must validate sandbox compose config and locally build the devcontainer image
#       without registry writes, run the reusable image verifier, compare fixed Debian bases,
#       and exercise every optional INSTALL_* path with real version evidence.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORKFLOW="$ROOT/.github/workflows/sandbox-boot-guard.yml"

if [[ ! -f "$WORKFLOW" ]]; then
  echo "REGRESSION sandbox boot guard workflow missing" >&2
  exit 1
fi

text="$(cat "$WORKFLOW")"
missing=()

has() { grep -Fq -- "$1" <<<"$text" || missing+=("$2"); }
has_regex() { grep -Eq -- "$1" <<<"$text" || missing+=("$2"); }

has 'name: "CI: Sandbox Boot Guard"' "workflow name"
has_regex '^[[:space:]]*contents:[[:space:]]*read[[:space:]]*$' "read-only contents permission"
has_regex '^[[:space:]]*pull_request:[[:space:]]*$' "pull_request trigger"
has_regex '^[[:space:]]*workflow_dispatch:[[:space:]]*$' "manual trigger"
has '".devcontainer/**"' "devcontainer path filter"
has '".oh/**"' "oh path filter"
has '"packages/oh/**"' "oh package path filter"
has '".oh/scripts/docker-compose.sh"' "compose wrapper path filter"
has '".oh/scripts/sandbox-boot-smoke.sh"' "boot smoke helper path filter"
has '".oh/scripts/harness-config.sh"' "harness config helper path filter"
has '"Makefile"' "Makefile path filter"
has '".devcontainer/.example.env"' "harness config template path filter"
has '".dockerignore"' "dockerignore path filter"
has '".github/workflows/sandbox-boot-guard.yml"' "workflow self path filter"
has 'persist-credentials: false' "checkout token persistence disabled"
has 'bash .oh/scripts/docker-compose.sh config --quiet' "base compose config validation"
has 'HERMES_DASHBOARD: "true"' "Hermes overlay validation env"
has 'docker build \' "local docker build step"
has '--file .devcontainer/Dockerfile' "devcontainer Dockerfile build target"
has '--tag openharness-sandbox-boot-guard:${{ github.sha }}' "local CI image tag"
has '--tag "sandbox-${SANDBOX_NAME}"' "compose image tag for smoke boot"
has 'bash .oh/scripts/sandbox-boot-smoke.sh' "boot smoke healthcheck invocation"
has 'name: Validate sandbox compose and image build' "the named boot guard job"
has 'bash .oh/scripts/verify-sandbox-image.sh' "reusable image verifier invocation"
has 'BOOT_SMOKE_TIMEOUT_SECONDS: "900"' "bounded boot smoke timeout"
has 'Sandbox boot guard only' "comment explaining non-release intent"

if grep -Eq 'docker[[:space:]]+push|--push([[:space:]]|$)|docker/login-action|docker/login|ghcr\.io|[[:alnum:]._-]+\.[[:alnum:]._-]+/.+:.+|packages:[[:space:]]*write|secrets\.' <<<"$text"; then
  echo "REGRESSION sandbox boot guard must not push/login/write packages/use secrets" >&2
  exit 1
fi

VERIFIER="$ROOT/.oh/scripts/verify-sandbox-image.sh"
[[ -x "$VERIFIER" ]] || missing+=("reusable image verifier .oh/scripts/verify-sandbox-image.sh is missing or not executable")

COMPAT="$ROOT/.github/workflows/sandbox-compatibility.yml"
if [[ ! -f "$COMPAT" ]]; then
  missing+=("compatibility workflow .github/workflows/sandbox-compatibility.yml is missing")
else
  compat="$(cat "$COMPAT")"
  chas() { grep -Fq -- "$1" <<<"$compat" || missing+=("compatibility workflow: $2"); }
  chas_regex() { grep -Eq -- "$1" <<<"$compat" || missing+=("compatibility workflow: $2"); }

  chas_regex '^[[:space:]]*contents:[[:space:]]*read[[:space:]]*$' "no read-only contents permission"
  chas_regex '^[[:space:]]*pull_request:[[:space:]]*$' "no automatic pull_request trigger"
  chas '".oh/scripts/node-pnpm-parity.sh"' "does not trigger when the parity script changes"

  parity=$(awk '
    /^  base-node-pnpm-parity:$/ { found=1 }
    found && /^  [[:alnum:]_-]+:$/ && !/^  base-node-pnpm-parity:$/ { exit }
    found { print }
  ' <<<"$compat")
  if [[ -z "$parity" ]]; then
    missing+=("compatibility workflow: no automatic Node/pnpm parity job")
  else
    phas() { grep -Fq -- "$1" <<<"$parity" || missing+=("compatibility parity job: $2"); }
    phas_regex() { grep -Eq -- "$1" <<<"$parity" || missing+=("compatibility parity job: $2"); }
    phas_regex '^    runs-on: ubuntu-latest$' "does not use the fixed Docker-capable amd64 runner"
    phas 'bash .oh/scripts/node-pnpm-parity.sh \' "does not invoke the Node/pnpm parity script"
    phas 'node:22-bookworm-slim \' "does not fix the baseline to node:22-bookworm-slim"
    phas 'node:22-trixie-slim' "does not fix the candidate to node:22-trixie-slim"
    if grep -Eq '\$\{\{[[:space:]]*(inputs|github\.event\.inputs)\.' <<<"$parity"; then
      missing+=("compatibility parity job: images come from dispatch inputs instead of fixed values")
    fi
  fi

  chas 'bash .oh/scripts/verify-sandbox-image.sh' "does not run the reusable image verifier"
  if grep -Eq 'arm64-default-image|linux/arm64|docker/setup-qemu-action|CI_RUNNER_ARM64' <<<"$compat"; then
    missing+=("compatibility workflow: retains the removed permanent arm64 build")
  fi
  for arg in INSTALL_HERMES INSTALL_DEEPAGENTS INSTALL_OPENCODE INSTALL_GROK_BUILD; do
    chas "--build-arg $arg=true" "does not build with $arg=true"
  done
  optional=$(awk '
    /^  optional-installers-image:$/ { found=1 }
    found && /^  [[:alnum:]_-]+:$/ && !/^  optional-installers-image:$/ { exit }
    found { print }
  ' <<<"$compat")
  if [[ -z "$optional" ]]; then
    missing+=("compatibility workflow: no optional installer job")
  else
    ohas() { grep -Fq -- "$1" <<<"$optional" || missing+=("compatibility optional installer job: $2"); }
    ohas 'for tool in hermes deepagents opencode grok; do' "does not check every optional tool in one guarded loop"
    ohas "if ! grep -Eq '(^|[^[:alnum:]])v?[0-9]+([.][0-9]+)+" "does not require numeric dotted versions"
    ohas 'did not output a numeric dotted version' "does not fail false-positive output"
  fi
  chas_regex '^[[:space:]]*-[[:space:]]*"\.devcontainer/Dockerfile"[[:space:]]*$' "is not Dockerfile-path-scoped"
  if grep -Eq '^[[:space:]]*-[[:space:]]*"\.oh/\*\*"[[:space:]]*$' <<<"$compat"; then
    missing+=("compatibility workflow: uses the broad .oh/** filter — expensive vendor installers would run for every harness change")
  fi
  if grep -Eq 'docker[[:space:]]+push|push:[[:space:]]*true|docker/login-action|ghcr\.io|packages:[[:space:]]*write|secrets\.' <<<"$compat"; then
    echo "REGRESSION sandbox compatibility workflow must not push/login/write packages/use secrets" >&2
    exit 1
  fi
fi

if [[ -e "$ROOT/.github/workflows/sandbox-base-parity.yml" ]]; then
  missing+=("standalone dispatch-only sandbox-base-parity.yml still exists")
fi

RELEASE="$ROOT/.github/workflows/release.yml"
if [[ -f "$RELEASE" ]] && grep -Fq 'sandbox-compatibility' "$RELEASE"; then
  missing+=("release.yml references the compatibility workflow — multi-platform publication is out of scope")
fi

if (( ${#missing[@]} )); then
  printf 'REGRESSION sandbox boot guard CI contract missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS sandbox boot guard validates compose and boot, while compatibility CI checks fixed-image Node/pnpm parity and numeric dotted versions from every optional installer without registry writes" >&2
exit 0
