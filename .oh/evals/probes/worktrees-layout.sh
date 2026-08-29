#!/usr/bin/env bash
# tier: A
# source: issue #872
# desc: a repository keeps its worktrees at its own root in .worktrees/, and
#       non-harness clones live at projects/<owner>/<repo>/. Both roots are
#       gitignored except a tracked AGENTS.md guide and its CLAUDE.md
#       provider-compatibility symlink, the retired
#       .oh/worktrees/ root is gone, and the layout is a fixed convention:
#       WORKTREES_DIR / PROJECTS_DIR / CRONS_DIR are retired and cannot move
#       any of these roots.
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
expected=$'.worktrees/AGENTS.md\n.worktrees/CLAUDE.md\nprojects/AGENTS.md\nprojects/CLAUDE.md'
if [[ "$tracked" != "$expected" ]]; then
  echo "REGRESSION: .worktrees/ and projects/ must track exactly their AGENTS.md + CLAUDE.md alias; got:" >&2
  printf '%s\n' "$tracked" >&2
  exit 1
fi

for alias in ".worktrees/CLAUDE.md" "projects/CLAUDE.md"; do
  if [[ ! -L "$alias" ]]; then
    echo "REGRESSION: $alias must be a symlink, not a copy" >&2
    exit 1
  fi
  if [[ "$(readlink "$alias")" != "AGENTS.md" ]]; then
    echo "REGRESSION: $alias must point at the sibling AGENTS.md, got: $(readlink "$alias")" >&2
    exit 1
  fi
done

for sample in ".worktrees/feat/1-probe" "projects/an-owner/a-repo"; do
  if ! git check-ignore -q "$sample" 2>/dev/null; then
    echo "REGRESSION: $sample is not gitignored" >&2
    exit 1
  fi
done

if ! grep -Fq 'const WORKTREES_DIR = ".worktrees";' .oh/scripts/cron-runtime.ts; then
  echo "REGRESSION: cron-runtime.ts does not pin WORKTREES_DIR to the .worktrees constant" >&2
  exit 1
fi
if ! grep -Fq 'const CRONS_DIR = path.resolve("crons");' .oh/scripts/cron-runtime.ts; then
  echo "REGRESSION: cron-runtime.ts does not pin CRONS_DIR to the crons constant" >&2
  exit 1
fi
for fixed in 'WORKTREES_PATH="$HARNESS/.worktrees"' 'PROJECTS_PATH="$HARNESS/projects"' 'CRONS_PATH="$HARNESS/crons"'; do
  if ! grep -Fq "$fixed" .devcontainer/entrypoint.sh; then
    echo "REGRESSION: entrypoint.sh does not create the fixed path: $fixed" >&2
    exit 1
  fi
done

if grep -Eq 'process\.env\.(WORKTREES|PROJECTS|CRONS)_DIR' .oh/scripts/cron-runtime.ts; then
  echo "REGRESSION: cron-runtime.ts reads a retired layout knob from the environment" >&2
  exit 1
fi

for guarded in \
  .oh/scripts/oh-path \
  .devcontainer/entrypoint.sh \
  .devcontainer/docker-compose.yml \
  .devcontainer/docker-compose.image-only.yml \
  .oh/scripts/migrate-harness-yaml.sh \
  .devcontainer/.example.env \
  .oh/templates/.devcontainer/.example.env; do
  if grep -Eq '(WORKTREES|PROJECTS|CRONS)_DIR' "$guarded"; then
    echo "REGRESSION: the retired layout knob is back in $guarded:" >&2
    grep -nE '(WORKTREES|PROJECTS|CRONS)_DIR' "$guarded" >&2
    exit 1
  fi
done

wt="$(WORKTREES_DIR=/tmp/oh-probe-wt bash .oh/scripts/oh-path worktrees --no-create)"
pr="$(PROJECTS_DIR=/tmp/oh-probe-pr bash .oh/scripts/oh-path projects --no-create)"
cr="$(CRONS_DIR=/tmp/oh-probe-cr bash .oh/scripts/oh-path crons --no-create)"
if [[ "$wt" != "$ROOT/.worktrees" || "$pr" != "$ROOT/projects" || "$cr" != "$ROOT/crons" ]]; then
  echo "REGRESSION: oh-path is still overridable or resolves wrong: worktrees=$wt projects=$pr crons=$cr" >&2
  exit 1
fi

if bash .oh/scripts/oh-path definitely-not-a-harness-dir --no-create >/dev/null 2>&1; then
  echo "REGRESSION: oh-path guesses a path for an unknown name instead of erroring" >&2
  exit 1
fi

if ! grep -Fq 'OH_PROJECT_ROOT' .devcontainer/docker-compose.yml; then
  echo "REGRESSION: OH_PROJECT_ROOT was swept up with the retired layout knobs" >&2
  exit 1
fi

echo "PASS: .worktrees/, projects/ and crons/ live at the repo root as a fixed convention, the retired *_DIR knobs are gone from every surface, and oh-path errors on an unknown name" >&2
exit 0
