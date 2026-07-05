#!/usr/bin/env bash
# tier: A
# source: .oh/tasks/image-only-deploy/prd.json US-004 (issue #609, Flavor B image-only deploy)
# desc: guards the Flavor B (image-only, no-checkout) contract — entrypoint.sh
#   gates its no-bind branch on OH_IMAGE_ONLY strictly BEFORE the host-UID-sync
#   elif, and defines seed_workspace_volume/.image-seeded; a behavioral sim
#   (fenced function extracted in isolation, no full entrypoint source) proves
#   fresh-seed, idempotent-reseed, and no-clobber-of-existing-.oh/ behavior;
#   docker-compose.image-only.yml mounts a named oh_workspace volume, sets
#   OH_IMAGE_ONLY=1, parameterizes image:, sets pull_policy:, and has neither
#   build: nor a `..:` bind mount; the primary docker-compose.yml still keeps
#   its `..:` bind mount (regression floor); the deploy doc has dropped the
#   "Not yet" placeholder and documents oh_workspace/OH_IMAGE_ONLY; the
#   Dockerfile (if present) stages /opt/oh-seed for the entrypoint to seed from.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ENTRYPOINT="$ROOT/.devcontainer/entrypoint.sh"
COMPOSE_IO="$ROOT/.devcontainer/docker-compose.image-only.yml"
COMPOSE_PRIMARY="$ROOT/.devcontainer/docker-compose.yml"
DOCKERFILE="$ROOT/.devcontainer/Dockerfile"
DOC="$ROOT/.oh/docs/deployment-prebuilt-image.md"

# SKIPPED (exit 2): Flavor B (image-only) artifacts are not present on this
# branch yet — do not REGRESSION on absence.
if [[ ! -f "$COMPOSE_IO" ]] || [[ ! -f "$ENTRYPOINT" ]] || ! grep -q 'OH_IMAGE_ONLY' "$ENTRYPOINT"; then
  echo "SKIPPED: Flavor B (image-only) artifacts not present (docker-compose.image-only.yml and/or entrypoint.sh OH_IMAGE_ONLY gate absent)" >&2
  exit 2
fi

fails=()

# (1) entrypoint.sh: the OH_IMAGE_ONLY gate must appear strictly BEFORE the
#     host-UID-sync `elif [ -d "$HARNESS_DIR" ]` branch, and the seed helper
#     + its marker must be present.
# NOTE: each pipe is `|| true`-guarded at the statement level — under
# `pipefail`, a no-match `grep -n` (exit 1) makes the WHOLE pipeline's exit
# status non-zero even though `head`/`cut` succeed on empty input, which
# would otherwise abort the script under `set -e` with no named failure.
gate_line="$(grep -n 'if \[.*OH_IMAGE_ONLY' "$ENTRYPOINT" | head -1 | cut -d: -f1)" || true
elif_line="$(grep -n 'elif \[ -d "\$HARNESS_DIR" \]' "$ENTRYPOINT" | head -1 | cut -d: -f1)" || true
if [[ -z "$gate_line" ]] || [[ -z "$elif_line" ]] || (( gate_line >= elif_line )); then
  fails+=("entrypoint.sh must gate the no-bind branch on OH_IMAGE_ONLY strictly BEFORE elif [ -d \"\$HARNESS_DIR\" ] (host UID sync path)")
fi
grep -Fq 'seed_workspace_volume' "$ENTRYPOINT" \
  || fails+=("entrypoint.sh must define/call seed_workspace_volume")
grep -Fq '.image-seeded' "$ENTRYPOINT" \
  || fails+=("entrypoint.sh must reference the .image-seeded marker")

# (2) BEHAVIORAL seed sim — extract ONLY the fenced seed_workspace_volume
#     function (entrypoint.sh ends in `exec "$@"`, so we never source the
#     whole file) and run it against real mktemp -d dirs.
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

seed_fn_file="$tmp/seed_workspace_volume.sh"
awk '
  /# >>> seed_workspace_volume >>>/ { flag=1; next }
  /# <<< seed_workspace_volume <<</ { flag=0 }
  flag
' "$ENTRYPOINT" > "$seed_fn_file"

if [[ ! -s "$seed_fn_file" ]] || ! grep -Fq 'seed_workspace_volume()' "$seed_fn_file"; then
  fails+=("seed_workspace_volume fence markers missing — cannot run behavioral sim")
else
  # shellcheck disable=SC1090
  source "$seed_fn_file"
  if ! declare -F seed_workspace_volume >/dev/null 2>&1; then
    fails+=("seed_workspace_volume fence markers missing — cannot run behavioral sim")
  else
    fixture="$tmp/fixture-src"
    mkdir -p "$fixture/.oh"
    echo "fixture-sentinel-$$" > "$fixture/.oh/SENTINEL_FIXTURE"
    export OH_IMAGE_SEED_SRC="$fixture"

    # (a) fresh empty dest: seeds .oh/, writes the marker, flags this-boot.
    dest_a="$(mktemp -d "$tmp/dest-a.XXXXXX")"
    if seed_workspace_volume "$dest_a"; then :; fi
    if [[ ! -d "$dest_a/.oh" ]] || [[ ! -f "$dest_a/.oh/.image-seeded" ]] \
       || [[ "${OH_IMAGE_SEEDED_THIS_BOOT:-}" != "1" ]]; then
      fails+=("seed sim (a): fresh empty dest must seed .oh/, write the .image-seeded marker, and set OH_IMAGE_SEEDED_THIS_BOOT=1")
    fi

    # (b) second call on the same (now-seeded) dest: idempotent, no re-copy.
    if seed_workspace_volume "$dest_a"; then :; fi
    if [[ "${OH_IMAGE_SEEDED_THIS_BOOT:-}" != "0" ]]; then
      fails+=("seed sim (b): a second call on an already-seeded dest must be idempotent (OH_IMAGE_SEEDED_THIS_BOOT=0, no re-copy)")
    fi

    # (c) fresh dest pre-populated with its OWN .oh/ (distinct sentinel, no
    #     marker): existing content is preserved and the fixture is NOT
    #     copied in (no clobber of a populated-but-unmarked volume).
    dest_c="$(mktemp -d "$tmp/dest-c.XXXXXX")"
    mkdir -p "$dest_c/.oh"
    echo "own-sentinel-$$" > "$dest_c/.oh/OWN_SENTINEL"
    if seed_workspace_volume "$dest_c"; then :; fi
    if [[ ! -f "$dest_c/.oh/OWN_SENTINEL" ]]; then
      fails+=("seed sim (c): pre-existing .oh/ content must be preserved (no-clobber guard)")
    fi
    if [[ -f "$dest_c/.oh/SENTINEL_FIXTURE" ]]; then
      fails+=("seed sim (c): fixture sentinel must NOT be copied into a dest that already has its own .oh/ (no-clobber guard)")
    fi
  fi
fi

# (3) docker-compose.image-only.yml shape: named volume mount, OH_IMAGE_ONLY=1,
#     parameterized image:, a pull_policy:, and NO build:/`..:` bind mount.
grep -Eq '^[[:space:]]*-[[:space:]]*oh_workspace:\$\{OH_PROJECT_ROOT' "$COMPOSE_IO" \
  || fails+=("docker-compose.image-only.yml must mount a named oh_workspace volume at \${OH_PROJECT_ROOT}")
grep -Fq 'OH_IMAGE_ONLY=1' "$COMPOSE_IO" \
  || fails+=("docker-compose.image-only.yml must set OH_IMAGE_ONLY=1 in the container environment")
grep -Eq 'image:[[:space:]]*\$\{OH_SANDBOX_IMAGE' "$COMPOSE_IO" \
  || fails+=("docker-compose.image-only.yml image: must interpolate \${OH_SANDBOX_IMAGE...}")
grep -Eq '^[[:space:]]*pull_policy:' "$COMPOSE_IO" \
  || fails+=("docker-compose.image-only.yml must set a pull_policy:")
if grep -Eq '^[[:space:]]*build:' "$COMPOSE_IO"; then
  fails+=("docker-compose.image-only.yml must NOT have a build: block (image-only, never builds locally)")
fi
if grep -Eq '^[[:space:]]*-[[:space:]]*\.\.:' "$COMPOSE_IO"; then
  fails+=("docker-compose.image-only.yml must NOT have a '..:' bind mount (no checkout)")
fi

# (4) REGRESSION FLOOR: the primary docker-compose.yml must still keep its
#     `..:` bind mount — Flavor B must not touch Flavor A's contract.
if [[ ! -f "$COMPOSE_PRIMARY" ]]; then
  fails+=("primary docker-compose.yml not found at $COMPOSE_PRIMARY")
else
  grep -Eq '^[[:space:]]*-[[:space:]]*\.\.:' "$COMPOSE_PRIMARY" \
    || fails+=("docker-compose.yml lost its '..:' bind mount — regression floor broken")
fi

# (5) Deploy doc: placeholder gone, mentions oh_workspace + OH_IMAGE_ONLY.
if [[ ! -f "$DOC" ]]; then
  fails+=("deploy doc not found at $DOC")
else
  not_yet_count="$(grep -c "Not yet" "$DOC" || true)"
  if [[ "${not_yet_count:-0}" -ne 0 ]]; then
    fails+=("deployment-prebuilt-image.md still contains the 'Not yet' placeholder (${not_yet_count} occurrence(s))")
  fi
  grep -Fq 'oh_workspace' "$DOC" \
    || fails+=("deployment-prebuilt-image.md must mention oh_workspace")
  grep -Fq 'OH_IMAGE_ONLY' "$DOC" \
    || fails+=("deployment-prebuilt-image.md must mention OH_IMAGE_ONLY")
fi

# (6) Dockerfile: if present, it must stage /opt/oh-seed for the entrypoint
#     to seed from. SKIP just this sub-check if the Dockerfile is absent.
if [[ -f "$DOCKERFILE" ]]; then
  grep -Eq 'COPY.*/opt/oh-seed' "$DOCKERFILE" \
    || fails+=("Dockerfile must stage the seed source (COPY ... /opt/oh-seed/)")
else
  echo "[oh-image-only-deploy] Dockerfile not present — skipping /opt/oh-seed staging sub-check" >&2
fi

if (( ${#fails[@]} > 0 )); then
  echo "REGRESSION: Flavor B (image-only deploy) contract broken:" >&2
  printf '  - %s\n' "${fails[@]}" >&2
  exit 1
fi

echo "PASS: Flavor B (image-only) contract — entrypoint gates OH_IMAGE_ONLY before the host-UID-sync elif and defines seed_workspace_volume/.image-seeded; behavioral sim confirms fresh-seed, idempotent-reseed, and no-clobber-of-existing-.oh/; docker-compose.image-only.yml mounts oh_workspace, sets OH_IMAGE_ONLY=1, parameterizes image:/pull_policy:, and has no build:/'..:' bind mount; primary docker-compose.yml still binds '..:' (regression floor); deploy doc drops the 'Not yet' placeholder and documents oh_workspace/OH_IMAGE_ONLY; Dockerfile stages /opt/oh-seed" >&2
exit 0
