#!/usr/bin/env bash
# tier: A
# source: issue #841 (closing keywords never fire because the default branch is main) 2026-08-26
# desc: the development-merge issue closer must stay merged-only, development-only, least-privilege,
#       and on the pull_request trigger — pull_request_target resolves from the default branch,
#       where this workflow does not exist, so it would never fire.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORKFLOW="$ROOT/.github/workflows/close-issues-on-development.yml"
PARSER="$ROOT/.oh/scripts/closing-keywords.mjs"

if [[ ! -f "$WORKFLOW" ]]; then
  echo "REGRESSION close-issues-on-development workflow missing" >&2
  exit 1
fi

if [[ ! -f "$PARSER" ]]; then
  echo "REGRESSION closing-keyword parser missing: .oh/scripts/closing-keywords.mjs" >&2
  exit 1
fi

text="$(cat "$WORKFLOW")"
missing=()

has() { grep -Fq -- "$1" <<<"$text" || missing+=("$2"); }
has_regex() { grep -Eq -- "$1" <<<"$text" || missing+=("$2"); }

has_regex '^[[:space:]]*pull_request:[[:space:]]*$' "pull_request trigger"
has_regex '^[[:space:]]*-[[:space:]]*closed[[:space:]]*$' "closed event type"
has_regex '^[[:space:]]*-[[:space:]]*development[[:space:]]*$' "development branch filter"
has 'if: github.event.pull_request.merged == true' "merged-only guard"
has_regex '^[[:space:]]*contents:[[:space:]]*read[[:space:]]*$' "read-only contents permission"
has_regex '^[[:space:]]*issues:[[:space:]]*write[[:space:]]*$' "issues write permission"
has 'persist-credentials: false' "checkout token persistence disabled"
has 'closing-keywords.mjs' "shared parser wired in"
has 'state_reason: "completed"' "completed state reason"
has 'PR_TITLE: ${{ github.event.pull_request.title }}' "title passed through env"
has 'PR_BODY: ${{ github.event.pull_request.body }}' "body passed through env"

# pull_request_target resolves the workflow from the DEFAULT branch (main), where
# this file does not exist — it would never fire. This is the bug the trigger swap
# fixed; the probe keeps it from coming back.
if grep -Eq '^[[:space:]]*pull_request_target:' <<<"$text"; then
  echo "REGRESSION close-issues-on-development must not use pull_request_target: it resolves from the default branch, where this workflow does not exist" >&2
  exit 1
fi

# The workflow must never run head-branch code: it checks out the base ref and
# only imports the parser. An explicit head ref would make this an ACE surface.
if grep -Eq 'ref:[[:space:]]*\$\{\{[[:space:]]*github\.event\.pull_request\.head' <<<"$text"; then
  echo "REGRESSION close-issues-on-development must not check out the pull request head ref" >&2
  exit 1
fi

# Author-controlled strings must reach the script through env, never through
# template interpolation inside the script body.
if grep -Eq '^[[:space:]]+.*\$\{\{[[:space:]]*github\.event\.pull_request\.(title|body)' <<<"$(sed -n '/script: |/,$p' <<<"$text")"; then
  echo "REGRESSION close-issues-on-development interpolates PR title/body into the script body" >&2
  exit 1
fi

if grep -Eq 'permissions:[[:space:]]*write-all|contents:[[:space:]]*write|packages:[[:space:]]*write|pull-requests:[[:space:]]*write' <<<"$text"; then
  echo "REGRESSION close-issues-on-development exceeds contents:read + issues:write" >&2
  exit 1
fi

if (( ${#missing[@]} )); then
  printf 'REGRESSION close-issues-on-development contract missing: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS close-issues-on-development closes referenced issues only on a merged development PR, under contents:read + issues:write" >&2
exit 0
