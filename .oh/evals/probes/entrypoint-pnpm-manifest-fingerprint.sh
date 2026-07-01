#!/usr/bin/env bash
# tier: A
# source: issue #521 (manifest-aware sandbox installs) 2026-07-01
# desc: Guards the devcontainer root pnpm install gate against returning to a node_modules-existence-only fast path.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ENTRYPOINT="$ROOT/.devcontainer/entrypoint.sh"
TEST_FILE="$ROOT/.oh/scripts/__tests__/entrypoint-pnpm-install.test.ts"

[[ -f "$ENTRYPOINT" ]] || { echo "SKIPPED: missing $ENTRYPOINT" >&2; exit 2; }
[[ -f "$TEST_FILE" ]] || { echo "SKIPPED: missing $TEST_FILE" >&2; exit 2; }

entrypoint="$(cat "$ENTRYPOINT")"
test_text="$(cat "$TEST_FILE")"
missing=()

has_entrypoint() {
  grep -Fq -- "$1" <<<"$entrypoint" || missing+=("entrypoint: $2")
}

has_entrypoint_regex() {
  grep -Eq -- "$1" <<<"$entrypoint" || missing+=("entrypoint: $2")
}

has_test() {
  grep -Fq -- "$1" <<<"$test_text" || missing+=("test: $2")
}

has_entrypoint 'PNPM_INSTALL_MARKER_FILENAME=".openharness-root-pnpm-manifest.sha256"' "Open Harness marker filename"
has_entrypoint 'PNPM_INSTALL_MARKER="$HARNESS/node_modules/$PNPM_INSTALL_MARKER_FILENAME"' "marker stored under node_modules"
has_entrypoint 'pnpm_manifest_fingerprint()' "pnpm_manifest_fingerprint helper"
has_entrypoint 'package.json pnpm-lock.yaml pnpm-workspace.yaml' "root manifest inputs"
has_entrypoint 'pnpm_workspace_package_manifest_paths "$root"' "workspace package manifest inclusion"
has_entrypoint 'LC_ALL=C sort -u' "bytewise sorted manifest path list"
has_entrypoint 'sha256sum "$root/$rel"' "per-file content hashing"
has_entrypoint "| sha256sum | awk '{print \$1}'" "final manifest-list digest"
has_entrypoint '[ "${SKIP_PNPM_INSTALL:-0}" != "1" ]' "SKIP_PNPM_INSTALL escape hatch"
has_entrypoint '[ ! -d "$HARNESS/node_modules" ]' "missing node_modules install branch"
has_entrypoint '[ ! -f "$PNPM_INSTALL_MARKER" ] || [ "$(cat "$PNPM_INSTALL_MARKER" 2>/dev/null || true)" != "$PNPM_MANIFEST_FINGERPRINT" ]' "missing/stale marker reinstall branch"
has_entrypoint 'manifest drift detected; reinstalling' "manifest drift log"
has_entrypoint 'dependencies current' "current-dependencies skip log"
has_entrypoint 'cd "$1" && pnpm install --prefer-offline' "pnpm install command"
has_entrypoint 'PNPM_INSTALL_MARKER_TMP="$PNPM_INSTALL_MARKER.tmp.$$"' "temporary marker path"
has_entrypoint 'printf "%s\n" "$1" > "$2" && mv -f "$2" "$3"' "atomic marker refresh"
has_entrypoint 'pnpm install failed — see /tmp/pnpm-install.log; aborting sandbox boot' "install failure diagnostic"
if ! awk '/pnpm install failed/{seen=1} seen && /exit 1/{found=1} END{exit found ? 0 : 1}' "$ENTRYPOINT"; then
  missing+=("entrypoint: install failure exits boot")
fi

has_test 'Open Harness marker stored under node_modules' "marker contract assertion"
has_test 'pnpm_manifest_fingerprint helper contract' "fingerprint helper assertion"
has_test 'reinstalls when manifests drift or the marker is missing' "drift reinstall assertion"
has_test 'skips install when dependencies are current' "current-dependencies assertion"
has_test 'atomically refreshes the marker only after install succeeds' "atomic marker refresh assertion"
has_test 'fails boot instead of swallowing a required pnpm install error' "install failure assertion"

if (( ${#missing[@]} )); then
  printf 'REGRESSION: entrypoint pnpm manifest fingerprint contract missing:\n' >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "PASS: entrypoint root pnpm install gate is manifest-aware, marker-backed, atomically refreshed, and still aborts on install failure" >&2
exit 0
