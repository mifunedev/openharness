#!/usr/bin/env bash
# tier: A
# source: issue #799 — seven comments on a GitHub thread produced zero notifications and nobody
#         knew delivery had failed; the kill-switch took ten days instead of one.
# desc: /escalate reaches a human or says so. An unavailable channel is a no-op, never a raised
#       error and never silence: the reason is printed and the attempt is recorded under .oh/logs/.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
S="$ROOT/.oh/skills/escalate/scripts/escalate.sh"
SKILL="$ROOT/.oh/skills/escalate/SKILL.md"

fail() { echo "REGRESSION: $*" >&2; exit 1; }

[[ -f $S && -x $S ]] || fail 'escalate script missing or not executable'
[[ -f $SKILL ]] || fail 'escalate SKILL.md missing'
[[ -f $ROOT/.oh/logs/AGENTS.md ]] || fail '.oh/logs/AGENTS.md missing — the log directory has no contract'
[[ -L $ROOT/.oh/logs/CLAUDE.md && $(readlink "$ROOT/.oh/logs/CLAUDE.md") == AGENTS.md ]] \
  || fail '.oh/logs/CLAUDE.md must be a symlink to the sibling AGENTS.md'
grep -Fq '.oh/logs/*' "$ROOT/.gitignore" || fail '.oh/logs contents are not gitignored'
for keep in '!.oh/logs/AGENTS.md' '!.oh/logs/CLAUDE.md'; do
  grep -Fq "$keep" "$ROOT/.gitignore" || fail "$keep is not exempted from the ignore"
done

grep -Fq 'Exit 0 is not proof' "$SKILL" || fail 'SKILL.md does not warn that exit 0 is not delivery'
grep -Fq 'conversations.info' "$SKILL" || fail 'SKILL.md does not document the channel health check'

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
log="$tmp/escalations.jsonl"
run() { ESCALATE_LOG="$log" ESCALATE_STATE_DIR="$tmp/state" ESCALATE_BRIDGE_CONFIG="$tmp/bridge.json" bash "$S" "$@"; }

run --summary s >/dev/null 2>&1 && fail 'missing --needs was accepted'
[[ $(run --summary s >/dev/null 2>&1; echo $?) == 64 ]] || fail 'usage error must exit 64'
run --needs n >/dev/null 2>&1 && fail 'missing --summary was accepted'

printf '{"auth":{"channels":{}}}' >"$tmp/bridge.json"
out=$(run --summary s --needs n 2>/dev/null) || fail 'no enabled channel must no-op, not raise'
[[ $(jq -r .ok <<<"$out") == false ]] || fail 'no-op must report ok=false'
[[ $(jq -r .skipped <<<"$out") == true ]] || fail 'no-op must report skipped=true'
[[ -n $(jq -r '.reason // empty' <<<"$out") ]] || fail 'no-op must name a reason'

err=$(run --summary s --needs n 2>&1 >/dev/null)
grep -Fq 'operator was NOT reached' <<<"$err" || fail 'a no-op must say the operator was not reached'

[[ -f $log ]] || fail 'a no-op was not recorded under the log path'
[[ $(jq -sr 'length' "$log") -ge 1 ]] || fail 'log holds no record'
[[ $(jq -sr 'last | .ok' "$log") == false ]] || fail 'logged record does not mark non-delivery'
[[ $(jq -sr 'last | .summary' "$log") == s ]] || fail 'logged record does not carry the escalation content'

printf '{"auth":{"channels":{"C1":{"enabled":true}}}}' >"$tmp/bridge.json"
dry=$(ESCALATE_LOG="$log" ESCALATE_BRIDGE_CONFIG="$tmp/bridge.json" PI_SLACK_BOT_TOKEN=x \
  bash "$S" --dry-run --summary s --needs n) || fail 'dry-run failed'
[[ $(jq -r .channel <<<"$dry") == C1 ]] || fail 'channel not resolved from the bridge config'
[[ $(jq -r .dryRun <<<"$dry") == true ]] || fail 'dry-run must not claim delivery'

grep -Fq 'Authorization: Bearer %s' "$S" || fail 'token must be passed via a header file, not argv'
grep -Eq '\-H "Authorization: Bearer \$' "$S" && fail 'token interpolated into argv where /proc exposes it'

echo 'PASS: escalate no-ops loudly on an unavailable channel and records every attempt' >&2
