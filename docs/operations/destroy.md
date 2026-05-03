# Destroy

Tear down the sandbox. Replaces the deprecated `/destroy` skill — `docker compose down` is the canonical substrate per SPEC v0.7.

## TL;DR

```bash
docker compose -f .devcontainer/docker-compose.yml down -v
```

Stops the container(s), removes the network, and **removes named volumes** declared in the base compose: `claude-auth`, `codex-auth`, `pi-auth`, `cloudflared-auth`, `gh-config`. Overlays add their own (e.g. `pgdata` from `docker-compose.postgres.yml`, `ssh-keys` from `docker-compose.ssh-generate.yml`) — pass those overlay files to `down -v` to clean them too. Drop the `-v` flag to preserve volumes for a faster next provision.

## With overlays

If you provisioned with overlays from `.openharness/config.json`, pass them to `down` as well so all services from the merged compose graph are cleaned up:

```bash
COMPOSE_FILES="-f .devcontainer/docker-compose.yml"
for f in $(jq -r '.composeOverrides[]' .openharness/config.json); do
  COMPOSE_FILES="$COMPOSE_FILES -f $f"
done
docker compose --env-file .devcontainer/.env $COMPOSE_FILES down -v
```

## Remove the built image (optional)

`docker compose down` does not remove the image. To free disk space (or force a fresh build next time):

```bash
docker rmi openharness-sandbox 2>/dev/null || true
```

The image name follows `<container>-sandbox`; substitute your `SANDBOX_NAME` from `.devcontainer/.env`.

## Verify clean state

```bash
docker ps -a --filter "name=openharness" --format '{{.Names}}'   # should be empty
docker volume ls --filter "name=openharness_" --format '{{.Name}}'  # empty if --volumes used
```

## When to keep volumes

- Quick restart after a code change: `docker compose ... down` (no `-v`) preserves `pgdata`, gh tokens, etc.
- Reset to a clean state: `down -v` wipes everything, including database data and OAuth tokens.

See [provision.md](provision.md) for bringing the sandbox back up.
