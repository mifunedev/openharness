#!/usr/bin/env bash
# tier: A
# source: get-oh.sh bootstrap — the only host-side path to the standalone `oh` CLI (unpublished npm pkg)
# desc: STATIC guard — `.oh/scripts/get-oh.sh` exists, is executable, uses the overridable repo form,
#       installs a PREBUILT `oh` to a bin dir WITHOUT cloning the repo, offers to install Node,
#       and is documented in the README. Also guards link-providers.sh's non-git fallback.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRIPT="$ROOT/.oh/scripts/get-oh.sh"

# SKIPPED: bootstrap not present on this base (lets the probe land green pre-slice).
if [ ! -f "$SCRIPT" ]; then
  echo 'SKIPPED .oh/scripts/get-oh.sh not present' >&2
  exit 2
fi

[ -x "$SCRIPT" ] || { echo 'REGRESSION .oh/scripts/get-oh.sh is not executable' >&2; exit 1; }

# Overridable upstream-repo form (mirrors install.sh; keeps forks working).
# shellcheck disable=SC2016  # the ${...:-} literal is grepped, not expanded
grep -q '${OH_GITHUB_REPO:-' "$SCRIPT" || { echo 'REGRESSION get-oh.sh lost the OH_GITHUB_REPO override' >&2; exit 1; }

# Core contract v2: install a PREBUILT oh.js (default oh.mifune.dev/oh.js) to a bin dir.
grep -q 'OH_JS_URL' "$SCRIPT" || { echo 'REGRESSION get-oh.sh no longer downloads a prebuilt oh.js (OH_JS_URL)' >&2; exit 1; }
grep -q 'oh.mifune.dev/oh.js' "$SCRIPT" || { echo 'REGRESSION get-oh.sh lost the default prebuilt URL' >&2; exit 1; }
grep -Eq 'install -m 0755 .*"\$OH_BIN_DIR/oh"' "$SCRIPT" || { echo 'REGRESSION get-oh.sh no longer installs oh to $OH_BIN_DIR/oh' >&2; exit 1; }

# MUST NOT persist a repo clone / touch the sandbox install dir (the core user requirement).
grep -qE '\.openharness|OH_HOME=' "$SCRIPT" && { echo 'REGRESSION get-oh.sh reintroduced a persistent ~/.openharness / OH_HOME clone' >&2; exit 1; }

# Offers to install Node when missing (nvm path).
grep -q 'nvm' "$SCRIPT" || { echo 'REGRESSION get-oh.sh no longer offers to install Node via nvm' >&2; exit 1; }

# v2: supports being sourced so it can mutate the caller's live PATH in the same
# shell (`source <(curl ...)`) — strict mode/traps scoped to the executed path.
grep -q '_OH_SOURCED' "$SCRIPT" || { echo 'REGRESSION get-oh.sh lost sourced-vs-executed detection (same-shell PATH activation)' >&2; exit 1; }

# Documented in the README.
grep -q 'get-oh.sh' "$ROOT/README.md" || { echo 'REGRESSION README no longer documents get-oh.sh' >&2; exit 1; }

# link-providers.sh must tolerate a non-git tree (falls back to OH_PROJECT_ROOT/PWD),
# so `oh init`-equipped sandboxes boot without `git init` instead of crash-looping.
LP="$ROOT/.oh/scripts/link-providers.sh"
if [ -f "$LP" ]; then
  # shellcheck disable=SC2016
  grep -q 'repo_root="${OH_PROJECT_ROOT:-$PWD}"' "$LP" \
    || { echo 'REGRESSION link-providers.sh lost the non-git OH_PROJECT_ROOT fallback (equipped sandbox crash-loop)' >&2; exit 1; }
fi

echo 'PASS get-oh.sh v2 (prebuilt install, no clone, Node offer) + link-providers non-git fallback intact'
exit 0
