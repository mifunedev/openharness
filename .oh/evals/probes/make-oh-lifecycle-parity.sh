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
MAP="$ROOT/.oh/docs/lifecycle-commands.md"

# A published `oh init` repo has no Makefile, and a non-source checkout has no
# CLI sources. Neither is a regression.
if [[ ! -f "$MAKEFILE" || ! -f "$CLI" ]]; then
  echo "SKIPPED: not a source checkout (Makefile or .oh/cli/src absent)" >&2
  exit 2
fi

missing=()

# Targets that deliberately have NO `oh` verb. Each must be justified in the
# mapping doc (A2), so this list cannot grow silently.
#   help/harness-config — build plumbing, not lifecycle
#   shell               — has `oh shell`, but the recipe is pinned raw (see A3)
#   destroy             — `down -v` wipes auth volumes; needs a confirm policy
#   config              — `oh config` already means "configure an integration"
EXCEPTIONS=(help harness-config shell destroy config)
is_exception() {
  local t=$1 e
  for e in "${EXCEPTIONS[@]}"; do [[ $t == "$e" ]] && return 0; done
  return 1
}

# --- A1: every .PHONY target has an `oh` verb, or is a listed exception -------
#
# Fails in BOTH directions: a new make target with no verb, and a verb whose
# dispatch was removed while the target stayed.
phony=$(sed -n 's/^\.PHONY:[[:space:]]*//p' "$MAKEFILE" | tr ' ' '\n' | sed '/^$/d')
if [[ -z $phony ]]; then
  missing+=("A1: no .PHONY line found in the Makefile — cannot enumerate targets")
fi
for target in $phony; do
  is_exception "$target" && continue
  # `sandbox`, `shell` and `gateway` dispatch by name; the compose verbs come
  # from COMPOSE_VERBS. Either form counts as a verb existing.
  if grep -qF "first === \"$target\"" "$CLI"; then continue; fi
  if grep -qE "^  $target: " "$LIFECYCLE"; then continue; fi
  missing+=("A1: make target \`$target\` has no \`oh $target\` verb and is not a documented exception")
done

# --- A2: every exception is named in the mapping doc --------------------------
if [[ ! -f "$MAP" ]]; then
  missing+=("A2: .oh/docs/lifecycle-commands.md is missing — the mapping has no home")
else
  for target in "${EXCEPTIONS[@]}"; do
    # help/harness-config are plumbing; the three real exceptions must be argued.
    case "$target" in help|harness-config) continue;; esac
    grep -qF "make $target" "$MAP" \
      || missing+=("A2: exception \`make $target\` is not explained in lifecycle-commands.md")
  done
fi

# --- A3: both doors go through docker-compose.sh ------------------------------
#
# The single implementation is the script. A recipe calling `docker compose`
# directly would fork overlay resolution and project naming.
while IFS= read -r line; do
  # Recipe lines only (tab-indented), and skip the documented `docker exec`.
  [[ $line == *"docker compose"* ]] || continue
  missing+=("A3: a Makefile recipe calls \`docker compose\` directly — go through \$(COMPOSE)")
done < <(grep -P '^\t' "$MAKEFILE" || true)

# The one permitted raw invocation. Deliberately consistent with
# execution-target-contract.sh C5, which pins this same line verbatim.
if ! sed 's/^[[:space:]]*//' "$MAKEFILE" |
  grep -Fxq 'docker exec -it -u $(SHELL_USER) $(SHELL_CONTAINER) zsh'; then
  missing+=("A3: the pinned \`make shell\` line changed — see execution-target-contract.sh C5")
fi

# --- A4: the new verbs assemble no compose argv in TypeScript -----------------
#
# The failure mode: someone "improves" a verb by building the overlay list in
# TS, and the two doors start to drift.
if [[ -f "$LIFECYCLE" ]]; then
  code=$(perl -0pe 's{/\*.*?\*/}{}gs; s{(^|[^:])//[^\n]*}{$1}gm' "$LIFECYCLE")
  if ! grep -qF 'COMPOSE_VERBS' <<<"$code"; then
    missing+=("A4: COMPOSE_VERBS is gone — the compose verb table moved or was inlined")
  fi
  if ! grep -qF 'docker-compose.sh' <<<"$code"; then
    missing+=("A4: lifecycle.ts no longer names docker-compose.sh — a verb may bypass the script")
  fi
  # `runComposeVerb` must not name an engine; the script owns that.
  body=$(awk '/export function runComposeVerb/,/^}/' <<<"$code")
  if grep -qE '"docker"|docker compose' <<<"$body"; then
    missing+=("A4: runComposeVerb names docker directly — the script owns the engine argv")
  fi
fi

# --- A5: exactly one mapping table, and the others link to it -----------------
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
