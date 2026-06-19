#!/usr/bin/env bash
# tier: A
# source: #455 — docs builds must stay out of fast harness/eval/release gates
# desc: Docusaurus builds run automatically only from docs.yml on main/master pushes
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PACKAGE_JSON="$ROOT/package.json"
CI_WORKFLOW="$ROOT/.github/workflows/ci-harness.yml"
DOCS_WORKFLOW="$ROOT/.github/workflows/docs.yml"
RELEASE_WORKFLOW="$ROOT/.github/workflows/release.yml"
EVAL_RUNNER="$ROOT/.claude/skills/eval/run.sh"
PROBES_DIR="$ROOT/evals/probes"
SELF="$ROOT/evals/probes/docs-build-fast-path.sh"

for f in "$PACKAGE_JSON" "$CI_WORKFLOW" "$DOCS_WORKFLOW" "$RELEASE_WORKFLOW" "$EVAL_RUNNER"; do
  [[ -f "$f" ]] || { echo "SKIPPED: missing required file $f" >&2; exit 2; }
done

script_value() {
  local key="$1"
  node -e 'const fs=require("fs"); const pkg=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); console.log((pkg.scripts && pkg.scripts[process.argv[2]]) || "")' "$PACKAGE_JSON" "$key"
}

failures=()

root_build="$(script_value build)"
root_setup="$(script_value setup)"
build_harness="$(script_value build:harness)"
docs_build="$(script_value docs:build)"

for pair in "build:$root_build" "setup:$root_setup"; do
  key="${pair%%:*}"
  value="${pair#*:}"
  if grep -Eiq 'docusaurus|docs:build|packages/docs|@openharness/docs' <<<"$value"; then
    failures+=("package.json scripts.$key enters docs build path: $value")
  fi
done

if [[ "$root_build" != "pnpm run build:harness" ]]; then
  failures+=("package.json scripts.build must delegate to pnpm run build:harness")
fi
if ! grep -Fq -- "--filter '!@openharness/docs'" <<<"$build_harness"; then
  failures+=("package.json scripts.build:harness must explicitly exclude @openharness/docs")
fi
if grep -Eiq 'docusaurus|docs:build|packages/docs' <<<"$build_harness"; then
  failures+=("package.json scripts.build:harness must not invoke Docusaurus/docs build: $build_harness")
fi
if [[ "$docs_build" != "pnpm --dir packages/docs build" ]]; then
  failures+=("package.json scripts.docs:build must remain the explicit manual docs build command")
fi

workflow_build_run() {
  local file="$1"
  awk '
    /^[[:space:]]+- name: Build[[:space:]]*$/ { in_build=1; next }
    in_build && /^[[:space:]]+- name:/ { exit }
    in_build && /^[[:space:]]*run:/ {
      line=$0
      sub(/^[[:space:]]*run:[[:space:]]*/, "", line)
      print line
      exit
    }
  ' "$file"
}

ci_build="$(workflow_build_run "$CI_WORKFLOW")"
release_build="$(workflow_build_run "$RELEASE_WORKFLOW")"
if [[ "$ci_build" != "pnpm run build:harness" ]]; then
  failures+=("ci-harness.yml Build step must run pnpm run build:harness, got: ${ci_build:-<missing>}")
fi
if [[ "$release_build" != "pnpm run build:harness" ]]; then
  failures+=("release.yml Build step must run pnpm run build:harness, got: ${release_build:-<missing>}")
fi

if grep -Eq '^[[:space:]]*pull_request:' "$DOCS_WORKFLOW"; then
  failures+=("docs.yml must not run docs builds on pull_request")
fi
if grep -Eq '^[[:space:]]*workflow_dispatch:' "$DOCS_WORKFLOW"; then
  failures+=("docs.yml must not expose manual workflow_dispatch docs builds")
fi
for branch in main master; do
  if ! awk '/^[[:space:]]+branches:/{in_br=1; next} in_br && /^[[:space:]]+-[[:space:]]*/{gsub(/["'"'"']/, ""); print} in_br && /^[[:space:]]+[A-Za-z0-9_-]+:/{exit}' "$DOCS_WORKFLOW" | grep -Eq "^[[:space:]]*-[[:space:]]*$branch$"; then
    failures+=("docs.yml push.branches must include $branch")
  fi
done
if ! awk '
  /^[[:space:]]+- name: Build site[[:space:]]*$/ { in_build=1; next }
  in_build && /^[[:space:]]+- name:/ { exit }
  in_build { print }
' "$DOCS_WORKFLOW" | grep -Fq 'working-directory: packages/docs'; then
  failures+=("docs.yml Build site step must run from packages/docs")
fi
if ! awk '
  /^[[:space:]]+- name: Build site[[:space:]]*$/ { in_build=1; next }
  in_build && /^[[:space:]]+- name:/ { exit }
  in_build { print }
' "$DOCS_WORKFLOW" | grep -Fq 'run: pnpm run build'; then
  failures+=("docs.yml Build site step must run pnpm run build")
fi
if ! grep -Eq "refs/heads/(main|master)" "$DOCS_WORKFLOW"; then
  failures+=("docs.yml deploy guards must be scoped to main/master refs")
fi

if grep -REn 'docusaurus build|pnpm (run )?docs:build|pnpm --dir packages/docs build' "$EVAL_RUNNER" "$PROBES_DIR" --exclude='docs-build-fast-path.sh' >/tmp/docs-build-fast-path-grep.txt; then
  failures+=("eval runner/probes must not invoke docs build commands: $(tr '\n' ';' </tmp/docs-build-fast-path-grep.txt)")
fi

if (( ${#failures[@]} == 0 )); then
  echo "PASS: docs build is confined to docs.yml main/master pushes and explicit pnpm docs:build" >&2
  exit 0
fi

printf 'REGRESSION: %s\n' "${failures[@]}" >&2
exit 1
