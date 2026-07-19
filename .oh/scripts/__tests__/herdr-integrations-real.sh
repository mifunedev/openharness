#!/usr/bin/env bash
# Built-image fixture for the pinned Herdr integration payload.
set -euo pipefail

root="${OH_PROJECT_ROOT:-/home/sandbox/harness}"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/herdr-real-fixture.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT
home="$tmp/home"
hermes_parent="$tmp/project"

# Claude, Codex, Pi, and OpenCode discover the shared project skill through
# their native project paths (OpenCode officially consumes .claude/skills).
for surface in .claude .codex .pi; do
  test -f "$root/$surface/skills/herdr/SKILL.md"
done
test -f "$root/.oh/skills/herdr/SKILL.md"
test "$(sha256sum "$root/.oh/skills/herdr/SKILL.md" | awk '{print $1}')" = \
  "04b5f99c3c3178d8a7d194be2fbe99796852a8fbd7739346213d15242723ebb9"

mkdir -p \
  "$home/.claude" \
  "$home/.codex" \
  "$home/.pi/agent/extensions" \
  "$home/.config/opencode" \
  "$hermes_parent/.hermes"
printf '{"custom":"keep"}\n' > "$home/.claude/settings.json"
printf 'model = "keep"\n' > "$home/.codex/config.toml"
printf 'custom: keep\n' > "$hermes_parent/.hermes/config.yaml"

for target in claude codex pi opencode; do
  HOME="$home" herdr integration install "$target" >/dev/null
done
HOME="$hermes_parent" herdr integration install hermes >/dev/null

status="$(HOME="$home" herdr integration status)"
printf '%s\n' "$status" | grep -q '^claude: current (v7)'
printf '%s\n' "$status" | grep -q '^codex: current (v6)'
printf '%s\n' "$status" | grep -q '^pi: current (v5)'
printf '%s\n' "$status" | grep -q '^opencode: current (v8)'
HOME="$hermes_parent" herdr integration status | grep -q '^hermes: current (v3)'

grep -q '"custom": "keep"' "$home/.claude/settings.json"
grep -q 'model = "keep"' "$home/.codex/config.toml"
grep -q 'custom: keep' "$hermes_parent/.hermes/config.yaml"

tree_hash() {
  find "$tmp" -type f -exec sha256sum {} + | sort | sha256sum | awk '{print $1}'
}
before="$(tree_hash)"
for target in claude codex pi opencode; do
  HOME="$home" herdr integration install "$target" >/dev/null
done
HOME="$hermes_parent" herdr integration install hermes >/dev/null
test "$(tree_hash)" = "$before"

echo "Herdr real integration fixture ok"
