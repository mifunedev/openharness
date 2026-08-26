#!/usr/bin/env bash
# tier: A
# source: operator directives 2026-08-06 (.config/ and settings.local.json are operator-only)
# desc: shared and provider hooks deny operator-only configuration for read and
#       write, stay silent on ordinary tool config, and remain wired up
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
FILE_HOOK="$ROOT/.oh/hooks/deny-secret-paths.sh"
CMD_HOOK="$ROOT/.oh/hooks/deny-env-dump.sh"
SETTINGS="$ROOT/.claude/settings.json"
CODEX_HOOK="$ROOT/.codex/hooks/deny-local-settings.sh"
CODEX_SETTINGS="$ROOT/.codex/hooks.json"

for f in "$FILE_HOOK" "$CMD_HOOK" "$CODEX_HOOK"; do
  if [[ ! -x "$f" ]]; then
    echo "SKIPPED: hook file absent or not executable: $f" >&2
    exit 2
  fi
done
for f in "$SETTINGS" "$CODEX_SETTINGS"; do
  if [[ ! -f "$f" ]]; then
    echo "SKIPPED: settings file absent: $f" >&2
    exit 2
  fi
done
if ! command -v jq >/dev/null 2>&1; then
  echo "SKIPPED: jq unavailable" >&2
  exit 2
fi

SEG=".config"
TMPDIR_PROBE=$(mktemp -d /tmp/operator-config-probe-XXXXXX)
trap 'rm -rf "$TMPDIR_PROBE"' EXIT

decision_for() {
  local out
  out=$(bash "$1" < "$2" 2>/dev/null)
  if [[ -z "$out" ]]; then
    echo allow
  else
    jq -r '.hookSpecificOutput.permissionDecision // "?"' <<<"$out"
  fi
}

fixture() {
  local path="$TMPDIR_PROBE/$1.json"
  printf '%s\n' "$2" > "$path"
  echo "$path"
}

assert() {
  local want="$1" got
  got=$(decision_for "$2" "$3")
  if [[ "$got" != "$want" ]]; then
    echo "REGRESSION: $4 — want '$want', got '$got'" >&2
    exit 1
  fi
}

A_READ=$(fixture a-read "$(jq -nc --arg p "/home/sandbox/$SEG/gh/hosts.yml" '{tool_input:{file_path:$p}}')")
A_WRITE=$(fixture a-write "$(jq -nc --arg p "/home/sandbox/harness/$SEG/main.yaml" '{tool_input:{file_path:$p}}')")
A_DIR=$(fixture a-dir "$(jq -nc --arg p "/home/sandbox/harness/$SEG" '{tool_input:{file_path:$p}}')")
A_GREP=$(fixture a-grep "$(jq -nc --arg p "/home/sandbox/$SEG" '{tool_input:{path:$p}}')")
assert deny "$FILE_HOOK" "$A_READ"  "file guard allowed a read under \$HOME/$SEG"
assert deny "$FILE_HOOK" "$A_WRITE" "file guard allowed a write under the repo-root $SEG"
assert deny "$FILE_HOOK" "$A_DIR"   "file guard allowed access to the $SEG directory itself"
assert deny "$FILE_HOOK" "$A_GREP"  "file guard allowed a Grep/Glob path into $SEG"
A_LOCAL_READ=$(fixture a-local-read "$(jq -nc '{tool_input:{file_path:"/home/sandbox/harness/.claude/settings.local.json"}}')")
A_LOCAL_WRITE=$(fixture a-local-write "$(jq -nc '{tool_input:{file_path:"/tmp/settings.local.json"}}')")
assert deny "$FILE_HOOK" "$A_LOCAL_READ"  "shared file guard allowed a settings.local.json read"
assert deny "$FILE_HOOK" "$A_LOCAL_WRITE" "shared file guard allowed a settings.local.json write"
assert deny "$CODEX_HOOK" "$A_LOCAL_READ"  "Codex file guard allowed a settings.local.json read"
assert deny "$CODEX_HOOK" "$A_LOCAL_WRITE" "Codex file guard allowed a settings.local.json write"

B_JEST=$(fixture b-jest "$(jq -nc '{tool_input:{file_path:"/home/sandbox/harness/jest.config.js"}}')")
B_OH=$(fixture b-oh "$(jq -nc '{tool_input:{file_path:"/home/sandbox/harness/.oh/config.json"}}')")
assert allow "$FILE_HOOK" "$B_JEST" "file guard falsely denied jest.config.js (segment anchor lost)"
assert allow "$FILE_HOOK" "$B_OH"   "file guard falsely denied .oh/config.json (segment anchor lost)"

C_CAT=$(fixture c-cat "$(jq -nc --arg c "cat ~/$SEG/gh/hosts.yml" '{tool_input:{command:$c}}')")
C_MKDIR=$(fixture c-mkdir "$(jq -nc --arg c "mkdir -p $SEG/foo" '{tool_input:{command:$c}}')")
C_TAR=$(fixture c-tar "$(jq -nc --arg c "tar czf out.tgz /home/sandbox/$SEG" '{tool_input:{command:$c}}')")
C_PY=$(fixture c-py "$(jq -nc --arg c "python3 -c \"open('/home/sandbox/$SEG/x')\"" '{tool_input:{command:$c}}')")
assert deny "$CMD_HOOK" "$C_CAT"   "command guard allowed a read of $SEG"
assert deny "$CMD_HOOK" "$C_MKDIR" "command guard allowed a write into $SEG"
assert deny "$CMD_HOOK" "$C_TAR"   "command guard allowed an archive route out of $SEG"
assert deny "$CMD_HOOK" "$C_PY"    "command guard only covers shell verbs — python reached $SEG"
C_LOCAL_READ=$(fixture c-local-read "$(jq -nc '{tool_input:{command:"cat .claude/settings.local.json"}}')")
C_LOCAL_WRITE=$(fixture c-local-write "$(jq -nc '{tool_input:{command:"python3 -c \"open(\\\"settings.local.json\\\", \\\"w\\\")\""}}')")
assert deny "$CMD_HOOK" "$C_LOCAL_READ"  "command guard allowed a settings.local.json read"
assert deny "$CMD_HOOK" "$C_LOCAL_WRITE" "command guard allowed a settings.local.json write"

D_JEST=$(fixture d-jest "$(jq -nc '{tool_input:{command:"npx jest --config jest.config.js"}}')")
D_GIT=$(fixture d-git "$(jq -nc '{tool_input:{command:"git config --get user.name"}}')")
D_OH=$(fixture d-oh "$(jq -nc '{tool_input:{command:"cat .oh/config.json"}}')")
assert allow "$CMD_HOOK" "$D_JEST" "command guard falsely denied a --config flag"
assert allow "$CMD_HOOK" "$D_GIT"  "command guard falsely denied git config"
assert allow "$CMD_HOOK" "$D_OH"   "command guard falsely denied .oh/config.json"

E_ENV=$(fixture e-env "$(jq -nc '{tool_input:{file_path:"/home/sandbox/harness/.env"}}')")
E_TMPL=$(fixture e-tmpl "$(jq -nc '{tool_input:{file_path:"/home/sandbox/harness/.env.example"}}')")
assert deny  "$FILE_HOOK" "$E_ENV"  "file guard stopped denying env files"
assert allow "$FILE_HOOK" "$E_TMPL" "file guard lost the env-template exemption"
assert allow "$CODEX_HOOK" "$E_ENV"  "Codex local-settings hook broadened beyond settings.local.json"

matcher=$(jq -r '.hooks.PreToolUse[]? | select(.hooks[]?.command // "" | contains("deny-secret-paths")) | .matcher' "$SETTINGS")
if [[ -z "$matcher" ]]; then
  echo "REGRESSION: deny-secret-paths.sh is no longer wired in $SETTINGS" >&2
  exit 1
fi
for tool in Read Write Edit Grep Glob; do
  if [[ "$matcher" != *"$tool"* ]]; then
    echo "REGRESSION: file-guard matcher '$matcher' does not cover $tool" >&2
    exit 1
  fi
done

for rule in "Read(file_path=**/$SEG/**)" "Write(file_path=**/$SEG/**)" "Edit(file_path=**/$SEG/**)" \
  "Read(file_path=**/settings.local.json)" "Write(file_path=**/settings.local.json)" "Edit(file_path=**/settings.local.json)"; do
  if ! jq -e --arg r "$rule" '.permissions.deny | index($r)' "$SETTINGS" >/dev/null; then
    echo "REGRESSION: permissions.deny is missing '$rule'" >&2
    exit 1
  fi
done

codex_matcher=$(jq -r '.hooks.PreToolUse[]? | select(.hooks[]?.command // "" | contains("deny-local-settings")) | .matcher' "$CODEX_SETTINGS")
for tool in Read Write Edit; do
  if [[ "$codex_matcher" != *"$tool"* ]]; then
    echo "REGRESSION: Codex file-guard matcher '$codex_matcher' does not cover $tool" >&2
    exit 1
  fi
done

echo "PASS: operator-only $SEG and settings.local.json are denied for read and write by shared/Claude/Codex guards; ordinary tool config is unaffected" >&2
exit 0
