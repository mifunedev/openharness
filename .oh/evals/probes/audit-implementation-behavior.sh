#!/usr/bin/env bash
# tier: A
# source: issue #645 — implementation root/repo/browser behavior
# desc: browser preflight is conditional, isolated, non-installing, and repository-nonmutating
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"; GATE="$REPO/.oh/skills/audit/scripts/implementation-gates.sh"
root=$(mktemp -d); bin=$(mktemp -d); runtime=$(mktemp -d); calls=$(mktemp); trap 'rm -rf "$root" "$bin" "$runtime" "$calls"' EXIT
mkdir -p "$root/.oh/tasks/no-ui" "$root/.oh/tasks/ui"
printf '{"userStories":[{"passes":true,"acceptanceCriteria":["shell only"]}]}' >"$root/.oh/tasks/no-ui/prd.json"
printf '{"userStories":[{"passes":true,"acceptanceCriteria":["Verify in browser"]}]}' >"$root/.oh/tasks/ui/prd.json"
git -C "$root" init -q; git -C "$root" config user.email test@example.invalid; git -C "$root" config user.name test; git -C "$root" add .; git -C "$root" commit -qm init
cat >"$bin/agent-browser" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$CALLS"
mkdir -p "$HOME/mock-profile"
[[ -z ${MUTATE_FILE:-} || $1 != open ]] || printf browser-change >>"$MUTATE_FILE"
exit 0
MOCK
chmod +x "$bin/agent-browser"; export CALLS="$calls"
fail(){ echo "REGRESSION: $*" >&2; exit 1; }
if AUDIT_ROOT="$root" PATH="$bin:$PATH" bash "$GATE" browser-required no-ui; then fail 'non-UI story selected browser'; fi
[[ ! -s $calls ]] || fail 'non-UI applicability invoked browser'
AUDIT_ROOT="$root" PATH="$bin:$PATH" bash "$GATE" browser-required ui || fail 'UI story skipped browser'
before=$(git -C "$root" status --porcelain=v1 --untracked-files=all)
AUDIT_ROOT="$root" AUDIT_RUN_ID='audit-20260717T120000Z-fixture' AUDIT_TMP_ROOT="$runtime" PATH="$bin:$PATH" bash "$GATE" browser-preflight
after=$(git -C "$root" status --porcelain=v1 --untracked-files=all)
[[ $before == "$after" ]] || fail 'preflight mutated repository'
[[ $(grep -c '^--version$' "$calls") -eq 1 && $(grep -c '^open about:blank --session audit-audit-20260717T120000Z-fixture$' "$calls") -eq 1 ]] || fail 'preflight command sequence'
! grep -Eqi 'install|npm|pnpm|https?://' "$calls" || fail 'preflight installed or navigated externally'
[[ -z $(find "$runtime" -mindepth 1 -print -quit) ]] || fail 'browser profile not cleaned'
# A porcelain-only comparison misses edits to a file that was already dirty.
printf preexisting-change >>"$root/.oh/tasks/ui/prd.json"
if AUDIT_ROOT="$root" AUDIT_RUN_ID='audit-20260717T120001Z-fixture' AUDIT_TMP_ROOT="$runtime" \
  MUTATE_FILE="$root/.oh/tasks/ui/prd.json" PATH="$bin:$PATH" bash "$GATE" browser-preflight >/dev/null 2>&1; then
  fail 'content mutation of already-dirty file was not detected'
fi
# Git status and ls-files --others both omit ignored files; the content detector
# must still see browser writes to them.
printf 'ignored-profile\n' >"$root/.gitignore"; printf original >"$root/ignored-profile"; git -C "$root" add .gitignore; git -C "$root" commit -qm ignore
if AUDIT_ROOT="$root" AUDIT_RUN_ID='audit-20260717T120002Z-fixture' AUDIT_TMP_ROOT="$runtime" \
  MUTATE_FILE="$root/ignored-profile" PATH="$bin:$PATH" bash "$GATE" browser-preflight >/dev/null 2>&1; then
  fail 'ignored content mutation was not detected'
fi
echo 'PASS: implementation browser/root/ignored-write behavior' >&2
