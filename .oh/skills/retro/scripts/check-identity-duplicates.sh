#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$SCRIPT_DIR/../../../.." && pwd)
IDENTITY_FILE="$ROOT/.oh/context/IDENTITY.md"

status=0
while IFS= read -r line; do
  [[ -n "$line" ]] || continue
  normalized=$(printf '%s' "$line" \
    | sed -E 's/^- +//' \
    | sed -E 's/^\*\*[0-9]{4}-[0-9]{2}-[0-9]{2}\*\*: //' \
    | sed -E 's/^[0-9]{4}-[0-9]{2}-[0-9]{2}: //' \
    | sed -E 's/ \[[^]]+\].*$//')
  [[ -n "$normalized" ]] || continue
  if [[ -f "$IDENTITY_FILE" ]] && grep -Fqi -- "$normalized" "$IDENTITY_FILE"; then
    echo "DUPLICATE: $line" >&2
    status=1
    continue
  fi

  if [[ -f "$IDENTITY_FILE" ]]; then
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
