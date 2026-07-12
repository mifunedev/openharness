#!/usr/bin/env bash
# tier: A
# source: issue #635 bounded CodeLayer coding-harness acceptance 2026-07-12
# desc: CodeLayer remains exact-pin, default-off, source-wrapped, explicit-only, no-egress-smoked, and daemon-free.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DF="$ROOT/.devcontainer/Dockerfile"
RALPH="$ROOT/.oh/scripts/ralph.sh"
SMOKE="$ROOT/.oh/scripts/codelayer-image-smoke.sh"
WORKFLOW="$ROOT/.github/workflows/sandbox-boot-guard.yml"
missing=()
has() { grep -Fq -- "$1" "$2" || missing+=("$3"); }
has "@humanlayer/codelayer@0.0.61" "$DF" "exact package pin"
has "rm -f /usr/local/bin/codelayer" "$DF" "unconditional wrapper replacement"
has 'exec /usr/local/bin/bun /usr/local/lib/node_modules/@humanlayer/codelayer/src/cli.ts "$@"' "$ROOT/.oh/install/codelayer-wrapper.sh" "exact source wrapper"
has 'claude|pi|codex|opencode|deepagents|codelayer' "$RALPH" "explicit Ralph adapter"
has 'iteration_output_completes "$ACTIVE_HARNESS"' "$RALPH" "diagnostic-only output gate"
has 'docker compose --project-name "$ENABLED_PROJECT"' "$SMOKE" "build-only Compose smoke"
has 'docker network create --internal "$NETWORK"' "$SMOKE" "no-egress unique network"
has 'Missing OPENAI_API_KEY. Set it in your environment before running codelayer.' "$SMOKE" "source-backed parsing oracle"
has 'codelayer-enabled-image:' "$WORKFLOW" "dedicated enabled/default CI job"
if grep -Eq "npm install[^\n]*@humanlayer/cli" "$DF"; then
  echo "REGRESSION: Dockerfile installs the unsupported daemon package" >&2
  exit 1
fi
if grep -Eq 'docker (system|image|container|volume|network) prune|docker compose .* (up|down)|docker volume rm' "$SMOKE"; then
  echo "REGRESSION: CodeLayer smoke contains broad/destructive Docker lifecycle commands" >&2
  exit 1
fi
if ((${#missing[@]})); then
  printf 'REGRESSION: CodeLayer support contract missing: %s\n' "${missing[*]}" >&2
  exit 1
fi
echo "PASS: bounded CodeLayer coding-harness contract is pinned, explicit, no-egress tested, and daemon-free" >&2
