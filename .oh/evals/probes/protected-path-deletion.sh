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

# Resolve the base branch through the first ref that exists; a checkout with none
# (a shallow CI clone, a detached export) cannot compute a deletion set at all.
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

# Deletions introduced by this branch. On development itself this is empty and the
# probe is a no-op pass rather than a skip -- an empty deletion set IS the passing state.
mapfile -t deleted < <(git diff --diff-filter=D --name-only "$BASE"..HEAD 2>/dev/null)

# The protected list as of the merge base. Strip comments (including the inline kind
# the file's own format note forbids but one entry carries) and blanks.
mapfile -t entries < <(
  git show "$BASE:$LIST" 2>/dev/null \
    | sed 's/[[:space:]]*#.*$//' \
    | sed 's/[[:space:]]*$//' \
    | grep -v '^$'
)
((${#entries[@]})) || { echo "SKIPPED: $LIST at the merge base has no entries" >&2; exit 2; }

# Every tracked evidence.md outside the archive is a place a justification may live.
mapfile -t evidence_files < <(git ls-files '.oh/tasks/*/evidence.md' | grep -v '^\.oh/tasks/archive/')

# Read the COMMITTED content, never the working tree. An uncommitted justification is
# present on disk and absent from the PR diff -- from the reviewer's seat, identical to
# never having written it, which is the same trap the evidence.md gate exists for.
justified() {  # $1 = string that must appear verbatim in some committed evidence doc
  local needle="$1" doc
  for doc in "${evidence_files[@]}"; do
    git show "HEAD:$doc" 2>/dev/null | grep -qF -- "$needle" && return 0
  done
  return 1
}

hits=() unjustified=()
for entry in "${entries[@]}"; do
  case "$entry" in
    */*) target="$entry" ;;          # repo-relative path
    *)   target=".oh/skills/$entry/" ;;  # bare skill name -> its directory
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
  # The entry OR the concrete deleted path satisfies it; both name the same removal.
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
