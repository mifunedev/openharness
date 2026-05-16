#!/usr/bin/env bash
set -euo pipefail

# Mifune Skills Installer — V0
# Usage: install.sh install <skill-name> [--scope project|user] [--client agents|claude|harness]
# See: https://github.com/mifunedev/skills

REGISTRY_REPO="${MIFUNE_REGISTRY_REPO:-https://github.com/mifunedev/skills}"
REGISTRY_BRANCH="${MIFUNE_REGISTRY_BRANCH:-master}"
CLI_VERSION="0.1.0"
PROG="$(basename "$0")"

usage() {
  cat <<EOF
Usage: $PROG install <skill-name> [--scope project] [--client agents|claude|harness]

Install a Mifune skill from the mifunedev/skills registry.

Options:
  --scope <scope>    Scope for install: project (default). user|system deferred to V1.
  --client <client>  Target client: agents (default), claude, harness (both).
  --symlink          Not supported in V0; deferred to V1.
  --help             Print this help and exit 0.

Exit codes:
  0  Success (or already installed idempotently).
  3  Refused: detected open-harness repo (safeguard).
  4  No git working tree found (--scope project requires .git).
  5  Feature deferred to V1 (--scope user/system or --symlink).
EOF
}

# ---- argument parsing -------------------------------------------------------

COMMAND=""
SKILL_NAME=""
SCOPE="project"
CLIENT="agents"
SYMLINK=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    install)
      COMMAND="install"
      shift
      if [[ $# -gt 0 && "$1" != --* ]]; then
        SKILL_NAME="$1"
        shift
      fi
      ;;
    --scope)
      SCOPE="${2:-}"
      shift 2
      ;;
    --client)
      CLIENT="${2:-}"
      shift 2
      ;;
    --symlink)
      SYMLINK=1
      shift
      ;;
    *)
      echo "ERR: unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ "$COMMAND" != "install" ]]; then
  usage
  exit 1
fi

if [[ -z "$SKILL_NAME" ]]; then
  echo "ERR: skill name required" >&2
  exit 1
fi

# ---- V1-deferred features ---------------------------------------------------

if [[ "$SYMLINK" -eq 1 ]]; then
  echo "ERR: --symlink deferred to V1" >&2
  exit 5
fi

if [[ "$SCOPE" == "user" || "$SCOPE" == "system" ]]; then
  echo "ERR: --scope $SCOPE deferred to V1" >&2
  exit 5
fi

if [[ "$SCOPE" != "project" ]]; then
  echo "ERR: unknown --scope value: $SCOPE (V0 supports: project)" >&2
  exit 1
fi

if [[ "$CLIENT" != "agents" && "$CLIENT" != "claude" && "$CLIENT" != "harness" ]]; then
  echo "ERR: unknown --client value: $CLIENT (V0 supports: agents, claude, harness)" >&2
  exit 1
fi

# ---- resolve git root -------------------------------------------------------

find_git_root() {
  local dir
  dir="$(pwd)"
  while [[ "$dir" != "/" ]]; do
    if [[ -e "$dir/.git" ]]; then
      echo "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

GIT_ROOT=""
if [[ "$SCOPE" == "project" ]]; then
  if ! GIT_ROOT="$(find_git_root)"; then
    echo "ERR: --scope project requires a git working tree (none found by walk-up from cwd)" >&2
    exit 4
  fi
fi

# ---- open-harness safeguard -------------------------------------------------

check_open_harness() {
  # Detect open-harness repo by presence of BOTH .claude/protected-paths.txt
  # AND context/SOUL.md at cwd or any walk-up parent.
  local dir
  dir="$(pwd)"
  while [[ "$dir" != "/" ]]; do
    if [[ -f "$dir/.claude/protected-paths.txt" && -f "$dir/context/SOUL.md" ]]; then
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

if [[ "$CLIENT" == "claude" || "$CLIENT" == "harness" ]]; then
  if check_open_harness; then
    echo "ERR: refusing to write into the open-harness skill namespace; this looks like the harness repo. Run from a different project root." >&2
    exit 3
  fi
fi

# ---- resolve install paths --------------------------------------------------

INSTALL_PATHS=()
case "$CLIENT" in
  agents)
    INSTALL_PATHS=("${GIT_ROOT}/.agents/skills/${SKILL_NAME}")
    ;;
  claude)
    INSTALL_PATHS=("${GIT_ROOT}/.claude/skills/${SKILL_NAME}")
    ;;
  harness)
    INSTALL_PATHS=("${GIT_ROOT}/.agents/skills/${SKILL_NAME}" "${GIT_ROOT}/.claude/skills/${SKILL_NAME}")
    ;;
esac

# ---- lock file setup --------------------------------------------------------

LOCK_DIR="${GIT_ROOT}/.mifune"
LOCK_FILE="${LOCK_DIR}/skills.lock"
LOCK_LCK="${LOCK_DIR}/skills.lock.lck"

# ---- idempotency check ------------------------------------------------------

if [[ -f "$LOCK_FILE" ]] && grep -q "\"${SKILL_NAME}\"" "$LOCK_FILE" 2>/dev/null; then
  LOCKED_COMMIT="$(python3 -c "
import json, sys
data = json.load(open('${LOCK_FILE}'))
entry = data.get('skills', {}).get('${SKILL_NAME}', {})
print(entry.get('commit', ''))
" 2>/dev/null || echo "")"

  ALL_PRESENT=1
  for p in "${INSTALL_PATHS[@]}"; do
    if [[ ! -d "$p" ]]; then
      ALL_PRESENT=0
      break
    fi
  done

  if [[ "$ALL_PRESENT" -eq 1 && -n "$LOCKED_COMMIT" ]]; then
    echo "already installed at ${INSTALL_PATHS[0]} (commit ${LOCKED_COMMIT})"
    exit 0
  fi
fi

# ---- clone repo to temp dir -------------------------------------------------

TMPDIR_CLONE="$(mktemp -d)"
cleanup_clone() {
  rm -rf "$TMPDIR_CLONE"
}
trap cleanup_clone EXIT

echo "Cloning mifunedev/skills (depth 1)..." >&2
if ! git clone --quiet --depth 1 --branch "$REGISTRY_BRANCH" "$REGISTRY_REPO" "$TMPDIR_CLONE" 2>&1; then
  echo "ERR: failed to clone $REGISTRY_REPO" >&2
  exit 1
fi

# Capture commit SHA immediately after clone (P6 mitigation — pins SHA, not branch ref)
COMMIT_SHA="$(git -C "$TMPDIR_CLONE" rev-parse HEAD)"

# Validate commit SHA is 40-char hex
if ! echo "$COMMIT_SHA" | grep -qE '^[0-9a-f]{40}$'; then
  echo "ERR: unexpected commit SHA format: $COMMIT_SHA" >&2
  exit 1
fi

# ---- verify skill exists in clone -------------------------------------------

SKILL_SRC="${TMPDIR_CLONE}/skills/${SKILL_NAME}"
if [[ ! -d "$SKILL_SRC" ]]; then
  echo "ERR: skill '${SKILL_NAME}' not found in registry" >&2
  exit 1
fi

if [[ ! -f "${SKILL_SRC}/SKILL.md" ]]; then
  echo "ERR: skill '${SKILL_NAME}' is missing SKILL.md — invalid skill folder" >&2
  exit 1
fi

# ---- atomic install sequence ------------------------------------------------

STAGING_DIRS=()
MOVED_FINALS=()

rollback() {
  local rc=$?
  if [[ $rc -ne 0 ]]; then
    echo "ERR: install failed (exit $rc), rolling back..." >&2
    for sd in "${STAGING_DIRS[@]:-}"; do
      [[ -n "$sd" ]] && rm -rf "$sd" 2>/dev/null || true
    done
    for fd in "${MOVED_FINALS[@]:-}"; do
      [[ -n "$fd" ]] && rm -rf "$fd" 2>/dev/null || true
    done
  fi
}
trap rollback ERR

# Compute checksum of source skill folder (algorithm per docs/checksum.md)
CHECKSUM="sha256:$(find "$SKILL_SRC" -type f -not -path '*/.*' | LC_ALL=C sort | xargs sha256sum | sha256sum | cut -d' ' -f1)"

# Create staging dirs and copy into them
for DEST_PATH in "${INSTALL_PATHS[@]}"; do
  DEST_PARENT="$(dirname "$DEST_PATH")"
  mkdir -p "$DEST_PARENT"

  STAGING_BASE="${DEST_PARENT}/.mifune-staging-$$"

  # Detect cross-filesystem: compare device IDs of clone temp dir and destination parent
  SRC_DEV="$(stat -c '%d' "$TMPDIR_CLONE" 2>/dev/null || stat -f '%d' "$TMPDIR_CLONE")"
  DST_DEV="$(stat -c '%d' "$DEST_PARENT" 2>/dev/null || stat -f '%d' "$DEST_PARENT")"
  if [[ "$SRC_DEV" != "$DST_DEV" ]]; then
    echo "ERR: install path on different filesystem from working tree" >&2
    exit 1
  fi

  cp -r "$SKILL_SRC" "$STAGING_BASE"
  STAGING_DIRS+=("$STAGING_BASE")
done

# Atomically move each staging dir to its final path
for DEST_PATH in "${INSTALL_PATHS[@]}"; do
  DEST_PARENT="$(dirname "$DEST_PATH")"
  STAGING_BASE="${DEST_PARENT}/.mifune-staging-$$"

  if [[ -d "$DEST_PATH" ]]; then
    rm -rf "$DEST_PATH"
  fi

  if ! mv "$STAGING_BASE" "$DEST_PATH"; then
    echo "ERR: install path on different filesystem from working tree" >&2
    exit 1
  fi

  STAGING_DIRS=("${STAGING_DIRS[@]/$STAGING_BASE/}")
  MOVED_FINALS+=("$DEST_PATH")
done

# Verify SKILL.md exists in each installed path before declaring success
for DEST_PATH in "${INSTALL_PATHS[@]}"; do
  if [[ ! -f "${DEST_PATH}/SKILL.md" ]]; then
    echo "ERR: SKILL.md missing from installed path ${DEST_PATH}" >&2
    exit 1
  fi
done

# ---- write lock file --------------------------------------------------------

# Build installed_paths JSON array (paths relative to git root)
PATHS_JSON="["
FIRST=1
for DEST_PATH in "${INSTALL_PATHS[@]}"; do
  REL_PATH="${DEST_PATH#"${GIT_ROOT}"/}"
  if [[ "$FIRST" -eq 1 ]]; then
    PATHS_JSON="${PATHS_JSON}\"${REL_PATH}\""
    FIRST=0
  else
    PATHS_JSON="${PATHS_JSON}, \"${REL_PATH}\""
  fi
done
PATHS_JSON="${PATHS_JSON}]"

NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TODAY="${NOW%T*}"

mkdir -p "$LOCK_DIR"

# Take advisory lock
exec 9>"$LOCK_LCK"
if ! flock -w 30 9; then
  echo "ERR: could not acquire lock on ${LOCK_LCK} (waited 30s)" >&2
  exit 1
fi

if [[ -f "$LOCK_FILE" ]]; then
  # Update existing lock file using python3 reading from a temp file
  SKILL_JSON_TMP="$(mktemp)"
  python3 -c "
import json, sys
paths = json.loads('${PATHS_JSON}')
entry = {
    'source': 'github:mifunedev/skills',
    'registry_version': '${TODAY}',
    'skill_version': '0.1.0',
    'commit': '${COMMIT_SHA}',
    'checksum': '${CHECKSUM}',
    'installed_paths': paths
}
print(json.dumps(entry, indent=2))
" > "$SKILL_JSON_TMP"

  python3 - "$LOCK_FILE" "$SKILL_JSON_TMP" "${SKILL_NAME}" "${NOW}" "${LOCK_FILE}.tmp" <<'PYEOF'
import json, sys
lock_path, entry_path, skill_name, now, out_path = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]
data = json.load(open(lock_path))
entry = json.load(open(entry_path))
data['generated_at'] = now
data['skills'][skill_name] = entry
with open(out_path, 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
PYEOF
  mv "${LOCK_FILE}.tmp" "$LOCK_FILE"
  rm -f "$SKILL_JSON_TMP"
else
  # Create a fresh lock file
  python3 -c "
import json
paths = json.loads('${PATHS_JSON}')
data = {
    '\$schema': 'https://skills.mifune.dev/schema/skills-lock.v1.json',
    'version': '1',
    'scope': '${SCOPE}',
    'client': '${CLIENT}',
    'generated_by': '@mifune/skills-cli@${CLI_VERSION}',
    'generated_at': '${NOW}',
    'skills': {
        '${SKILL_NAME}': {
            'source': 'github:mifunedev/skills',
            'registry_version': '${TODAY}',
            'skill_version': '0.1.0',
            'commit': '${COMMIT_SHA}',
            'checksum': '${CHECKSUM}',
            'installed_paths': paths
        }
    }
}
import sys
json.dump(data, sys.stdout, indent=2)
print()
" > "$LOCK_FILE"
fi

# Release advisory lock
exec 9>&-

# ---- success ----------------------------------------------------------------

echo "installed ${SKILL_NAME} at ${INSTALL_PATHS[*]} (commit ${COMMIT_SHA})"
