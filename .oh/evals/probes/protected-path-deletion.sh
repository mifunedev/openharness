#!/usr/bin/env bash
# tier: A
# source: .oh/tasks/spec-simplification/ (issue #816, US-001) — the critique gate was deleted,
#         and with it the ONE deterministic check it carried: cross-check proposed deletions
#         against .claude/protected-paths.txt and halt on a hit. PR #212 deleted six
#         load-bearing skills under a defensible-sounding rationale and it took two weeks to
#         surface (.oh/agents/critic.md:41). Nothing inherited that property.
# desc: a protected path may be deleted, but never silently. Intersect this branch's deletions
#       with .claude/protected-paths.txt AS OF THE MERGE BASE — the one version an in-PR
#       amendment cannot edit — and require every hit to be named verbatim in a task
#       evidence.md. Removing the path and its list entry in the same commit keeps
#       protected-paths-resolve.sh green, so that probe cannot see this failure.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT" || { echo "SKIPPED: cannot enter repo root" >&2; exit 2; }
git rev-parse --git-dir >/dev/null 2>&1 || { echo "SKIPPED: not a git repository" >&2; exit 2; }

BASE_REF=""
for ref in development upstream/development origin/development; do
  if git rev-parse --verify --quiet "$ref" >/dev/null 2>&1; then BASE_REF="$ref"; break; fi
done
[ -n "$BASE_REF" ] || { echo "SKIPPED: no development ref to diff against" >&2; exit 2; }

BASE="$(git merge-base "$BASE_REF" HEAD 2>/dev/null || true)"
[ -n "$BASE" ] || { echo "SKIPPED: no merge base with $BASE_REF" >&2; exit 2; }

LIST=".claude/protected-paths.txt"
git cat-file -e "$BASE:$LIST" 2>/dev/null \
  || { echo "SKIPPED: $LIST absent at the merge base" >&2; exit 2; }

mapfile -t deleted < <(git diff --diff-filter=D --name-only "$BASE"..HEAD 2>/dev/null)

mapfile -t entries < <(
  git show "$BASE:$LIST" 2>/dev/null \
    | sed 's/[[:space:]]*#.*$//' \
    | sed 's/[[:space:]]*$//' \
    | grep -v '^$'
)
((${#entries[@]})) || { echo "SKIPPED: $LIST at the merge base has no entries" >&2; exit 2; }

mapfile -t evidence_files < <(git ls-files '.oh/tasks/*/evidence.md' | grep -v '^\.oh/tasks/archive/')

justified() {
  local needle="$1" doc
  for doc in "${evidence_files[@]}"; do
    git show "HEAD:$doc" 2>/dev/null | grep -qF -- "$needle" && return 0
  done
  return 1
}

hits=() unjustified=()
for entry in "${entries[@]}"; do
  case "$entry" in
    */*) target="$entry" ;;
    *)   target=".oh/skills/$entry/" ;;
  esac

  hit=""
  for d in "${deleted[@]}"; do
    case "$target" in
      */) [[ $d == "$target"* ]] && hit="$d" ;;
      *)  [[ $d == "$target" ]] && hit="$d" ;;
    esac
    [ -n "$hit" ] && break
  done
  [ -n "$hit" ] || continue

  hits+=("$entry -> $hit")
  if ! justified "$entry" && ! justified "$hit"; then
    unjustified+=("$entry (deleted: $hit)")
  fi
done

if ((${#unjustified[@]})); then
  {
    printf 'REGRESSION: protected path deleted without a justification in any evidence.md:\n'
    printf '  - %s\n' "${unjustified[@]}"
    printf 'Base: %s (%s). The list was read at the merge base, so amending\n' "$BASE_REF" "${BASE:0:8}"
    printf '.claude/protected-paths.txt in this branch does not clear this.\n'
    printf 'Fix: name the path in .oh/tasks/<slug>/evidence.md and say why it went.\n'
  } >&2
  exit 1
fi

if ((${#hits[@]})); then
  printf 'PASS: %d protected path(s) deleted, each justified in a tracked evidence.md: %s\n' \
    "${#hits[@]}" "$(printf '%s; ' "${hits[@]}")"
else
  echo "PASS: no protected path (as of the merge base) is deleted by this branch"
fi
exit 0
