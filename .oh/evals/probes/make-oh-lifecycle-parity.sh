#!/usr/bin/env bash
# tier: A
# source: the Makefile/oh surface-gap consolidation — two front doors onto
#         .oh/scripts/docker-compose.sh, one mapping doc
# desc: every Makefile lifecycle target has a matching `oh` verb or is a documented
#       exception; both doors keep going through docker-compose.sh; the mapping lives in
#       exactly one place and the other docs link to it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MAKEFILE="$ROOT/Makefile"
CLI="$ROOT/.oh/cli/src/cli.ts"
LIFECYCLE="$ROOT/.oh/cli/src/commands/lifecycle.ts"
MAP="$ROOT/docs/lifecycle-commands.md"

if [[ ! -f "$MAKEFILE" || ! -f "$CLI" ]]; then
  echo "SKIPPED: not a source checkout (Makefile or .oh/cli/src absent)" >&2
  exit 2
fi

missing=()

EXCEPTIONS=(help harness-config shell destroy config)
is_exception() {
  local t=$1 e
  for e in "${EXCEPTIONS[@]}"; do [[ $t == "$e" ]] && return 0; done
  return 1
}

phony=$(sed -n 's/^\.PHONY:[[:space:]]*//p' "$MAKEFILE" | tr ' ' '\n' | sed '/^$/d')
if [[ -z $phony ]]; then
  missing+=("A1: no .PHONY line found in the Makefile — cannot enumerate targets")
fi
for target in $phony; do
  is_exception "$target" && continue
  if grep -qF "first === \"$target\"" "$CLI"; then continue; fi
  if grep -qE "^  $target: " "$LIFECYCLE"; then continue; fi
  missing+=("A1: make target \`$target\` has no \`oh $target\` verb and is not a documented exception")
done

if [[ ! -f "$MAP" ]]; then
  missing+=("A2: docs/lifecycle-commands.md is missing — the mapping has no home")
else
  for target in "${EXCEPTIONS[@]}"; do
    case "$target" in help|harness-config) continue;; esac
    grep -qF "make $target" "$MAP" \
      || missing+=("A2: exception \`make $target\` is not explained in lifecycle-commands.md")
  done
fi

while IFS= read -r line; do
  [[ $line == *"docker compose"* ]] || continue
  missing+=("A3: a Makefile recipe calls \`docker compose\` directly — go through \$(COMPOSE)")
done < <(grep -P '^\t' "$MAKEFILE" || true)

if ! sed 's/^[[:space:]]*//' "$MAKEFILE" |
  grep -Fxq 'docker exec -it -u $(SHELL_USER) $(SHELL_CONTAINER) zsh'; then
  missing+=("A3: the pinned \`make shell\` line changed — see execution-target-contract.sh C5")
fi

if [[ -f "$LIFECYCLE" ]]; then
  code=$(perl -0pe 's{/\*.*?\*/}{}gs; s{(^|[^:])//[^\n]*}{$1}gm' "$LIFECYCLE")
  if ! grep -qF 'COMPOSE_VERBS' <<<"$code"; then
    missing+=("A4: COMPOSE_VERBS is gone — the compose verb table moved or was inlined")
  fi
  if ! grep -qF 'docker-compose.sh' <<<"$code"; then
    missing+=("A4: lifecycle.ts no longer names docker-compose.sh — a verb may bypass the script")
  fi
  body=$(awk '/export function runComposeVerb/,/^}/' <<<"$code")
  if grep -qE '"docker"|docker compose' <<<"$body"; then
    missing+=("A4: runComposeVerb names docker directly — the script owns the engine argv")
  fi
fi

if [[ -f "$MAP" ]]; then
  for doc in AGENTS.md README.md .oh/cli/README.md; do
    [[ -f "$ROOT/$doc" ]] || continue
    grep -qF 'lifecycle-commands.md' "$ROOT/$doc" \
      || missing+=("A5: $doc does not link to lifecycle-commands.md — a second mapping will drift from it")
  done
fi

if ((${#missing[@]})); then
  printf 'REGRESSION: %s\n' "${missing[@]}" >&2
  exit 1
fi

echo 'PASS: make and oh lifecycle surfaces agree, and the mapping has one home' >&2
