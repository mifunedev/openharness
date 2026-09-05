#!/usr/bin/env bash
# tier: A
# source: absorb .mifune submodule into .oh — the skills/hooks pack is vendored
#         directly under .oh/ (no submodule); provider symlinks resolve into it from a clean clone
# desc: there is NO .mifune submodule; .oh/skills|hooks are tracked in-repo and the
#       provider symlinks resolve into .oh/ with no init/network step; the Hermes link is
#       created when the hermes binary is on PATH and not otherwise (#920 replaced the
#       INSTALL_HERMES flag with that presence check, so it works in both sandbox flavors)
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

for link in .agents/skills .pi/skills .claude/skills .codex/skills .claude/hooks; do
  [ -L "$link" ] || fail "$link is not a symlink"
  [ -e "$link" ] || fail "$link target does not resolve"
done

bash .oh/scripts/link-providers.sh --check >/dev/null

if [ "${SKILLS_VENDORED_SKIP_CLEAN_CLONE:-0}" != "1" ]; then
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  git clone --no-recurse-submodules "$ROOT" "$tmp/openharness" >/dev/null 2>&1
  cd "$tmp/openharness"
  [ -f .oh/skills/git/SKILL.md ] || fail "clean clone is missing the vendored .oh/skills pack"
  [ -f .agents/skills/git/SKILL.md ] || fail "standard skill symlink does not resolve in a clean clone"
  [ -f .pi/skills/git/SKILL.md ] || fail "Pi skill symlink does not resolve in a clean clone"
  [ -f .claude/skills/spec/SKILL.md ] || fail "Claude skill symlink does not resolve in a clean clone"
  [ -f .codex/skills/git/SKILL.md ] || fail "Codex skill symlink does not resolve in a clean clone"
  fake_bin="$tmp/bin"
  mkdir -p "$fake_bin"
  bare_path="$fake_bin:/usr/bin:/bin"

  PATH="$bare_path" bash .oh/scripts/link-providers.sh --check >/dev/null
  PATH="$bare_path" bash .oh/scripts/link-providers.sh --init >/dev/null
  [ ! -e .hermes/skills/openharness ] \
    || fail "Hermes skill symlink created with no hermes binary on PATH — the wiring must key off the binary"

  printf '#!/bin/sh\nexit 0\n' > "$fake_bin/hermes"
  chmod +x "$fake_bin/hermes"
  PATH="$bare_path" bash .oh/scripts/link-providers.sh --init >/dev/null
  [ -f .hermes/skills/openharness/git/SKILL.md ] \
    || fail "Hermes skill symlink missing after an init with hermes on PATH"
  cd "$ROOT"
fi

echo "PASS: skills/hooks are vendored under .oh/ (no submodule) and provider symlinks resolve from a clean clone" >&2
exit 0
