#!/usr/bin/env bash
# tier: A
# source: wikiskill arXiv:2608.27454 — Wiki Maintainer role added as /wiki compile
# desc: the /wiki dispatcher routes a fourth compile subcommand, compile.md defers to the schema merge rules, forbids snapshotting retro reports into raw/, and the deleted memory tier is not reintroduced
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILL="$ROOT/.oh/skills/wiki/SKILL.md"
COMPILE="$ROOT/.oh/skills/wiki/references/compile.md"

failures=()

if [[ ! -f "$SKILL" ]]; then
  echo "SKIPPED: wiki dispatcher absent" >&2
  exit 2
fi
if [[ ! -f "$COMPILE" ]]; then
  echo "REGRESSION: /wiki compile reference missing: .oh/skills/wiki/references/compile.md" >&2
  exit 1
fi

need() { grep -qF -- "$2" "$1" || failures+=("$(basename "$1") missing contract text: $2"); }

need "$SKILL" 'four subcommands: ingest, query, lint, or compile'
need "$SKILL" 'references/{ingest,query,lint,compile}.md'
need "$SKILL" 'compile [--from <path>] [--task <slug>] [--dry-run]'
need "$SKILL" '| `compile` | Read `references/compile.md`'
need "$SKILL" "\`compile\`'s pattern-page writes"

need "$COMPILE" '/wiki compile [--from <path>] [--task <slug>] [--dry-run]'
need "$COMPILE" 'MUST NOT write a `raw/` snapshot of a `/retro` report'
need "$COMPILE" '§ 11 as amended by § 11a'
need "$COMPILE" 'orchestrator-only'
need "$COMPILE" 'One page per failure mode'
need "$COMPILE" '## Contents'

# The deleted memory tier must not return through this door. compile.md is
# expected to NAME the tier while explaining why it is not one, so only the
# operative machinery tokens are forbidden.
for f in "$SKILL" "$COMPILE"; do
  grep -qE 'MEMORY_DIR|MEMORY\.md|Memory Improvement Protocol' "$f" \
    && failures+=("$(basename "$f") reintroduces the removed memory tier")
done
need "$COMPILE" '## Why this is not a session journal'
need "$COMPILE" 'One page per **failure mode**'

# compile.md must stay a single-level reference under the 500-line house cap.
lines="$(wc -l < "$COMPILE")"
(( lines < 500 )) || failures+=("compile.md is $lines lines, over the 500-line cap")

if ((${#failures[@]})); then
  printf 'REGRESSION: %s\n' "${failures[@]}" >&2
  exit 1
fi

echo "PASS: /wiki routes compile, and compile.md defers to the schema merge rules without reviving the memory tier" >&2
exit 0
