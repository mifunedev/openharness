#!/usr/bin/env bash
# tier: A
# source: .oh/tasks/spec-simplification/ (issue #816, US-007) — MEMORY.md cited 73 `probe:` ids
#         and NOT ONE of them resolved to a file. Every one was a claim of enforcement that
#         nothing enforced.
# desc: every `probe:` id in MEMORY.md resolves to a real .oh/evals/probes/<id>.sh. A memory
#       entry that names a probe is claiming "this lesson is guarded"; an id that resolves to
#       nothing makes the ledger lie about which lessons are actually protected, which is
#       worse than an entry with no claim at all.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PROBE_DIR="$ROOT/.oh/evals/probes"

# MEMORY.md is gitignored and shared across worktrees: resolve it the way every other
# caller must, through oh-path, which anchors `memory` to the MAIN worktree. Do NOT read
# ${MEMORY_DIR} directly — a relative value there resolves against this probe's CWD and
# would silently check a per-worktree empty ledger (the exact defect US-007 fixed).
MEM_DIR="$(sh "$ROOT/.oh/scripts/oh-path" memory --no-create 2>/dev/null || printf '%s' "$ROOT/.oh/memory")"
MEMORY_FILE="$MEM_DIR/MEMORY.md"

if [[ ! -f "$MEMORY_FILE" ]]; then
  echo "SKIPPED: no MEMORY.md at $MEMORY_FILE (gitignored; absent in a fresh clone)" >&2
  exit 2
fi

# `probe: <id>` — the id may be bare, backticked, or carry a .sh suffix. Trailing ` | basis:`
# and similar metadata are excluded by the character class.
mapfile -t ids < <(grep -oE 'probe:[[:space:]]*`?[A-Za-z0-9._/-]+' "$MEMORY_FILE" \
  | sed -E 's/^probe:[[:space:]]*`?//' \
  | sed -E 's/\.sh$//' \
  | sort -u)

# Partition the cited ids. `probe: none` is the explicit "this lesson is NOT guarded"
# sentinel that .oh/skills/retro/scripts/memory-audit.py writes when it strips an unbacked
# claim — it is the honest state this probe exists to produce, not a claim to resolve. Count
# it separately rather than folding it into the checked set, or the PASS line reports a
# number of verified claims that were never verified.
claimed=()
declared_none=0
for id in "${ids[@]}"; do
  [[ -n "$id" ]] || continue
  if [[ "$id" == "none" ]]; then declared_none=1; continue; fi
  claimed+=("$id")
done

if (( ${#claimed[@]} == 0 )); then
  if (( declared_none )); then
    echo "PASS: MEMORY.md makes no probe claim it cannot back — every field reads \`probe: none\`" >&2
  else
    echo "PASS: MEMORY.md cites no probe: ids, so it claims no enforcement it cannot back" >&2
  fi
  exit 0
fi

unresolved=()
for id in "${claimed[@]}"; do
  [[ -f "$PROBE_DIR/$id.sh" ]] || unresolved+=("$id")
done

if (( ${#unresolved[@]} > 0 )); then
  printf 'REGRESSION: %d of %d probe: id(s) in MEMORY.md resolve to no probe file:\n' \
    "${#unresolved[@]}" "${#claimed[@]}" >&2
  for u in "${unresolved[@]}"; do
    printf '  - probe: %s → .oh/evals/probes/%s.sh (missing)\n' "$u" "$u" >&2
  done
  printf 'Each is a claim that a lesson is guarded when nothing guards it. Strip the field or write the probe.\n' >&2
  exit 1
fi

echo "PASS: all ${#claimed[@]} probe: claim(s) in MEMORY.md resolve to a real .oh/evals/probes/<id>.sh" >&2
exit 0
