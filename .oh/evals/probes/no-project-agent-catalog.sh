#!/usr/bin/env bash
# tier: A
# source: ADR #929 — .oh/agents/ is retired; provider-link and update logic must not recreate it
# desc: no project-agent catalog exists in the tree, the index, the oh payload manifest, or the
#       provider wiring, and link-providers.sh --init does not recreate one
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

fail() { echo "REGRESSION: $*" >&2; exit 1; }

catalogs=(.oh/agents .claude/agents .codex/agents .pi/agents)
for path in "${catalogs[@]}"; do
  [ ! -e "$path" ] && [ ! -L "$path" ] || fail "project-agent catalog is back in the tree: $path"
done
[ -z "$(git ls-files .oh/agents .claude/agents .codex/agents .pi/agents)" ] \
  || fail "a project-agent catalog path is still tracked in the git index"

grep -qF 'agents' .oh/manifest.json && fail "the oh payload manifest still ships an agents/** pack"

LINKER=".oh/scripts/link-providers.sh"
[ -x "$LINKER" ] || fail "$LINKER is missing or not executable"
wiring="$(awk '/^provider_links=\(/{f=1; next} f && /^\)/{exit} f{print}' "$LINKER")"
[ -n "$wiring" ] || fail "could not read provider_links from $LINKER"
grep -qF 'agents' <<<"$wiring" && fail "link-providers.sh still wires a project-agent provider symlink"

created=()
bash "$LINKER" --init >/dev/null 2>&1 || true
for path in "${catalogs[@]}"; do
  if [ -e "$path" ] || [ -L "$path" ]; then
    created+=("$path")
    rm -rf "$path"
  fi
done
(( ${#created[@]} == 0 )) || fail "link-providers.sh --init recreated the project-agent catalog: ${created[*]}"

echo "PASS: no project-agent catalog in the tree, index, manifest, or provider wiring; --init recreates none" >&2
