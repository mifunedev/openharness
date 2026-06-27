#!/usr/bin/env bash
# tier: A
# source: issue #531 Phase 2 (devcontainer relocation)
# desc: harness build assets live under .oh/devcontainer/ (Dockerfile, compose + hermes overlay, entrypoint, the two client scripts); root .devcontainer/ is a generated compat layer (devcontainer.json -> ../.oh/devcontainer/docker-compose.yml) + user env; no moved asset lingers at .devcontainer/ and the generator does not drift.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

DOCKERFILE="$ROOT/.oh/devcontainer/Dockerfile"
COMPOSE="$ROOT/.oh/devcontainer/docker-compose.yml"
DEVCONTAINER_JSON="$ROOT/.devcontainer/devcontainer.json"
DOCKERIGNORE="$ROOT/.dockerignore"
SYNC_SCRIPT="$ROOT/.oh/scripts/sync-devcontainer.sh"

# SKIPPED: the relocation has not landed yet (the moved Dockerfile is the anchor).
if [[ ! -f "$DOCKERFILE" ]]; then
  echo "SKIPPED: relocation not present — $DOCKERFILE absent" >&2
  exit 2
fi

regress() {
  echo "REGRESSION: $1" >&2
  exit 1
}

# 1. All six build assets exist under .oh/devcontainer/.
for asset in \
  Dockerfile \
  docker-compose.yml \
  docker-compose.hermes-dashboard.yml \
  entrypoint.sh \
  client-slack-supervise.sh \
  seed-msg-bridge.sh; do
  [[ -f "$ROOT/.oh/devcontainer/$asset" ]] || regress "moved asset missing from .oh/devcontainer/: $asset"
done

# 2. The moved assets are GONE from the root .devcontainer/.
[[ ! -f "$ROOT/.devcontainer/Dockerfile" ]] || regress ".devcontainer/Dockerfile still present (should have moved to .oh/devcontainer/)"
[[ ! -f "$ROOT/.devcontainer/docker-compose.yml" ]] || regress ".devcontainer/docker-compose.yml still present (should have moved to .oh/devcontainer/)"
[[ ! -f "$ROOT/.devcontainer/entrypoint.sh" ]] || regress ".devcontainer/entrypoint.sh still present (should have moved to .oh/devcontainer/)"

# 3. Root compat layer points VS Code at the relocated compose file.
[[ -f "$DEVCONTAINER_JSON" ]] || regress "root compat layer missing: $DEVCONTAINER_JSON"
grep -Fq '../.oh/devcontainer/docker-compose.yml' "$DEVCONTAINER_JSON" \
  || regress "root devcontainer.json does not point dockerComposeFile at ../.oh/devcontainer/docker-compose.yml"

# 4. Relocated compose references the relocated Dockerfile.
grep -Fq 'dockerfile: .oh/devcontainer/Dockerfile' "$COMPOSE" \
  || regress ".oh/devcontainer/docker-compose.yml does not set dockerfile: .oh/devcontainer/Dockerfile"

# 5. Relocated Dockerfile copies the relocated entrypoint.
grep -Fq 'COPY .oh/devcontainer/entrypoint.sh' "$DOCKERFILE" \
  || regress ".oh/devcontainer/Dockerfile does not COPY .oh/devcontainer/entrypoint.sh"

# 6. .dockerignore no longer carries a stale negation for the moved Dockerfile.
if [[ -f "$DOCKERIGNORE" ]] && grep -Fq '.devcontainer/Dockerfile' "$DOCKERIGNORE"; then
  regress ".dockerignore still references .devcontainer/Dockerfile (stale post-move)"
fi

# 7. The generator and the committed compat layer agree (no drift) when present.
if [[ -f "$SYNC_SCRIPT" ]]; then
  bash "$SYNC_SCRIPT" --check >/dev/null 2>&1 \
    || regress "sync-devcontainer.sh --check reports drift between the generator and root devcontainer.json"
fi

echo "PASS: build assets relocated to .oh/devcontainer/, root .devcontainer/ reduced to a generated compat layer, no moved asset lingers, generator in sync" >&2
exit 0
