#!/usr/bin/env bash
# tier: A
# source: operator directive 2026-08-06 (.config/ is operator-only)
# desc: both secret guards deny the operator-only dot-config directory for read
#       and write, stay silent on ordinary tool config, and remain wired up
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
FILE_HOOK="$ROOT/.oh/hooks/deny-secret-paths.sh"
CMD_HOOK="$ROOT/.oh/hooks/deny-env-dump.sh"
SETTINGS="$ROOT/.claude/settings.json"

for f in "$FILE_HOOK" "$CMD_HOOK"; do
  if [[ ! -x "$f" ]]; then
    echo "SKIPPED: hook file absent or not executable: $f" >&2
    exit 2
  fi
done
if [[ ! -f "$SETTINGS" ]]; then
  echo "SKIPPED: settings file absent: $SETTINGS" >&2
  exit 2
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "SKIPPED: jq unavailable" >&2
  exit 2
fi

# --- file-fixture driver ---
# Hold the protected segment in a variable and write fixtures to /tmp so the
# probe's own command text never carries the path the guards deny.
SEG=".config"
TMPDIR_PROBE=$(mktemp -d /tmp/operator-config-probe-XXXXXX)
trap 'rm -rf "$TMPDIR_PROBE"' EXIT

decision_for() {
  # decision_for <hook> <fixture>; echoes deny | ask | allow
  local out
  out=$(bash "$1" < "$2" 2>/dev/null)
  if [[ -z "$out" ]]; then
    echo allow
  else
    jq -r '.hookSpecificOutput.permissionDecision // "?"' <<<"$out"
  fi
}

fixture() {
  # fixture <name> <json>; echoes the path written
  local path="$TMPDIR_PROBE/$1.json"
  printf '%s\n' "$2" > "$path"
  echo "$path"
}

assert() {
  # assert <want> <hook> <fixture> <label>
  local want="$1" got
  got=$(decision_for "$2" "$3")
  if [[ "$got" != "$want" ]]; then
    echo "REGRESSION: $4 — want '$want', got '$got'" >&2
    exit 1
  fi
}

# --- assertion group A: file tools deny read AND write under the directory ---
A_READ=$(fixture a-read "$(jq -nc --arg p "/home/sandbox/$SEG/gh/hosts.yml" '{tool_input:{file_path:$p}}')")
A_WRITE=$(fixture a-write "$(jq -nc --arg p "/home/sandbox/harness/$SEG/main.yaml" '{tool_input:{file_path:$p}}')")
A_DIR=$(fixture a-dir "$(jq -nc --arg p "/home/sandbox/harness/$SEG" '{tool_input:{file_path:$p}}')")
A_GREP=$(fixture a-grep "$(jq -nc --arg p "/home/sandbox/$SEG" '{tool_input:{path:$p}}')")
assert deny "$FILE_HOOK" "$A_READ"  "file guard allowed a read under \$HOME/$SEG"
assert deny "$FILE_HOOK" "$A_WRITE" "file guard allowed a write under the repo-root $SEG"
assert deny "$FILE_HOOK" "$A_DIR"   "file guard allowed access to the $SEG directory itself"
assert deny "$FILE_HOOK" "$A_GREP"  "file guard allowed a Grep/Glob path into $SEG"

# --- assertion group B: file tools stay silent on ordinary tool config ---
B_JEST=$(fixture b-jest "$(jq -nc '{tool_input:{file_path:"/home/sandbox/harness/jest.config.js"}}')")
B_OH=$(fixture b-oh "$(jq -nc '{tool_input:{file_path:"/home/sandbox/harness/.oh/config.json"}}')")
assert allow "$FILE_HOOK" "$B_JEST" "file guard falsely denied jest.config.js (segment anchor lost)"
assert allow "$FILE_HOOK" "$B_OH"   "file guard falsely denied .oh/config.json (segment anchor lost)"

# --- assertion group C: Bash guard closes non-shell verbs, not just readers ---
C_CAT=$(fixture c-cat "$(jq -nc --arg c "cat ~/$SEG/gh/hosts.yml" '{tool_input:{command:$c}}')")
C_MKDIR=$(fixture c-mkdir "$(jq -nc --arg c "mkdir -p $SEG/foo" '{tool_input:{command:$c}}')")
C_TAR=$(fixture c-tar "$(jq -nc --arg c "tar czf out.tgz /home/sandbox/$SEG" '{tool_input:{command:$c}}')")
C_PY=$(fixture c-py "$(jq -nc --arg c "python3 -c \"open('/home/sandbox/$SEG/x')\"" '{tool_input:{command:$c}}')")
assert deny "$CMD_HOOK" "$C_CAT"   "command guard allowed a read of $SEG"
assert deny "$CMD_HOOK" "$C_MKDIR" "command guard allowed a write into $SEG"
assert deny "$CMD_HOOK" "$C_TAR"   "command guard allowed an archive route out of $SEG"
assert deny "$CMD_HOOK" "$C_PY"    "command guard only covers shell verbs — python reached $SEG"

# --- assertion group D: Bash guard tolerates ordinary tool config ---
D_JEST=$(fixture d-jest "$(jq -nc '{tool_input:{command:"npx jest --config jest.config.js"}}')")
D_GIT=$(fixture d-git "$(jq -nc '{tool_input:{command:"git config --get user.name"}}')")
D_OH=$(fixture d-oh "$(jq -nc '{tool_input:{command:"cat .oh/config.json"}}')")
assert allow "$CMD_HOOK" "$D_JEST" "command guard falsely denied a --config flag"
assert allow "$CMD_HOOK" "$D_GIT"  "command guard falsely denied git config"
assert allow "$CMD_HOOK" "$D_OH"   "command guard falsely denied .oh/config.json"

# --- assertion group E: pre-existing secret family unchanged by the new tier ---
E_ENV=$(fixture e-env "$(jq -nc '{tool_input:{file_path:"/home/sandbox/harness/.env"}}')")
E_TMPL=$(fixture e-tmpl "$(jq -nc '{tool_input:{file_path:"/home/sandbox/harness/.env.example"}}')")
assert deny  "$FILE_HOOK" "$E_ENV"  "file guard stopped denying env files"
assert allow "$FILE_HOOK" "$E_TMPL" "file guard lost the env-template exemption"

# --- assertion F: wiring — the file guard must actually run for Grep/Glob ---
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

# --- assertion G: wiring — deny-list mirrors the directory for read and write ---
for rule in "Read(file_path=**/$SEG/**)" "Write(file_path=**/$SEG/**)" "Edit(file_path=**/$SEG/**)"; do
  if ! jq -e --arg r "$rule" '.permissions.deny | index($r)' "$SETTINGS" >/dev/null; then
    echo "REGRESSION: permissions.deny is missing '$rule'" >&2
    exit 1
  fi
done

echo "PASS: operator-only $SEG directory is denied for read and write by both guards, ordinary tool config is unaffected, and the wiring covers Read/Write/Edit/Grep/Glob" >&2
exit 0
