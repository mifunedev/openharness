#!/usr/bin/env bash
# tier: A
# desc: migrate-harness-yaml.sh carries a live harness.yaml into .devcontainer/.env, renames the file, and is a no-op on the second run
set -euo pipefail

# WHY THIS PROBE EXISTS. harness.yaml was removed in 0.4.0, and the ONE thing
# standing between an existing install and a silently lost setting is this
# migrator. It runs from .oh/scripts/docker-compose.sh and .oh/scripts/install.sh,
# so it fires on every lifecycle verb — which also means a regression in it is
# invisible until someone's sandbox comes up with the wrong name.
#
# The fixture exercises all four cases that differ:
#   - a key ABSENT from .env               -> appended
#   - a key COMMENTED in .env              -> uncommented IN PLACE
#   - a key already holding the SAME value -> unchanged
#   - a key holding a DIFFERENT value      -> overwritten (harness.yaml won at
#     runtime before, so preserving the .env value would change behaviour)

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MIGRATOR="$ROOT/.oh/scripts/migrate-harness-yaml.sh"

if [[ ! -f "$MIGRATOR" ]]; then
  echo "SKIPPED: .oh/scripts/migrate-harness-yaml.sh absent on this branch" >&2
  exit 2
fi

fails=()
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/.devcontainer" "$work/.oh/scripts"

cat > "$work/harness.yaml" <<'YAML'
sandbox:
  name: probebox
  timezone: America/Denver
git:
  user_name: Probe User
install:
  hermes: true
compose:
  overrides:
    - .devcontainer/docker-compose.probe.yml
YAML

# TZ commented (must uncomment in place), GIT_USER_NAME already matching,
# SANDBOX_NAME holding a different value (must be overwritten), INSTALL_HERMES
# absent entirely (must be appended).
{
  printf '# TZ=America/Los_Angeles\n'
  printf 'GIT_USER_NAME=Probe User\n'
  printf 'SANDBOX_NAME=stalename\n'
} > "$work/.devcontainer/.env"

env_lines_before="$(wc -l < "$work/.devcontainer/.env")"

set +e
out="$(sh "$MIGRATOR" "$work" 2>&1)"
rc=$?
set -e

(( rc == 0 )) || fails+=("migrator exited $rc on a live harness.yaml")

get() { grep -E "^$1=" "$work/.devcontainer/.env" | head -1 | cut -d= -f2-; }

[[ "$(get SANDBOX_NAME)"   == "probebox"       ]] || fails+=("SANDBOX_NAME not overwritten with the harness.yaml value (got '$(get SANDBOX_NAME)')")
[[ "$(get TZ)"             == "America/Denver" ]] || fails+=("TZ not set from harness.yaml (got '$(get TZ)')")
[[ "$(get GIT_USER_NAME)"  == "Probe User"     ]] || fails+=("GIT_USER_NAME lost its already-correct value (got '$(get GIT_USER_NAME)')")
[[ "$(get INSTALL_HERMES)" == "true"           ]] || fails+=("INSTALL_HERMES not appended (got '$(get INSTALL_HERMES)')")

# Uncomment-in-place, not append: the commented TZ line is REPLACED, so the file
# gains one line for INSTALL_HERMES and nothing else.
env_lines_after="$(wc -l < "$work/.devcontainer/.env")"
(( env_lines_after == env_lines_before + 1 )) \
  || fails+=("expected exactly one new line (INSTALL_HERMES); went from $env_lines_before to $env_lines_after — a commented key was appended instead of uncommented in place")
grep -qE '^[[:space:]]*#[[:space:]]*TZ=' "$work/.devcontainer/.env" \
  && fails+=("the commented TZ line survived — it must be replaced, not shadowed by an appended duplicate")

# The summary names what changed. A silent migration is the failure mode this
# whole design exists to avoid.
grep -qF 'SANDBOX_NAME' <<<"$out" || fails+=("the summary does not name SANDBOX_NAME")
grep -qF 'stalename'    <<<"$out" || fails+=("the summary does not print the replaced value, so the change is invisible")

[[ -f "$work/harness.yaml.migrated" ]] || fails+=("harness.yaml was not renamed to harness.yaml.migrated")
[[ -f "$work/harness.yaml"          ]] && fails+=("harness.yaml still exists after migration")

# compose.overrides is a list .env cannot hold, so it moves to .oh/config.json.
if command -v jq >/dev/null 2>&1; then
  [[ -f "$work/.oh/config.json" ]] || fails+=(".oh/config.json was not created for compose.overrides")
  if [[ -f "$work/.oh/config.json" ]]; then
    jq -e '.composeOverrides | index(".devcontainer/docker-compose.probe.yml")' \
      "$work/.oh/config.json" >/dev/null \
      || fails+=("compose.overrides path did not reach .oh/config.json composeOverrides[]")
  fi
fi

# --- Second run: a pure no-op --------------------------------------------------
before="$(cat "$work/.devcontainer/.env")"
set +e
out2="$(sh "$MIGRATOR" "$work" 2>&1)"
rc2=$?
set -e
(( rc2 == 0 ))                                    || fails+=("second run exited $rc2 (must be a silent no-op)")
[[ -z "$out2" ]]                                  || fails+=("second run printed output (must be silent): ${out2%%$'\n'*}")
[[ "$before" == "$(cat "$work/.devcontainer/.env")" ]] || fails+=("second run modified .devcontainer/.env")

if (( ${#fails[@]} > 0 )); then
  echo "REGRESSION: harness.yaml migration contract broken:" >&2
  printf '  - %s\n' "${fails[@]}" >&2
  exit 1
fi

echo "PASS: harness.yaml migration — keys carried over (append / uncomment-in-place / preserve / overwrite), overrides rehomed, file renamed, second run a no-op" >&2
exit 0
