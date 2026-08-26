#!/usr/bin/env bash
# tier: A
# source: issue #449 (sandbox image build CI guard) 2026-06-19;
#         issue #807 (Debian Trixie base: arm64 + optional-installer compatibility CI)
# desc: PR CI must validate sandbox compose config and locally build the devcontainer image
#       without registry writes, run the reusable image verifier, and exercise arm64 plus
#       every optional INSTALL_* path in a Dockerfile-path-scoped compatibility workflow.
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
  chas 'platforms: linux/arm64' "no arm64 build platform"
  chas 'docker/setup-qemu-action' "no QEMU fallback for a non-native arm64 runner"
  chas 'vars.CI_RUNNER_ARM64' "no native arm64 runner preference"
  chas 'bash .oh/scripts/verify-sandbox-image.sh' "does not run the reusable image verifier"
  for arg in INSTALL_HERMES INSTALL_DEEPAGENTS INSTALL_OPENCODE INSTALL_GROK_BUILD; do
    chas "--build-arg $arg=true" "does not build with $arg=true"
  done
  for tool in hermes deepagents opencode grok; do
    grep -Eq "(^|[^[:alnum:]_-])$tool([^[:alnum:]_-]|$)" <<<"$compat" \
      || missing+=("compatibility workflow: never reports a version for $tool")
  done
  chas_regex '^[[:space:]]*-[[:space:]]*"\.devcontainer/Dockerfile"[[:space:]]*$' "is not Dockerfile-path-scoped"
  if grep -Eq '^[[:space:]]*-[[:space:]]*"\.oh/\*\*"[[:space:]]*$' <<<"$compat"; then
    missing+=("compatibility workflow: uses the broad .oh/** filter — expensive vendor installers would run for every harness change")
  fi
  if grep -Eq 'docker[[:space:]]+push|push:[[:space:]]*true|docker/login-action|ghcr\.io|packages:[[:space:]]*write|secrets\.' <<<"$compat"; then
    echo "REGRESSION sandbox compatibility workflow must not push/login/write packages/use secrets" >&2
    exit 1
  fi
fi

RELEASE="$ROOT/.github/workflows/release.yml"
if [[ -f "$RELEASE" ]] && grep -Fq 'sandbox-compatibility' "$RELEASE"; then
  missing+=("release.yml references the compatibility workflow — multi-platform publication is out of scope")
fi

if (( ${#missing[@]} )); then
  printf 'REGRESSION sandbox boot guard CI contract missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS sandbox boot guard validates compose config, builds and verifies the devcontainer image, boots it through the healthcheck, and the compatibility workflow covers arm64 plus every optional installer without registry writes" >&2
exit 0
