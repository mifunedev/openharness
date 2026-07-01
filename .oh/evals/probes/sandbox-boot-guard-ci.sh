#!/usr/bin/env bash
# tier: A
# source: issue #449 (sandbox image build CI guard) 2026-06-19
# desc: PR CI must validate sandbox compose config and locally build the devcontainer image without registry writes.
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
has '"workspace/**"' "workspace path filter"
has '"packages/oh/**"' "oh package path filter"
has '".oh/scripts/docker-compose.sh"' "compose wrapper path filter"
has '".oh/scripts/sandbox-boot-smoke.sh"' "boot smoke helper path filter"
has '".oh/scripts/harness-config.sh"' "harness config helper path filter"
has '"Makefile"' "Makefile path filter"
has '"harness.yaml"' "harness config path filter"
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
has 'BOOT_SMOKE_TIMEOUT_SECONDS: "900"' "bounded boot smoke timeout"
has 'Sandbox boot guard only' "comment explaining non-release intent"

if grep -Eq 'docker[[:space:]]+push|--push([[:space:]]|$)|docker/login-action|docker/login|ghcr\.io|[[:alnum:]._-]+\.[[:alnum:]._-]+/.+:.+|packages:[[:space:]]*write|secrets\.' <<<"$text"; then
  echo "REGRESSION sandbox boot guard must not push/login/write packages/use secrets" >&2
  exit 1
fi

if (( ${#missing[@]} )); then
  printf 'REGRESSION sandbox boot guard CI contract missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS sandbox boot guard validates compose config, builds the devcontainer image, and boots it through the healthcheck without registry writes" >&2
exit 0
