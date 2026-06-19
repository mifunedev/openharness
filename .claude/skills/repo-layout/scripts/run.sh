#!/usr/bin/env bash
set -euo pipefail

IGNORE_PATTERN='.git|node_modules|.pnpm-store|.worktrees|dist|build|coverage|.next|.cache|__pycache__'
DEPTH=1
FILE_LIMIT=40
TARGET='.'
RAW=false
RAW_ARGS=()

usage() {
  cat <<'USAGE'
Usage:
  /repo-layout [path] [--depth N]
  /repo-layout [path] [-L N]
  /repo-layout --raw [tree-options]

Default mode prints a concise, descriptive agent premap: a bounded tree plus short notes about recognizable harness areas. Raw mode passes arguments directly to tree.
USAGE
}

describe_path() {
  case "$1" in
    .claude) echo "Claude-facing skills, agents, hooks, and project rules." ;;
    .codex) echo "Codex-facing symlinks/config that mirror Claude surfaces." ;;
    .devcontainer) echo "Sandbox image, compose files, and container entrypoint." ;;
    .github) echo "GitHub Actions, issue templates, and repository automation." ;;
    .pi) echo "Pi runtime config, extensions, prompts, and skill symlink." ;;
    AGENTS.md|CLAUDE.md) echo "Root orchestrator instructions and operating boundaries." ;;
    CHANGELOG.md) echo "Unreleased/release notes required for user-visible changes." ;;
    Makefile) echo "Host lifecycle shortcuts for sandbox create/shell/destroy." ;;
    README.md) echo "Human-facing project overview and quick start." ;;
    context) echo "Always-loaded voice, identity, tools, user, and rules context." ;;
    crons) echo "Markdown-defined autonomous schedules run by cron-runtime." ;;
    docs) echo "Docusaurus documentation for operators and harness users." ;;
    evals) echo "Deterministic regression probes and capability benchmark data." ;;
    install) echo "Boot/install shell assets copied into the sandbox image." ;;
    packages) echo "Workspace packages such as docs and the oh CLI." ;;
    scripts) echo "Harness automation, runtime, and test-covered helper scripts." ;;
    tasks) echo "/ship-spec and Ralph task artifacts for in-flight work." ;;
    wiki) echo "LLM-readable source-backed knowledge base entries." ;;
    workspace) echo "Seed files bind-mounted into the managed agent workspace." ;;
    *) return 1 ;;
  esac
}

if ! command -v tree >/dev/null 2>&1; then
  cat >&2 <<'MSG'
ERROR: tree is not installed in this sandbox.
This repo-layout skill uses the Debian `tree` package. Rebuild the sandbox after this change lands, or install `tree` locally for this session.
MSG
  exit 127
fi

while [ "$#" -gt 0 ]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    --raw)
      RAW=true
      shift
      RAW_ARGS=("$@")
      break
      ;;
    --depth|-L)
      if [ "$#" -lt 2 ]; then
        echo "ERROR: $1 requires a numeric depth" >&2
        exit 2
      fi
      DEPTH="$2"
      shift 2
      ;;
    --depth=*)
      DEPTH="${1#--depth=}"
      shift
      ;;
    -L*)
      DEPTH="${1#-L}"
      shift
      ;;
    --)
      shift
      if [ "$#" -gt 0 ]; then TARGET="$1"; fi
      break
      ;;
    -*)
      echo "ERROR: unsupported premap option: $1 (use --raw to pass native tree options)" >&2
      exit 2
      ;;
    *)
      TARGET="$1"
      shift
      ;;
  esac
done

if [ "$RAW" = true ]; then
  if [ "${#RAW_ARGS[@]}" -eq 0 ]; then
    exec tree -L "$DEPTH" --dirsfirst --filelimit "$FILE_LIMIT" -a -I "$IGNORE_PATTERN" "$TARGET"
  fi
  exec tree "${RAW_ARGS[@]}"
fi

case "$DEPTH" in
  ''|*[!0-9]*) echo "ERROR: depth must be a positive integer" >&2; exit 2 ;;
  0) echo "ERROR: depth must be greater than zero" >&2; exit 2 ;;
esac

if [ ! -e "$TARGET" ]; then
  echo "ERROR: path not found: $TARGET" >&2
  exit 1
fi

printf "# Agent premap: \`%s\`\n\n" "$TARGET"
printf '_Concise map for orientation only; read files for evidence._\n\n'
printf '```text\n'
tree -L "$DEPTH" --dirsfirst --filelimit "$FILE_LIMIT" -a -I "$IGNORE_PATTERN" "$TARGET"
printf '```\n\n'

printf '## Key areas\n\n'
key_count=0
while IFS= read -r entry; do
  name="$(basename "$entry")"
  if desc="$(describe_path "$name")"; then
    printf -- "- \`%s\` - %s\n" "$entry" "$desc"
    key_count=$((key_count + 1))
  fi
done < <(find "$TARGET" -mindepth 1 -maxdepth 1 2>/dev/null | sort)

if [ "$key_count" -eq 0 ]; then
  printf -- "- No known harness landmarks at this level; inspect likely files with \`rg --files %q | head\`.\n" "$TARGET"
fi

printf '\n## Good next reads\n\n'
read_count=0
for candidate in \
  "$TARGET/AGENTS.md" \
  "$TARGET/CLAUDE.md" \
  "$TARGET/README.md" \
  "$TARGET/package.json" \
  "$TARGET/Makefile" \
  "$TARGET/wiki/README.md"; do
  if [ -e "$candidate" ]; then
    printf -- "- \`%s\`\n" "$candidate"
    read_count=$((read_count + 1))
  fi
done
if [ "$read_count" -eq 0 ]; then
  printf -- "- Use \`rg --files %q | head -40\` to choose precise files.\n" "$TARGET"
fi
