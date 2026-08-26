#!/usr/bin/env bash
# tier: A
# source: operator directive 2026-08-08 (agents keep the docker socket, but must
#         not read Config.Env out of `docker inspect`)
# desc: the Bash guard denies container-inspect shapes that expose environment
#       variables (bare inspect, whole-object templates, env templates, unverifiable
#       jq pipes) while still allowing narrow --format field reads, and the
#       deny-list mirrors the env-shaped patterns without blanket-blocking inspect
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CMD_HOOK="$ROOT/.oh/hooks/deny-env-dump.sh"
SETTINGS="$ROOT/.claude/settings.json"

if [[ ! -x "$CMD_HOOK" ]]; then
  echo "SKIPPED: hook file absent or not executable: $CMD_HOOK" >&2
  exit 2
fi
if [[ ! -f "$SETTINGS" ]]; then
  echo "SKIPPED: settings file absent: $SETTINGS" >&2
  exit 2
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "SKIPPED: jq unavailable" >&2
  exit 2
fi

decision_for() {
  local out
  out=$(jq -nc --arg c "$1" '{tool_input:{command:$c}}' | bash "$CMD_HOOK" 2>/dev/null)
  if [[ -z "$out" ]]; then
    echo allow
  else
    jq -r '.hookSpecificOutput.permissionDecision // "?"' <<<"$out"
  fi
}

assert() {
  local want="$1" got
  got=$(decision_for "$2")
  if [[ "$got" != "$want" ]]; then
    echo "REGRESSION: $3 — want '$want', got '$got' for: $2" >&2
    exit 1
  fi
}

ENV_FIELD='.Config.'"En"'v'
assert deny "docker inspect openharness" \
  "bare inspect dumps full JSON including the env block"
assert deny "docker container inspect openharness" \
  "the container subcommand form bypassed the guard"
assert deny "docker inspect --format '{{${ENV_FIELD}}}' web" \
  "an explicit env template was allowed"
assert deny "docker inspect --format '{{json .}}' web" \
  "a whole-object json template was allowed"
assert deny "docker inspect --format '{{.}}' web" \
  "a whole-object dot template was allowed"
assert deny "docker inspect --format '{{.Config}}' web" \
  "the Config subtree (which contains the env block) was allowed"
assert deny "docker inspect --format json web" \
  "--format json re-dumps the whole object"
assert deny "docker inspect web | jq '.[0].State'" \
  "an unverifiable jq pipe over full JSON was allowed"
assert deny "podman inspect mycontainer" \
  "the podman equivalent bypassed the guard"

assert allow "docker inspect --format '{{.State.Health.Status}}' openharness" \
  "guard over-blocked a narrow health-status read"
assert allow "docker container inspect -f '{{.State.Status}}' openharness" \
  "guard over-blocked the -f short form"
assert allow "docker inspect --format '{{.NetworkSettings.IPAddress}}' web" \
  "guard over-blocked a narrow network read"
assert allow "docker inspect --format '{{json .State.Health}}' openharness" \
  "guard over-blocked a scoped json subtree (see .oh/docs/installation.md)"
assert allow "docker inspect oh-sbx-local --format '{{range \$name, \$_ := .NetworkSettings.Networks}}{{\$name}}{{end}}'" \
  "guard over-blocked the network-discovery template (see .oh/docs/integrations/langfuse.md)"
assert allow "docker image inspect --format '{{.Id}}' node:20" \
  "guard over-blocked an image-id read"

assert allow "docker ps -a" "guard leaked onto docker ps"
assert allow "docker compose up -d --build" "guard leaked onto docker compose"
assert allow "docker exec -it openharness tmux ls" "guard leaked onto docker exec"

assert deny "docker sec""ret inspect foo" "docker secret inspect stopped being denied"
assert deny "docker con""fig inspect foo" "docker config inspect stopped being denied"

for rule in "Bash(command=*inspect*Config.Env*)" "Bash(command=*inspect*{{json .}}*)" "Bash(command=*inspect*{{.}}*)"; do
  if ! jq -e --arg r "$rule" '.permissions.deny | index($r)' "$SETTINGS" >/dev/null; then
    echo "REGRESSION: permissions.deny is missing '$rule'" >&2
    exit 1
  fi
done

if jq -e '.permissions.deny | index("Bash(command=*docker inspect*)")' "$SETTINGS" >/dev/null; then
  echo "REGRESSION: permissions.deny blanket-blocks docker inspect again — the policy is field-level denial, not a full block" >&2
  exit 1
fi

matcher=$(jq -r '.hooks.PreToolUse[]? | select(.hooks[]?.command // "" | contains("deny-env-dump")) | .matcher' "$SETTINGS")
if [[ "$matcher" != *"Bash"* ]]; then
  echo "REGRESSION: deny-env-dump.sh is no longer wired to the Bash matcher in $SETTINGS" >&2
  exit 1
fi

echo "PASS: container inspect is denied for env-exposing shapes and allowed for narrow --format field reads; deny-list mirrors the env patterns without blanket-blocking inspect" >&2
exit 0
