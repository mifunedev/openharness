#!/usr/bin/env bash
# tier: A
# source: issue #881 — the Makefile is retired and `oh` is the only front door
# desc: every verb documented in docs/lifecycle-commands.md dispatches in cli.ts or the
#       COMPOSE_VERBS table in lifecycle.ts; only .oh/scripts/docker-compose.sh drives a
#       compose project; and no Makefile exists to reopen the second door.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CLI="$ROOT/.oh/cli/src/cli.ts"
LIFECYCLE="$ROOT/.oh/cli/src/commands/lifecycle.ts"
MAP="$ROOT/docs/lifecycle-commands.md"
COMPOSE_SCRIPT="$ROOT/.oh/scripts/docker-compose.sh"

if [[ ! -f "$CLI" || ! -f "$LIFECYCLE" ]]; then
  echo "SKIPPED: not a source checkout (.oh/cli/src absent)" >&2
  exit 2
fi

strip_ts_comments() {
  perl -0pe 's{/\*.*?\*/}{}gs; s{(^|[^:])//[^\n]*}{$1}gm' "$1"
}

CLI_CODE="$(strip_ts_comments "$CLI")"
LIFECYCLE_CODE="$(strip_ts_comments "$LIFECYCLE")"

grep -qF 'export async function run(' <<<"$CLI_CODE" \
  || grep -qF 'first === "sandbox"' <<<"$CLI_CODE" \
  || { echo "SKIPPED: comment stripping did not yield recognizable code from $CLI" >&2; exit 2; }

missing=()

CLI_VERBS=(sandbox shell destroy compose config secret update harness tool cloud gateway)
COMPOSE_TABLE_VERBS=(stop restart logs ps destroy)

for verb in "${CLI_VERBS[@]}"; do
  grep -qF "first === \"$verb\"" <<<"$CLI_CODE" \
    || missing+=("S1: \`oh $verb\` has no \`first === \"$verb\"\` dispatch in cli.ts")
done

compose_table="$(awk '/^const COMPOSE_VERBS = Object.freeze\(\{/,/^\}\);/' <<<"$LIFECYCLE_CODE")"
if [[ -z "$compose_table" ]]; then
  missing+=("S2: the COMPOSE_VERBS table is gone from lifecycle.ts — the compose verb list has no home")
else
  for verb in "${COMPOSE_TABLE_VERBS[@]}"; do
    grep -qE "^  $verb: Object\.freeze\(\[" <<<"$compose_table" \
      || missing+=("S2: \`oh $verb\` is not a key of the COMPOSE_VERBS table in lifecycle.ts")
  done
fi

compose_branch="$(awk '/if \(first === "compose"\) \{/,/^  \}/' <<<"$CLI_CODE")"
if [[ -z "$compose_branch" ]]; then
  missing+=("S3: cli.ts has no \`first === \"compose\"\` branch — \`oh compose config\` cannot dispatch")
elif ! grep -qF 'runComposeConfig(' <<<"$compose_branch"; then
  missing+=("S3: the \`oh compose\` branch in cli.ts does not call runComposeConfig — \`oh compose config\` prints nothing")
fi

config_branch="$(awk '/if \(first === "config"\) \{/,/^  \}/' <<<"$CLI_CODE")"
if [[ -n "$config_branch" ]] && grep -qF 'runComposeConfig(' <<<"$config_branch"; then
  missing+=("S3: the \`oh config\` integration branch calls runComposeConfig — the compose printer belongs under \`oh compose\`")
fi

if [[ ! -f "$MAP" ]]; then
  missing+=("S4: docs/lifecycle-commands.md is missing — the verb reference has no home")
else
  for verb in "${CLI_VERBS[@]}" "${COMPOSE_TABLE_VERBS[@]}"; do
    grep -qE "\`oh $verb( |\`)" "$MAP" \
      || missing+=("S4: \`oh $verb\` dispatches but is not documented in docs/lifecycle-commands.md")
  done
  grep -qE '`oh compose config`' "$MAP" \
    || missing+=("S4: \`oh compose config\` is not documented in docs/lifecycle-commands.md")
fi

PROJECT_VERBS='up|down|stop|start|restart|logs|ps|config|exec|run|build|pull|create|kill|rm'
while IFS= read -r file; do
  [[ "$file" == "$COMPOSE_SCRIPT" ]] && continue
  hits="$(sed 's/^[[:space:]]*//; s/^if !\{0,1\} //' "$file" |
    grep -nE "^docker compose ($PROJECT_VERBS)( |$)" || true)"
  if [[ -n "$hits" ]]; then
    missing+=("S5: ${file#"$ROOT"/} drives a compose project directly ($(head -1 <<<"$hits")) — go through .oh/scripts/docker-compose.sh")
  fi
done < <(find "$ROOT/.oh/scripts" "$ROOT/.github/workflows" -type f \( -name '*.sh' -o -name '*.yml' \) 2>/dev/null | sort)

ts_argv="$(grep -rnE --exclude-dir=__tests__ '"docker"[[:space:]]*,[[:space:]]*\[?[[:space:]]*"compose"' "$ROOT/.oh/cli/src" 2>/dev/null || true)"
if [[ -n "$ts_argv" ]]; then
  missing+=("S5: the CLI builds a \`docker compose\` argv directly ($(head -1 <<<"$ts_argv")) — the script owns the engine argv")
fi

if [[ -e "$ROOT/Makefile" ]]; then
  missing+=("S6: a Makefile exists at the repository root — \`oh\` is the only front door (issue #881)")
fi

if ((${#missing[@]})); then
  printf 'REGRESSION: %s\n' "${missing[@]}" >&2
  exit 1
fi

echo 'PASS: every documented oh verb dispatches, only docker-compose.sh drives compose, and no Makefile exists' >&2
exit 0
