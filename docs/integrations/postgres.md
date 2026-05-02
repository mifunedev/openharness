---
sidebar_position: 4
title: "Postgres"
---

# Postgres

Open Harness ships a PostgreSQL 16 compose overlay at `.devcontainer/docker-compose.postgres.yml`. It runs Postgres as a sibling Docker service on the same isolated network as the sandbox, injects connection environment variables automatically, and persists data in a named volume across container restarts.

## Enabling the overlay

Add the Postgres overlay when starting the sandbox:

```bash
docker compose \
  -f .devcontainer/docker-compose.yml \
  -f .devcontainer/docker-compose.postgres.yml \
  up -d --build
```

The sandbox waits for Postgres to pass its health check before starting, so the database is always ready when the sandbox shell opens.

## Default credentials

| Setting | Value |
|---|---|
| Host | `postgres` (service name on the Docker network) |
| Port | `5432` |
| User | `sandbox` |
| Password | `sandbox` |
| Database | `sandbox` |

## Environment variables injected into the sandbox

The overlay sets these variables in the sandbox container automatically — no manual export required:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgresql://sandbox:sandbox@postgres:5432/sandbox` |
| `PGHOST` | `postgres` |
| `PGUSER` | `sandbox` |
| `PGPASSWORD` | `sandbox` |
| `PGDATABASE` | `sandbox` |

Application code and CLI tools that read standard `PG*` environment variables connect without additional configuration.

## Connecting from inside the sandbox

```bash
psql postgresql://sandbox:sandbox@postgres:5432/sandbox
```

Or use the injected variables:

```bash
psql
```

`psql` picks up `PGHOST`, `PGUSER`, `PGPASSWORD`, and `PGDATABASE` from the environment automatically.

## Data persistence

Database files are stored in the `pgdata` named Docker volume. The volume survives `docker compose down` but is removed by `docker compose down -v`. To back up data before tearing down with volumes, dump it first:

```bash
pg_dump -Fc sandbox > /workspace/backup.dump
```

## Changing credentials

The default credentials are intentionally simple for local development. To use different values, set `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` in `.devcontainer/.env` and update the `DATABASE_URL` accordingly in a custom overlay.
