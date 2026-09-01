#!/usr/bin/env bash
# tier: A
# source: issue #926 — ignored local scratch must never be an implicit input
# desc: /wiki query and every /spec flow read tracked knowledge only; .oh/knowledge/local/ is
#       gitignored, holds nothing tracked but its README anchor, and no read path enumerates it
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

QUERY=".oh/skills/wiki/references/query.md"
PLAN=".oh/skills/spec/references/plan.md"
EXECUTE=".oh/skills/spec/references/execute.md"

for f in "$QUERY" "$PLAN" "$EXECUTE"; do
  [[ -f "$f" ]] || { echo "SKIPPED: required file absent: $f" >&2; exit 2; }
done

failures=()

# 1. The ignore rule must actually ignore it.
probe_file=".oh/knowledge/local/.boundary-probe-$$.md"
mkdir -p .oh/knowledge/local
printf 'scratch\n' > "$probe_file"
if ! git check-ignore -q "$probe_file"; then
  failures+=(".oh/knowledge/local/ is not gitignored — a scratch page would enter the shared set")
fi
rm -f "$probe_file"

# 2. Nothing but the README anchor may be tracked there.
while IFS= read -r rel; do
  [[ -n "$rel" ]] || continue
  [[ "$rel" == ".oh/knowledge/local/README.md" ]] && continue
  failures+=("tracked file under the ignored scratch tier: $rel")
done < <(git ls-files -- '.oh/knowledge/local')

# 3. The query enumeration must name only the two shared directories.
grep -qF 'DIR="$KNOWLEDGE/source"' "$QUERY" \
  || failures+=("query.md does not enumerate .oh/knowledge/source/")
grep -qF 'DIR="$KNOWLEDGE/patterns"' "$QUERY" \
  || failures+=("query.md does not enumerate .oh/knowledge/patterns/")

# 4. Every mention of the scratch tier in a read path must be a prohibition, never
#    an enumeration. A read path that globs it is the failure this probe exists for.
for f in "$QUERY" "$PLAN" "$EXECUTE"; do
  if grep -nE 'knowledge/local/\*|knowledge/local/\*\.md|for .* in .*knowledge/local' "$f"; then
    failures+=("$f enumerates the ignored scratch tier")
  fi
done

# 5. The prohibition must be stated where a reader of each path will meet it.
grep -qF 'does **not** read `.oh/knowledge/local/`' "$QUERY" \
  || failures+=("query.md does not state that it refuses the scratch tier")
grep -qF 'query path reads it' "$PLAN" \
  || failures+=("plan.md does not state that recall refuses the scratch tier")

# 6. The scratch tier must document its explicit promotion path, or it becomes a
#    dead end people work around by hand-moving files past the schema.
grep -qF '/wiki ingest' .oh/knowledge/local/README.md \
  || failures+=(".oh/knowledge/local/README.md documents no explicit promotion path")

if ((${#failures[@]})); then
  printf 'REGRESSION: %s\n' "${failures[@]}" >&2
  exit 1
fi

echo "PASS: .oh/knowledge/local/ is ignored, holds nothing tracked but its anchor, is enumerated by no read path, and has an explicit promotion path" >&2
exit 0
