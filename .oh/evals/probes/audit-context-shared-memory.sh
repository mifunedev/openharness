#!/usr/bin/env bash
# tier: A
# source: issue #645 — shared-memory context ablation routing
# desc: MEMORY.md ablates under AUDIT_LOG_ROOT while source context remains under AUDIT_ROOT
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RUNNER="$REPO/.oh/skills/audit/scripts/context-audit-runner.sh"
root=$(mktemp -d); shared=$(mktemp -d); bin=$(mktemp -d); trap 'rm -rf "$root" "$shared" "$bin"' EXIT
mkdir -p "$root/.oh/scripts" "$root/.oh/evals" "$root/.oh/skills/audit/probes/context" "$root/.oh/context" "$shared/.oh/memory"
cp "$REPO/.oh/scripts/ablate.sh" "$root/.oh/scripts/ablate.sh"
printf '%s\n' '%s\n' >"$root/.oh/skills/audit/probes/context/probe.md"
printf source >"$root/.oh/context/USER.md"; printf shared-memory >"$shared/.oh/memory/MEMORY.md"
cat >"$bin/claude" <<'MOCK'
#!/usr/bin/env bash
printf 'probe output\n'
MOCK
chmod +x "$bin/claude"
fail(){ echo "REGRESSION: $*" >&2; exit 1; }
PATH="$bin:$PATH" AUDIT_ROOT="$root" AUDIT_LOG_ROOT="$shared" AUDIT_RUN_ID='audit-20260717T120000Z-shared' \
  bash "$RUNNER" --ablate .oh/memory/MEMORY.md >/dev/null
[[ $(<"$shared/.oh/memory/MEMORY.md") == shared-memory ]] || fail 'shared MEMORY was not restored byte-for-byte'
[[ ! -e "$root/.oh/memory/MEMORY.md" ]] || fail 'shared MEMORY was incorrectly routed to source root'
[[ $(<"$root/.oh/context/USER.md") == source ]] || fail 'source context changed during shared ablation'
[[ ! -d "$root/.oh/evals/.ablation-state" || -z $(find "$root/.oh/evals/.ablation-state" -type f -print -quit) ]] || fail 'shared ablation recovery state leaked'
PATH="$bin:$PATH" AUDIT_ROOT="$root" AUDIT_LOG_ROOT="$shared" AUDIT_RUN_ID='audit-20260717T120001Z-source' \
  bash "$RUNNER" --ablate .oh/context/USER.md >/dev/null
[[ $(<"$root/.oh/context/USER.md") == source ]] || fail 'source context did not remain source-root constrained'
echo 'PASS: shared-memory context ablation routing' >&2
