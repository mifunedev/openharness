#!/usr/bin/env bash
# tier: A
# source: issue #900 (slim the sandbox image) 2026-08-30
# desc: The baked home seed ships no build caches (~/.npm, ~/.cache/uv are purged before the seed is staged) and the build context excludes .pnpm-store and the .pi build outputs
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DOCKERFILE="$ROOT/.devcontainer/Dockerfile"
DOCKERIGNORE="$ROOT/.dockerignore"

for f in "$DOCKERFILE" "$DOCKERIGNORE"; do
  [[ -f "$f" ]] || { echo "SKIPPED: missing $f" >&2; exit 2; }
done

fails=()

instructions="$(grep -nvE '^[[:space:]]*(#|$)' "$DOCKERFILE" || true)"

first_line_matching() {
  printf '%s\n' "$instructions" | { grep -E "$1" || true; } | head -n1 | cut -d: -f1
}

stage_line="$(first_line_matching '/opt/home-seed')"

if [[ -z "$stage_line" ]]; then
  fails+=("Dockerfile must stage the baked home at /opt/home-seed (no instruction mentions it)")
  stage_line=$(( $(wc -l < "$DOCKERFILE") + 1 ))
fi

# Each cache is identified by any spelling that resolves to the same path:
# the literal path, the $HOME-relative form, or the ENV var the Dockerfile pins.
npm_cache_re='rm -rf[^;&|]*(/home/sandbox/\.npm|\$\{?HOME\}?/\.npm)([[:space:]]|/|$)'
uv_cache_re='rm -rf[^;&|]*(/home/sandbox/\.cache/uv|\$\{?HOME\}?/\.cache/uv|\$\{?UV_CACHE_DIR\}?)([[:space:]]|/|$)'

check_purge() {
  local label="$1" re="$2" line
  line="$(first_line_matching "$re")"
  if [[ -z "$line" ]]; then
    fails+=("Dockerfile never removes the $label build cache from /home/sandbox; it ships inside the home seed staged at /opt/home-seed")
  elif (( line >= stage_line )); then
    fails+=("Dockerfile removes the $label build cache at line $line, at or after the seed is staged at /opt/home-seed (line $stage_line); the purge must run before staging (and, in a multi-stage build, inside the stage that produces the home)")
  fi
}

check_purge "npm (~/.npm)" "$npm_cache_re"
check_purge "uv (~/.cache/uv)" "$uv_cache_re"

ignored() {
  grep -qE "^[[:space:]]*(\*\*/)?$1/?[[:space:]]*$" "$DOCKERIGNORE"
}

ignored '\.pnpm-store' \
  || fails+=(".dockerignore must exclude .pnpm-store — a multi-GB gitignored pnpm content-addressable store that otherwise ships to the daemon on every local build")

for out in '\.pi/bridge' '\.pi/npm'; do
  ignored "$out" \
    || fails+=(".dockerignore must exclude ${out//\\/} — an untracked .pi build output (see .pi/.gitignore)")
done

# The .pi exclusions must be surgical: /opt/oh-seed still needs every tracked
# .pi file, so a blanket .pi exclusion without re-includes is a regression.
if grep -qE '^[[:space:]]*(\*\*/)?\.pi/?[[:space:]]*$' "$DOCKERIGNORE" \
   && ! grep -qE '^[[:space:]]*!\.pi/' "$DOCKERIGNORE"; then
  fails+=(".dockerignore excludes all of .pi/ without re-including the tracked files /opt/oh-seed needs; follow the exclude-then-re-include pattern already used for .claude/*")
fi

if command -v git >/dev/null 2>&1 && git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  while IFS= read -r tracked; do
    case "$tracked" in
      .pi/bridge/*|.pi/npm/*|.pnpm-store/*)
        fails+=(".dockerignore excludes '$tracked', which is tracked in git and must reach the build context")
        ;;
    esac
  done < <(git -C "$ROOT" ls-files .pi .pnpm-store)
fi

if (( ${#fails[@]} > 0 )); then
  echo "REGRESSION: sandbox image seed hygiene broken:" >&2
  printf '  - %s\n' "${fails[@]}" >&2
  exit 1
fi

echo "PASS: the Dockerfile purges ~/.npm and ~/.cache/uv before the home is staged at /opt/home-seed, and .dockerignore keeps .pnpm-store and the .pi build outputs out of the build context without dropping any tracked .pi file" >&2
exit 0
