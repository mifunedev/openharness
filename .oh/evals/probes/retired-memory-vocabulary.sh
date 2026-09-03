#!/usr/bin/env bash
# tier: A
# source: issue #926 — .oh/README.md and .gitignore still described a deleted subsystem
# desc: no current architecture surface describes the retired per-session memory tier as
#       active, and the surviving ignore rule is explicitly labelled a compatibility tombstone
#       with a removal horizon
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

# Assembled from fragments so this probe is not itself a hit for the path it
# retires, and therefore needs no self-exemption.
RETIRED=".oh/""memory"

failures=()

[[ -e "$RETIRED" ]] && failures+=("the retired memory directory exists in the checkout: $RETIRED")

tracked="$(git ls-files -- "$RETIRED" || true)"
[[ -n "$tracked" ]] && failures+=("files are tracked under the retired memory path: $tracked")

# 1. Current architecture docs must not present it as a live subsystem.
#    CHANGELOG.md, the preserved changelog rationale, and the RFCs are historical
#    records, excluded exactly as .oh/evals/probes/audit-stale-references.sh
#    excludes them.
set +e
hits="$(git grep -n -F -- "$RETIRED" -- \
  '.oh/README.md' 'docs' 'AGENTS.md' \
  ':!docs/rfcs/**')"
rc=$?
set -e
[[ $rc -eq 0 || $rc -eq 1 ]] || failures+=("memory-vocabulary scan failed")
[[ -n "$hits" ]] && failures+=("a current architecture doc still names the retired memory tier: $(tr '\n' ' ' <<<"$hits")")

# 2. The .oh/ contents table must not list it.
grep -nE '^\|[[:space:]]*`memory/`' .oh/README.md \
  && failures+=(".oh/README.md still lists memory/ in its contents table")

# 3. The ignore rule may remain ONLY as a labelled tombstone with a removal horizon.
if grep -qF "$RETIRED/" .gitignore; then
  block="$(grep -B8 -F "$RETIRED/" .gitignore)"
  grep -qi 'tombstone' <<<"$block" \
    || failures+=(".gitignore keeps the retired memory rule without labelling it a tombstone")
  grep -qiE 'remove it in [0-9]+\.[0-9]+' <<<"$block" \
    || failures+=(".gitignore's retired memory rule names no removal horizon")
  grep -qi 'local scratch, like' <<<"$block" \
    && failures+=(".gitignore still describes the retired memory tier as current scratch")
fi

# 4. A skill that mentions it must be speaking in the past tense about a deletion,
#    never describing a surface that exists.
while IFS= read -r line; do
  [[ -n "$line" ]] || continue
  file="${line%%:*}"; rest="${line#*:}"; text="${rest#*:}"
  grep -qiE 'deleted|removed|retired|used to' <<<"$text" \
    || failures+=("$file names the retired memory tier in the present tense: $text")
done < <(git grep -n -F -- "$RETIRED" -- '.oh/skills' || true)

if ((${#failures[@]})); then
  printf 'REGRESSION: %s\n' "${failures[@]}" >&2
  exit 1
fi

echo "PASS: the retired memory tier appears in no current architecture doc, and its ignore rule is a labelled tombstone with a removal horizon" >&2
exit 0
