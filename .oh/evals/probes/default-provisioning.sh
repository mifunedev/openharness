#!/usr/bin/env bash
# tier: A
# source: #902 — `oh harness install` must work from inside the sandbox, where
#         sudo has no NOPASSWD, so default harnesses install into the home mount
# source: #904 — the image must not bake a default harness, or the boot-time
#         install path is dead code that CI and a normal boot both skip
# source: #906 — herdr and cloudflared are tools the in-sandbox CLI owns, and a
#         root-installed default would hit `sudo` with no NOPASSWD
# desc: every kind:"default" harness AND tool installs as the sandbox user into
#       NPM_USER_PREFIX, claude-code keeps its postinstall, no default package or
#       download URL appears in the Dockerfile, and the boot path carries the
#       OH_PROVISION_DEFAULTS guard and its provisioner.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CATALOG="$ROOT/.oh/cli/src/lib/harnesses/catalog.ts"
TOOLS="$ROOT/.oh/cli/src/lib/tools/catalog.ts"
ENTRY="$ROOT/.devcontainer/entrypoint.sh"
DOCKERFILE="$ROOT/.devcontainer/Dockerfile"
PROVISIONER="$ROOT/.oh/scripts/provision-defaults.sh"

for f in "$CATALOG" "$TOOLS" "$ENTRY" "$DOCKERFILE"; do
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

# #908: every harness, not just kind:"default". commands/harness.ts installs
# with stdio:"inherit", so local-target.ts picks plain `sudo --` for a root
# install and /etc/sudoers.d/sandbox has no NOPASSWD — an agent would hang on a
# password prompt. No harness of any kind belongs in the image either.
defaults=0
while IFS= read -r entry; do
  id=$(sed -n 's/.*id: "\([^"]*\)".*/\1/p' <<<"$entry")
  [[ -n $id ]] || continue
  defaults=$((defaults + 1))
  if [[ $entry == *'installUser: "root"'* ]]; then
    missing+=("harnesses/catalog.ts: harness \"$id\" installs as root — commands/harness.ts uses stdio:\"inherit\", so that becomes an interactive \`sudo\`, and /etc/sudoers.d/sandbox has no NOPASSWD")
  fi
  if [[ $entry == *'buildArg:'* ]]; then
    missing+=("harnesses/catalog.ts: harness \"$id\" declares buildArg — that field carries a Dockerfile invariant this catalog cannot satisfy; the tool catalog already bans it")
  fi
  # on-demand entries (t3code) are fetched per invocation via npx and install
  # nowhere, so the prefix rule does not apply to them.
  if [[ $entry != *'kind: "on-demand"'* \
        && $entry != *"$PREFIX"* \
        && $entry != *'$HOME/.local'* \
        && $entry != *'uv", "tool", "install'* ]]; then
    missing+=("harnesses/catalog.ts: harness \"$id\" does not install into $PREFIX — a system-path install cannot be upgraded by a running sandbox and does not persist in the home mount")
  fi
  if [[ $id == "claude-code" && $entry == *"--ignore-scripts"* ]]; then
    missing+=("harnesses/catalog.ts: claude-code uses --ignore-scripts — its postinstall copies the native binary over the placeholder, so \`claude --version\` fails with 'claude native binary not installed'")
  fi
done <<<"$entries"

if ((defaults == 0)); then
  echo "SKIPPED: no harness parsed out of $CATALOG" >&2
  exit 2
fi

grep -qF 'OH_PROVISION_DEFAULTS' "$ENTRY" \
  || missing+=("entrypoint.sh: no OH_PROVISION_DEFAULTS guard — nothing provisions harnesses into the home mount at boot")
grep -qF 'provision-defaults.sh' "$ENTRY" \
  || missing+=("entrypoint.sh: does not call .oh/scripts/provision-defaults.sh")
grep -qF 'WARNING: default provisioning did not complete' "$ENTRY" \
  || missing+=("entrypoint.sh: default provisioning does not warn-and-continue — an offline sandbox must still come up as a usable shell")
[[ -x $PROVISIONER ]] \
  || missing+=(".oh/scripts/provision-defaults.sh: missing or not executable")
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
  # on-demand entries (t3code, prime-agent) are fetched per invocation and were
  # never baked; skip them rather than assert against an npx incantation.
  [[ $entry == *'kind: "default"'* || $entry == *'kind: "optional"'* ]] || continue
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
    missing+=("Dockerfile: names $pkg — harness \"$id\" is baked into the image again; it belongs to \`oh harness install\`, which installs it into $PREFIX")
  fi
done <<<"$entries"

if ((pkgs == 0)); then
  echo "SKIPPED: parsed no install package out of any kind:\"default\" catalog entry, so the no-bake check would pass vacuously" >&2
  exit 2
fi

if grep -qE '^ARG (BAKE_HARNESSES|AGENTS|HERDR_VERSION)=' <<<"$DOCKERFILE_CODE"; then
  missing+=("Dockerfile: ARG BAKE_HARNESSES/AGENTS/HERDR_VERSION is back — a build arg that re-bakes a default is a dormant path that reintroduces the shadowed install and un-exercises the boot provisioner")
fi

# #908: no harness may have a Dockerfile build arg at all. INSTALL_HERMES keeps
# its RUNTIME life (link-providers.sh vendors the Hermes skill pack from it,
# entrypoint.sh wires auth.json), so only an `ARG` declaration is a regression.
while IFS= read -r arg; do
  [[ -n $arg ]] || continue
  missing+=("Dockerfile: $arg is back — optional harnesses install through \`oh harness install\`, and a build arg makes the image the install path again")
done < <(grep -oE '^ARG INSTALL_(HERMES|OPENCODE|GROK_BUILD|DEEPAGENTS)' <<<"$DOCKERFILE_CODE" | sort -u)

# #906: the same rule for kind:"default" tools. These install as root nowhere:
# commands/tool.ts passes stdio:"inherit", so local-target.ts selects plain
# `sudo --` for a root install, and /etc/sudoers.d/sandbox has no NOPASSWD —
# an agent in a Herdr pane would hang on a password prompt.
tool_entries=$(awk '
  /^  Object\.freeze\(\{$/ { buf=""; inb=1; next }
  /^  \}\),$/               { if (inb) print buf; inb=0; next }
  inb                       { buf = buf $0 " " }
' "$TOOLS")

tools=0
while IFS= read -r entry; do
  [[ $entry == *'kind: "default"'* ]] || continue
  tools=$((tools + 1))
  id=$(sed -n 's/.*id: "\([^"]*\)".*/\1/p' <<<"$entry")
  if [[ $entry == *'installUser: "root"'* ]]; then
    missing+=("tools/catalog.ts: default tool \"$id\" installs as root — commands/tool.ts uses stdio:\"inherit\", so that becomes an interactive \`sudo\`, and /etc/sudoers.d/sandbox has no NOPASSWD")
  fi
  if [[ $entry != *'NPM_USER_PREFIX'* ]]; then
    missing+=("tools/catalog.ts: default tool \"$id\" does not install into NPM_USER_PREFIX — a system-path install cannot be upgraded by a running sandbox and does not persist in the home mount")
  fi
  if [[ $entry != *'sha256sum -c -'* ]]; then
    missing+=("tools/catalog.ts: default tool \"$id\" downloads without \`sha256sum -c -\` — an unverified binary is installed straight into the agent's PATH")
  fi
  # Match the pinned project path, not the bare host — the Dockerfile clones
  # oh-my-zsh plugins from github.com and that is not a baked tool.
  while IFS= read -r origin; do
    [[ -n $origin ]] || continue
    if grep -qF -- "$origin" <<<"$DOCKERFILE_CODE"; then
      missing+=("Dockerfile: names $origin — default tool \"$id\" is baked into the image again; it belongs to .oh/scripts/provision-defaults.sh, which installs it into $PREFIX at boot")
    fi
  done < <(grep -oE 'https://[a-z0-9.-]+/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+' <<<"$entry" | sort -u)
done <<<"$tool_entries"

if ((tools == 0)); then
  echo "SKIPPED: no kind:\"default\" tool parsed out of $TOOLS, so the tool half would pass vacuously" >&2
  exit 2
fi

if ((${#missing[@]})); then
  printf 'REGRESSION: %s\n' "${missing[@]}" >&2
  exit 1
fi

echo "PASS: all $defaults harnesses and $tools default tools install as the sandbox user into $PREFIX, none of the $pkgs packages is baked into the image, and the boot path provisions them" >&2
