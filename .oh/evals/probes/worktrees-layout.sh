#!/usr/bin/env bash
# tier: A
# source: issue #872
# desc: a repository keeps its worktrees at its own root in .worktrees/, and
#       non-harness clones live at projects/<owner>/<repo>/. Both roots are
#       gitignored except a single tracked AGENTS.md guide, the retired
#       .oh/worktrees/ root is gone, and the runtime defaults agree with the
#       documented layout.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

if [[ -e ".oh/worktrees" ]]; then
  echo "REGRESSION: retired .oh/worktrees/ root still exists" >&2
  exit 1
fi

for guide in ".worktrees/AGENTS.md" "projects/AGENTS.md"; do
  if [[ ! -f "$guide" ]]; then
    echo "REGRESSION: missing directory guide: $guide" >&2
    exit 1
  fi
  if ! git ls-files --error-unmatch "$guide" >/dev/null 2>&1; then
    echo "REGRESSION: $guide is not tracked" >&2
    exit 1
  fi
done

tracked="$(git ls-files .worktrees projects)"
expected=$'.worktrees/AGENTS.md\nprojects/AGENTS.md'
if [[ "$tracked" != "$expected" ]]; then
  echo "REGRESSION: .worktrees/ and projects/ must track exactly their AGENTS.md; got:" >&2
  printf '%s\n' "$tracked" >&2
  exit 1
fi

for sample in ".worktrees/feat/1-probe" "projects/an-owner/a-repo"; do
  if ! git check-ignore -q "$sample" 2>/dev/null; then
    echo "REGRESSION: $sample is not gitignored" >&2
    exit 1
  fi
done

if ! grep -Fq 'process.env.WORKTREES_DIR || ".worktrees"' .oh/scripts/cron-runtime.ts; then
  echo "REGRESSION: cron-runtime.ts does not default WORKTREES_DIR to .worktrees" >&2
  exit 1
fi
if ! grep -Fq 'case "${WORKTREES_DIR:-.worktrees}" in' .devcontainer/entrypoint.sh; then
  echo "REGRESSION: entrypoint.sh does not default WORKTREES_DIR to .worktrees" >&2
  exit 1
fi
if ! grep -Fq 'case "${PROJECTS_DIR:-projects}" in' .devcontainer/entrypoint.sh; then
  echo "REGRESSION: entrypoint.sh does not create the projects/ root" >&2
  exit 1
fi

wt="$(env -u WORKTREES_DIR bash .oh/scripts/oh-path worktrees --no-create)"
pr="$(env -u PROJECTS_DIR bash .oh/scripts/oh-path projects --no-create)"
if [[ "$wt" != "$ROOT/.worktrees" || "$pr" != "$ROOT/projects" ]]; then
  echo "REGRESSION: oh-path defaults wrong: worktrees=$wt projects=$pr" >&2
  exit 1
fi

echo "PASS: .worktrees/ and projects/ live at the repo root, track only their AGENTS.md guide, and the runtime defaults match" >&2
exit 0
