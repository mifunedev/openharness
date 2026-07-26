#!/usr/bin/env bash
# tier: A
# source: .oh/tasks/first-mate-charter/ (issue #660) — First Mate role charter + advisor prompt pack must stay present, tracked, resolvable, and effort-vocabulary-aligned with /delegate
# desc: .oh/context/rules/first-mate.md exists with § Effort Scaling, the .oh/prompts/advisor/ pack is git-tracked with every agents: name resolving to .oh/agents/<name>.md, and the four /delegate complexity-class labels stay identical in both the charter and .oh/skills/delegate/SKILL.md
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CHARTER="$ROOT/.oh/context/rules/first-mate.md"
DELEGATE="$ROOT/.oh/skills/delegate/SKILL.md"
AGENTS_DIR="$ROOT/.oh/agents"
YAMLS=(
  ".oh/prompts/advisor/plan.yml"
  ".oh/prompts/advisor/implement.yml"
  ".oh/prompts/advisor/pr.yml"
)

# /delegate is a pre-existing surface outside this feature; without it the
# drift-guard has no counterpart to compare against.
if [[ ! -f "$DELEGATE" ]]; then
  echo "SKIPPED: /delegate skill absent, drift-guard counterpart missing: $DELEGATE" >&2
  exit 2
fi

missing=()

# 1. Charter exists.
if [[ ! -f "$CHARTER" ]]; then
  missing+=("charter .oh/context/rules/first-mate.md exists")
else
  # 2. Effort Scaling heading present.
  grep -Eq '^## Effort Scaling' "$CHARTER" || missing+=("charter has '^## Effort Scaling' heading")
fi

# 3. The three advisor prompt YAMLs are git-tracked (index counts: staged new files are tracked).
for rel in "${YAMLS[@]}"; do
  git -C "$ROOT" ls-files --error-unmatch "$rel" >/dev/null 2>&1 \
    || missing+=("$rel git-tracked")
done

# 4. Every name in every agents: list resolves to .oh/agents/<name>.md.
for rel in "${YAMLS[@]}"; do
  yml="$ROOT/$rel"
  [[ -f "$yml" ]] || continue # absence already reported by the tracked check
  names="$(grep -E '^[[:space:]]*agents:' "$yml" | grep -oE '"[^"]+"' | tr -d '"' || true)"
  if [[ -z "$names" ]]; then
    missing+=("$rel declares a non-empty agents: list")
    continue
  fi
  while IFS= read -r name; do
    [[ -f "$AGENTS_DIR/$name.md" ]] \
      || missing+=("$rel agents: '$name' resolves to .oh/agents/$name.md")
  done <<< "$names"
done

# 5. Drift-guard: the four complexity-class labels in the charter's Effort Scaling
#    table must each appear in BOTH files (charter § Effort Scaling consistency
#    clause: /delegate is the enforcement layer this table must track).
if [[ -f "$CHARTER" ]]; then
  labels="$(awk '/^## Effort Scaling/{f=1; next} /^## /{f=0} f' "$CHARTER" \
    | grep -E '^\| `' | sed -E 's/^\| `([^`]+)`.*/\1/' || true)"
  label_count=0
  [[ -n "$labels" ]] && label_count="$(wc -l <<< "$labels")"
  if (( label_count != 4 )); then
    missing+=("charter Effort Scaling table lists exactly 4 complexity-class labels (found $label_count) — consistency clause: the table must track /delegate's complexity classes")
  else
    while IFS= read -r label; do
      grep -Fq "$label" "$DELEGATE" \
        || missing+=("complexity class '$label' present in /delegate SKILL.md — charter § Effort Scaling consistency clause requires the labels to match /delegate's policy verbatim")
    done <<< "$labels"
  fi
fi

if (( ${#missing[@]} )); then
  printf 'REGRESSION: first-mate charter/prompt-pack contract broken: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: first-mate charter present with Effort Scaling, advisor prompt pack tracked with resolving agents, complexity-class labels aligned with /delegate" >&2
exit 0
