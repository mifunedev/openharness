# shellcheck shell=bash
#
# .oh/scripts/lib/task-contract.sh — the shared task-folder contract.
#
# The slug regex and the four-file contract (prd.md, prd.json, prompt.md,
# progress.txt) are the ONE interface every executor validates a task folder
# against. This helper exists so the executors cannot silently diverge: an
# executor sources it instead of growing its own private copy of the checks.
#
# ---------------------------------------------------------------------------
# WORDING PROVENANCE
# ---------------------------------------------------------------------------
# The error and hint strings below are taken from `.oh/scripts/ralph.sh` — the
# slug check at ralph.sh:394-397, the task-dir check at ralph.sh:402-406, and
# the four-file loop at ralph.sh:409-414 — so that an operator sees the SAME
# message whichever executor rejected the folder. `.oh/scripts/ralph.sh` itself
# is a protected path and stays ZERO-DIFF this round, so it does not source this
# file; the duplication is deliberate and this comment is its attribution.
#
# ---------------------------------------------------------------------------
# CONTRACT: THE CALLER OWNS SHELL OPTIONS; THIS LIBRARY MUST NOT MUTATE THEM.
# ---------------------------------------------------------------------------
# There is deliberately no file-scope `set` here, for the same reason
# `.oh/scripts/lib/session-runner.sh` has none: a `set` in a sourced file
# silently rewrites the caller's option state for the rest of its execution,
# which no linter flags. These functions RETURN non-zero on failure; a sourced
# library must never `exit` the caller's shell.

# The four-file contract, in the order ralph.sh checks them.
TASK_CONTRACT_FILES=(prd.md prd.json prompt.md progress.txt)

# Per SPEC: kebab-case and shell-safe, because the slug becomes part of a
# session name, a log path and a lock path.
task_contract_validate_slug() { # <slug>
  local slug="${1:-}"
  if [[ ! "$slug" =~ ^[a-z0-9-]+$ ]]; then
    printf "Error: <taskdesc> must match ^[a-z0-9-]+\$ (got: '%s')\n" "$slug" >&2
    return 2
  fi
  return 0
}

# The folder must exist AND carry all four files. A partial folder is a
# scaffolding bug, not something an executor should launch against.
task_contract_validate_dir() { # <task_dir>
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
