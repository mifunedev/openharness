#!/usr/bin/env bash
# tier: A
# source: #455 — docs builds must stay out of fast harness/eval/release gates; #536 — docs site externalized to openharness-web; docs markdown relocated to .oh/docs/
# desc: Docusaurus site/BUILD machinery stays out of the core repo (openharness-web owns the rendered site). The GitHub-readable markdown now lives at .oh/docs/; only build machinery is forbidden under that path.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PACKAGE_JSON="$ROOT/package.json"
CI_WORKFLOW="$ROOT/.github/workflows/ci-harness.yml"
RELEASE_WORKFLOW="$ROOT/.github/workflows/release.yml"
README="$ROOT/README.md"
DOCS_INDEX="$ROOT/.oh/docs/README.md"
LOCKFILE="$ROOT/pnpm-lock.yaml"
EVAL_RUNNER="$ROOT/.claude/skills/eval/run.sh"
PROBES_DIR="$ROOT/evals/probes"
SELF="$ROOT/evals/probes/docs-build-fast-path.sh"

for f in "$PACKAGE_JSON" "$CI_WORKFLOW" "$RELEASE_WORKFLOW" "$README" "$DOCS_INDEX" "$LOCKFILE" "$EVAL_RUNNER"; do
  [[ -f "$f" ]] || { echo "SKIPPED: missing required file $f" >&2; exit 2; }
done

script_value() {
  local key="$1"
  node -e 'const fs=require("fs"); const pkg=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); console.log((pkg.scripts && pkg.scripts[process.argv[2]]) || "")' "$PACKAGE_JSON" "$key"
}

failures=()

# .oh/docs now holds the GitHub-readable markdown docs; only Docusaurus BUILD
# machinery (a package.json / docusaurus.config.* / sidebars.*) is forbidden there.
[[ ! -e "$ROOT/.oh/docs/package.json" ]] || failures+=(".oh/docs must not regain a Docusaurus package.json (the rendered site stays in openharness-web)")
for __cfg in "$ROOT/.oh/docs"/docusaurus.config.* "$ROOT/.oh/docs"/sidebars.*; do
  [[ -e "$__cfg" ]] && failures+=(".oh/docs must not contain Docusaurus build config: $(basename "$__cfg")")
done
[[ ! -e "$ROOT/.github/workflows/docs.yml" ]] || failures+=("core repo must not keep the Docusaurus docs.yml workflow")
[[ ! -e "$ROOT/blog" ]] || failures+=("blog archive must live in mifunedev/openharness-web, not the core repo")
[[ ! -e "$ROOT/.oh/patches/gray-matter@4.0.3.patch" ]] || failures+=("docs-only gray-matter patch must not remain in core repo")

for key in build setup build:harness docs:build docs:dev docs:serve; do
  value="$(script_value "$key")"
  case "$key" in
    docs:build|docs:dev|docs:serve)
      [[ -z "$value" ]] || failures+=("package.json scripts.$key must be absent after site extraction: $value")
      ;;
    *)
      if grep -Eiq 'docusaurus|docs:build|docs:dev|docs:serve|packages/docs|@openharness/docs|\.oh/docs' <<<"$value"; then
        failures+=("package.json scripts.$key enters removed docs-site path: $value")
      fi
      ;;
  esac
done

if grep -Eiq '@docusaurus|docusaurus|@openharness/docs|@easyops-cn/docusaurus-search-local|gray-matter|mermaid' "$PACKAGE_JSON" "$LOCKFILE"; then
  failures+=("root package/lockfile must not retain Docusaurus docs-site dependencies")
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
[[ "$ci_build" == "pnpm run build:harness" ]] || failures+=("ci-harness.yml Build step must run pnpm run build:harness, got: ${ci_build:-<missing>}")
[[ "$release_build" == "pnpm run build:harness" ]] || failures+=("release.yml Build step must run pnpm run build:harness, got: ${release_build:-<missing>}")

for f in "$README" "$DOCS_INDEX"; do
  grep -Fq 'https://github.com/mifunedev/openharness-web' "$f" || failures+=("$(basename "$f") must point to mifunedev/openharness-web")
done
grep -Fiq 'deepwiki' "$README" || failures+=("README.md must point readers to DeepWiki for generated navigation")
grep -Fq '.oh/docs/README.md' "$README" || failures+=("README.md must point readers to .oh/docs/README.md")

# Keep eval/probe code from reintroducing docs-build commands. Historical task
# artifacts are excluded because they describe old completed work.
if git -C "$ROOT" grep -nE 'docusaurus build|pnpm (run )?docs:build|pnpm --dir \.oh/docs build|@openharness/docs' -- \
  ':!evals/probes/docs-build-fast-path.sh' \
  ':!tasks/**' \
  ':!CHANGELOG.md' >/tmp/docs-site-externalized-grep.txt; then
  failures+=("core repo still references removed docs-build commands: $(tr '\n' ';' </tmp/docs-site-externalized-grep.txt)")
fi

if (( ${#failures[@]} == 0 )); then
  echo "PASS: docs site externalized to mifunedev/openharness-web; .oh/docs holds markdown only (no build machinery)" >&2
  exit 0
fi

printf 'REGRESSION: %s\n' "${failures[@]}" >&2
exit 1
