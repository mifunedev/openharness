#!/usr/bin/env bash
# tier: A
# source: issue #937 — parent-sandbox QA door for the published image
# desc: guards the deployment-guard INSTRUMENT's wiring and host-safety invariants, not
#   the deployment — the live boot takes minutes and cannot run under the 30s probe cap.
#   /deploy-check must drive .oh/scripts/deployment-guard.sh; the guard must still run
#   verify-sandbox-image.sh and sandbox-boot-smoke.sh with BOOT_SMOKE_FLAVOR=image-only,
#   trap EXIT INT TERM, and contain no prune verb or bulk force-remove; the image-only
#   compose driver must read no repository dotenv; the flavor switch must not have
#   disabled verify_bind_ownership on the bind path; and no CI leg may reappear. The
#   static Flavor B contract belongs to oh-image-only-deploy.sh and is not restated.
#   Set DEPLOY_GUARD_PROBE_ROOT to a tree with an injected defect to drive any assertion
#   below to REGRESSION.
set -euo pipefail

ROOT="${DEPLOY_GUARD_PROBE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"

GUARD="$ROOT/.oh/scripts/deployment-guard.sh"
DRIVER="$ROOT/.oh/scripts/deployment-compose.sh"
SMOKE="$ROOT/.oh/scripts/sandbox-boot-smoke.sh"
SKILL="$ROOT/.oh/skills/deploy-check/SKILL.md"

missing=()

read_or_miss() {
  local path="$1" label="$2"
  if [[ ! -f "$path" ]]; then
    missing+=("$label is missing: ${path#"$ROOT"/}")
    printf ''
    return
  fi
  cat "$path"
}

guard="$(read_or_miss "$GUARD" "the deployment guard script")"
driver="$(read_or_miss "$DRIVER" "the image-only compose driver")"
smoke="$(read_or_miss "$SMOKE" "the sandbox boot smoke")"
skill="$(read_or_miss "$SKILL" "the /deploy-check skill")"

code_only() { grep -v '^[[:space:]]*#' <<<"$1" || true; }

has() { grep -Fq -- "$2" <<<"$1" || missing+=("$3"); }
has_line() { grep -qxF -- "$2" <<<"$1" || missing+=("$3"); }
hasnt_re() { ! grep -Eq -- "$2" <<<"$(code_only "$1")" || missing+=("$3"); }

has "$skill" 'bash .oh/scripts/deployment-guard.sh' \
  "the /deploy-check skill no longer invokes .oh/scripts/deployment-guard.sh — the door must not fork the mechanism"

if [[ -e "$ROOT/.github/workflows/deployment-guard.yml" ]]; then
  missing+=("a deployment-guard CI workflow is back — this instrument is the parent-sandbox QA door, run on demand against a child sandbox, and a CI leg was removed as machinery ahead of its use")
fi

has "$guard" 'verify-sandbox-image.sh' \
  "the guard no longer runs the reusable image verifier"
has "$guard" 'sandbox-boot-smoke.sh' \
  "the guard no longer runs the boot smoke — its default-catalog oracle is the provisioning check"
has "$guard" 'BOOT_SMOKE_FLAVOR=image-only' \
  "the guard no longer requests the image-only flavor, so it would boot the bind stack"
has "$guard" 'docker pull' \
  "the guard no longer pulls the image, so it could validate a stale local object"

has_line "$guard" 'trap teardown EXIT INT TERM' \
  "the guard no longer traps EXIT INT TERM — an interrupted run would leak its container, volume, and network"
hasnt_re "$guard" 'docker[[:space:]]+(system|volume|image|container|network|builder)[[:space:]]+prune' \
  "the guard runs a prune verb — it must remove only the resources it created"
hasnt_re "$guard" 'docker[[:space:]]+rm[[:space:]]+-f[[:space:]]+\$\(' \
  "the guard force-removes over a command substitution — that can reach containers it did not create"

has "$driver" 'docker-compose.image-only.yml' \
  "the compose driver no longer pins the image-only compose file"
hasnt_re "$driver" '(--env-file|\.devcontainer/\.env|source .*\.env)' \
  "the compose driver reads a repository dotenv — that carries the local flavor's OH_SANDBOX_IMAGE and SANDBOX_NAME"

has "$smoke" 'FLAVOR=${BOOT_SMOKE_FLAVOR:-bind}' \
  "sandbox-boot-smoke.sh no longer defaults BOOT_SMOKE_FLAVOR to bind"
has "$smoke" '[ "$FLAVOR" = "bind" ] && ! verify_bind_ownership' \
  "sandbox-boot-smoke.sh no longer runs verify_bind_ownership on the bind flavor, or keys the skip on something other than the flavor variable"

if ((${#missing[@]})); then
  printf 'REGRESSION deployment guard instrument contract: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "PASS deployment guard instrument: /deploy-check drives .oh/scripts/deployment-guard.sh, which reuses the image verifier and the image-only boot smoke, traps EXIT INT TERM, prunes nothing, and leaves the bind-flavor ownership check intact; no CI leg has reappeared" >&2
exit 0
