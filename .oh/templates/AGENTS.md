# AGENTS.md — your OpenHarness project

This repository is equipped with [OpenHarness](https://github.com/mifunedev/openharness).
**This is YOUR project.** Agents working here build and ship the application —
the harness machinery under `.oh/` (including the `.oh/skills` skill pack) and the
provider surfaces (`.claude/ .codex/ .pi/ .hermes/`) are infrastructure that
supports that work. You write application code; you also own and evolve this file.

> `CLAUDE.md` is a symlink to this file (provider-compat alias). Edit `AGENTS.md`.

## Internal repo map

```
your-project/
  AGENTS.md                 # this file (CLAUDE.md -> AGENTS.md)
  .devcontainer/.env        # local gitignored harness config (sandbox name, timezone, installs, secrets)
  .devcontainer/            # local image build (Dockerfile, docker-compose.yml, entrypoint)
  .claude/ .codex/          # provider surfaces — skills/agents/hooks symlinks + config
  .pi/ .hermes/             #   (configured by `oh init`; runtime/secrets gitignored)
  .oh/                      # the OpenHarness control plane (commit it)
    cli/                    #   the `oh` CLI (build: cd .oh/cli && npm run build)
    skills/ agents/ hooks/  #   vendored shared primitives (provider surfaces symlink here)
    scripts/  install/      #   machinery (ralph, link-providers, cron-runtime, ...)
    context/                #   identity layer (SOUL, IDENTITY, REPO_MAP, ...)
    crons/                  #   scheduled agents (heartbeat, cleanup, ...)
    evals/                  #   probe suite + RESULTS benchmark
    memory/                 #   long-term lessons (append-only) — seeded empty
    tasks/                  #   per-task spec folders — seeded empty
  src/ ...                  # YOUR application code lives here
```

## Getting started

1. `oh init` already scaffolded this layout, including the vendored `.oh/skills` pack.
2. Put secrets in `.devcontainer/.env` (gitignored — never commit them).
3. Build the sandbox image: reopen in your editor's Dev Container, or
   `docker compose -f .devcontainer/docker-compose.yml up -d --build`. The
   published image is a documented fallback in `.devcontainer/devcontainer.json`.
4. Commit `.oh/` and the provider surfaces.
