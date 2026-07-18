# AGENTS.md — your OpenHarness project

This repository is equipped with [OpenHarness](https://github.com/mifunedev/openharness).
**This is YOUR project.** Agents working here build and ship the application —
the harness machinery under `.oh/` (including the `.oh/skills` skill pack) and the
provider surfaces (`.claude/ .codex/ .pi/ .hermes/`) are infrastructure that
supports that work. You write application code; you also own and evolve this file.

> `CLAUDE.md` is a symlink to this file (provider-compat alias). Edit `AGENTS.md`.

## How work flows

OpenHarness has one canonical operative path:

```
select → plan ⇄ critique → execute → merge → reset
```

- **plan** (`/spec plan`) turns a topic/issue into a `.oh/tasks/<slug>/` folder
  (PRD + plan + critique + `prd.json`).
- **critique** (`/spec critique`) runs adversarial critics + an approve gate
  before any build.
- **execute** (`/spec execute`) builds ⇄ audits to a ready PR (the human merges).
- `/ship-spec` is the all-in-one composer that runs the same pipeline end-to-end.

Two adversarial critic loops guard quality: `plan ⇄ critique` vets the plan;
`build ⇄ audit` vets the build.

## Conventions (`/git`)

| Item | Convention |
|------|-----------|
| Base branch | `development` |
| Feature/task branches | `feat/<short-slug>` |
| PR target | `development` |
| Commit format | `<type>: <description>` (`feat`, `fix`, `task`, `docs`, `test`) |

Full provider-portable policy lives in the `/git` skill.

## Skills

Skills are loaded from `.oh/skills/` via each provider's `skills` symlink, so
`/<skill>` works the same in Claude, Codex, Pi, and Hermes.

| Skill | When |
|-------|------|
| `/spec` | plan / critique / execute / retro — the decomposed build workflow |
| `/ship-spec` | end-to-end spec → ready PR in one invocation |
| `/prd` | generate a PRD from a feature description |
| `/ralph` | convert a markdown PRD → `.oh/tasks/<name>/prd.json` |
| `/delegate` | parallel sub-agent coordinator — execute a plan in waves |
| `/critique`, `/approve` | adversarial review + the go/no-go gate |
| `/audit` | explicit nine-target audit dispatcher (`implementation|pr|prs|harness|context|skills|eval-quality|drift|full`) |
| `/eval` | run the probe suite, write `.oh/evals/RESULTS.md` |
| `/git` | issues, branches, commits, PR titles/bodies, releases |
| `/ci-status` | after a push — poll CI, report pass/fail |
| `/release` | CalVer release — branch, tag, push, image |
| `/health-check` | triage host memory/disk/Docker before a heavy build |
| `/agent-browser` | open a URL headless for screenshots / preview checks |
| `/cloudflared` | expose a sandbox port via a public tunnel |
| `/wiki` | knowledge-base ingest / query / lint |
| `/retro` | session-closing retrospective → memory updates |
| `/interview` | adaptive pre-work clarifier |

Run `ls .oh/skills/` for the full set; each has a `SKILL.md`.

## Internal repo map

```
your-project/
  AGENTS.md                 # this file (CLAUDE.md -> AGENTS.md)
  harness.yaml              # local gitignored harness config (sandbox name, timezone, installs)
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
