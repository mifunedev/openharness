#!/usr/bin/env bash
# tier: A
# source: issue #645 — production PR acquisition behavior
# desc: --mine reaches gh as @me, focused fields are real, and concurrent temp files clean independently
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"; A="$ROOT/.oh/skills/audit/scripts/pr-acquire.sh"
bin=$(mktemp -d); tmp=$(mktemp -d); calls=$(mktemp); trap 'rm -rf "$bin" "$tmp" "$calls"' EXIT
cat >"$bin/gh" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$CALLS"
if [[ " $* " == *' pr view '* ]]; then
  printf '%s\n' '{"number":7,"title":"FROM x TO development","statusCheckRollup":[{"__typename":"CheckRun","status":"COMPLETED","conclusion":"SUCCESS"}]}'
else
  printf '%s\n' '[]'
fi
MOCK
chmod +x "$bin/gh"; export CALLS="$calls"
fail(){ echo "REGRESSION: $*" >&2; exit 1; }
PATH="$bin:$PATH" TMPDIR="$tmp" AUDIT_RUN_ID='audit-20260717T120000Z-mine' bash "$A" prs --repo o/r --mine >"$tmp/mine.out"
grep -Fq -- '--author @me' "$calls" || fail '--mine was not forwarded as @me'
if PATH="$bin:$PATH" TMPDIR="$tmp" bash "$A" prs --repo o/r --mine --author other >/dev/null 2>&1; then fail '--mine combined with --author'; fi
for n in 1 2; do PATH="$bin:$PATH" TMPDIR="$tmp" AUDIT_RUN_ID="audit-20260717T12000${n}Z-c$n" bash "$A" pr --repo o/r --pr 7 --base stack-parent >"$tmp/$n.out" & pids[n]=$!; done
wait "${pids[1]}"; wait "${pids[2]}"
for n in 1 2; do jq -e '.mode=="pr" and .options.expectedBase=="stack-parent" and .prs[0].number==7 and .prs[0].statusCheckRollup[0].status=="COMPLETED"' "$tmp/$n.out" >/dev/null || fail "focused stacked envelope $n"; done
! grep -Fq -- '--base stack-parent' "$calls" || fail 'focused expected base was incorrectly forwarded as gh view filter'
[[ -z $(find "$tmp" -maxdepth 1 -type d -name 'audit-*.pr-acquire.*' -print -quit) ]] || fail 'acquisition temp leaked'
echo 'PASS: production PR acquisition behavior' >&2
