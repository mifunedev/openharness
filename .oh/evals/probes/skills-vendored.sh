#!/usr/bin/env bash
# tier: A
# source: absorb .mifune submodule into .oh — the skills/agents/hooks pack is vendored
#         directly under .oh/ (no submodule); provider symlinks resolve into it from a clean clone
# desc: there is NO .mifune submodule; .oh/skills|agents|hooks are tracked in-repo and the
#       provider/Hermes symlinks resolve into .oh/ with no init/network step
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

fail() {
  echo "REGRESSION: $*" >&2
  exit 1
}

# 1. The submodule must be GONE — no .gitmodules, no .mifune gitlink, no .mifune path.
[ ! -e .gitmodules ] || fail ".gitmodules still exists — the .mifune submodule was not removed"
[ -z "$(git ls-files .mifune)" ] || fail ".mifune is still tracked in the index"
[ ! -e .mifune ] || fail ".mifune path still exists in the working tree"

# 2. The provider-link helper exists and replaces ensure-mifune.sh.
[ -x .oh/scripts/link-providers.sh ] || fail ".oh/scripts/link-providers.sh is missing or not executable"
[ ! -e .oh/scripts/ensure-mifune.sh ] || fail ".oh/scripts/ensure-mifune.sh should be removed (renamed to link-providers.sh)"

# 3. The skill pack is vendored + tracked directly in this repo.
for path in \
  .oh/skills/git/SKILL.md \
  .oh/skills/t3/references/sandbox-processes.md \
  .oh/skills/retro/references/memory-protocol.md \
  .oh/skills/wiki/references/schema.md; do
  [ -f "$path" ] || fail "vendored pack file missing: $path"
  git ls-files --error-unmatch "$path" >/dev/null 2>&1 || fail "pack file not tracked in-repo: $path"
done

# 4. Provider symlinks resolve into the vendored .oh/ pack.
for link in .pi/skills .claude/skills .codex/skills .claude/agents .claude/hooks .codex/agents; do
  [ -L "$link" ] || fail "$link is not a symlink"
  [ -e "$link" ] || fail "$link target does not resolve"
done

# 5. link-providers.sh --check passes against the live tree. The Hermes link is
#    optional + runtime-created (gitignored), so check the base providers with
#    INSTALL_HERMES=false to stay deterministic regardless of the ambient env.
INSTALL_HERMES=false bash .oh/scripts/link-providers.sh --check >/dev/null

# 6. Clean-clone proof: a fresh clone has the skills IMMEDIATELY (vendored, tracked) —
#    no submodule fetch, no network. Skippable only for ad-hoc local debugging.
if [ "${SKILLS_VENDORED_SKIP_CLEAN_CLONE:-0}" != "1" ]; then
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  git clone --no-recurse-submodules "$ROOT" "$tmp/openharness" >/dev/null 2>&1
  cd "$tmp/openharness"
  # Vendored — present with zero init, unlike the old submodule that needed materializing.
  [ -f .oh/skills/git/SKILL.md ] || fail "clean clone is missing the vendored .oh/skills pack"
  [ -f .pi/skills/git/SKILL.md ] || fail "Pi skill symlink does not resolve in a clean clone"
  [ -f .claude/skills/spec/SKILL.md ] || fail "Claude skill symlink does not resolve in a clean clone"
  [ -f .codex/skills/git/SKILL.md ] || fail "Codex skill symlink does not resolve in a clean clone"
  INSTALL_HERMES=false bash .oh/scripts/link-providers.sh --check >/dev/null
  INSTALL_HERMES=false bash .oh/scripts/link-providers.sh --init >/dev/null   # idempotent
  # Opt-in Hermes: --init creates the runtime link on demand.
  INSTALL_HERMES=true bash .oh/scripts/link-providers.sh --init >/dev/null
  [ -f .hermes/skills/openharness/git/SKILL.md ] || fail "Hermes skill symlink missing after INSTALL_HERMES init"
  cd "$ROOT"
fi

echo "PASS: skills/agents/hooks are vendored under .oh/ (no submodule) and provider symlinks resolve from a clean clone" >&2
exit 0
