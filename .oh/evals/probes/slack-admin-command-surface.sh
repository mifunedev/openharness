#!/usr/bin/env bash
# tier: A
# source: issue #354 — Slack bridge docs must distinguish Pi /msg-bridge commands from Slack DM admin text handlers
# desc: Slack bridge docs separate Pi commands from manifest-backed Slack admin commands and guard manifest/bridge handler alignment
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DOC="$ROOT/.oh/docs/integrations/slack.md"
CONNECTING="$ROOT/.oh/docs/connecting.md"
PI_DOC="$ROOT/.oh/docs/harnesses/pi.md"
T3_PROCESSES="$ROOT/.oh/skills/t3/references/sandbox-processes.md"
ROOT_PACKAGE_AUDIT="$ROOT/.oh/tasks/slack-admin-command-surface/root-package-audit.md"
MANIFEST="$ROOT/.pi/install/slack-manifest.json"
TEMPLATE_MANIFEST="$ROOT/.oh/templates/full/.pi/install/slack-manifest.json"

fail() {
  echo "REGRESSION: $*" >&2
  exit 1
}
need_literal() {
  local file="$1" label="$2" literal="$3"
  grep -Fq -- "$literal" "$file" || fail "$label missing from ${file#$ROOT/}: $literal"
}
reject_regex() {
  local file="$1" label="$2" regex="$3"
  if grep -Eq -- "$regex" "$file"; then
    fail "$label present in ${file#$ROOT/}: $regex"
  fi
}

[ -f "$DOC" ] || fail "missing Slack integration doc"
[ -f "$MANIFEST" ] || fail "missing Slack manifest"

# Positive contract: Pi command surface, Slack DM admin handlers, caveat, fallbacks.
need_literal "$DOC" "Pi command surface" "Inside the Pi session, the bridge exposes **one** Pi slash command"
need_literal "$DOC" "Pi /msg-bridge command" '`/msg-bridge status` — connection state plus trusted-user/channel counts.'
need_literal "$DOC" "Slack admin command boundary" "manifest-backed Slack admin commands"
need_literal "$DOC" "root package README grounding" "This mirrors the root package"
need_literal "$DOC" "source grounding" 'registers only `msg-bridge` as a Pi command'
need_literal "$DOC" "manifest setup" "declares the bridge admin slash commands"
need_literal "$DOC" "gateway fallback" "gateway status"
need_literal "$DOC" "tmux fallback" "tmux capture-pane -t client-slack-pi -p | grep -F '[Slack] Bot user ID:'"
need_literal "$DOC" "auth fallback" "jq '.auth' ~/.pi/msg-bridge.json"
need_literal "$DOC" "plain-text auth trigger" "DM the bot plain text"
need_literal "$CONNECTING" "connecting doc boundary" "Trust/channel admin is handled by challenge auth plus manifest-backed Slack admin commands, not separate Pi commands."
need_literal "$PI_DOC" "Pi harness doc boundary" "trusted-user/channel admin is handled by manifest-backed Slack admin commands"
need_literal "$T3_PROCESSES" "tmux process doc boundary" "Slack trust/channel admin is handled by DM"
need_literal "$ROOT_PACKAGE_AUDIT" "root package audit artifact" "## Grounded RCA"
need_literal "$ROOT_PACKAGE_AUDIT" "root package README evidence" "README.md:141 ### Admin commands (in DM with the bot)"
need_literal "$ROOT_PACKAGE_AUDIT" "root package source evidence" "src/index.ts:275 pi.registerCommand(\"msg-bridge\", {"

# Negative contract: old misleading in-session guidance must not return.
reject_regex "$DOC" "old in-session /trusted guidance" 'inside the session.*(/trusted|/channels)'
reject_regex "$DOC" "old attach guidance" 'run `/msg-bridge`, `/trusted`, or `/channels` inside the session'
reject_regex "$T3_PROCESSES" "old t3 pane command guidance" '`/msg-bridge`, `/trusted`,[[:space:]]*$'
reject_regex "$T3_PROCESSES" "old t3 /channels pane guidance" '`/channels` are typed \*\*into\*\* that pane'
reject_regex "$DOC" "DM table mislabels /msg-bridge" '^\| `/msg-bridge status` \|'

# The shipped app manifest must declare every package-owned admin command.
need_literal "$MANIFEST" "DM event subscription" '"message.im"'
for command in /help /trusted /revoke /channels /enable /disable /toggletools; do
  need_literal "$MANIFEST" "manifest admin command $command" "\"command\": \"$command\""
done
cmp -s "$MANIFEST" "$TEMPLATE_MANIFEST" || fail "root and full-template Slack manifests differ"

# `/trusted` and `/channels` must live under the Slack admin command section.
trusted_line=$(grep -nF '| `/trusted` |' "$DOC" | cut -d: -f1 | head -1 || true)
heading_line=$(grep -nF '## 6. Admin Slack commands' "$DOC" | cut -d: -f1 | head -1 || true)
if [ -z "$trusted_line" ] || [ -z "$heading_line" ] || [ "$trusted_line" -le "$heading_line" ]; then
  fail "/trusted must appear under Admin Slack commands"
fi

# Runtime pin must select the fork branch containing Slack slash handlers.
need_literal "$ROOT/.oh/scripts/gateway.sh" "bridge slash-command handler pin" '965de09fdfbe156c4369df84091723614c0b6600'
need_literal "$ROOT/.oh/scripts/gateway.sh" "bridge pin reconciliation marker" '.openharness-pin'
need_literal "$ROOT/.oh/scripts/gateway.sh" "bridge pin reconciliation check" 'installed_pin" != "$FORK_PIN'

echo "PASS: Slack manifest and docs expose admin commands while Pi keeps /msg-bridge as its command surface" >&2
exit 0
