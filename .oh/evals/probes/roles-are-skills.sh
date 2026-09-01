#!/usr/bin/env bash
# tier: A
# source: ADR #929 — roles are behavior, skills encode behavior, agents execute behavior
# desc: active core docs and tooling encode durable roles as skills; no role is defined as a
#       required project-agent identity, and no active surface cites a project-agent file
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

fail() { echo "REGRESSION: $*" >&2; exit 1; }

for skill in architect spec audit retro delegate builder; do
  [ -f ".oh/skills/$skill/SKILL.md" ] || fail "role-owning skill missing: .oh/skills/$skill/SKILL.md"
done

for role in architect advisor auditor implementer critic pm council first-mate prime; do
  for dir in .oh/agents .claude/agents .codex/agents .pi/agents; do
    [ ! -e "$dir/$role.md" ] || fail "role reintroduced as a project agent: $dir/$role.md"
  done
done

agent_file_refs="$(grep -rnE '\.(oh|claude|codex|pi)/agents/[A-Za-z0-9_-]+\.md' \
  .oh/skills docs AGENTS.md README.md .oh/README.md 2>/dev/null \
  | grep -v '^\.oh/skills/wiki/corpus/' \
  | grep -v '^docs/rfcs/preserved-changelog-rationale\.md:' || true)"
if [ -n "$agent_file_refs" ]; then
  echo "REGRESSION: active surfaces still cite project-agent definition files:" >&2
  printf '%s\n' "$agent_file_refs" >&2
  exit 1
fi

retired_role_uses="$(grep -rnE '\b(Advisor|First Mate)\b' .oh/skills 2>/dev/null \
  | grep -v '^\.oh/skills/wiki/corpus/' \
  | grep -vE '\b([Nn]o|[Nn]ot|[Nn]ever|[Nn]either)\b' || true)"
if [ -n "$retired_role_uses" ]; then
  echo "REGRESSION: active skills still invoke a retired role identity (a retired role may only appear in a negation):" >&2
  printf '%s\n' "$retired_role_uses" >&2
  exit 1
fi

grep -qF 'canonical primitive for a reusable role' docs/glossary.md \
  || fail "docs/glossary.md does not name skills as the canonical reusable-role primitive"
grep -qF 'the **runtime and the owner of the' docs/glossary.md \
  || fail "docs/glossary.md does not name the active coding agent as the runtime/owner"
grep -qF -e '- **worker / subagent**' docs/glossary.md \
  || fail "docs/glossary.md does not define worker/subagent as a bounded execution context"
grep -qF -e '- **rule**' docs/glossary.md || fail "docs/glossary.md does not define rule"
grep -qF -e '- **rfc / adr**' docs/glossary.md || fail "docs/glossary.md does not define rfc/adr"

echo "PASS: durable roles are skills; no active surface defines or cites a project-agent identity" >&2
