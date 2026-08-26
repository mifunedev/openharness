#!/usr/bin/env bash
# tier: A
# source: issue #531 follow-on (de-hardcode residual — shipped .oh shell scripts keep the upstream repo overridable)
# desc: STATIC guard (.sh-scoped) — no shipped .oh shell script directly assigns a bare upstream-repo literal; it must use the overridable ${VAR:-…} form. Comparisons/help-text/comments are allowed. Real config-derivation lives in the autopilot skill + cron-runtime; shipped .ts/.mjs are clean today + covered by typecheck.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

if [ ! -f "$ROOT/.oh/scripts/install.sh" ]; then
  echo 'SKIPPED .oh/scripts/install.sh not present' >&2
  exit 2
fi

#   !=          → a test/comparison
hits=$(grep -rn 'mifunedev/openharness\|ryaneggz/openharness' "$ROOT/.oh" --include='*.sh' --exclude-dir=evals 2>/dev/null || true)
bad=$(printf '%s\n' "$hits" | grep -v ':-' | grep -vE ':[0-9]+:[[:space:]]*#' | grep -v '!=' | grep -v 'default:' || true)
if [ -n "$bad" ]; then
  echo "REGRESSION non-overridable upstream-repo reference in shipped .oh script: $bad" >&2
  exit 1
fi

# shellcheck disable=SC2016  # the ${...:-} literal is grepped, not expanded
grep -q '${OH_GITHUB_REPO:-' "$ROOT/.oh/scripts/install.sh" || { echo 'REGRESSION install.sh lost the OH_GITHUB_REPO override' >&2; exit 1; }

exit 0
