#!/usr/bin/env bash
# tier: A
# source: wikiskill arXiv:2608.27454 — skill-change ledger, never rolled back
# desc: skill-impact.md is tracked, carries no slug (so it never enters the corpus index), and every SI record present at the merge-base is present and byte-identical at HEAD
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
LEDGER_REL=".oh/skills/wiki/corpus/skill-impact.md"
LEDGER="$ROOT/$LEDGER_REL"

if [[ ! -f "$LEDGER" ]]; then
  echo "SKIPPED: ledger absent: $LEDGER_REL" >&2
  exit 2
fi
if ! git -C "$ROOT" ls-files --error-unmatch "$LEDGER_REL" >/dev/null 2>&1; then
  echo "REGRESSION: $LEDGER_REL exists but is untracked — the ledger must be reviewable in a pull request" >&2
  exit 1
fi
if grep -q '^slug:' "$LEDGER"; then
  echo "REGRESSION: $LEDGER_REL carries a slug: field — it would become a corpus index row" >&2
  exit 1
fi

# Required record keys must be documented, so a writer cannot omit them silently.
failures=()
for lit in '**target**' '**motivating patterns**' '**for**' '**verdict**' 'Never edit an existing record'; do
  grep -qF -- "$lit" "$LEDGER" || failures+=("ledger missing documented key: $lit")
done
if ((${#failures[@]})); then
  printf 'REGRESSION: %s\n' "${failures[@]}" >&2
  exit 1
fi

# WIKI_LEDGER_BASE overrides the comparison point so the append-only invariant can
# be exercised against a real mutation rather than only asserted.
base="${WIKI_LEDGER_BASE:-}"
[[ -n "$base" ]] && base="$(git -C "$ROOT" rev-parse "$base" 2>/dev/null || true)"
for cand in development main master; do
  [[ -n "$base" ]] && break
  if git -C "$ROOT" show-ref --verify --quiet "refs/heads/$cand"; then
    base="$(git -C "$ROOT" merge-base HEAD "$cand" 2>/dev/null || true)"
    [[ -n "$base" ]] && break
  fi
done
if [[ -z "$base" ]]; then
  echo "SKIPPED: no merge-base against development/main/master (shallow or detached checkout)" >&2
  exit 2
fi

if ! git -C "$ROOT" cat-file -e "$base:$LEDGER_REL" 2>/dev/null; then
  echo "PASS: $LEDGER_REL is new on this branch; nothing to compare against the merge-base" >&2
  exit 0
fi

MARKER='<!-- Appended below this line'

records() {
  # Only the append region counts. Everything above the marker is documentation,
  # including a worked example whose ids would otherwise collide with real records.
  awk -v m="$MARKER" 'index($0, m) { seen=1; next } seen { print }' |
  # One output line per record: "<id>\t<sha1 of the record body>". Body newlines are
  # folded to \036 inside awk so a multi-line body cannot split the read loop below.
  awk '
    function emit() {
      # Trailing blank lines belong to the gap between records, not to the record.
      # Without this, appending a record would look like a mutation of the previous one.
      sub(/[ \t\036]+$/, "", body)
      printf "%s\t%s\n", id, body
    }
    /^## SI-[0-9]+(-V)?[[:space:]]/ { if (id != "") emit(); id=$2; body=""; next }
    id != "" { body = body $0 "\036" }
    END { if (id != "") emit() }
  ' | while IFS=$'\t' read -r id body; do
      [[ -n "$id" ]] || continue
      printf '%s\t%s\n' "$id" "$(printf '%s' "$body" | shasum | awk '{print $1}')"
    done
}

base_recs="$(git -C "$ROOT" show "$base:$LEDGER_REL" | records | sort)"
head_recs="$(records < "$LEDGER" | sort)"

missing=(); mutated=()
while IFS=$'\t' read -r id sha; do
  [[ -n "$id" ]] || continue
  head_sha="$(awk -F'\t' -v i="$id" '$1==i{print $2}' <<<"$head_recs")"
  if [[ -z "$head_sha" ]]; then
    missing+=("$id")
  elif [[ "$head_sha" != "$sha" ]]; then
    mutated+=("$id")
  fi
done <<<"$base_recs"

if ((${#missing[@]})); then
  printf 'REGRESSION: ledger record removed since the merge-base: %s\n' "${missing[@]}" >&2
  exit 1
fi
if ((${#mutated[@]})); then
  printf 'REGRESSION: ledger record edited in place since the merge-base (append a -V record instead): %s\n' "${mutated[@]}" >&2
  exit 1
fi

echo "PASS: skill-impact.md is tracked, index-invisible, and append-only against the merge-base" >&2
exit 0
