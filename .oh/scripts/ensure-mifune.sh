#!/usr/bin/env bash
# Initialize and verify the pinned Mifune submodule consumed at .mifune/.
set -euo pipefail

EXPECTED_URL="https://github.com/ryaneggz/mifune.git"
SUBMODULE_PATH=".mifune"
PROTECTED_PATHS_FILE=".claude/protected-paths.txt"

required_files=(
  ".mifune/skills/git/SKILL.md"
  ".mifune/skills/t3/references/sandbox-processes.md"
  ".mifune/skills/advisor/SKILL.md"
  ".mifune/skills/advisor/references/recursive-delegation.md"
  ".mifune/skills/retro/references/memory-protocol.md"
  ".mifune/skills/wiki/references/schema.md"
  ".mifune/skills/eval/run.sh"
)

required_execs=(
  ".mifune/hooks/deny-env-dump.sh"
  ".mifune/hooks/deny-secret-paths.sh"
  ".mifune/hooks/warn-devtcp.sh"
  ".mifune/skills/autopilot/autopilot-caps.sh"
  ".mifune/skills/cloudflared/scripts/run.sh"
  ".mifune/skills/context-audit/runner.sh"
  ".mifune/skills/eval/run.sh"
  ".mifune/skills/prompt-miner/prompt-miner-caps.sh"
  ".mifune/skills/prompt-miner/scripts/render-log-entry.sh"
  ".mifune/skills/retro/scripts/check-memory-duplicates.sh"
  ".mifune/skills/retro/scripts/render-log-entry.sh"
  ".mifune/skills/retro/scripts/validate-retro-report.sh"
  ".mifune/skills/t3/scripts/t3-code.sh"
)

provider_links=(
  ".pi/skills|../.mifune/skills"
  ".claude/skills|../.mifune/skills"
  ".codex/skills|../.mifune/skills"
  ".claude/agents|../.mifune/agents"
  ".claude/hooks|../.mifune/hooks"
  ".codex/agents|../.claude/agents"
)

usage() {
  cat <<'EOF'
usage: bash .oh/scripts/ensure-mifune.sh [--init|--check]

--init   initialize/repair the pinned .mifune submodule, then verify it
--check  verify .mifune without mutating it
EOF
}

mode="${1:---check}"
case "$mode" in
  --init|--check) ;;
  -h|--help) usage; exit 0 ;;
  *) usage >&2; exit 64 ;;
esac

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ -z "$repo_root" ]; then
  echo "ERROR: ensure-mifune must run inside an Open Harness git checkout" >&2
  exit 1
fi
cd "$repo_root"

normalize_url() {
  case "${1:-}" in
    *.git) printf '%s\n' "$1" ;;
    "") printf '\n' ;;
    *) printf '%s.git\n' "$1" ;;
  esac
}

expected_sha() {
  git ls-files --stage -- "$SUBMODULE_PATH" | awk '$1 == "160000" { print $2; exit }'
}

current_sha() {
  if git -C "$SUBMODULE_PATH" rev-parse --verify HEAD >/dev/null 2>&1; then
    git -C "$SUBMODULE_PATH" rev-parse HEAD
  else
    printf '<uninitialized>\n'
  fi
}

current_url() {
  if git -C "$SUBMODULE_PATH" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git -C "$SUBMODULE_PATH" config --get remote.origin.url || true
  else
    printf '<uninitialized>\n'
  fi
}

submodule_config_url() {
  git config -f .gitmodules --get submodule..mifune.url 2>/dev/null || true
}

print_state() {
  local sha
  sha="$(expected_sha)"
  cat >&2 <<EOF
Expected Mifune URL: $EXPECTED_URL
Expected Mifune SHA: ${sha:-<missing gitlink>}
Current Mifune URL: $(current_url)
Current Mifune SHA: $(current_sha)
Remediation: bash .oh/scripts/ensure-mifune.sh --init
EOF
}

failures=0
fail() {
  echo "ERROR: $*" >&2
  failures=1
}

prepare_empty_or_missing_submodule_dir() {
  if [ ! -e "$SUBMODULE_PATH" ]; then
    return 0
  fi
  if git -C "$SUBMODULE_PATH" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    return 0
  fi
  if [ -d "$SUBMODULE_PATH" ] && [ -z "$(find "$SUBMODULE_PATH" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
    rm -rf "$SUBMODULE_PATH"
    return 0
  fi
  fail "$SUBMODULE_PATH exists but is not an initialized git submodule; move it aside, then run --init"
  return 1
}

init_mifune() {
  prepare_empty_or_missing_submodule_dir || true
  if [ "$failures" -ne 0 ]; then
    return 1
  fi

  git submodule sync -- "$SUBMODULE_PATH" >/dev/null
  git submodule update --init --recursive --checkout "$SUBMODULE_PATH"

  local f
  for f in "${required_execs[@]}"; do
    [ -f "$f" ] && chmod +x "$f"
  done

  if [ "${INSTALL_HERMES:-false}" = "true" ]; then
    mkdir -p .hermes/skills
    if [ -L .hermes/skills/openharness ]; then
      if [ "$(readlink .hermes/skills/openharness)" != "../../.mifune/skills" ]; then
        rm -f .hermes/skills/openharness
        ln -s ../../.mifune/skills .hermes/skills/openharness
      fi
    elif [ ! -e .hermes/skills/openharness ]; then
      ln -s ../../.mifune/skills .hermes/skills/openharness
    fi
  fi
}

check_symlink() {
  local path="$1"
  local expected_target="$2"
  if [ ! -L "$path" ]; then
    fail "$path is not a symlink"
    return
  fi
  local target
  target="$(readlink "$path")"
  if [ "$target" != "$expected_target" ]; then
    fail "$path points to $target, expected $expected_target"
  fi
  if [ ! -e "$path" ]; then
    fail "$path target is missing; initialize $SUBMODULE_PATH"
  fi
}

check_hermes_link() {
  if [ "${INSTALL_HERMES:-false}" != "true" ] && [ ! -e .hermes/skills/openharness ] && [ ! -L .hermes/skills/openharness ]; then
    return 0
  fi
  check_symlink ".hermes/skills/openharness" "../../.mifune/skills"
  if [ ! -f .hermes/skills/openharness/git/SKILL.md ]; then
    fail ".hermes/skills/openharness/git/SKILL.md is missing"
  fi
}

check_protected_mifune_paths() {
  if [ ! -f "$PROTECTED_PATHS_FILE" ]; then
    fail "$PROTECTED_PATHS_FILE is missing"
    return
  fi

  local entry
  while IFS= read -r entry || [ -n "$entry" ]; do
    entry="${entry%%#*}"
    entry="$(printf '%s' "$entry" | xargs)"
    [ -n "$entry" ] || continue
    case "$entry" in
      .mifune/*)
        [ -e "$entry" ] || fail "protected Mifune path missing: $entry"
        ;;
    esac
  done < "$PROTECTED_PATHS_FILE"
}

check_mifune() {
  local sha configured_url submodule_url submodule_head
  sha="$(expected_sha)"
  configured_url="$(submodule_config_url)"
  submodule_url="$(current_url)"
  submodule_head="$(current_sha)"

  if [ -z "$sha" ]; then
    fail "$SUBMODULE_PATH is not recorded as a git submodule in the index"
  fi
  if [ "$(normalize_url "$configured_url")" != "$EXPECTED_URL" ]; then
    fail ".gitmodules URL for $SUBMODULE_PATH is ${configured_url:-<missing>}, expected $EXPECTED_URL"
  fi
  if [ ! -d "$SUBMODULE_PATH" ] || ! git -C "$SUBMODULE_PATH" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    fail "$SUBMODULE_PATH is missing or uninitialized"
  fi
  if [ "$(normalize_url "$submodule_url")" != "$EXPECTED_URL" ]; then
    fail "$SUBMODULE_PATH origin URL is $submodule_url, expected $EXPECTED_URL"
  fi
  if [ -n "$sha" ] && [ "$submodule_head" != "$sha" ]; then
    fail "$SUBMODULE_PATH is at $submodule_head, expected pinned SHA $sha"
  fi

  local f
  for f in "${required_files[@]}"; do
    [ -f "$f" ] || fail "required Mifune file missing: $f"
  done
  for f in "${required_execs[@]}"; do
    [ -x "$f" ] || fail "required Mifune executable missing or not executable: $f"
  done

  local link path expected_target
  for link in "${provider_links[@]}"; do
    path="${link%%|*}"
    expected_target="${link#*|}"
    check_symlink "$path" "$expected_target"
  done

  check_hermes_link
  check_protected_mifune_paths
}

if [ "$mode" = "--init" ]; then
  init_mifune
fi

check_mifune

if [ "$failures" -ne 0 ]; then
  print_state
  exit 1
fi

printf 'Mifune OK: %s @ %s\n' "$EXPECTED_URL" "$(expected_sha)"
