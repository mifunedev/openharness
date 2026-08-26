#!/usr/bin/env bash
# tier: A
# source: agent-browser's exclusion from the harness catalog (#821) and the
#         three-catalog split introduced with `oh tool`
# desc: the harness/runtime/tool catalogs stay disjoint; agent-browser's ground truth stays
#       .devcontainer/entrypoint.sh and NOT the Dockerfile; the ~1 GB download stays gated
#       and fails closed without --yes.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TOOLS="$ROOT/.oh/cli/src/lib/tools/catalog.ts"
CMD="$ROOT/.oh/cli/src/commands/tool.ts"
HARNESSES="$ROOT/.oh/cli/src/lib/harnesses/catalog.ts"
ENTRY="$ROOT/.devcontainer/entrypoint.sh"
DOCKERFILE="$ROOT/.devcontainer/Dockerfile"

if [[ ! -f "$TOOLS" ]]; then
  echo "SKIPPED: tool catalog absent: $TOOLS" >&2
  exit 2
fi
if [[ ! -f "$CMD" ]]; then
  echo "SKIPPED: tool command absent: $CMD" >&2
  exit 2
fi

missing=()

# Comments describe the very patterns being banned, so code-level assertions
# read stripped source. Line comments whose `//` follows `:` are left alone so a
# `https://` inside a string literal is not truncated.
strip_comments() {
  perl -0pe 's{/\*.*?\*/}{}gs; s{(^|[^:])//[^\n]*}{$1}gm' "$1"
}

# --- 1. agent-browser is installed by the ENTRYPOINT, not the image ----------
#
# This is the premise that justifies a separate `entrypointGuard` field instead
# of reusing the harness catalog's `buildArg`. The harness drift test enforces
# "buildArg names appear in the Dockerfile"; agent-browser has no Dockerfile
# presence at all, so borrowing that field would quietly falsify the invariant.
if ! grep -qF 'INSTALL_AGENT_BROWSER' "$ENTRY"; then
  missing+=("entrypoint.sh: no INSTALL_AGENT_BROWSER guard — the tool catalog's ground truth moved")
fi
if grep -qF 'INSTALL_AGENT_BROWSER' "$DOCKERFILE"; then
  missing+=("Dockerfile: INSTALL_AGENT_BROWSER appeared — agent-browser now has a build arg, so buildArg is the right field, not entrypointGuard")
fi
if ! grep -qF 'entrypointGuard' "$TOOLS"; then
  missing+=("tools/catalog.ts: no entrypointGuard field — the entrypoint install shape is unrecorded")
fi
# Stripped: the field's own doc comment explains why buildArg is NOT reused, and
# that explanation must survive while the field itself stays absent.
if grep -qE '\bbuildArg\b' <<<"$(strip_comments "$TOOLS")"; then
  missing+=("tools/catalog.ts: uses buildArg — that field carries a Dockerfile invariant this catalog cannot satisfy")
fi

# The version pin must match the entrypoint's, or the CLI installs a different
# agent-browser than a container rebuild would.
pin=$(grep -oE 'agent-browser@[0-9]+\.[0-9]+\.[0-9]+' "$ENTRY" | head -1 || true)
if [[ -z $pin ]]; then
  missing+=("entrypoint.sh: no pinned agent-browser version found")
elif ! grep -qF "$pin" "$TOOLS"; then
  missing+=("tools/catalog.ts: version pin disagrees with entrypoint.sh ($pin)")
fi

# --- 2. The three catalogs stay disjoint -------------------------------------
#
# A tool in two tables means two commands claim it and two drift tests assert
# different ground truths.
if grep -qE 'harnessKey: *"agent_browser"' "$HARNESSES"; then
  missing+=("harnesses/catalog.ts: agent_browser moved into the harness catalog — it is a browser, not an agent CLI")
fi
if grep -qE 'id: *"docker"' <<<"$(strip_comments "$TOOLS")"; then
  missing+=("tools/catalog.ts: declares id \"docker\" — that id belongs to the runtime catalog; the CLI binary is \"docker-cli\"")
fi

# --- 3. The large download stays gated ---------------------------------------
#
# The failure mode: someone removes the gate and a CI run silently pulls ~1 GB
# of Chromium.
cmd_code=$(strip_comments "$CMD")
if ! grep -qF 'downloadSize' "$TOOLS"; then
  missing+=("tools/catalog.ts: no downloadSize — nothing arms the confirmation gate")
fi
if ! grep -qF 'confirmDownload' <<<"$cmd_code"; then
  missing+=("commands/tool.ts: no confirmDownload gate — a ~1 GB pull can start unprompted")
fi
# Fail closed: the non-interactive path must return false, not fall through.
if ! grep -qF 'process.stdin.isTTY' <<<"$cmd_code"; then
  missing+=("commands/tool.ts: the gate does not check for a TTY — it cannot fail closed")
fi
if ! grep -qF -e '--yes' <<<"$cmd_code"; then
  missing+=("commands/tool.ts: no --yes escape hatch for non-interactive installs")
fi

# --- 4. Container work stays behind the ExecutionTarget contract -------------
if grep -qE '\("docker"|\bdocker exec\b' <<<"$cmd_code"; then
  missing+=("commands/tool.ts: names docker directly — go through ExecutionTarget.exec")
fi
if grep -qE '\.kind ===' <<<"$cmd_code"; then
  missing+=("commands/tool.ts: branches on target.kind — use capability discovery")
fi

# --- 5. The command is reachable ---------------------------------------------
CLI="$ROOT/.oh/cli/src/cli.ts"
if [[ -f "$CLI" ]]; then
  grep -qF 'first === "tool"' "$CLI" \
    || missing+=("cli.ts: no dispatch for `oh tool`")
  grep -qF 'oh tool <args...>' "$CLI" \
    || missing+=("cli.ts: `oh tool` missing from the top-level usage block")
fi

if ((${#missing[@]})); then
  printf 'REGRESSION: %s\n' "${missing[@]}" >&2
  exit 1
fi

echo 'PASS: the three catalogs are disjoint and the large download stays gated' >&2
