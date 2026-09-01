#!/usr/bin/env bash
# tier: A
# source: issue #926 — /spec wrote knowledge more reliably than it read it
# desc: /spec plan recalls TRACKED knowledge and re-grounds it against current sources before
#       the PRD exists, and records Knowledge Context in prd.md; the retired Wiki Alignment
#       block is gone from the planning contract
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PLAN="$ROOT/.oh/skills/spec/references/plan.md"
SPEC="$ROOT/.oh/skills/spec/SKILL.md"

for f in "$PLAN" "$SPEC"; do
  [[ -f "$f" ]] || { echo "SKIPPED: required file absent: $f" >&2; exit 2; }
done

failures=()
need() { grep -qF -- "$1" "$PLAN" || failures+=("plan.md missing contract text: $1"); }
# An EXACT-LINE pin: a heading that merely names the block must not satisfy the
# assertion that the block itself is still specified.
need_line() { grep -qxF -- "$1" "$PLAN" || failures+=("plan.md no longer specifies the block: $1"); }

# The three-step recall contract, and the section that records it.
need '### 2. Recall tracked knowledge'
need '### 3. Ground the recalled claims against current sources'
need '/wiki query <terms>'
need '/wiki query <terms> --patterns'
need_line '## Knowledge Context'
need_line '## Expected Knowledge Impact'
need '- **Base commit**: `<sha>`'
need '- **Queries**: `<queries used>`'
need '- **Knowledge used**: `[[slug]]`, ... or `none`'
need '- **Grounded against**: `<repo-relative paths>`'
need '- **Conflicts discovered**: `none` or concise reconciliation'

# Order matters: recall and grounding must precede the PRD, or the loop is open.
recall_line=$(grep -n '^### 2\. Recall tracked knowledge' "$PLAN" | cut -d: -f1)
ground_line=$(grep -n '^### 3\. Ground the recalled claims' "$PLAN" | cut -d: -f1)
prd_line=$(grep -n '^### 4\. `/prd` ' "$PLAN" | cut -d: -f1)
if [[ -z "$recall_line" || -z "$ground_line" || -z "$prd_line" ]]; then
  failures+=("plan.md no longer has the numbered recall / ground / prd steps this probe reads")
elif (( recall_line >= ground_line || ground_line >= prd_line )); then
  failures+=("plan.md orders the pipeline wrong — recall and grounding must precede /prd")
fi

# Knowledge is a cache, not an authority.
grep -qF 'the source wins and the page is wrong' "$PLAN" \
  || failures+=("plan.md no longer subordinates recalled knowledge to the repository")

# Recall reads the SHARED set only.
grep -qF '.oh/knowledge/source/' "$PLAN" \
  || failures+=("plan.md does not name the tracked entity-page directory")
grep -qF '.oh/knowledge/patterns/' "$PLAN" \
  || failures+=("plan.md does not name the tracked pattern directory")

# The retired planning-time oracle must not come back AS A BLOCK. A code-spanned
# mention is how the supersession is documented; a heading is the reappearance.
if grep -nE '^## Wiki Alignment[[:space:]]*$' "$PLAN" "$SPEC"; then
  failures+=("the retired Wiki Alignment planning block reappeared as a section heading")
fi
grep -qF '`## Wiki Alignment` is superseded' "$PLAN" \
  || failures+=("plan.md does not record that Wiki Alignment was superseded")

# The dispatcher must describe the loop, not just the nodes.
grep -qF 'recall tracked knowledge' "$SPEC" \
  || failures+=("the /spec dispatcher no longer shows recall in the loop")

if ((${#failures[@]})); then
  printf 'REGRESSION: %s\n' "${failures[@]}" >&2
  exit 1
fi

echo "PASS: /spec plan recalls tracked knowledge and re-grounds it before the PRD, and records Knowledge Context" >&2
exit 0
