#!/usr/bin/env bash
# tier: A
# source: consolidate devcontainer — .oh/devcontainer/ folded back into .devcontainer/
# desc: the harness's own devcontainer build assets live in the conventional root .devcontainer/ (Dockerfile, compose + hermes overlay, entrypoint, the two client scripts) alongside devcontainer.json; nothing lingers under .oh/devcontainer/; devcontainer.json points dockerComposeFile at the same-dir compose (no ../.oh shim); compose builds .devcontainer/Dockerfile with a repo-root context; Dockerfile copies .devcontainer/entrypoint.sh; .dockerignore keeps the .devcontainer/ dir in the build context (so the entrypoint COPY resolves) yet still excludes env secrets; the sync-devcontainer.sh compat generator is retired.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

DC="$ROOT/.devcontainer"
DOCKERFILE="$DC/Dockerfile"
COMPOSE="$DC/docker-compose.yml"
DEVCONTAINER_JSON="$DC/devcontainer.json"
DOCKERIGNORE="$ROOT/.dockerignore"

# SKIPPED: the consolidation has not landed yet (the moved Dockerfile is the anchor).
if [[ ! -f "$DOCKERFILE" ]]; then
  echo "SKIPPED: consolidation not present — $DOCKERFILE absent" >&2
  exit 2
fi

regress() {
  echo "REGRESSION: $1" >&2
  exit 1
}

# 1. All six build assets exist under .devcontainer/.
for asset in \
  Dockerfile \
  docker-compose.yml \
  docker-compose.hermes-dashboard.yml \
  entrypoint.sh \
  client-slack-supervise.sh \
  seed-msg-bridge.sh; do
  [[ -f "$DC/$asset" ]] || regress "build asset missing from .devcontainer/: $asset"
done

# 2. Nothing lingers under the retired .oh/devcontainer/.
[[ ! -d "$ROOT/.oh/devcontainer" ]] \
  || regress ".oh/devcontainer/ still present (assets should have consolidated into .devcontainer/)"

# 3. The VS Code devcontainer.json points at the same-dir compose (no ../.oh shim).
[[ -f "$DEVCONTAINER_JSON" ]] || regress "devcontainer.json missing: $DEVCONTAINER_JSON"
grep -Fq '"docker-compose.yml"' "$DEVCONTAINER_JSON" \
  || regress "devcontainer.json does not point dockerComposeFile at the same-dir docker-compose.yml"
if grep -Fq '.oh/devcontainer' "$DEVCONTAINER_JSON"; then
  regress "devcontainer.json still references .oh/devcontainer (stale shim)"
fi

# 4. Compose references the co-located Dockerfile and a repo-root build context.
grep -Fq 'dockerfile: .devcontainer/Dockerfile' "$COMPOSE" \
  || regress "docker-compose.yml does not set dockerfile: .devcontainer/Dockerfile"
grep -Eq '^[[:space:]]*context: \.\.$' "$COMPOSE" \
  || regress "docker-compose.yml build context is not the repo root (context: ..)"

# 5. Dockerfile copies the co-located entrypoint.
grep -Fq 'COPY .devcontainer/entrypoint.sh' "$DOCKERFILE" \
  || regress "Dockerfile does not COPY .devcontainer/entrypoint.sh"

# 6. No moved build asset still references the retired .oh/devcontainer/ path.
for asset in Dockerfile docker-compose.yml docker-compose.hermes-dashboard.yml \
             entrypoint.sh client-slack-supervise.sh seed-msg-bridge.sh devcontainer.json; do
  if grep -Fq '.oh/devcontainer' "$DC/$asset" 2>/dev/null; then
    regress ".devcontainer/$asset still references the retired .oh/devcontainer/ path"
  fi
done

# 7. .dockerignore must NOT exclude the whole .devcontainer/ dir (else the
#    entrypoint COPY has no source) but must still exclude env secrets.
if [[ -f "$DOCKERIGNORE" ]]; then
  if grep -Eq '^[[:space:]]*\.devcontainer/?[[:space:]]*$' "$DOCKERIGNORE"; then
    regress ".dockerignore excludes the whole .devcontainer/ dir — the entrypoint COPY would fail"
  fi
  grep -Fq '.env' "$DOCKERIGNORE" \
    || regress ".dockerignore no longer excludes env files (secret-leak risk)"
fi

# 8. The compat generator is retired (no split left to keep in sync).
[[ ! -f "$ROOT/.oh/scripts/sync-devcontainer.sh" ]] \
  || regress ".oh/scripts/sync-devcontainer.sh still present (compat generator retired by consolidation)"

echo "PASS: devcontainer build assets consolidated under .devcontainer/, nothing under .oh/devcontainer/, same-dir compose ref, no compat generator, .dockerignore keeps the dir but excludes secrets" >&2
exit 0
