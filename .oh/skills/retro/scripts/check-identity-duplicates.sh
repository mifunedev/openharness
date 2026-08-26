#!/usr/bin/env bash
set -euo pipefail

# Reads proposed IDENTITY lines from stdin and reports lines whose lesson text
# already appears in .oh/context/IDENTITY.md. Exact enough to catch
# double-writes without making subjective semantic judgments.
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$SCRIPT_DIR/../../../.." && pwd)
IDENTITY_FILE="$ROOT/.oh/context/IDENTITY.md"

status=0
while IFS= read -r line; do
  [[ -n "$line" ]] || continue
  # Strip common bullet/date prefixes and metadata after the first bracket tag.
  normalized=$(printf '%s' "$line" \
    | sed -E 's/^- +//' \
    | sed -E 's/^\*\*[0-9]{4}-[0-9]{2}-[0-9]{2}\*\*: //' \
    | sed -E 's/^[0-9]{4}-[0-9]{2}-[0-9]{2}: //' \
    | sed -E 's/ \[[^]]+\].*$//')
  [[ -n "$normalized" ]] || continue
  # Pass 1 — exact (fixed-string, case-insensitive). Cheap and certain.
  if [[ -f "$IDENTITY_FILE" ]] && grep -Fqi -- "$normalized" "$IDENTITY_FILE"; then
    echo "DUPLICATE: $line" >&2
    status=1
    continue
  fi

  # Pass 2 — REPHRASED. `grep -Fqi` alone only catches a byte-identical restatement, so
  # reordering a clause or swapping two words slipped a duplicate straight through, which
  # is how the same lesson lands three times in different words. Compare content-word
  # SETS instead: reduce both sides to lowercase words, drop stopwords and anything
  # shorter than 4 characters, and flag when a high proportion of the proposal's distinct
  # content words already co-occur in a single existing entry.
  #
  # Deliberately still not semantic: this is a set-overlap heuristic, not a judgment about
  # meaning. It reports a candidate for a human to confirm — the propose-then-confirm gate
  # is what decides.
  if [[ -f "$IDENTITY_FILE" ]]; then
    # thresh/minhits calibrated against the real file, both directions: a human
    # rephrasing of an existing entry scored 0.56 and a synthetic one reusing the entry's
    # own content words scored 0.82, while 8 lessons from domains this harness has never
    # recorded topped out at 0.20. 0.50 sits in that gap with margin on both sides. The
    # hit floor stops a 5-word proposal from matching on two incidental words.
    hit=$(printf '%s\n' "$normalized" | awk -v thresh=0.50 -v minhits=5 '
      function words(str, out,   n, i, w, arr) {
        n = split(tolower(str), arr, /[^a-z0-9]+/)
        for (i = 1; i <= n; i++) {
          w = arr[i]
          if (length(w) < 4) continue
          if (w ~ /^(this|that|with|from|when|then|than|they|them|their|there|here|have|has|had|been|being|were|will|would|should|could|must|never|always|into|onto|over|under|only|also|such|very|more|most|less|least|each|every|some|both|same|other|does|done|make|made|used|using|use|the|and|but|for|not|are|was|its)$/) continue
          out[w] = 1
        }
      }
      NR == FNR { words($0, want); next }
      { delete got; words($0, got)
        hits = 0; total = 0
        for (w in want) { total++; if (w in got) hits++ }
        if (total >= 5 && hits >= minhits && hits / total >= thresh) { print FILENAME ":" FNR; exit }
      }
    ' - "$IDENTITY_FILE" 2>/dev/null || true)
    if [[ -n "$hit" ]]; then
      echo "NEAR-DUPLICATE: $line" >&2
      echo "  ↳ overlaps an existing entry at $hit — confirm before writing" >&2
      status=1
    fi
  fi
done
exit "$status"
