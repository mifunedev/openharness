#!/usr/bin/env bash
# tier: A
# source: issue #926 — a prose sentinel duplicated structured task-graph state
# desc: task completion derives from prd.json (every required story passes); the retired
#       progress.txt sentinel survives in no active consumer, doc, template, or cron
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

CRON="crons/cleanup-tasks.md"
TASKS_README=".oh/tasks/README.md"
EXECUTE=".oh/skills/spec/references/execute.md"
SPEC=".oh/skills/spec/SKILL.md"
PROMPT=".oh/skills/spec/templates/task-prompt.md"

for f in "$CRON" "$TASKS_README" "$EXECUTE" "$SPEC" "$PROMPT"; do
  [[ -f "$f" ]] || { echo "SKIPPED: required file absent: $f" >&2; exit 2; }
done

failures=()

# Assembled from fragments so this probe is not itself a hit for the token it
# retires, and therefore needs no self-exemption.
SENTINEL="STATUS: ""COMPLETE"

# 1. No ACTIVE surface may key on the prose sentinel. Historical records are
#    excluded for the same reason .oh/evals/probes/audit-stale-references.sh
#    excludes them: the changelog and the RFCs cite it as a past exhibit, and
#    .oh/knowledge/raw/ holds immutable captures that are never rewritten.
set +e
hits="$(git grep -n -F -- "$SENTINEL" -- \
  ':!CHANGELOG.md' \
  ':!docs/rfcs/**' \
  ':!.oh/knowledge/raw/**' \
  ':!.oh/evals/RESULTS.md' \
  ':!.oh/tasks/**' \
  ":!${BASH_SOURCE[0]#"$ROOT"/}")"
rc=$?
set -e
[[ $rc -eq 0 || $rc -eq 1 ]] || failures+=("sentinel scan failed")
[[ -n "$hits" ]] && failures+=("active surface still keys on the retired completion sentinel: $(tr '\n' ' ' <<<"$hits")")

# 2. Any RFC that still cites it must mark it retired, so no reader takes it for
#    current architecture.
while IFS= read -r line; do
  [[ -n "$line" ]] || continue
  file="${line%%:*}"; rest="${line#*:}"; text="${rest#*:}"
  grep -qi 'retired\|no longer\|since been' <<<"$text" \
    || failures+=("$file cites the retired sentinel without marking it retired: $text")
done < <(git grep -n -F -- "$SENTINEL" -- 'docs/rfcs' || true)

# 3. The structured check must be the one that runs.
JQ_CHECK="all(.userStories[]; .passes == true)"
grep -qF -- "$JQ_CHECK" "$CRON" \
  || failures+=("the cleanup cron does not derive completion from prd.json story state")
grep -qF -- "$JQ_CHECK" "$TASKS_README" \
  || failures+=(".oh/tasks/README.md does not document the structured completion check")
grep -qF -- "$JQ_CHECK" "$EXECUTE" \
  || failures+=("execute.md does not derive completion from prd.json story state")
grep -qF -- "$JQ_CHECK" "$PROMPT" \
  || failures+=("the task prompt does not tell the owner how completion is decided")
grep -qF 'Completion is structured state' "$SPEC" \
  || failures+=("the /spec dispatcher does not state that completion is structured state")

# 4. An unreadable task graph must not read as complete.
grep -qiF 'no readable `prd.json`' "$CRON" \
  || grep -qiF 'unreadable' "$CRON" \
  || failures+=("the cleanup cron does not say what happens when prd.json is unreadable")

# 5. Behavioral: the documented jq expression must actually answer both ways.
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
printf '%s\n' '{"userStories":[{"passes":true},{"passes":true}]}' > "$tmp/done.json"
printf '%s\n' '{"userStories":[{"passes":true},{"passes":false}]}' > "$tmp/open.json"
printf '%s\n' '{"userStories":[]}' > "$tmp/empty.json"
jq -e "$JQ_CHECK" "$tmp/done.json" >/dev/null 2>&1 \
  || failures+=("the documented completion check rejects an all-passing task graph")
jq -e "$JQ_CHECK" "$tmp/open.json" >/dev/null 2>&1 \
  && failures+=("the documented completion check accepts a graph with an unpassed story")
jq -e "$JQ_CHECK" "$tmp/empty.json" >/dev/null 2>&1 \
  || failures+=("the documented completion check rejects an empty task graph unexpectedly")

if ((${#failures[@]})); then
  printf 'REGRESSION: %s\n' "${failures[@]}" >&2
  exit 1
fi

echo "PASS: task completion derives from prd.json structured state; the prose sentinel survives only in marked historical records" >&2
exit 0
