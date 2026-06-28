#!/usr/bin/env bash
# tier: A
# source: issue #539 — Mifune external repository extraction
# desc: .mifune must enter Open Harness through the pinned ryaneggz/mifune submodule and provider/Hermes symlinks must resolve after init
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
EXPECTED_URL="https://github.com/ryaneggz/mifune.git"

cd "$ROOT"

fail() {
  echo "REGRESSION: $*" >&2
  exit 1
}

[ -x .oh/scripts/ensure-mifune.sh ] || fail ".oh/scripts/ensure-mifune.sh is missing or not executable"
[ -f .gitmodules ] || fail ".gitmodules is missing"
[ "$(git config -f .gitmodules --get submodule..mifune.url)" = "$EXPECTED_URL" ] || fail ".gitmodules does not point .mifune at $EXPECTED_URL"
expected_sha="$(git ls-files --stage -- .mifune | awk '$1 == "160000" { print $2; exit }')"
[ -n "$expected_sha" ] || fail ".mifune is not recorded as a gitlink in the Open Harness index"

bash .oh/scripts/ensure-mifune.sh --check >/dev/null

for path in \
  .mifune/skills/git/SKILL.md \
  .mifune/skills/t3/references/sandbox-processes.md \
  .mifune/skills/advisor/SKILL.md \
  .mifune/skills/advisor/references/recursive-delegation.md \
  .mifune/skills/retro/references/memory-protocol.md \
  .mifune/skills/wiki/references/schema.md; do
  [ -f "$path" ] || fail "protected/runtime Mifune path missing after check: $path"
done

for link in .pi/skills .claude/skills .codex/skills .claude/agents .claude/hooks .codex/agents; do
  [ -L "$link" ] || fail "$link is not a symlink"
  [ -e "$link" ] || fail "$link target does not resolve"
done

# Full clean-clone ingress proof. Skippable only for ad-hoc local debugging; CI and
# /eval run the default path.
if [ "${MIFUNE_CHECKOUT_SKIP_CLEAN_CLONE:-0}" != "1" ]; then
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  git clone --no-recurse-submodules "$ROOT" "$tmp/openharness" >/dev/null 2>&1
  cd "$tmp/openharness"
  [ ! -e .mifune/skills/git/SKILL.md ] || fail "plain clone unexpectedly had initialized .mifune contents"
  bash .oh/scripts/ensure-mifune.sh --init >/dev/null
  bash .oh/scripts/ensure-mifune.sh --check >/dev/null
  INSTALL_HERMES=true bash .oh/scripts/ensure-mifune.sh --init >/dev/null
  [ -f .pi/skills/git/SKILL.md ] || fail "Pi skill symlink missing after clean-clone init"
  [ -f .claude/skills/spec/SKILL.md ] || fail "Claude skill symlink missing after clean-clone init"
  [ -f .codex/skills/git/SKILL.md ] || fail "Codex skill symlink missing after clean-clone init"
  [ -f .hermes/skills/openharness/git/SKILL.md ] || fail "Hermes skill symlink missing after clean-clone init"
  cd "$ROOT"
fi

echo "PASS: .mifune enters Open Harness via pinned ryaneggz/mifune submodule and ensure-mifune init/check" >&2
exit 0
