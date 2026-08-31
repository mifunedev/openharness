#!/usr/bin/env bash
# tier: A
# source: #902 — `oh harness install` must work from inside the sandbox, where
#         sudo has no NOPASSWD, so default harnesses install into the home mount
# source: #904 — the image must not bake a default harness, or the boot-time
#         install path is dead code that CI and a normal boot both skip
# desc: every kind:"default" harness installs as the sandbox user into
#       NPM_USER_PREFIX, claude-code keeps its postinstall, no default harness
#       package appears in the Dockerfile, and the boot path carries the
#       OH_PROVISION_HARNESSES guard and its provisioner.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CATALOG="$ROOT/.oh/cli/src/lib/harnesses/catalog.ts"
ENTRY="$ROOT/.devcontainer/entrypoint.sh"
DOCKERFILE="$ROOT/.devcontainer/Dockerfile"
PROVISIONER="$ROOT/.oh/scripts/provision-harnesses.sh"

for f in "$CATALOG" "$ENTRY" "$DOCKERFILE"; do
  if [[ ! -f $f ]]; then
    echo "SKIPPED: absent: $f" >&2
    exit 2
  fi
done

PREFIX=$(sed -n 's/^ENV NPM_USER_PREFIX="\([^"]*\)".*/\1/p' "$DOCKERFILE" | head -1)
if [[ -z $PREFIX ]]; then
  echo "SKIPPED: Dockerfile declares no ENV NPM_USER_PREFIX to anchor the install prefix" >&2
  exit 2
fi

missing=()

entries=$(awk '
  /^  \{$/   { buf=""; inb=1; next }
  /^  \},$/  { if (inb) print buf; inb=0; next }
  inb        { buf = buf $0 " " }
' "$CATALOG")

defaults=0
while IFS= read -r entry; do
  [[ $entry == *'kind: "default"'* ]] || continue
  defaults=$((defaults + 1))
  id=$(sed -n 's/.*id: "\([^"]*\)".*/\1/p' <<<"$entry")
  if [[ $entry == *'installUser: "root"'* ]]; then
    missing+=("harnesses/catalog.ts: default harness \"$id\" installs as root — inside the sandbox that becomes \`sudo -n\`, and /etc/sudoers.d/sandbox has no NOPASSWD")
  fi
  if [[ $entry != *"$PREFIX"* ]]; then
    missing+=("harnesses/catalog.ts: default harness \"$id\" does not install into $PREFIX — a baked install under /usr/lib/node_modules cannot be upgraded by a running sandbox")
  fi
  if [[ $id == "claude-code" && $entry == *"--ignore-scripts"* ]]; then
    missing+=("harnesses/catalog.ts: claude-code uses --ignore-scripts — its postinstall copies the native binary over the placeholder, so \`claude --version\` fails with 'claude native binary not installed'")
  fi
done <<<"$entries"

if ((defaults == 0)); then
  echo "SKIPPED: no kind:\"default\" harness parsed out of $CATALOG" >&2
  exit 2
fi

grep -qF 'OH_PROVISION_HARNESSES' "$ENTRY" \
  || missing+=("entrypoint.sh: no OH_PROVISION_HARNESSES guard — nothing provisions harnesses into the home mount at boot")
grep -qF 'provision-harnesses.sh' "$ENTRY" \
  || missing+=("entrypoint.sh: does not call .oh/scripts/provision-harnesses.sh")
grep -qF 'WARNING: harness provisioning did not complete' "$ENTRY" \
  || missing+=("entrypoint.sh: harness provisioning does not warn-and-continue — an offline sandbox must still come up as a usable shell")
[[ -x $PROVISIONER ]] \
  || missing+=(".oh/scripts/provision-harnesses.sh: missing or not executable")
# #904: the image must not bake any kind:"default" harness. The install target is
# the home mount, so a copy under /usr/lib/node_modules shadows it with one no
# running sandbox can upgrade — and, worse, makes the boot-time install path
# dead code that never runs and never gets tested. The package names come from
# the catalog itself, so this cannot drift.
strip_dockerfile_comments() {
  grep -vE '^[[:space:]]*#' "$DOCKERFILE"
}

DOCKERFILE_CODE=$(strip_dockerfile_comments)

pkgs=0
while IFS= read -r entry; do
  [[ $entry == *'kind: "default"'* ]] || continue
  id=$(sed -n 's/.*id: "\([^"]*\)".*/\1/p' <<<"$entry")
  # The package specifier is the last element of installArgv. Read it from that
  # array alone — `binary` and `verifyArgv` also hold bare names, and matching
  # those would test the wrong string ("claude" appears in the Dockerfile's
  # shell alias; "@anthropic-ai/claude-code" is what must not).
  argv=$(sed -n 's/.*installArgv: \[\(.*\)\], *installUser.*/\1/p' <<<"$entry")
  pkg=$(grep -oE '"[^"]+"' <<<"$argv" | tr -d '"' | tail -1)
  if [[ -z $pkg || $pkg == -* ]]; then
    missing+=("harnesses/catalog.ts: could not read an install package out of default harness \"$id\" — the no-bake check cannot be applied to it")
    continue
  fi
  pkgs=$((pkgs + 1))
  if grep -qF -- "$pkg" <<<"$DOCKERFILE_CODE"; then
    missing+=("Dockerfile: names $pkg — default harness \"$id\" is baked into the image again; it belongs to .oh/scripts/provision-harnesses.sh, which installs it into $PREFIX at boot")
  fi
done <<<"$entries"

if ((pkgs == 0)); then
  echo "SKIPPED: parsed no install package out of any kind:\"default\" catalog entry, so the no-bake check would pass vacuously" >&2
  exit 2
fi

if grep -qE '^ARG (BAKE_HARNESSES|AGENTS)=' <<<"$DOCKERFILE_CODE"; then
  missing+=("Dockerfile: ARG BAKE_HARNESSES/AGENTS is back — a build-arg that re-bakes the default harnesses is a dormant path that reintroduces the shadowed install and un-exercises the boot provisioner")
fi

if ((${#missing[@]})); then
  printf 'REGRESSION: %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "PASS: all $defaults default harnesses install as the sandbox user into $PREFIX, none of the $pkgs packages is baked into the image, and the boot path provisions them" >&2
