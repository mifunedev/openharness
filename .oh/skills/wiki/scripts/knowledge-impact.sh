#!/usr/bin/env bash
# Dependency-aware knowledge invalidation for .oh/knowledge/.
#
# One implementation, two consumers:
#   /wiki lint       — `--verified`, the source-change freshness check
#   /spec execute    — `--changed <paths>`, the Actual Knowledge Impact gate
#
# A page's `sources:` list IS its dependency declaration. Only the
# repository-relative entries expire: a `raw/<date>-<slug>.md` snapshot is
# immutable and a `<path>@<sha>` pin names a fixed revision, so neither can go
# stale, and neither can a bare upstream URL. `verified_at:` records the commit a
# `kind: repo` page was last checked
# against; anything that touched a declared source after it is a reason to
# re-read the page.
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
usage: knowledge-impact.sh [--verified] [--changed <path>...]
                           [--root <dir>] [--format tsv|slugs]

  --verified          (default) per page, diff its own verified_at against HEAD
  --changed <path>... use this explicit changed-path set (the actual diff).
                      MUST BE LAST — it consumes every remaining argument, so
                      put --root/--format before it.
  --root <dir>        repository root (default: git rev-parse --show-toplevel)
  --format slugs      print only NEEDS-REVIEW slugs, one per line

Output (tsv): <state>\t<slug>\t<page-path>\t<reason>
States: NEEDS-REVIEW | FRESH | NOT-APPLICABLE
Exit: 0 on a completed report (findings are data, not failure), 2 on usage error.
EOF
  exit 2
}

MODE=verified
ROOT=""
FORMAT=tsv
CHANGED=()

while [ $# -gt 0 ]; do
  case "$1" in
    --verified) MODE=verified; shift ;;
    --changed) MODE=changed; shift; CHANGED=("$@"); break ;;
    --root) ROOT="${2:-}"; [ -n "$ROOT" ] || usage; shift 2 ;;
    --format) FORMAT="${2:-}"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "unknown arg: $1" >&2; usage ;;
  esac
done

case "$FORMAT" in tsv|slugs) ;; *) usage ;; esac
[ "$MODE" = changed ] && [ ${#CHANGED[@]} -eq 0 ] && usage

if [ -z "$ROOT" ]; then
  ROOT="$(git rev-parse --show-toplevel)"
fi
ROOT="$(cd "$ROOT" && pwd -P)"
KNOWLEDGE="$ROOT/.oh/knowledge"

if [ ! -d "$KNOWLEDGE" ]; then
  echo "knowledge-impact: no knowledge surface at $KNOWLEDGE" >&2
  exit 0
fi

frontmatter() { awk '/^---$/{f=!f; next} f{print}' "$1"; }

# A sources: entry is a live repository dependency unless it is an immutable
# raw/ snapshot, a <path>@<sha> pin, or a bare upstream URL.
is_repo_dep() {
  case "$1" in
    raw/*) return 1 ;;
    http://*|https://*) return 1 ;;
    *@*) return 1 ;;
    "") return 1 ;;
    *) return 0 ;;
  esac
}

# Does a changed path fall under a declared dependency? Supports an exact path,
# a shell glob, and a bare directory (which covers everything beneath it).
dep_matches() {
  local dep="$1" changed="$2"
  # shellcheck disable=SC2254 # $dep is a deliberate glob pattern
  case "$changed" in
    $dep) return 0 ;;
    "${dep%/}"/*) return 0 ;;
  esac
  return 1
}

emit() {
  if [ "$FORMAT" = slugs ]; then
    [ "$1" = "NEEDS-REVIEW" ] && printf '%s\n' "$2"
    return 0
  fi
  printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4"
}

shopt -s nullglob
pages=("$KNOWLEDGE"/source/*.md "$KNOWLEDGE"/patterns/*.md)
shopt -u nullglob

for page in "${pages[@]}"; do
  base="$(basename "$page")"
  [ "$base" = "README.md" ] && continue
  rel="${page#"$ROOT"/}"
  fm="$(frontmatter "$page")"
  slug="$(grep '^slug:' <<<"$fm" | awk '{print $2}' | head -1 || true)"
  [ -n "$slug" ] || { emit "NEEDS-REVIEW" "$base" "$rel" "no slug: in frontmatter"; continue; }
  kind="$(grep '^kind:' <<<"$fm" | awk '{print $2}' | head -1 || true)"

  if [ "$kind" != "repo" ]; then
    emit "NOT-APPLICABLE" "$slug" "$rel" "kind: ${kind:-unset} — provenance is immutable, freshness does not apply"
    continue
  fi

  verified="$(grep '^verified_at:' <<<"$fm" | awk '{print $2}' | head -1 || true)"
  if [ -z "$verified" ]; then
    emit "NEEDS-REVIEW" "$slug" "$rel" "kind: repo with no verified_at: — freshness cannot be decided"
    continue
  fi

  mapfile -t deps < <(awk '
    /^sources:/ {s=1; next}
    s && /^[[:space:]]*-[[:space:]]/ { sub(/^[[:space:]]*-[[:space:]]*/, ""); print; next }
    s { exit }
  ' <<<"$fm")

  repo_deps=()
  for d in "${deps[@]}"; do
    is_repo_dep "$d" && repo_deps+=("$d")
  done
  if [ ${#repo_deps[@]} -eq 0 ]; then
    emit "NEEDS-REVIEW" "$slug" "$rel" "kind: repo with no repository-relative sources: — nothing to verify against"
    continue
  fi

  case "$MODE" in
    verified)
      hit_reason="declared sources changed since ${verified:0:8}"
      miss_reason="no declared source changed since ${verified:0:8}"
      if ! git -C "$ROOT" cat-file -e "${verified}^{commit}" 2>/dev/null; then
        emit "NEEDS-REVIEW" "$slug" "$rel" "verified_at $verified is not a commit in this repository"
        continue
      fi
      mapfile -t page_changed < <(git -C "$ROOT" diff --name-only "$verified" HEAD)
      ;;
    *)
      hit_reason="declared sources are in the changed set"
      miss_reason="no declared source is in the changed set"
      page_changed=("${CHANGED[@]}")
      ;;
  esac

  hits=()
  for dep in "${repo_deps[@]}"; do
    for c in "${page_changed[@]}"; do
      [ -n "$c" ] || continue
      if dep_matches "$dep" "$c"; then
        hits+=("$dep")
        break
      fi
    done
  done

  if [ ${#hits[@]} -gt 0 ]; then
    emit "NEEDS-REVIEW" "$slug" "$rel" "$hit_reason: $(printf '%s ' "${hits[@]}" | sed 's/ $//')"
  else
    emit "FRESH" "$slug" "$rel" "$miss_reason"
  fi
done
