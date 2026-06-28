#!/usr/bin/env bash
# tier: A
# source: issue #196 — .oh/evals/datasets verifiable trajectory corpus (Repo2RLEnv-inspired)
# desc: guards the datasets corpus structural integrity — a README with a ## Catalogue index,
#       >=3 example folders (each with manifest.json + prompt.md + oracle/ + an executable verify.sh
#       whose hermetic self-check exits 0), jq-valid manifests (required fields + DS-<n> id), a
#       bidirectional README-catalogue <-> folder drift check, and every capability `datasets:` ref
#       resolving to a real example — so the corpus can't silently rot.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DS="$ROOT/.oh/evals/datasets"
README="$DS/README.md"

# Assertion 1 — corpus not present on this branch => SKIPPED (not a regression).
if [[ ! -f "$README" ]]; then
  echo "SKIPPED: datasets corpus absent: $README" >&2
  exit 2
fi
command -v jq >/dev/null 2>&1 || { echo "SKIPPED: jq not on PATH" >&2; exit 2; }

fails=()

# Assertion 2 — >=3 example folders matching <dataset>/DS-*/.
shopt -s nullglob
example_dirs=("$DS"/*/DS-*/)
shopt -u nullglob
if (( ${#example_dirs[@]} < 3 )); then
  fails+=("expected >=3 example folders <dataset>/DS-*/ under .oh/evals/datasets, found ${#example_dirs[@]}")
fi

ids=()
for d in "${example_dirs[@]}"; do
  d="${d%/}"
  rel="${d#"$ROOT"/}"
  # Assertion 3 — required files per example folder.
  [[ -f "$d/manifest.json" ]] || fails+=("$rel: missing manifest.json")
  [[ -f "$d/prompt.md" ]]     || fails+=("$rel: missing prompt.md")
  [[ -d "$d/oracle" ]]        || fails+=("$rel: missing oracle/ directory")
  [[ -x "$d/verify.sh" ]]     || fails+=("$rel: missing executable verify.sh")

  # Assertion 4 — manifest parses + required fields + DS-<n> id.
  if [[ -f "$d/manifest.json" ]]; then
    jq -e '.id and .slug and .dataset and .title and (.source|type=="object") and (.reward_kind|type=="array") and (.oracle|type=="object")' \
      "$d/manifest.json" >/dev/null 2>&1 || fails+=("$rel/manifest.json: missing required fields or invalid JSON")
    id="$(jq -r '.id // empty' "$d/manifest.json" 2>/dev/null || true)"
    if [[ "$id" =~ ^DS-[0-9]+$ ]]; then
      ids+=("$id")
    else
      fails+=("$rel/manifest.json: id '$id' is not DS-<n>")
    fi
  fi

  # Assertion 5 — hermetic verify.sh self-check exits 0.
  if [[ -x "$d/verify.sh" ]]; then
    bash "$d/verify.sh" >/dev/null 2>&1 || fails+=("$rel/verify.sh: self-check did not exit 0")
  fi
done

# Assertion 6 — bidirectional drift: every example id has a `| DS-NNN |` catalogue row, and vice-versa.
cat_ids=()
while read -r cid; do
  [[ -n "$cid" ]] && cat_ids+=("$cid")
done < <(grep -oE '^\|[[:space:]]*DS-[0-9]+[[:space:]]*\|' "$README" | grep -oE 'DS-[0-9]+' | sort -u)

if (( ${#ids[@]} > 0 && ${#cat_ids[@]} > 0 )); then
  for id in "${ids[@]}"; do
    printf '%s\n' "${cat_ids[@]}" | grep -qx "$id" || fails+=("example $id has no ## Catalogue row in README")
  done
  for cid in "${cat_ids[@]}"; do
    printf '%s\n' "${ids[@]}" | grep -qx "$cid" || fails+=("catalogue row $cid maps to no example folder")
  done
else
  fails+=("could not extract example ids (${#ids[@]}) or catalogue ids (${#cat_ids[@]})")
fi

# Assertion 7 — every capability `datasets:` frontmatter ref resolves to a real example id.
CAP_TASKS="$ROOT/.oh/evals/capability/tasks"
if [[ -d "$CAP_TASKS" && ${#ids[@]} -gt 0 ]]; then
  while read -r ref; do
    [[ -n "$ref" ]] || continue
    printf '%s\n' "${ids[@]}" | grep -qx "$ref" || fails+=("capability datasets: ref $ref resolves to no example")
  done < <(grep -rhE '^datasets:' "$CAP_TASKS"/*.md 2>/dev/null | grep -oE 'DS-[0-9]+' | sort -u)
fi

if (( ${#fails[@]} > 0 )); then
  echo "REGRESSION: datasets corpus structural integrity broken:" >&2
  printf '  - %s\n' "${fails[@]}" >&2
  exit 1
fi

echo "PASS: datasets corpus intact — README + ${#example_dirs[@]} example folders (manifest+prompt+oracle+verify self-check), catalogue<->folder drift clean, capability datasets refs resolve" >&2
exit 0
