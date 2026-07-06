#!/bin/sh
# ensure-memory-file.sh — idempotently seed the durable lessons file.
#
# .oh/memory/MEMORY.md is the long-term "Lessons Learned" ledger the /retro
# skill appends to and CLAUDE.md's session-start reads. It is gitignored
# (local per-instance state), so a fresh clone / fresh sandbox starts WITHOUT
# it — and an unconditional read (session start, retro dedup) then hits ENOENT.
#
# This script creates the file with its canonical header IF AND ONLY IF it is
# missing. It never touches an existing file, so it is safe to run on every
# boot and from any skill. The memory directory is resolved through oh-path so
# it honors paths.memory / MEMORY_DIR exactly like every other caller.
#
# Usage:  ensure-memory-file.sh        # seed if missing, print path
set -eu

_script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd -P)

# Resolve the memory dir via the shared resolver; fall back to the default.
_root=$(dirname -- "$(dirname -- "$_script_dir")")   # <root>/.oh/scripts -> <root>
_mem="$(sh "$_script_dir/oh-path" memory 2>/dev/null || printf '%s' "$_root/.oh/memory")"
mkdir -p "$_mem"

_file="$_mem/MEMORY.md"
if [ -f "$_file" ]; then
    printf '%s\n' "$_file"
    exit 0
fi

cat > "$_file" <<'EOF'
# Memory — Lessons Learned

Durable, distilled lessons for this harness instance. The `/retro` skill
appends supported findings here under `## Lessons Learned`, one bullet per
lesson (`- **YYYY-MM-DD**: <lesson>`). This file is gitignored and local to
this instance; it is auto-seeded by `.oh/scripts/ensure-memory-file.sh` when
missing. A lesson graduates to `.oh/context/IDENTITY.md` once it recurs across
sessions. See `.oh/skills/retro/references/memory-protocol.md`.

## Lessons Learned
EOF

printf '%s\n' "$_file"
