#!/usr/bin/env bash
# Create/repair the provider skill/agent/hook symlinks into the vendored .oh/
# pack, and verify the pack is present. The skills/agents/hooks primitive pack is
# vendored directly under .oh/ (no submodule), so there is nothing to fetch —
# this script only wires the provider surfaces to it and validates the result.
set -euo pipefail

PROTECTED_PATHS_FILE=".claude/protected-paths.txt"

# cc-safety-net destructive-command guard: pinned binary installed at image
# build time (see .devcontainer/Dockerfile). Boot validation is presence +
# version only — zero npm-registry access. See install-decision.md.
CC_SAFETY_NET_PIN="1.0.6"

required_files=(
  ".oh/skills/git/SKILL.md"
  ".oh/skills/herdr/SKILL.md"
  ".oh/skills/t3/references/sandbox-processes.md"
  ".oh/agents/advisor.md"
  ".oh/skills/retro/references/memory-protocol.md"
  ".oh/skills/wiki/references/schema.md"
  ".oh/skills/eval/run.sh"
)

required_execs=(
  ".oh/hooks/deny-env-dump.sh"
  ".oh/hooks/deny-secret-paths.sh"
  ".oh/hooks/warn-devtcp.sh"
  ".oh/skills/autopilot/autopilot-caps.sh"
  ".oh/skills/cloudflared/scripts/run.sh"
  ".oh/skills/audit/scripts/context-audit-runner.sh"
  ".oh/skills/eval/run.sh"
  ".oh/skills/prompt-miner/prompt-miner-caps.sh"
  ".oh/skills/prompt-miner/scripts/render-log-entry.sh"
  ".oh/scripts/reconcile-herdr-integrations.sh"
  ".oh/scripts/package-herdr-corresponding-source.sh"
  ".oh/skills/retro/scripts/check-memory-duplicates.sh"
  ".oh/skills/retro/scripts/render-log-entry.sh"
  ".oh/skills/retro/scripts/validate-retro-report.sh"
  ".oh/skills/t3/scripts/t3-code.sh"
)

provider_links=(
  ".pi/skills|../.oh/skills"
  ".claude/skills|../.oh/skills"
  ".codex/skills|../.oh/skills"
  ".claude/agents|../.oh/agents"
  ".claude/hooks|../.oh/hooks"
  ".codex/agents|../.claude/agents"
)

HERMES_LINK=".hermes/skills/openharness"
HERMES_TARGET="../../.oh/skills"

usage() {
  cat <<'EOF'
usage: bash .oh/scripts/link-providers.sh [--init|--check]

--init   create/repair the provider symlinks into .oh/, then verify
--check  verify the provider symlinks + vendored .oh/ pack without mutating
EOF
}

mode="${1:---check}"
case "$mode" in
  --init|--check) ;;
  -h|--help) usage; exit 0 ;;
  *) usage >&2; exit 64 ;;
esac

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
# Inside a git checkout, git wins. Otherwise fall back to the project root
# (OH_PROJECT_ROOT, else PWD) so `oh init`-equipped projects and standalone
# trees — which are not git repos — still wire their providers instead of
# crash-looping the sandbox boot. The real guard is the vendored pack below.
if [ -z "$repo_root" ]; then
  repo_root="${OH_PROJECT_ROOT:-$PWD}"
fi
if [ ! -d "$repo_root/.oh/skills" ]; then
  echo "ERROR: not an Open Harness tree (no .oh/skills at $repo_root)" >&2
  exit 1
fi
cd "$repo_root"

failures=0
fail() {
  echo "ERROR: $*" >&2
  failures=1
}

print_state() {
  cat >&2 <<EOF
Vendored skill pack: .oh/skills (expected to exist as tracked files)
Provider surfaces:   .pi/skills .claude/skills .codex/skills -> ../.oh/skills
Remediation: bash .oh/scripts/link-providers.sh --init
EOF
}

link_provider() {
  local path="$1" target="$2"
  mkdir -p "$(dirname "$path")"
  if [ -L "$path" ]; then
    [ "$(readlink "$path")" = "$target" ] && return 0
    rm -f "$path"
  elif [ -e "$path" ]; then
    fail "$path exists and is not a symlink; move it aside, then run --init"
    return 1
  fi
  ln -s "$target" "$path"
}

init_links() {
  if [ ! -d .oh/skills ]; then
    fail ".oh/skills is missing — the vendored skill pack is not present"
    return 1
  fi

  local link path target
  for link in "${provider_links[@]}"; do
    path="${link%%|*}"
    target="${link#*|}"
    link_provider "$path" "$target" || true
  done

  local f
  for f in "${required_execs[@]}"; do
    [ -f "$f" ] && chmod +x "$f"
  done

  if [ "${INSTALL_HERMES:-false}" = "true" ]; then
    link_provider "$HERMES_LINK" "$HERMES_TARGET" || true
  fi
}

check_symlink() {
  local path="$1" expected_target="$2" target
  if [ ! -L "$path" ]; then
    fail "$path is not a symlink"
    return
  fi
  target="$(readlink "$path")"
  if [ "$target" != "$expected_target" ]; then
    fail "$path points to $target, expected $expected_target"
  fi
  if [ ! -e "$path" ]; then
    fail "$path target is missing; the vendored .oh/ pack is incomplete"
  fi
}

check_hermes_link() {
  if [ "${INSTALL_HERMES:-false}" != "true" ] && [ ! -e "$HERMES_LINK" ] && [ ! -L "$HERMES_LINK" ]; then
    return 0
  fi
  check_symlink "$HERMES_LINK" "$HERMES_TARGET"
  if [ ! -f "$HERMES_LINK/git/SKILL.md" ]; then
    fail "$HERMES_LINK/git/SKILL.md is missing"
  fi
}

check_protected_paths() {
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
      .oh/skills/*|.oh/agents/*|.oh/hooks/*)
        [ -e "$entry" ] || fail "protected pack path missing: $entry"
        ;;
    esac
  done < "$PROTECTED_PATHS_FILE"
}

check_cc_safety_net() {
  # New check-kind: the required_* arrays above validate repo-relative files;
  # cc-safety-net is a global binary on PATH, so it needs a presence + version
  # check instead. Fails loudly via the shared `fail` path when the binary is
  # missing or version-mismatched — UNLESS CC_SAFETY_NET_OFF=1, the kill-switch,
  # which must never brick boot (downgrade to a warning and continue).
  local off="${CC_SAFETY_NET_OFF:-}" version
  if ! command -v cc-safety-net >/dev/null 2>&1; then
    if [ "$off" = "1" ]; then
      echo "WARNING: cc-safety-net not on PATH, but CC_SAFETY_NET_OFF=1 — continuing" >&2
      return 0
    fi
    fail "cc-safety-net binary not found on PATH (expected @${CC_SAFETY_NET_PIN}); install via .devcontainer/Dockerfile, or set CC_SAFETY_NET_OFF=1 to bypass"
    return
  fi
  version="$(cc-safety-net --version 2>/dev/null | tr -d '[:space:]' || true)"
  case "$version" in
    *"$CC_SAFETY_NET_PIN"*) ;;
    *)
      if [ "$off" = "1" ]; then
        echo "WARNING: cc-safety-net version '$version' != pin ${CC_SAFETY_NET_PIN}, but CC_SAFETY_NET_OFF=1 — continuing" >&2
        return 0
      fi
      fail "cc-safety-net version mismatch: found '$version', expected ${CC_SAFETY_NET_PIN}; re-pin per install-decision.md, or set CC_SAFETY_NET_OFF=1 to bypass"
      ;;
  esac
}

check_links() {
  if [ ! -d .oh/skills ]; then
    fail ".oh/skills is missing — the vendored skill pack is not present"
  fi

  local f
  for f in "${required_files[@]}"; do
    [ -f "$f" ] || fail "required pack file missing: $f"
  done
  for f in "${required_execs[@]}"; do
    [ -x "$f" ] || fail "required pack executable missing or not executable: $f"
  done

  # cc-safety-net enforcement is scoped to environments where the guard is
  # actually enabled: the sandbox container exports CC_SAFETY_NET_STRICT=1 via
  # docker-compose, and the Dockerfile guarantees the binary there. CI runners
  # and pre-rebuild hosts also run this script (both --init and --check) but
  # never set that marker — failing there would recreate the #639
  # boot-adjacent failure class. The eval probe cc-safety-net-wiring.sh owns
  # non-sandbox verification with proper SKIP semantics.
  if [ "${CC_SAFETY_NET_STRICT:-}" = "1" ]; then
    check_cc_safety_net
  else
    command -v cc-safety-net >/dev/null 2>&1 || \
      echo "note: cc-safety-net not on PATH (enforced only where CC_SAFETY_NET_STRICT=1, i.e. inside the sandbox)" >&2
  fi

  local link path expected_target
  for link in "${provider_links[@]}"; do
    path="${link%%|*}"
    expected_target="${link#*|}"
    check_symlink "$path" "$expected_target"
  done

  check_hermes_link
  check_protected_paths
}

if [ "$mode" = "--init" ]; then
  init_links
fi

check_links

if [ "$failures" -ne 0 ]; then
  print_state
  exit 1
fi

printf 'Providers OK: .pi/.claude/.codex skills -> .oh/skills (vendored pack present)\n'
