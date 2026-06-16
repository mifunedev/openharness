#!/usr/bin/env bash
# tier: A
# source: issue #202 — credential/security hook changes must trigger harness CI
# desc: Static guard that `.claude/hooks/**` remains in ci-harness push + pull_request path filters and hook scripts remain shellchecked.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
WORKFLOW="$ROOT/.github/workflows/ci-harness.yml"

if [ ! -f "$WORKFLOW" ]; then
  echo "REGRESSION: missing harness CI workflow: $WORKFLOW" >&2
  exit 1
fi

hook_path_count=$(grep -Fc '".claude/hooks/**"' "$WORKFLOW" || true)
if [ "$hook_path_count" -lt 2 ]; then
  echo "REGRESSION: ci-harness must include .claude/hooks/** in both push and pull_request path filters (found $hook_path_count occurrence(s))" >&2
  exit 1
fi

shellcheck_line=$(grep 'shellcheck -S warning' "$WORKFLOW" | head -1 || true)
if [ -z "$shellcheck_line" ]; then
  echo "REGRESSION: ci-harness boot-lint job no longer runs shellcheck" >&2
  exit 1
fi

if ! grep -Fq '.claude/hooks/*.sh' <<<"$shellcheck_line"; then
  echo "REGRESSION: ci-harness shellcheck command must cover .claude/hooks/*.sh" >&2
  echo "shellcheck line: $shellcheck_line" >&2
  exit 1
fi

echo "PASS: harness CI path filters and shellcheck cover .claude/hooks" >&2
