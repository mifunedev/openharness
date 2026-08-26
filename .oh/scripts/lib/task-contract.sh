# shellcheck shell=bash

TASK_CONTRACT_FILES=(prd.md prd.json prompt.md progress.txt)

task_contract_validate_slug() {
  local slug="${1:-}"
  if [[ ! "$slug" =~ ^[a-z0-9-]+$ ]]; then
    printf "Error: <taskdesc> must match ^[a-z0-9-]+\$ (got: '%s')\n" "$slug" >&2
    return 2
  fi
  return 0
}

task_contract_validate_dir() {
  local task_dir="${1:-}" f
  if [ ! -d "$task_dir" ]; then
    printf 'Error: %s does not exist.\n' "$task_dir" >&2
    printf 'Hint: scaffold a task with /prd then /ralph first.\n' >&2
    return 1
  fi
  for f in "${TASK_CONTRACT_FILES[@]}"; do
    if [ ! -f "$task_dir/$f" ]; then
      printf 'Error: %s/%s is missing (SPEC §tasks/ four-file contract).\n' "$task_dir" "$f" >&2
      return 1
    fi
  done
  return 0
}
