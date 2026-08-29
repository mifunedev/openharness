#!/usr/bin/env bash
# tier: A
# source: issue #733 (ExecutionTarget contract + Docker Compose adapter) 2026-08-10
# desc: the execution seam stays provider-neutral — the contract file names no substrate and
#       declares no snapshot method, the shell verb builds no engine argv of its own, and the
#       operator-facing `oh shell` attach call is byte-for-byte unchanged.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TARGET="$ROOT/.oh/cli/src/lib/execution/target.ts"
LIFECYCLE="$ROOT/.oh/cli/src/commands/lifecycle.ts"

[[ -d "$ROOT/.oh/cli/src" ]] || { echo "SKIPPED: missing $ROOT/.oh/cli/src — not a harness source checkout" >&2; exit 2; }
[[ -f "$LIFECYCLE" ]] || { echo "SKIPPED: missing $LIFECYCLE" >&2; exit 2; }

strip_comments() {
  awk '
    BEGIN { inblock = 0 }
    {
      line = $0; out = ""; i = 1; n = length(line)
      while (i <= n) {
        two = substr(line, i, 2)
        if (inblock) {
          if (two == "*/") { inblock = 0; i += 2 } else { i++ }
        } else if (two == "/*") {
          inblock = 1; i += 2
        } else if (two == "//") {
          break
        } else {
          out = out substr(line, i, 1); i++
        }
      }
      print out
    }
  ' "$1"
}

missing=()

if [[ ! -f "$TARGET" ]]; then
  missing+=("C1: $TARGET is absent — the execution contract has no home")
  printf 'REGRESSION: execution-target contract broken: %s\n' "${missing[*]}" >&2
  exit 1
fi

cap_line="$(grep -n '^[[:space:]]*|[[:space:]]*"docker"[[:space:]]*$' "$TARGET" | head -1 | cut -d: -f1 || true)"
if [[ -n "$cap_line" ]]; then
  nouns="$(awk -v a="$cap_line" -v b="$((cap_line - 1))" 'NR != a && NR != b' "$TARGET" |
    grep -inE 'containerid|container|compose|dockerd|docker|image|volume' || true)"
else
  nouns="$(grep -inE 'containerid|container|compose|dockerd|docker|image|volume' "$TARGET" || true)"
fi
if [[ -n "$nouns" ]]; then
  missing+=("C2: target.ts names a substrate outside the \"docker\" capability literal ($(echo "$nouns" | head -3 | tr '\n' ';'))")
fi

snapshot_method="$(strip_comments "$TARGET" | grep -nE 'snapshot[[:space:]]*\(' || true)"
if [[ -n "$snapshot_method" ]]; then
  missing+=("C3: target.ts declares a snapshot method ($(echo "$snapshot_method" | head -1))")
fi

code="$(strip_comments "$LIFECYCLE")"
if ! grep -q 'export function runShell' <<<"$code"; then
  echo "SKIPPED: comment stripping did not yield recognizable code from $LIFECYCLE" >&2
  exit 2
fi
flat="$(tr -d '[:space:]' <<<"$code")"
if grep -qF '["exec"' <<<"$flat" || grep -qF '"exec","-it"' <<<"$flat"; then
  missing+=("C4: lifecycle.ts constructs an engine argv literal beginning with \"exec\" — that belongs behind the contract")
fi

shell_body="$(awk '/export function runShell/,/^}/' <<<"$code")"
if [[ -z "$shell_body" ]]; then
  missing+=("C5: runShell has no recognizable body — the \`oh shell\` entry point moved")
elif ! sed 's/^[[:space:]]*//' <<<"$shell_body" |
  grep -Fxq 'code = target.attach({ argv: ["zsh"], user: "sandbox" });'; then
  missing+=("C5: runShell no longer contains the verbatim attach call \`code = target.attach({ argv: [\"zsh\"], user: \"sandbox\" });\` — the operator-facing shell entry changed")
fi

if ((${#missing[@]})); then
  printf 'REGRESSION: execution-target contract broken: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo 'PASS: target.ts is substrate-neutral with no snapshot method, runShell builds no engine argv, and the `oh shell` attach call is verbatim intact' >&2
exit 0
