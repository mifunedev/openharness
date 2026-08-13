#!/usr/bin/env bash
# tier: A
# source: issue #733 (ExecutionTarget contract + Docker Compose adapter) 2026-08-10
# desc: the execution seam stays provider-neutral — the contract file names no substrate and
#       declares no snapshot method, the shell verb builds no engine argv of its own, and the
#       operator-facing Makefile shell line is byte-for-byte unchanged.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)" # .oh/evals/probes/<id>.sh -> root
TARGET="$ROOT/.oh/cli/src/lib/execution/target.ts"
LIFECYCLE="$ROOT/.oh/cli/src/commands/lifecycle.ts"
MAKEFILE="$ROOT/Makefile"

# Not a source checkout of the harness itself (an `oh update`-vendored .oh/ payload has no
# CLI sources and no Makefile). Nothing to verify — never a silent green.
[[ -d "$ROOT/.oh/cli/src" ]] || { echo "SKIPPED: missing $ROOT/.oh/cli/src — not a harness source checkout" >&2; exit 2; }
[[ -f "$MAKEFILE" ]] || { echo "SKIPPED: missing $MAKEFILE — not a harness source checkout" >&2; exit 2; }
[[ -f "$LIFECYCLE" ]] || { echo "SKIPPED: missing $LIFECYCLE" >&2; exit 2; }

# Strip TypeScript comments (block + line) with a character scanner, so doc prose can neither
# trip a code-level check nor falsely satisfy one. Emits code text only.
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

# --- C1: the provider-neutral contract file exists ---------------------------
if [[ ! -f "$TARGET" ]]; then
  missing+=("C1: $TARGET is absent — the execution contract has no home")
  # C2/C3 read that file; without it they cannot be evaluated.
  printf 'REGRESSION: execution-target contract broken: %s\n' "${missing[*]}" >&2
  exit 1
fi

# --- C2: no Docker nouns in the contract -------------------------------------
# Exception (and only this): the "docker" capability string literal and the doc comment
# immediately above it. Everything else in the file must name no substrate.
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

# --- C3: no snapshot method on the interface ---------------------------------
# "snapshot" is a capability literal in this slice, deliberately with no method behind it.
snapshot_method="$(strip_comments "$TARGET" | grep -nE 'snapshot[[:space:]]*\(' || true)"
if [[ -n "$snapshot_method" ]]; then
  missing+=("C3: target.ts declares a snapshot method ($(echo "$snapshot_method" | head -1))")
fi

# --- C4: runShell builds no engine argv of its own ---------------------------
# Argv-LITERAL inspection, not a text grep: comments are stripped first and whitespace is
# collapsed, so a multi-line array literal cannot hide and surviving doc prose about the old
# `docker exec` invocation cannot trip this.
code="$(strip_comments "$LIFECYCLE")"
if ! grep -q 'export function runShell' <<<"$code"; then
  echo "SKIPPED: comment stripping did not yield recognizable code from $LIFECYCLE" >&2
  exit 2
fi
flat="$(tr -d '[:space:]' <<<"$code")"
if grep -qF '["exec"' <<<"$flat" || grep -qF '"exec","-it"' <<<"$flat"; then
  missing+=("C4: lifecycle.ts constructs an engine argv literal beginning with \"exec\" — that belongs behind the contract")
fi

# --- C5: the operator-facing Makefile shell line is unchanged ----------------
# Whole-line exact match (modulo the recipe tab), NOT a loose "docker exec" substring test,
# which would stay green through an argument-level regression.
if ! sed 's/^[[:space:]]*//' "$MAKEFILE" |
  grep -Fxq 'docker exec -it -u $(SHELL_USER) $(SHELL_CONTAINER) zsh'; then
  missing+=("C5: Makefile no longer contains the verbatim line \`docker exec -it -u \$(SHELL_USER) \$(SHELL_CONTAINER) zsh\`")
fi

if ((${#missing[@]})); then
  printf 'REGRESSION: execution-target contract broken: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS: target.ts is substrate-neutral with no snapshot method, runShell builds no engine argv, and the Makefile shell line is verbatim intact" >&2
exit 0
