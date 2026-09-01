#!/usr/bin/env bash
# tier: A
# source: issue #643 — consolidate artifact builders behind one /builder dispatcher
# desc: /builder owns skill, command, and rule authoring while legacy builder entry points stay removed
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILL="$ROOT/.oh/skills/builder/SKILL.md"
REFS="$ROOT/.oh/skills/builder/references"

fail() {
  echo "REGRESSION: $*" >&2
  exit 1
}

required=(
  "$SKILL"
  "$REFS/skill.md"
  "$REFS/command.md"
  "$REFS/rule.md"
)
for path in "${required[@]}"; do
  [ -f "$path" ] || fail "missing required builder artifact: ${path#"$ROOT/"}"
done

legacy=(
  ".oh/skills/skill-builder"
)
for rel in "${legacy[@]}"; do
  [ ! -e "$ROOT/$rel" ] || fail "legacy builder entry point still exists: $rel"
done

frontmatter="$(awk '
  NR == 1 && $0 == "---" { inside=1; next }
  inside && $0 == "---" { exit }
  inside { print }
' "$SKILL")"
[ -n "$frontmatter" ] || fail "builder SKILL.md lacks YAML frontmatter"
grep -qxF 'name: builder' <<<"$frontmatter" || fail "builder frontmatter name is not exact"
grep -qxF 'argument-hint: "skill|command|rule <name-or-request>"' <<<"$frontmatter" || fail "builder argument hint does not expose all three public types"
grep -qxF 'allowed-tools: Read, Write, Edit, Glob, Grep, Bash' <<<"$frontmatter" || fail "builder allowed-tools contract drifted"
if grep -qE '^model:' <<<"$frontmatter"; then
  fail "builder must inherit the session model"
fi

for type in skill command rule; do
  grep -qF "| \`$type\` | \`references/$type.md\` |" "$SKILL" || fail "dispatcher route missing for type: $type"
done
grep -qF 'Usage: /builder <skill|command|rule> <name-or-request>' "$SKILL" || fail "missing exact invalid-argument usage"
grep -qF 'remaining request is empty or only' "$SKILL" || fail "dispatcher does not reject an empty request after a valid type"
grep -qF 'stop without reading' "$SKILL" || fail "missing fail-closed invalid-type behavior"
if grep -qF '.oh/memory' "$SKILL"; then fail "builder references the deleted .oh/memory tier"; fi
if grep -qF 'MEMORY_DIR' "$SKILL"; then fail "builder reintroduced the MEMORY_DIR override"; fi

SKILL_REF="$REFS/skill.md"
grep -qF '.oh/skills/<name>/SKILL.md' "$SKILL_REF" || fail "skill type omits canonical Open Harness placement"
grep -qiF 'progressive disclosure' "$SKILL_REF" || fail "skill type omits progressive disclosure"
grep -q '^## Frontmatter$' "$SKILL_REF" || fail "skill type omits frontmatter guidance"
grep -qF 'below 500 lines' "$SKILL_REF" || fail "skill type omits size validation"

COMMAND_REF="$REFS/command.md"
grep -qF '.oh/skills/<name>/SKILL.md' "$COMMAND_REF" || fail "command type does not target a task-style skill"
grep -qF 'Never create' "$COMMAND_REF" || fail "command type does not forbid legacy command creation"
grep -qF '.claude/commands/<name>.md' "$COMMAND_REF" || fail "command type does not name the forbidden legacy path"

RULE_REF="$REFS/rule.md"
grep -qF '.oh/skills/<name>/SKILL.md' "$RULE_REF" || fail "rule type does not prefer a portable skill"
grep -qF 'with `paths:`' "$RULE_REF" || fail "rule type does not require path scoping"
grep -qF '`.claude/rules/`' "$RULE_REF" || fail "rule type omits the provider-specific rule surface"
grep -qF '.claude/rules/<name>.md' "$RULE_REF" || fail "rule type omits the explicit provider-specific exception"
if grep -qF 'references/skill.md' "$RULE_REF"; then
  fail "rule type delegates authority to a second type reference"
fi

for path in "${required[@]}"; do
  lines=$(wc -l < "$path")
  [ "$lines" -lt 500 ] || fail "builder artifact exceeds 499 lines: ${path#"$ROOT/"} ($lines)"
done
for path in "$REFS"/*.md; do
  lines=$(wc -l < "$path")
  if [ "$lines" -gt 100 ]; then
    grep -q '^## Contents$' "$path" || fail "reference over 100 lines lacks contents list: ${path#"$ROOT/"}"
  fi
done

if grep -qF 'skill-builder' "$ROOT/docs/oh-directory-layout.md"; then
  fail "current directory-layout docs still advertise skill-builder as an agent"
fi

echo "PASS: /builder dispatches three artifact references and legacy builders remain removed" >&2
exit 0
