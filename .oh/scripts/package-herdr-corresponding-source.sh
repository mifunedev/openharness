#!/usr/bin/env bash
# Build Herdr's deterministic, dependency-vendored corresponding-source bundle.
set -euo pipefail
umask 022

HERDR_VERSION=0.7.4
HERDR_TAG="v${HERDR_VERSION}"
HERDR_COMMIT=50aaa2ec046ee26ff407c20f49de496f522512a8
HERDR_COMMIT_ARCHIVE_SHA256=71ce984133b50bd097d499873dc867f4f947c39d7868027146169df7aea516e4
HERDR_REPOSITORY=https://github.com/ogulcancelik/herdr.git
export SOURCE_DATE_EPOCH=1784133039
CARGO_VERSION=1.96.1
ZIG_VERSION=0.15.2
ZIG_TARGET=x86_64-linux-gnu
ZIG_PACKAGE_COUNT=36
ZIG_HIGHWAY_PACKAGE=N-V-__8AAGmZhABbsPJLfbqrh6JTHsXhY6qCaLAQyx25e0XE
ZIG_UUCODE_01_PACKAGE=uucode-0.1.0-ZZjBPj96QADXyt5sqwBJUnhaDYs_qBeeKijZvlRa0eqM
ZIG_UUCODE_02_PACKAGE=uucode-0.2.0-ZZjBPqZVVABQepOqZHR7vV_NcaN-wats0IB6o-Exj6m9
BUNDLE_NAME="herdr-${HERDR_VERSION}-corresponding-source.tar.gz"

if [ "$#" -gt 1 ]; then
  printf 'Usage: %s [OUTPUT_DIRECTORY]\n' "$0" >&2
  exit 64
fi

output_dir=${1:-$PWD}
mkdir -p "$output_dir"
output_dir=$(cd "$output_dir" && pwd)

for command in cargo cp curl find git gzip python3 sha256sum tar zig; do
  command -v "$command" >/dev/null 2>&1 || {
    printf 'ERROR: required command not found: %s\n' "$command" >&2
    exit 1
  }
done

actual_cargo_version=$(cargo --version)
case "$actual_cargo_version" in
  "cargo ${CARGO_VERSION} "*) ;;
  *)
    printf 'ERROR: Cargo %s is required; found: %s\n' "$CARGO_VERSION" "$actual_cargo_version" >&2
    exit 1
    ;;
esac

actual_zig_version=$(zig version)
if [ "$actual_zig_version" != "$ZIG_VERSION" ]; then
  printf 'ERROR: Zig %s is required; found: %s\n' "$ZIG_VERSION" "$actual_zig_version" >&2
  exit 1
fi

actual_python_version=$(python3 -c 'import sys; print(sys.version_info.major)')
if [ "$actual_python_version" != 3 ]; then
  printf 'ERROR: Python 3 is required\n' >&2
  exit 1
fi

tag_commit=$(git ls-remote --tags "$HERDR_REPOSITORY" "refs/tags/${HERDR_TAG}^{}" | awk 'NR == 1 { print $1 }')
if [ "$tag_commit" != "$HERDR_COMMIT" ]; then
  printf 'ERROR: %s dereferences to %s, expected %s\n' "$HERDR_TAG" "${tag_commit:-<missing>}" "$HERDR_COMMIT" >&2
  exit 1
fi

tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/herdr-corresponding-source.XXXXXXXX")
trap 'rm -rf "$tmp_dir"' EXIT HUP INT TERM

upstream_archive="$tmp_dir/herdr-commit.tar.gz"
source_root="$tmp_dir/herdr-${HERDR_VERSION}"
archive_tmp="$tmp_dir/$BUNDLE_NAME"
checksum_tmp="$tmp_dir/${BUNDLE_NAME}.sha256"
zig_global_cache="$tmp_dir/zig-global-cache"
zig_local_cache="$tmp_dir/zig-local-cache"

curl --fail --silent --show-error --location --retry 5 --retry-all-errors \
  "https://codeload.github.com/ogulcancelik/herdr/tar.gz/${HERDR_COMMIT}" \
  --output "$upstream_archive"
printf '%s  %s\n' "$HERDR_COMMIT_ARCHIVE_SHA256" "$upstream_archive" | sha256sum -c -

tar -xzf "$upstream_archive" -C "$tmp_dir"
mv "$tmp_dir/herdr-${HERDR_COMMIT}" "$source_root"

for required in LICENSE Cargo.toml Cargo.lock build.rs src/main.rs \
  vendor/portable-pty/Cargo.toml vendor/portable-pty/src/lib.rs \
  vendor/libghostty-vt/build.zig vendor/libghostty-vt/build.zig.zon.json \
  vendor/libghostty-vt/VERSION; do
  test -f "$source_root/$required" || {
    printf 'ERROR: upstream source is missing %s\n' "$required" >&2
    exit 1
  }
done

mkdir -p "$source_root/.cargo"
(
  cd "$source_root"
  cargo vendor --locked --versioned-dirs vendor/cargo > .cargo/config.toml
)

test -s "$source_root/.cargo/config.toml"
grep -Fq 'directory = "vendor/cargo"' "$source_root/.cargo/config.toml"
test -d "$source_root/vendor/cargo"
find "$source_root/vendor/cargo" -mindepth 2 -name .cargo-checksum.json -type f -print -quit | grep -q .

mkdir -p "$zig_global_cache" "$zig_local_cache"
libghostty_root="$source_root/vendor/libghostty-vt"
libghostty_version=$(python3 -c 'from pathlib import Path; import sys; print(Path(sys.argv[1]).read_text().strip())' \
  "$libghostty_root/VERSION")
(
  cd "$libghostty_root"
  ZIG_GLOBAL_CACHE_DIR="$zig_global_cache" ZIG_LOCAL_CACHE_DIR="$zig_local_cache" \
    zig build --fetch=all \
      -Demit-lib-vt \
      -Doptimize=ReleaseFast \
      -Dsimd=true \
      -Dtarget="$ZIG_TARGET" \
      -Dversion-string="$libghostty_version" \
      -Demit-xcframework=false
)

test -d "$zig_global_cache/p"
mkdir -p "$source_root/vendor/zig-global-cache"
cp -a "$zig_global_cache/p" "$source_root/vendor/zig-global-cache/p"

python3 - \
  "$libghostty_root/build.zig.zon.json" \
  "$source_root/vendor/zig-global-cache/p" \
  "$ZIG_PACKAGE_COUNT" \
  "$ZIG_HIGHWAY_PACKAGE" \
  "$ZIG_UUCODE_01_PACKAGE" \
  "$ZIG_UUCODE_02_PACKAGE" <<'PY'
import json
import sys
from pathlib import Path

manifest_path = Path(sys.argv[1])
package_root = Path(sys.argv[2])
required_count = int(sys.argv[3])
mandatory = set(sys.argv[4:])

manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
expected = set(manifest)
actual = {entry.name for entry in package_root.iterdir()}

if len(expected) != required_count:
    raise SystemExit(
        f"ERROR: build.zig.zon.json contains {len(expected)} packages, expected {required_count}"
    )
if expected != actual:
    missing = sorted(expected - actual)
    extra = sorted(actual - expected)
    raise SystemExit(
        f"ERROR: Zig package cache mismatch; missing={missing!r}; extra={extra!r}"
    )
if not mandatory <= expected:
    raise SystemExit(
        f"ERROR: mandatory highway/uucode package hashes missing: {sorted(mandatory - expected)!r}"
    )
mandatory_names = {manifest[package_hash].get("name") for package_hash in mandatory}
if mandatory_names != {"highway", "uucode"}:
    raise SystemExit(
        f"ERROR: mandatory package hashes do not identify highway/uucode: {mandatory_names!r}"
    )
if any(not entry.is_dir() for entry in package_root.iterdir()):
    raise SystemExit("ERROR: Zig package cache must contain package directories only")
PY

# Build outputs and local caches are not corresponding source. The isolated
# global cache contributes only its fetched p/ package-source directory above.
while IFS= read -r -d '' generated_cache; do
  rm -rf -- "$generated_cache"
done < <(find "$source_root" -type d \( -name .zig-cache -o -name zig-out \) -print0)

cat > "$source_root/OPENHARNESS-CORRESPONDING-SOURCE.md" <<EOF
# Herdr v${HERDR_VERSION} corresponding source

This bundle contains the unmodified Herdr source at upstream tag
\`${HERDR_TAG}\`, commit \`${HERDR_COMMIT}\`, plus the locked Rust registry and
Git dependency sources needed by Cargo under \`vendor/cargo/\` and all ${ZIG_PACKAGE_COUNT}
package-source directories referenced by
\`vendor/libghostty-vt/build.zig.zon.json\` under
\`vendor/zig-global-cache/p/\`.

Open Harness generated \`.cargo/config.toml\` with this command, using Cargo
${CARGO_VERSION}:

\`\`\`sh
cargo vendor --locked --versioned-dirs vendor/cargo > .cargo/config.toml
\`\`\`

It fetched the Zig package sources with Zig ${ZIG_VERSION}, isolated global and
local caches, and the same libghostty-vt options used by Herdr's build script:

\`\`\`sh
ZIG_GLOBAL_CACHE_DIR=/tmp/zig-global-cache \\
ZIG_LOCAL_CACHE_DIR=/tmp/zig-local-cache \\
zig build --fetch=all \\
  -Demit-lib-vt -Doptimize=ReleaseFast -Dsimd=true \\
  -Dtarget=${ZIG_TARGET} -Dversion-string=${libghostty_version} \\
  -Demit-xcframework=false
\`\`\`

For an offline x86_64 GNU/Linux rebuild, install Rust 1.96.1, Cargo
${CARGO_VERSION}, and Zig ${ZIG_VERSION}, then run from this directory:

\`\`\`sh
export ZIG_GLOBAL_CACHE_DIR="\$PWD/vendor/zig-global-cache"
export ZIG_LOCAL_CACHE_DIR="\$PWD/.zig-cache"
cargo build --locked --release --offline
\`\`\`

The Cargo source replacement path and Zig global cache path are relative to this
source tree. Generated Zig local caches and \`zig-out\` build outputs are
excluded. Archive ownership and timestamps are normalized with
\`SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH}\`; legitimate upstream and fetched file
modes and symlinks are preserved.

This is a conservative corresponding-source bundle, not a claim that rebuilding
it produces an executable byte-identical to the binary distributed by upstream.
Herdr is provided without warranty under AGPL-3.0-or-later; see \`LICENSE\`.
EOF

# Preserve legitimate executable modes and symlinks from upstream/fetched
# sources. Normalize timestamps only; tar normalizes archive ownership.
find "$source_root" -exec touch -h -d "@${SOURCE_DATE_EPOCH}" {} +

(
  cd "$tmp_dir"
  tar --sort=name \
    --format=posix \
    --pax-option=delete=atime,delete=ctime \
    --mtime="@${SOURCE_DATE_EPOCH}" \
    --owner=0 --group=0 --numeric-owner \
    -cf - "herdr-${HERDR_VERSION}" | gzip -n -9 > "$archive_tmp"
)

(
  cd "$tmp_dir"
  printf '%s  %s\n' "$(sha256sum "$BUNDLE_NAME" | awk '{ print $1 }')" "$BUNDLE_NAME" \
    > "$checksum_tmp"
  sha256sum -c "$(basename "$checksum_tmp")"
)

install -m 0644 "$archive_tmp" "$output_dir/$BUNDLE_NAME"
install -m 0644 "$checksum_tmp" "$output_dir/${BUNDLE_NAME}.sha256"
printf 'Created %s\n' "$output_dir/$BUNDLE_NAME"
printf 'Created %s\n' "$output_dir/${BUNDLE_NAME}.sha256"
