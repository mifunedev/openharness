#!/usr/bin/env bash
# tier: A
# source: issue #898 (single $HOME mount) 2026-08-30
# desc: One mount at /home/sandbox replaces the per-tool auth volumes; seed_home populates it for both mount kinds; the UID repair prunes the checkout instead of relying on -xdev
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
COMPOSE_PRIMARY="$ROOT/.devcontainer/docker-compose.yml"
COMPOSE_IO="$ROOT/.devcontainer/docker-compose.image-only.yml"
ENTRYPOINT="$ROOT/.devcontainer/entrypoint.sh"
DOCKERFILE="$ROOT/.devcontainer/Dockerfile"

for f in "$COMPOSE_PRIMARY" "$COMPOSE_IO" "$ENTRYPOINT" "$DOCKERFILE"; do
  [[ -f "$f" ]] || { echo "SKIPPED: missing $f" >&2; exit 2; }
done

fails=()

RETIRED_VOLUMES=(claude-auth codex-auth pi-auth opencode-auth grok-auth
  herdr-data cloudflared-auth ssh-config config-dir
  cc-safety-net oh_workspace)

for compose in "$COMPOSE_PRIMARY" "$COMPOSE_IO"; do
  label="$(basename "$compose")"

  home_mounts="$(grep -cE '^[[:space:]]*-[[:space:]]*[^[:space:]]+:/home/sandbox$' "$compose" || true)"
  if [[ "${home_mounts:-0}" -ne 1 ]]; then
    fails+=("$label must have exactly one mount targeting /home/sandbox (found ${home_mounts:-0})")
  fi

  grep -Eq '^[[:space:]]*-[[:space:]]*\$\{OH_HOME_MOUNT:-workspace\}:/home/sandbox$' "$compose" \
    || fails+=("$label must mount \${OH_HOME_MOUNT:-workspace} at /home/sandbox so a blank oh.json storage.homePath falls back to the named volume")

  grep -qE '^  workspace:$' "$compose" \
    || fails+=("$label must declare the top-level named volume 'workspace' (compose prefixes it with the project name)")

  if grep -qE '^[[:space:]]*name:[[:space:]]*\S+' <(sed -n '/^volumes:/,$p' "$compose"); then
    fails+=("$label must not pin an explicit volume name: the project name: key supplies the <sandbox-name>_ prefix, and a pinned name removes it")
  fi

  for vol in "${RETIRED_VOLUMES[@]}"; do
    if grep -qE "^[[:space:]]*-?[[:space:]]*${vol}:" "$compose"; then
      fails+=("$label still references the retired per-tool volume '${vol}'")
    fi
  done
done

grep -Eq '^[[:space:]]*-[[:space:]]*\.\.:/home/sandbox/harness$' "$COMPOSE_PRIMARY" \
  || fails+=("docker-compose.yml must bind the checkout at the fixed path /home/sandbox/harness, nested inside the home mount")

if grep -qE '^[[:space:]]*-[[:space:]]*\.\.:' "$COMPOSE_IO"; then
  fails+=("docker-compose.image-only.yml must NOT bind a checkout — the workspace is a directory inside the home mount")
fi

dockerfile_stages="$(grep -oiE '^[[:space:]]*FROM[[:space:]]+[^[:space:]]+[[:space:]]+AS[[:space:]]+[A-Za-z0-9_.-]+[[:space:]]*$' "$DOCKERFILE" | awk '{print $NF}')"
seed_copy="$(grep -E '^[[:space:]]*COPY[[:space:]].*--from=[^[:space:]]+.*[[:space:]]/home/sandbox[[:space:]]+/opt/home-seed[[:space:]]*$' "$DOCKERFILE" | head -n1)"
seed_from="$(printf '%s' "$seed_copy" | grep -oE -- '--from=[^[:space:]]+' | head -n1 | cut -d= -f2)"

if grep -Eq '^[[:space:]]*RUN[[:space:]]+mv[[:space:]]+/home/sandbox[[:space:]]+/opt/home-seed[[:space:]]*$' "$DOCKERFILE"; then
  :
elif [[ -z "$seed_from" ]]; then
  fails+=("Dockerfile must stage the baked home at /opt/home-seed (RUN mv, or COPY --from=<stage> /home/sandbox /opt/home-seed) so a host bind and a named volume are seeded identically")
elif ! printf '%s\n' "$dockerfile_stages" | grep -qxF "$seed_from"; then
  fails+=("the /opt/home-seed staging COPY sources --from=$seed_from, which is not a stage defined in this Dockerfile; an external image's /home/sandbox is not the home this build bakes")
elif [[ "$seed_from" == "base" ]]; then
  fails+=("the /opt/home-seed staging COPY sources --from=base, whose /home/sandbox is bare useradd -m skel; the seed must come from the stage that bakes the dotfiles, agent state, and toolchain homes")
fi
grep -Fq 'install -d -o sandbox -g sandbox -m 0755 /home/sandbox' "$DOCKERFILE" \
  || fails+=("Dockerfile must leave /home/sandbox empty after staging the seed (an empty named volume must not auto-copy)")
grep -Fq 'rm -rf /opt/home-seed/harness' "$DOCKERFILE" \
  || fails+=("Dockerfile must drop harness/ from the seed, or seed_home would create an empty directory under the checkout bind")

if grep -E -- '-xdev' "$ENTRYPOINT" | grep -Fq '/home/sandbox'; then
  fails+=("entrypoint.sh must not use -xdev under /home/sandbox: once home is a mount it shares a device with the checkout and stops pruning it")
fi
grep -Fq 'find /home/sandbox -path "$OH_PROJECT_ROOT" -prune -o' "$ENTRYPOINT" \
  || fails+=("entrypoint.sh must prune \$OH_PROJECT_ROOT explicitly when repairing home ownership")

# ── behavioral sim of the fenced seed_home ────────────────────────────
seed_fn_file="$(mktemp)"
trap 'rm -rf "$seed_fn_file" "${simdir:-}"' EXIT
awk '/^# >>> seed_home >>>$/{f=1;next} /^# <<< seed_home <<<$/{f=0} f' "$ENTRYPOINT" > "$seed_fn_file"

if [[ ! -s "$seed_fn_file" ]]; then
  fails+=("entrypoint.sh must define seed_home inside the '# >>> seed_home >>>' fence so this probe can exercise it")
else
  simdir="$(mktemp -d)"
  src="$simdir/seed"; mkdir -p "$src/.oh-my-zsh"
  printf 'baked\n' > "$src/.zshrc"
  printf 'baked\n' > "$src/.oh-my-zsh/marker"

  # (a) fresh dest gets the whole baked home
  dest_a="$simdir/a"
  ( set -e; source "$seed_fn_file"; OH_HOME_SEED_SRC="$src" seed_home "$dest_a" )
  [[ -f "$dest_a/.zshrc" && -f "$dest_a/.oh-my-zsh/marker" ]] \
    || fails+=("seed sim (a): an empty home mount must receive the baked dotfiles")

  # (b) operator state is never clobbered, and new files still backfill
  dest_b="$simdir/b"; mkdir -p "$dest_b"
  printf 'mine\n' > "$dest_b/.zshrc"
  ( set -e; source "$seed_fn_file"; OH_HOME_SEED_SRC="$src" seed_home "$dest_b" )
  [[ "$(cat "$dest_b/.zshrc")" == "mine" ]] \
    || fails+=("seed sim (b): seed_home must never clobber an existing file")
  [[ -f "$dest_b/.oh-my-zsh/marker" ]] \
    || fails+=("seed sim (b): seed_home must still backfill files the dest lacks, so image upgrades land")

  # (b2) an existing top-level DIRECTORY is left entirely alone — mode
  # included. A plain `cp -a -n` skips existing files but still rewrites the
  # mode of directories, silently relaxing ~/.ssh from 0700 on every boot.
  mkdir -p "$src/.ssh"; chmod 755 "$src/.ssh"
  printf 'baked\n' > "$src/.ssh/known_hosts"
  dest_b2="$simdir/b2"; mkdir -p "$dest_b2/.ssh"; chmod 700 "$dest_b2/.ssh"
  ( set -e; source "$seed_fn_file"; OH_HOME_SEED_SRC="$src" seed_home "$dest_b2" )
  [[ "$(stat -c %a "$dest_b2/.ssh")" == "700" ]] \
    || fails+=("seed sim (b2): seed_home must not rewrite the mode of a directory the home mount already has")
  [[ ! -e "$dest_b2/.ssh/known_hosts" ]] \
    || fails+=("seed sim (b2): seed_home must not descend into an existing top-level entry — seeding is per top-level entry, so a whole-tree walk would re-copy the uv cache on every boot")

  # (b3) a top-level directory the mount lacks arrives whole, with its mode
  dest_b3="$simdir/b3"
  ( set -e; source "$seed_fn_file"; OH_HOME_SEED_SRC="$src" seed_home "$dest_b3" )
  [[ "$(stat -c %a "$dest_b3/.ssh")" == "755" ]] \
    || fails+=("seed sim (b3): a directory absent from the home mount must arrive with the seed's mode")
  [[ -f "$dest_b3/.ssh/known_hosts" ]] \
    || fails+=("seed sim (b3): a directory absent from the home mount must arrive with its contents")

  # (c) idempotent across boots
  ( set -e; source "$seed_fn_file"; OH_HOME_SEED_SRC="$src" seed_home "$dest_a" )
  [[ "$(cat "$dest_a/.zshrc")" == "baked" ]] \
    || fails+=("seed sim (c): a second boot must leave an already-seeded home unchanged")

  # (d) a missing seed source is a no-op, never a boot failure
  ( set -e; source "$seed_fn_file"; OH_HOME_SEED_SRC="$simdir/absent" seed_home "$simdir/d" ) \
    || fails+=("seed sim (d): seed_home must return 0 when the baked seed is absent")

  # (e) a genuine copy failure is reported, not swallowed
  dest_e="$simdir/e"; mkdir -p "$dest_e"; chmod 500 "$dest_e"
  if [[ "$(id -u)" != "0" ]]; then
    if ( source "$seed_fn_file"; OH_HOME_SEED_SRC="$src" seed_home "$dest_e" ) 2>/dev/null; then
      fails+=("seed sim (e): seed_home must return non-zero when it cannot write the home mount, so a partial seed is visible in the boot log")
    fi
  fi
  chmod 700 "$dest_e"
fi

if (( ${#fails[@]} > 0 )); then
  echo "REGRESSION: single-\$HOME-mount contract broken:" >&2
  printf '  - %s\n' "${fails[@]}" >&2
  exit 1
fi

echo "PASS: one \${OH_HOME_MOUNT:-workspace} mount at /home/sandbox in both compose files with the per-tool volumes retired and no pinned volume name; the checkout binds at the fixed /home/sandbox/harness; the Dockerfile stages /opt/home-seed and leaves the image home empty; entrypoint prunes \$OH_PROJECT_ROOT instead of -xdev; seed_home copies whole top-level entries the mount lacks, never touches one it already has (mode included), reports write failures, and no-ops without a seed" >&2
exit 0
