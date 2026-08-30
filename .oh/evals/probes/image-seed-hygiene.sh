#!/usr/bin/env bash
# tier: A
# source: issue #900 (slim the sandbox image) 2026-08-30
# desc: The baked home seed ships no build caches (~/.npm, ~/.cache/uv are purged inside the stage the seed is copied from), /opt/home-seed keeps the 0700 mode of the home it replaces, and the build context excludes .pnpm-store and the .pi build outputs
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DOCKERFILE="$ROOT/.devcontainer/Dockerfile"
DOCKERIGNORE="$ROOT/.dockerignore"

for f in "$DOCKERFILE" "$DOCKERIGNORE"; do
  [[ -f "$f" ]] || { echo "SKIPPED: missing $f" >&2; exit 2; }
done

fails=()

instructions="$(grep -nvE '^[[:space:]]*(#|$)' "$DOCKERFILE" || true)"

declare -A line_stage=()
declare -A stage_defined=()
cur_stage='<unnamed>'
while IFS= read -r entry; do
  [[ -n "$entry" ]] || continue
  ln="${entry%%:*}"
  text="${entry#*:}"
  if [[ "$text" =~ ^[[:space:]]*[Ff][Rr][Oo][Mm][[:space:]] ]]; then
    if [[ "$text" =~ [[:space:]][Aa][Ss][[:space:]]+([A-Za-z0-9_.-]+)[[:space:]]*$ ]]; then
      cur_stage="${BASH_REMATCH[1]}"
    else
      cur_stage='<unnamed>'
    fi
    stage_defined["$cur_stage"]=1
  fi
  line_stage["$ln"]="$cur_stage"
done <<< "$instructions"

mv_re='^[[:space:]]*RUN[[:space:]]+mv[[:space:]]+/home/sandbox[[:space:]]+/opt/home-seed[[:space:]]*$'
copy_re='^[[:space:]]*COPY[[:space:]].*--from=([^[:space:]]+).*[[:space:]]/home/sandbox[[:space:]]+/opt/home-seed[[:space:]]*$'

stage_line=""
seed_stage=""
seed_form=""
while IFS= read -r entry; do
  [[ -n "$entry" ]] || continue
  ln="${entry%%:*}"
  text="${entry#*:}"
  if [[ "$text" =~ $mv_re ]]; then
    stage_line="$ln"; seed_form="mv"; seed_stage="${line_stage[$ln]}"; break
  fi
  if [[ "$text" =~ $copy_re ]]; then
    stage_line="$ln"; seed_form="copy"; seed_stage="${BASH_REMATCH[1]}"; break
  fi
done <<< "$instructions"

if [[ -z "$stage_line" ]]; then
  fails+=("Dockerfile must stage the baked home at /opt/home-seed with 'RUN mv /home/sandbox /opt/home-seed' or 'COPY --from=<stage> /home/sandbox /opt/home-seed' (no instruction does)")
elif [[ "$seed_form" == "copy" && -z "${stage_defined[$seed_stage]:-}" ]]; then
  fails+=("the /opt/home-seed staging COPY at line $stage_line sources --from=$seed_stage, which is not a stage defined in this Dockerfile; the seed must come from a stage this build produces")
  stage_line=""
fi

npm_cache_re='rm -rf[^;&|]*(/home/sandbox/\.npm|\$\{?HOME\}?/\.npm)([[:space:]]|/|$)'
uv_cache_re='rm -rf[^;&|]*(/home/sandbox/\.cache/uv|\$\{?HOME\}?/\.cache/uv|\$\{?UV_CACHE_DIR\}?)([[:space:]]|/|$)'

check_purge() {
  local label="$1" re="$2" entry ln found_any="" ok=""
  [[ -n "$stage_line" ]] || return 0
  while IFS= read -r entry; do
    [[ -n "$entry" ]] || continue
    ln="${entry%%:*}"
    [[ "${entry#*:}" =~ $re ]] || continue
    found_any=1
    [[ "${line_stage[$ln]}" == "$seed_stage" ]] || continue
    if [[ "$seed_form" == "mv" ]] && (( ln >= stage_line )); then continue; fi
    ok=1
  done <<< "$instructions"

  if [[ -z "$found_any" ]]; then
    fails+=("Dockerfile never removes the $label build cache from /home/sandbox; it ships inside the home seed staged at /opt/home-seed")
  elif [[ -z "$ok" && "$seed_form" == "mv" ]]; then
    fails+=("Dockerfile removes the $label build cache at or after the home is staged at /opt/home-seed (line $stage_line); the purge must run before staging")
  elif [[ -z "$ok" ]]; then
    fails+=("Dockerfile removes the $label build cache, but not inside the stage '$seed_stage' whose /home/sandbox becomes the seed staged at /opt/home-seed (line $stage_line); a purge in any other stage leaves the shipped seed unchanged")
  fi
}

check_purge "npm (~/.npm)" "$npm_cache_re"
check_purge "uv (~/.cache/uv)" "$uv_cache_re"

if [[ -n "$stage_line" ]] \
   && ! grep -qE 'chmod([[:space:]]+-[^[:space:]]+)*[[:space:]]+0?700[[:space:]]+/opt/home-seed([[:space:]]|$)' "$DOCKERFILE" \
   && ! grep -qE '^[[:space:]]*COPY[[:space:]].*--chmod=0?700.*[[:space:]]/opt/home-seed([[:space:]]|$)' "$DOCKERFILE"; then
  fails+=("/opt/home-seed must be mode 0700, matching the 0700 Debian useradd -m home it replaces; 'COPY --from' creates the destination 0755 and --chown does not restore the mode, so the final stage must chmod it")
fi

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

echo "PASS: the Dockerfile purges ~/.npm and ~/.cache/uv inside the stage whose /home/sandbox becomes the seed staged at /opt/home-seed, stages that seed 0700, and .dockerignore keeps .pnpm-store and the .pi build outputs out of the build context without dropping any tracked .pi file" >&2
exit 0
