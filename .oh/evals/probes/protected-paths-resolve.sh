#!/usr/bin/env bash
# tier: A
# source: issue #753 — .claude/protected-paths.txt named 7 paths that did not exist.
#         `cloudflared-tunnel` was listed while the skill is `cloudflared`, so
#         /cloudflared had no protection at all; four `spec-*` entries had never been
#         directories (the dispatcher implements them as spec/references/*.md);
#         `.oh/install/cloudflared-tunnel.sh` was deleted; and
#         `.claude/specs/structure-spec-v0.7.md` sat under a gitignored path
#         (.gitignore:66) that could never resolve. A guard entry that matches nothing
#         protects nothing AND reads identical to one that passes, so a rename
#         silently disarms it. Only a resolution check catches the next one.
# desc: every entry in .claude/protected-paths.txt resolves to a file or directory
#       that exists, so a rename cannot silently disarm a protection
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"; cd "$ROOT"
LIST=".claude/protected-paths.txt"

[ -f "$LIST" ] || { echo "REGRESSION: $LIST is missing" >&2; exit 1; }

broken=()
count=0

# Entry format, per the file's own header: bare names are skills; everything else
# is a repo-relative path. `Makefile` is the one slash-free non-skill entry, so a
# slash-free entry resolves as either a skill directory or a repo-root path.
while IFS= read -r raw || [ -n "$raw" ]; do
  line="${raw%%#*}"                              # strip trailing comment
  line="${line#"${line%%[![:space:]]*}"}"        # ltrim
  line="${line%"${line##*[![:space:]]}"}"        # rtrim
  [ -n "$line" ] || continue
  count=$((count + 1))
  case "$line" in
    */*)
      [ -e "$line" ] || broken+=("$line  (path does not exist)")
      ;;
    *)
      if [ ! -d ".oh/skills/$line" ] && [ ! -e "$line" ]; then
        broken+=("$line  (no .oh/skills/$line directory, and no such repo-root path)")
      fi
      ;;
  esac
done < "$LIST"

[ "$count" -gt 0 ] || { echo "REGRESSION: $LIST parsed to zero entries" >&2; exit 1; }

if ((${#broken[@]})); then
  printf 'REGRESSION: %d entry/entries in %s resolve to nothing:\n' "${#broken[@]}" "$LIST" >&2
  printf '  %s\n' "${broken[@]}" >&2
  echo 'A guard entry that matches nothing protects nothing, and reads identical to one that passes.' >&2
  exit 1
fi

echo "PASS: all $count entries in $LIST resolve" >&2
