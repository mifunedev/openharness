#!/usr/bin/env bash
# tier: A
# source: absorb .mifune submodule into .oh — the skills/hooks pack is vendored
#         directly under .oh/ (no submodule); provider symlinks resolve into it from a clean clone
# desc: there is NO .mifune submodule; .oh/skills|hooks are tracked in-repo and the
#       provider/Hermes symlinks resolve into .oh/ with no init/network step
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

fail() {
  echo "REGRESSION: $*" >&2
  exit 1
}

[ ! -e .gitmodules ] || fail ".gitmodules still exists — the .mifune submodule was not removed"
[ -z "$(git ls-files .mifune)" ] || fail ".mifune is still tracked in the index"
[ ! -e .mifune ] || fail ".mifune path still exists in the working tree"

[ -x .oh/scripts/link-providers.sh ] || fail ".oh/scripts/link-providers.sh is missing or not executable"
[ ! -e .oh/scripts/ensure-mifune.sh ] || fail ".oh/scripts/ensure-mifune.sh should be removed (renamed to link-providers.sh)"

for path in \
  .oh/skills/git/SKILL.md \
  .oh/skills/t3/references/sandbox-processes.md \
  .oh/skills/wiki/references/schema.md; do
  [ -f "$path" ] || fail "vendored pack file missing: $path"
  git ls-files --error-unmatch "$path" >/dev/null 2>&1 || fail "pack file not tracked in-repo: $path"
done

for link in .pi/skills .claude/skills .codex/skills .claude/hooks .prime/agent/skills; do
  [ -L "$link" ] || fail "$link is not a symlink"
  [ -e "$link" ] || fail "$link target does not resolve"
done

INSTALL_HERMES=false bash .oh/scripts/link-providers.sh --check >/dev/null

if [ "${SKILLS_VENDORED_SKIP_CLEAN_CLONE:-0}" != "1" ]; then
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  git clone --no-recurse-submodules "$ROOT" "$tmp/openharness" >/dev/null 2>&1
  cd "$tmp/openharness"
  [ -f .oh/skills/git/SKILL.md ] || fail "clean clone is missing the vendored .oh/skills pack"
  [ -f .pi/skills/git/SKILL.md ] || fail "Pi skill symlink does not resolve in a clean clone"
  [ -f .claude/skills/spec/SKILL.md ] || fail "Claude skill symlink does not resolve in a clean clone"
  [ -f .codex/skills/git/SKILL.md ] || fail "Codex skill symlink does not resolve in a clean clone"
  [ -f .prime/agent/skills/git/SKILL.md ] || fail "prime-agent skill symlink does not resolve in a clean clone"
  INSTALL_HERMES=false bash .oh/scripts/link-providers.sh --check >/dev/null
  INSTALL_HERMES=false bash .oh/scripts/link-providers.sh --init >/dev/null
  INSTALL_HERMES=true bash .oh/scripts/link-providers.sh --init >/dev/null
  [ -f .hermes/skills/openharness/git/SKILL.md ] || fail "Hermes skill symlink missing after INSTALL_HERMES init"
  cd "$ROOT"
fi

echo "PASS: skills/hooks are vendored under .oh/ (no submodule) and provider symlinks resolve from a clean clone" >&2
exit 0
