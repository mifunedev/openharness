#!/usr/bin/env bash
# tier: A
# source: issue #928 — retire automated /spec agent handoff
# desc: /spec task identity and RUNNING state depend on the task folder alone, never on an
#       agent-spec-* session, a tmux session name, a Herdr tab/pane id, or another runtime handle
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SPEC="$ROOT/.oh/skills/spec"
EXEC="$SPEC/references/execute.md"
SKILL="$SPEC/SKILL.md"
PLAN="$SPEC/references/plan.md"
TASKS="$ROOT/.oh/tasks/README.md"
GLOSSARY="$ROOT/docs/glossary.md"

for file in "$EXEC" "$SKILL" "$PLAN" "$TASKS" "$GLOSSARY"; do
  [[ -f "$file" ]] || { echo "SKIPPED: required file absent: $file" >&2; exit 2; }
done

mapfile -t SCOPE < <(find "$SPEC" -type f \( -name '*.md' -o -name '*.sh' \) | sort)
SCOPE+=("$TASKS" "$GLOSSARY")

found=()

retired_session='agent-''spec-'
hits=$(grep -rnF -- "$retired_session" "${SCOPE[@]}" || true)
[[ -n "$hits" ]] && found+=("retired session prefix '$retired_session': ${hits//$'\n'/ ; }")

# With the prohibition prose written so it never uses these handles as its own words, an
# affirmative recoupling is exactly a literal occurrence — no negation-aware matcher needed.
coupling=$(grep -rniF -- "$(printf '%s\n' 'tmux session name' 'Herdr tab id' 'Herdr pane id' 'tab id' 'pane id' '$CRON_TMUX_SESSION')" "${SCOPE[@]}" || true)
[[ -n "$coupling" ]] && found+=("affirmative session coupling: ${coupling//$'\n'/ ; }")

missing=()
grep -qiF 'It is never a terminal' "$SKILL" || missing+=("/spec dispatcher no longer states the slug is never a terminal identifier")
grep -qiF 'never the existence of a named process, session, tab, or pane' "$EXEC" \
  || missing+=("execute.md no longer decouples RUNNING task state from a named process/session/tab/pane")
grep -qiF 'it never names a terminal session, tab, or pane' "$PLAN" \
  || missing+=("plan.md no longer decouples the slug from a terminal session name")
grep -qiF 'never depend on a session, tab, or pane' "$TASKS" \
  || missing+=(".oh/tasks/README.md no longer decouples task identity from a session/tab/pane id")
grep -qiF 'implementation owner' "$GLOSSARY" \
  || missing+=("docs/glossary.md no longer distinguishes the implementation owner from the terminal backend")

if (( ${#found[@]} + ${#missing[@]} )); then
  printf 'REGRESSION: /spec task identity recoupled to a terminal/session identifier:\n' >&2
  (( ${#found[@]} )) && printf '  - %s\n' "${found[@]}" >&2
  (( ${#missing[@]} )) && printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "PASS: /spec task identity and RUNNING state are independent of tmux/Herdr session identifiers" >&2
