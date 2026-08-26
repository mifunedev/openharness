#!/usr/bin/env bash
# tier: A
# source: issue #663 — prompt-miner engine no-ops via the documented .claude/skills symlink
# desc: two guards on the CLI-entrypoint detection that SKILL.md Step 1 and the daily
#       cron depend on. (1) BEHAVIORAL: invoke mine-traces.mjs through a *symlinked*
#       skills directory — exactly how `.claude/skills -> ../.oh/skills` is laid out —
#       and assert it actually runs (parseable dataset, sessionsScanned > 0). Node
#       resolves symlinks for import.meta.url but not for process.argv[1], so an
#       `import.meta.url === pathToFileURL(argv[1])` guard silently no-ops here: exit 0,
#       zero stdout, nothing written. The two existing prompt-miner probes both hardcode
#       the real .oh/ path and are structurally blind to it. (2) STATIC: no executable
#       line under .oh/skills/**/*.mjs may reintroduce that comparison, in either operand
#       order, nor hand process.argv to pathToFileURL() — mine-traces.mjs was the third
#       instance of a pattern rlm/ and weigh/ already document as forbidden.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SKILL_DIR="$ROOT/.oh/skills/prompt-miner"
ENGINE_REL="prompt-miner/scripts/mine-traces.mjs"
FIXTURES="$SKILL_DIR/scripts/__tests__/fixtures"

if [[ ! -d "$ROOT/.oh/skills" ]]; then
  echo "SKIPPED: skills dir absent: $ROOT/.oh/skills" >&2
  exit 2
fi
if [[ ! -f "$ROOT/.oh/skills/$ENGINE_REL" ]]; then
  echo "SKIPPED: engine absent: $ROOT/.oh/skills/$ENGINE_REL" >&2
  exit 2
fi
if [[ ! -d "$FIXTURES" ]]; then
  echo "SKIPPED: fixtures dir absent: $FIXTURES" >&2
  exit 2
fi
if ! command -v node >/dev/null 2>&1; then
  echo "SKIPPED: node unavailable" >&2
  exit 2
fi

TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

if ! ln -s "$ROOT/.oh/skills" "$TMP/skills" 2>/dev/null; then
  echo "SKIPPED: filesystem does not support symlinks (cannot reproduce provider layout)" >&2
  exit 2
fi

set +e
out="$(node "$TMP/skills/$ENGINE_REL" --dry-run --no-git --fixtures-dir "$FIXTURES" 2>/dev/null)"
rc=$?
set -e

if [[ "$rc" -ne 0 ]]; then
  echo "REGRESSION: engine invoked via symlinked skills dir exited $rc" >&2
  exit 1
fi
if [[ -z "$out" ]]; then
  echo "REGRESSION: engine invoked via symlinked skills dir produced ZERO stdout at exit 0 —" \
       "the CLI-entrypoint guard no-opped (issue #663). SKILL.md Step 1 and .oh/crons/prompt-miner.md" \
       "both invoke through this path." >&2
  exit 1
fi

scanned="$(
  printf '%s' "$out" | node -e '
    let d = "";
    process.stdin.on("data", c => d += c).on("end", () => {
      try {
        const j = JSON.parse(d);
        process.stdout.write(String((j.manifest && j.manifest.sessionsScanned) || 0) + "\n");
      } catch {
        process.stdout.write("PARSE_FAIL\n");
      }
    });
  '
)" || true

if [[ "$scanned" == "PARSE_FAIL" ]]; then
  echo "REGRESSION: engine invoked via symlinked skills dir emitted non-JSON stdout" >&2
  exit 1
fi
if ! [[ "$scanned" =~ ^[0-9]+$ ]] || (( scanned == 0 )); then
  echo "REGRESSION: engine invoked via symlinked skills dir returned sessionsScanned=$scanned (want > 0)" >&2
  exit 1
fi

offenders="$(
  git -C "$ROOT" grep -nE \
    'import\.meta\.url[[:space:]]*===|===[[:space:]]*import\.meta\.url|pathToFileURL\([^)]*process\.argv' \
    -- '.oh/skills/**/*.mjs' 2>/dev/null \
    | grep -vE ':[0-9]+:[[:space:]]*(//|\*)' \
    || true
)"

if [[ -n "$offenders" ]]; then
  echo "REGRESSION: symlink-unsafe CLI-entrypoint guard reintroduced (issue #663) —" \
       "use \`path.basename(process.argv[1] || \"\") === \"<file>.mjs\"\` instead:" >&2
  printf '%s\n' "$offenders" >&2
  exit 1
fi

echo "PASS: prompt-miner engine runs through a symlinked skills dir (sessionsScanned=$scanned);" \
     "no symlink-unsafe entrypoint guard in .oh/skills/**/*.mjs" >&2
exit 0
