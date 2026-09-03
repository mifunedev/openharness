#!/usr/bin/env bash
# tier: A
# source: council review 2026-08-29 (issue #886) — /delegate instructed Claude-Code-only
#         TaskCreate/TaskUpdate from .oh/skills/, the canonical pack symlinked into
#         .claude, .codex and .pi. Codex and Pi never had those tools, and Claude Code
#         2.1.233 stopped providing them by default, so the step became a silent no-op.
# desc: the canonical skill pack and the sandbox agree about the Claude-Code-only task
#       tools — a skill may instruct them only while the sandbox enables them, and the
#       sandbox may enable them only while some skill needs them
set -euo pipefail

PROBE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$PROBE_DIR" && git rev-parse --show-toplevel 2>/dev/null)" \
  || ROOT="$(cd "$PROBE_DIR/../../.." && pwd)"

SKILLS="$ROOT/.oh/skills"
TOOLS='TodoWrite|TaskCreate|TaskGet|TaskUpdate|TaskList'

if [[ ! -d "$SKILLS" ]]; then
  echo "SKIPPED: .oh/skills/ absent on this branch" >&2
  exit 2
fi

mapfile -t consumers < <(
  grep -rlE "\`($TOOLS)\`" "$SKILLS" 2>/dev/null | sed "s|^$ROOT/||" | sort
)

enabled_in=()
for f in "$ROOT/.devcontainer/docker-compose.yml" \
         "$ROOT/.devcontainer/docker-compose.image-only.yml" \
         "$ROOT/.claude/settings.json"; do
  [[ -f "$f" ]] || continue
  grep -qE 'CLAUDE_CODE_ENABLE_TODO_TOOLS' "$f" && enabled_in+=("${f#"$ROOT"/}")
done

if (( ${#consumers[@]} > 0 && ${#enabled_in[@]} == 0 )); then
  echo "REGRESSION: a canonical skill instructs Claude-Code-only task tools that the sandbox does not enable:" >&2
  printf '  - %s\n' "${consumers[@]}" >&2
  echo "  Those tools are absent on Codex and Pi, and on Claude Code 2.1.233+ by default." >&2
  echo "  Fix the skill to use the .oh/tasks/ ledger, or enable CLAUDE_CODE_ENABLE_TODO_TOOLS=1 in the sandbox." >&2
  exit 1
fi

if (( ${#consumers[@]} == 0 && ${#enabled_in[@]} > 0 )); then
  echo "REGRESSION: the sandbox enables CLAUDE_CODE_ENABLE_TODO_TOOLS but no canonical skill needs it:" >&2
  printf '  - %s\n' "${enabled_in[@]}" >&2
  echo "  Dead configuration — drop it, or point at the skill that depends on the tools." >&2
  exit 1
fi

if (( ${#consumers[@]} == 0 )); then
  echo "PASS: no canonical skill depends on the Claude-Code-only task tools, and the sandbox does not enable them" >&2
else
  echo "PASS: ${#consumers[@]} skill(s) instruct the task tools and the sandbox enables them (${enabled_in[*]})" >&2
fi
exit 0
