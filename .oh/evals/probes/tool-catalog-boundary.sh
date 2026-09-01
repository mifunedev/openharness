#!/usr/bin/env bash
# tier: A
# source: agent-browser's exclusion from the harness catalog (#821), the three-catalog
#         split introduced with `oh tool`, and #920 — the CLI is the only install
#         surface, so a second installer on the boot path is a second unverified
#         description of the same pin.
# desc: the harness/runtime/tool catalogs stay disjoint; agent-browser's ground truth is
#       tools/catalog.ts alone — no guard and no pin in .devcontainer/entrypoint.sh, the
#       Dockerfile, or compose; the ~1 GB download stays gated and fails closed without
#       --yes.
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

strip_comments() {
  perl -0pe 's{/\*.*?\*/}{}gs; s{(^|[^:])//[^\n]*}{$1}gm' "$1"
}

if grep -qF 'INSTALL_AGENT_BROWSER' "$ENTRY"; then
  missing+=("entrypoint.sh: INSTALL_AGENT_BROWSER guard returned — the install belongs to the tool catalog, reached through provision-defaults.sh from oh.json")
fi
if grep -qF 'INSTALL_AGENT_BROWSER' "$DOCKERFILE"; then
  missing+=("Dockerfile: INSTALL_AGENT_BROWSER appeared — an image-layer install is discarded on every container recreate")
fi
if grep -qF 'entrypointGuard' "$TOOLS"; then
  missing+=("tools/catalog.ts: entrypointGuard returned — it records a second installer that must not exist")
fi
if grep -qE '\bbuildArg\b' <<<"$(strip_comments "$TOOLS")"; then
  missing+=("tools/catalog.ts: uses buildArg — that field carries a Dockerfile invariant this catalog cannot satisfy")
fi

pin=$(grep -oE 'agent-browser@[0-9]+\.[0-9]+\.[0-9]+' "$TOOLS" | head -1 || true)
if [[ -z $pin ]]; then
  missing+=("tools/catalog.ts: no pinned agent-browser version found — the catalog is the only place that may hold it")
fi
if grep -qE 'agent-browser@[0-9]+\.[0-9]+\.[0-9]+' "$ENTRY"; then
  missing+=("entrypoint.sh: pins an agent-browser version — a second copy of the pin drifts from tools/catalog.ts")
fi

if grep -qE 'harnessKey: *"agent_browser"' "$HARNESSES"; then
  missing+=("harnesses/catalog.ts: agent_browser moved into the harness catalog — it is a browser, not an agent CLI")
fi
if grep -qE 'id: *"docker"' <<<"$(strip_comments "$TOOLS")"; then
  missing+=("tools/catalog.ts: declares id \"docker\" — that id belongs to the runtime catalog; the CLI binary is \"docker-cli\"")
fi

cmd_code=$(strip_comments "$CMD")
if ! grep -qF 'downloadSize' "$TOOLS"; then
  missing+=("tools/catalog.ts: no downloadSize — nothing arms the confirmation gate")
fi
if ! grep -qF 'confirmDownload' <<<"$cmd_code"; then
  missing+=("commands/tool.ts: no confirmDownload gate — a ~1 GB pull can start unprompted")
fi
if ! grep -qF 'process.stdin.isTTY' <<<"$cmd_code"; then
  missing+=("commands/tool.ts: the gate does not check for a TTY — it cannot fail closed")
fi
if ! grep -qF -e '--yes' <<<"$cmd_code"; then
  missing+=("commands/tool.ts: no --yes escape hatch for non-interactive installs")
fi

if grep -qE '\("docker"|\bdocker exec\b' <<<"$cmd_code"; then
  missing+=("commands/tool.ts: names docker directly — go through ExecutionTarget.exec")
fi
if grep -qE '\.kind ===' <<<"$cmd_code"; then
  missing+=("commands/tool.ts: branches on target.kind — use capability discovery")
fi

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
